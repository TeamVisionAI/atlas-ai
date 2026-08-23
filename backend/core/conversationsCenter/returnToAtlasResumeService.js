/**
 * Return to Atlas — contextual resume orchestration.
 * Reconstructs transcript + workflow state, processes exactly one unresolved prospect turn.
 */

const { loadPersistedWorkflowState, savePersistedWorkflowState } = require("../workflowStateStore");
const { processConversationAfterInbound } = require("../communicationHub");
const { logWhatsAppStage } = require("../whatsappStructuredLogger");
const { loadConversationContext } = require("../recruitAiV2/contextLoader");
const { mergeConversationContext } = require("../recruitAiV2/conversationContext");
const { INTENTS } = require("../recruitAiV2/constants");
const { interpretInboundMessage } = require("../recruitAiV2/interpreter");
const {
  createContextPersistenceService
} = require("../recruitAiV2/contextPersistenceService");
const {
  createSupabaseContextRepository,
  createMemoryContextRepository
} = require("../recruitAiV2/contextRepository");

const BURST_GAP_MS = 2500;
const SHORT_FRAGMENT_MAX_LEN = 48;

function resolvePersistenceService() {
  try {
    const { getServiceRoleClient } = require("../../services/backendDbService");
    const supabase = getServiceRoleClient();
    return createContextPersistenceService({
      repository: supabase
        ? createSupabaseContextRepository(supabase)
        : createMemoryContextRepository()
    });
  } catch {
    return createContextPersistenceService({
      repository: createMemoryContextRepository()
    });
  }
}

function normalizeLogDirection(row) {
  const direction = String(row?.direction || "").toLowerCase();
  return direction === "incoming" || direction === "inbound" ? "inbound" : "outbound";
}

function isHumanOutboundLog(row) {
  const direction = normalizeLogDirection(row);
  if (direction !== "outbound") {
    return false;
  }
  const pipeline = String(row.pipeline || "").toUpperCase();
  const intent = String(row.intent || "").toUpperCase();
  return (
    pipeline === "HUMAN" ||
    pipeline.startsWith("HUMAN:") ||
    intent === "HUMAN_COMPOSER_REPLY" ||
    intent.startsWith("HUMAN_")
  );
}

function isAtlasOutboundLog(row) {
  const direction = normalizeLogDirection(row);
  if (direction !== "outbound") {
    return false;
  }
  return !isHumanOutboundLog(row);
}

function inferPendingQuestionFromHumanText(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    /\b(permiso de trabajo|documentacion legal|autoriz.*trabajar|work permit|authorized to work|legal documentation)\b/.test(
      t
    )
  ) {
    return "ask_authorization";
  }
  if (/\b(ciudad|city)\b/.test(t) && /\b(estado|state)\b/.test(t)) {
    return "ask_location";
  }
  if (/\b(manana|tarde|morning|afternoon|day part)\b/.test(t)) {
    return "ask_day_part";
  }
  if (/\b(hora|time|a las)\b/.test(t)) {
    return "ask_time_preference";
  }
  if (/\b(cita|appointment|entrevista|interview)\b/.test(t)) {
    return "confirm_slot";
  }
  return null;
}

function combineBurstFragments(fragments = []) {
  const sorted = [...fragments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const texts = sorted
    .map((row) => String(row.message || "").trim())
    .filter(Boolean);
  return {
    combinedText: texts.join(" ").replace(/\s+/g, " ").trim(),
    anchorLog: sorted[sorted.length - 1] || null,
    logIds: sorted.map((row) => String(row.id))
  };
}

function findUnresolvedProspectTurn(logs, humanTakenOverAt) {
  const cutoff = humanTakenOverAt ? new Date(humanTakenOverAt).getTime() : 0;
  const chronological = [...(logs || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let lastHumanOutbound = null;
  let lastAtlasOutboundAt = 0;
  const inboundSinceHuman = [];

  for (const row of chronological) {
    const at = new Date(row.created_at).getTime();
    if (Number.isNaN(at) || at < cutoff) {
      continue;
    }

    if (isHumanOutboundLog(row)) {
      lastHumanOutbound = row;
      inboundSinceHuman.length = 0;
      continue;
    }

    if (isAtlasOutboundLog(row)) {
      lastAtlasOutboundAt = at;
      inboundSinceHuman.length = 0;
      continue;
    }

    if (normalizeLogDirection(row) === "inbound") {
      inboundSinceHuman.push(row);
    }
  }

  if (!inboundSinceHuman.length) {
    return null;
  }

  const lastInboundAt = new Date(
    inboundSinceHuman[inboundSinceHuman.length - 1].created_at
  ).getTime();
  if (lastAtlasOutboundAt >= lastInboundAt) {
    return null;
  }

  const burst = [];
  for (let i = inboundSinceHuman.length - 1; i >= 0; i -= 1) {
    const row = inboundSinceHuman[i];
    burst.unshift(row);
    if (i === 0) {
      break;
    }
    const prevAt = new Date(inboundSinceHuman[i - 1].created_at).getTime();
    const curAt = new Date(row.created_at).getTime();
    const prevLen = String(inboundSinceHuman[i - 1].message || "").trim().length;
    const curLen = String(row.message || "").trim().length;
    if (
      curAt - prevAt <= BURST_GAP_MS &&
      prevLen <= SHORT_FRAGMENT_MAX_LEN &&
      curLen <= SHORT_FRAGMENT_MAX_LEN
    ) {
      continue;
    }
    break;
  }

  const { combinedText, anchorLog, logIds } = combineBurstFragments(burst);
  if (!combinedText || !anchorLog) {
    return null;
  }

  return {
    combinedText,
    anchorLog,
    logIds,
    lastHumanOutbound,
    pendingQuestion: inferPendingQuestionFromHumanText(
      lastHumanOutbound?.message || ""
    )
  };
}

async function fetchRecentConversationLogs(phone, organizationId, limit = 40) {
  const { supabase } = require("../../services/supabaseService");
  let query = supabase
    .from("conversation_logs")
    .select("id, direction, message, intent, pipeline, created_at, organization_id")
    .eq("prospect_phone", phone)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (organizationId) {
    query = query.or(
      `organization_id.eq.${organizationId},organization_id.is.null`
    );
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data || [];
}

async function patchResumeConversationContext({
  loaded,
  pendingQuestion,
  lastHumanOutboundText,
  organizationId,
  prospectId,
  prospectPhone,
  persistence = null
}) {
  if (!pendingQuestion) {
    return loaded;
  }

  const patched = mergeConversationContext(loaded, {
    conversation: {
      ...loaded.conversation,
      lastQuestionAsked: pendingQuestion,
      resumePendingQuestion: pendingQuestion,
      lastAtlasOutboundText:
        lastHumanOutboundText || loaded.conversation?.lastAtlasOutboundText || null
    }
  });

  const service = persistence || resolvePersistenceService();
  try {
    await service.compareAndSaveContext({
      organizationId,
      prospectId,
      prospectPhone,
      channel: "whatsapp",
      nextContext: patched,
      inboundMessageId: null,
      decisionCode: "return_to_atlas_resume_prep"
    });
  } catch (error) {
    logWhatsAppStage("return_to_atlas_resume_context_patch_failed", {
      level: "warn",
      phone: prospectPhone,
      error: error.message
    });
  }

  return patched;
}

async function resumeConversationAfterReturnToAtlas({
  phone,
  prospect,
  organizationId = null,
  previousWorkflow = {},
  returnedToAtlasAt = null,
  dependencies = {}
} = {}) {
  const scope = {
    organizationId: organizationId || prospect?.organization_id || null,
    prospectId: prospect?.id || null
  };

  const persisted = await loadPersistedWorkflowState(phone, scope);
  const resumeAt = returnedToAtlasAt || persisted.returnedToAtlasAt || new Date().toISOString();

  const logs =
    dependencies.logs ||
    (await fetchRecentConversationLogs(phone, scope.organizationId));

  const unresolved = findUnresolvedProspectTurn(
    logs,
    previousWorkflow.humanTakenOverAt || persisted.humanTakenOverAt
  );

  if (!unresolved) {
    logWhatsAppStage("return_to_atlas_resume_no_unresolved_turn", {
      phone,
      organizationId: scope.organizationId
    });
    return {
      attempted: true,
      resumed: false,
      reason: "NO_UNRESOLVED_INBOUND"
    };
  }

  const resumeKey = `return-to-atlas:${resumeAt}:${unresolved.logIds.join(",")}`;
  if (persisted.returnToAtlasResumeKey === resumeKey) {
    logWhatsAppStage("return_to_atlas_resume_idempotent_skip", {
      phone,
      resumeKey
    });
    return {
      attempted: true,
      resumed: false,
      reason: "ALREADY_RESUMED",
      idempotent: true
    };
  }

  const loaded = await loadConversationContext({
    organizationId: scope.organizationId,
    prospectId: prospect?.id || null,
    prospectPhone: phone,
    timezone: "America/New_York"
  });

  const resumeContext = await patchResumeConversationContext({
    loaded,
    pendingQuestion: unresolved.pendingQuestion,
    lastHumanOutboundText: unresolved.lastHumanOutbound?.message || null,
    organizationId: scope.organizationId,
    prospectId: prospect?.id || null,
    prospectPhone: phone,
    persistence: dependencies.persistenceService || null
  });

  const interpretation = interpretInboundMessage({
    message: { text: unresolved.combinedText },
    context: resumeContext
  });

  if (
    interpretation.intent === INTENTS.OPT_OUT_REQUEST ||
    interpretation.intent === INTENTS.WITHDRAW_INTEREST
  ) {
    await savePersistedWorkflowState(
      phone,
      { returnToAtlasResumeKey: resumeKey },
      scope
    );
    logWhatsAppStage("return_to_atlas_resume_disengaged", {
      phone,
      intent: interpretation.intent
    });
    return {
      attempted: true,
      resumed: false,
      reason: "PROSPECT_DISENGAGED",
      intent: interpretation.intent
    };
  }

  const syntheticInbound = {
    phone,
    text: unresolved.combinedText,
    providerMessageId: `resume:${resumeKey}`,
    messageType: "text",
    channel: "whatsapp"
  };

  const processAfterInbound =
    dependencies.processConversationAfterInbound || processConversationAfterInbound;

  const conversation = await processAfterInbound({
    inbound: syntheticInbound,
    storagePhone: phone,
    prospect,
    contactName: prospect?.name || null
  });

  await savePersistedWorkflowState(
    phone,
    { returnToAtlasResumeKey: resumeKey },
    scope
  );

  logWhatsAppStage("return_to_atlas_resume_completed", {
    phone,
    resumeKey,
    replied: Boolean(conversation?.replied),
    reason: conversation?.reason || null
  });

  return {
    attempted: true,
    resumed: true,
    replied: Boolean(conversation?.replied),
    resumeKey,
    combinedText: unresolved.combinedText,
    conversation
  };
}

module.exports = {
  inferPendingQuestionFromHumanText,
  findUnresolvedProspectTurn,
  combineBurstFragments,
  resumeConversationAfterReturnToAtlas
};
