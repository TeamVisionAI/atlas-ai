/**
 * Sprint 11.1 — Locate or create prospects for inbound WhatsApp leads.
 * Organization scoping: resolve via whatsappInboundOrganizationResolver (tenant-safe).
 * Phase 2: QR attribution match before create-time BR-080 assignment (BR-129 / BR-130).
 */

const supabaseService = require("../services/supabaseService");
const quickCaptureEngine = require("../core/quickCaptureEngine");
const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("../core/phoneNormalizer");
const prospectNumberService = require("../services/prospectNumberService");
const eventEngine = require("./eventEngine");
const { savePersistedWorkflowState } = require("./workflowStateStore");
const { MILESTONES, OWNERSHIP } = require("./workflowConstants");
const {
  WHATSAPP_ENTRY_METHOD,
  WHATSAPP_SOURCE,
  REOPENED_INACTIVITY_MS
} = require("./whatsappConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const recruitingWorkflowHooks = require("./recruitingWorkflowHooks");
const whatsappInboundOrganizationResolver = require("./whatsappInboundOrganizationResolver");
const {
  resolveNewLeadAssignment,
  buildNewLeadAttentionFields
} = require("./newLeadAssignmentEngine");
const {
  createSupabaseQrChannelRepository
} = require("./qrChannel/supabaseQrChannelRepository");
const {
  createQrInboundAttributionService,
  mergeQrAttributionIntoLeadSource,
  MATCH_OUTCOME,
  ATTRIBUTION_RESULT
} = require("./qrChannel/qrInboundAttribution");
const { emitQrEvent, EVENTS } = require("./qrChannel/qrChannelTelemetry");
const {
  ensureCoreProspectForLegacyLead,
  findCoreProspectIdByPhone
} = require("./recruitingProspectBridge");
const { resolveWhatsAppCreateLanguageFields } = require("./prospectLanguage");

const { supabase } = supabaseService;
const { EVENT_TYPES } = eventEngine;
const { WhatsAppInboundOrganizationError } = whatsappInboundOrganizationResolver;

let _attributionService = null;

function getAttributionService() {
  if (_attributionService) return _attributionService;
  return createQrInboundAttributionService({
    repository: createSupabaseQrChannelRepository()
  });
}

/** Test hook */
function setQrAttributionServiceForTests(service) {
  _attributionService = service || null;
}

function resolveStoragePhone(rawPhone) {
  const normalized = normalizePhoneNumber(rawPhone);
  return formatPhoneForStorage(normalized) || String(rawPhone || "").trim();
}

function isMissingWhatsAppColumn(error) {
  const message = String(error?.message || "");

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("normalized_phone") ||
    message.includes("prospect_number") ||
    message.includes("entry_method") ||
    message.includes("source") ||
    message.includes("organization_id") ||
    message.includes("assignment_status") ||
    message.includes("attention_status") ||
    message.includes("new_lead_received_at") ||
    message.includes("acknowledged_at") ||
    message.includes("escalation_level")
  );
}

function shouldEmitConversationReopened(prospect) {
  if (!prospect) {
    return false;
  }

  if (prospect.current_step === "CLOSED") {
    return true;
  }

  const updatedAt = Date.parse(prospect.updated_at || prospect.created_at || "");

  if (!Number.isNaN(updatedAt) && Date.now() - updatedAt > REOPENED_INACTIVITY_MS) {
    return true;
  }

  return false;
}

function resolveCreateSourceFields(qrTouch, origin = {}) {
  if (qrTouch) {
    return {
      source: qrTouch.source || WHATSAPP_SOURCE.CAR_MAGNET,
      entryMethod: WHATSAPP_ENTRY_METHOD.QR,
      campaignAgentId: qrTouch.ownerUserId || null,
      assignmentSourceHint: qrTouch.source
    };
  }

  const {
    hasPositiveCtwaReferral
  } = require("./atlasInboundAutomationEligibility");

  if (hasPositiveCtwaReferral(origin.ctwaReferral)) {
    return {
      source: WHATSAPP_SOURCE.FACEBOOK,
      entryMethod: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
      campaignAgentId: null,
      assignmentSourceHint: WHATSAPP_SOURCE.FACEBOOK
    };
  }

  const intake = String(origin.intakeSource || "").trim().toUpperCase();
  if (
    intake === WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS ||
    intake === "FACEBOOK_LEAD" ||
    intake === "FACEBOOK_LEAD_ADS"
  ) {
    return {
      source: WHATSAPP_SOURCE.FACEBOOK,
      entryMethod: WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS,
      campaignAgentId: null,
      assignmentSourceHint: WHATSAPP_SOURCE.FACEBOOK
    };
  }

  // Implements BR-142 — unknown inbound is not Click-to-WhatsApp.
  return {
    source: WHATSAPP_SOURCE.UNKNOWN,
    entryMethod: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    campaignAgentId: null,
    assignmentSourceHint: null
  };
}

/**
 * @param {object} params
 */
async function insertWhatsAppProspectRow({
  storagePhone,
  normalizedPhone,
  name,
  firstMessage,
  organizationId,
  qrTouch = null,
  origin = {}
}) {
  if (!organizationId) {
    throw new WhatsAppInboundOrganizationError(
      "Refusing to create WhatsApp prospect without organization_id."
    );
  }

  const prospectNumber = await prospectNumberService.generateNextProspectNumber();
  const fullName = String(name || "Unknown").trim() || "Unknown";
  const sourceFields = resolveCreateSourceFields(qrTouch, origin);
  // Always set preferred_language — DB DEFAULT 'english' must not override Spanish WhatsApp leads.
  const languageFields = resolveWhatsAppCreateLanguageFields(firstMessage);

  // Implements BR-080 — deterministic owner or durable Unassigned at create.
  // QR: campaignAgentId feeds campaign_mapping (primary RVP for Car Magnet).
  const assignment = await resolveNewLeadAssignment({
    organizationId,
    source: sourceFields.assignmentSourceHint,
    campaignAgentId: sourceFields.campaignAgentId
  });
  const attentionFields = buildNewLeadAttentionFields(assignment);

  const insertRow = {
    phone: storagePhone,
    normalized_phone: normalizedPhone,
    name: fullName,
    first_name: fullName.split(" ")[0] || fullName,
    last_name: fullName.split(" ").slice(1).join(" ") || null,
    prospect_number: prospectNumber,
    organization_id: organizationId,
    current_step: "NEW",
    status: "NEW",
    ...languageFields,
    source: sourceFields.source,
    entry_method: sourceFields.entryMethod,
    preferred_communication_channel: "WHATSAPP",
    last_message: firstMessage || "",
    ...attentionFields
  };

  const { data, error } = await supabase.from("prospects").insert(insertRow).select().single();

  if (error && isMissingWhatsAppColumn(error)) {
    const { data: fallback, error: fallbackError } = await supabase
      .from("prospects")
      .insert({
        phone: storagePhone,
        name: fullName,
        organization_id: organizationId,
        owner_user_id: attentionFields.owner_user_id,
        current_step: "NEW",
        preferred_language: languageFields.preferred_language,
        language: languageFields.language,
        last_message: firstMessage || "",
        notes: JSON.stringify({
          source: sourceFields.source,
          entry_method: sourceFields.entryMethod,
          normalized_phone: normalizedPhone,
          prospect_number: prospectNumber,
          organization_id: organizationId,
          assignment_status: attentionFields.assignment_status,
          assignment_source: attentionFields.assignment_source,
          attention_status: attentionFields.attention_status,
          new_lead_received_at: attentionFields.new_lead_received_at,
          conversationGoal: qrTouch?.conversationGoal || null
        })
      })
      .select()
      .single();

    if (fallbackError) {
      throw fallbackError;
    }

    return fallback;
  }

  if (error) {
    throw error;
  }

  return data;
}

async function stampCoreLeadSourceAttribution({
  phone,
  organizationId,
  displayName,
  qrTouch,
  created
}) {
  if (!qrTouch) {
    return { coreProspectId: null, leadSource: null };
  }

  const leadSourceForCreate = mergeQrAttributionIntoLeadSource(
    {
      sourceType: "social",
      sourceDetail: qrTouch.source
    },
    qrTouch
  );

  if (created) {
    const ensured = await ensureCoreProspectForLegacyLead({
      phone,
      displayName,
      organizationId,
      leadSource: leadSourceForCreate
    }).catch(() => null);

    return {
      coreProspectId: ensured?.prospectId || null,
      leadSource: leadSourceForCreate,
      ensured
    };
  }

  const coreProspectId = await findCoreProspectIdByPhone(phone, organizationId);
  if (!coreProspectId) {
    const ensured = await ensureCoreProspectForLegacyLead({
      phone,
      displayName,
      organizationId,
      leadSource: leadSourceForCreate
    }).catch(() => null);
    return {
      coreProspectId: ensured?.prospectId || null,
      leadSource: leadSourceForCreate,
      ensured
    };
  }

  const { data: row } = await supabase
    .from("atlas_core_prospects")
    .select("id, lead_source")
    .eq("id", coreProspectId)
    .maybeSingle();

  const merged = mergeQrAttributionIntoLeadSource(row?.lead_source || {}, qrTouch);
  await supabase
    .from("atlas_core_prospects")
    .update({ lead_source: merged, updated_at: new Date().toISOString() })
    .eq("id", coreProspectId);

  return { coreProspectId, leadSource: merged };
}

async function emitProspectLifecycleEvents(
  prospect,
  { created, reopened, correlationBase, organizationId, qrTouch = null, sourceFields = null }
) {
  const resolved =
    sourceFields || resolveCreateSourceFields(qrTouch, {});
  const source = resolved.source || WHATSAPP_SOURCE.UNKNOWN;
  const entryMethod = resolved.entryMethod || WHATSAPP_ENTRY_METHOD.UNATTRIBUTED;

  if (created) {
    await savePersistedWorkflowState(
      prospect.phone,
      {
        canonicalMilestone: MILESTONES.NEW_LEAD,
        workflowOwnership: OWNERSHIP.ATLAS,
        needsHumanAttention: false,
        manualAgentOwnership: false,
        doNotContact: false
      },
      {
        organizationId: organizationId || prospect.organization_id || null,
        prospectId: prospect.id || null
      }
    );

    await eventEngine.emit(EVENT_TYPES.PROSPECT_CREATED, {
      prospectPhone: prospect.phone,
      actor: "SYSTEM",
      milestoneAfter: MILESTONES.NEW_LEAD,
      ownershipAfter: OWNERSHIP.ATLAS,
      payload: {
        source,
        entry_method: entryMethod,
        channel: "whatsapp",
        prospect_number: prospect.prospect_number || null,
        organization_id: organizationId || prospect.organization_id || null,
        conversationGoal: qrTouch?.conversationGoal || null,
        campaignKey: qrTouch?.campaignKey || null
      },
      correlationId: `${correlationBase}:prospect_created`
    });

    await eventEngine.emit(EVENT_TYPES.CONVERSATION_STARTED, {
      prospectPhone: prospect.phone,
      actor: "prospect",
      payload: {
        channel: "whatsapp",
        source,
        entry_method: entryMethod
      },
      correlationId: `${correlationBase}:conversation_started`
    });

    logWhatsAppStage("prospect_created", {
      phone: prospect.phone,
      organizationId: organizationId || prospect.organization_id || null
    });

    // Core stamp for QR happens in stampCoreLeadSourceAttribution (rich lead_source).
    // Non-QR keeps the Facebook bridge path.
    if (
      !qrTouch &&
      (entryMethod === WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP ||
        entryMethod === WHATSAPP_ENTRY_METHOD.FACEBOOK_LEAD_ADS)
    ) {
      await recruitingWorkflowHooks
        .onLegacyProspectCreated({
          prospect,
          source: WHATSAPP_SOURCE.FACEBOOK,
          organizationId: organizationId || prospect.organization_id || null
        })
        .catch((error) => {
          console.warn("[whatsappProspectResolver] core prospect bridge failed:", error.message);
        });
    }

    return;
  }

  logWhatsAppStage("prospect_located", { phone: prospect.phone });

  if (reopened) {
    await eventEngine.emit(EVENT_TYPES.CONVERSATION_REOPENED, {
      prospectPhone: prospect.phone,
      actor: "prospect",
      payload: {
        channel: "whatsapp",
        source
      },
      correlationId: `${correlationBase}:conversation_reopened`
    });

    logWhatsAppStage("conversation_reopened", { phone: prospect.phone });
  }
}

/**
 * @returns {Promise<{ prospect: Object, created: boolean, storagePhone: string, organizationId: string|null, qrAttribution?: Object|null }>}
 */
async function locateOrCreateWhatsAppProspect({
  phone,
  name,
  firstMessage,
  correlationBase,
  phoneNumberId = null,
  wabaId = null,
  organizationId: explicitOrganizationId = null,
  providerMessageId = null,
  ctwaReferral = null,
  intakeSource = null
} = {}) {
  const normalizedPhone = normalizePhoneNumber(phone);
  const storagePhone = resolveStoragePhone(phone);

  const { organizationId, source: organizationSource } =
    await whatsappInboundOrganizationResolver.resolveWhatsAppInboundOrganizationId({
      phoneNumberId,
      wabaId,
      explicitOrganizationId
    });

  // Phase 2 — match QR pending_inbound BEFORE create-time assignment.
  const attribution = getAttributionService();
  const match = await attribution.matchEligiblePendingInboundScan({
    organizationId,
    phoneNormalized: normalizedPhone
  });

  let qrTouch = null;
  let matchedScan = null;
  let matchedCampaign = null;
  if (match.outcome === MATCH_OUTCOME.HIT && match.scan && match.campaign) {
    matchedScan = match.scan;
    matchedCampaign = match.campaign;
    qrTouch = attribution.buildAttributionTouch(matchedCampaign, matchedScan);
  }

  const origin = {
    ctwaReferral: ctwaReferral || null,
    intakeSource: intakeSource || null
  };

  let prospect =
    (await quickCaptureEngine.findProspectByNormalizedPhone(normalizedPhone || phone)) ||
    (await supabaseService.findProspect(storagePhone)) ||
    (await supabaseService.findProspect(phone));

  const created = !prospect;
  const sourceFields = resolveCreateSourceFields(qrTouch, origin);

  if (created) {
    prospect = await insertWhatsAppProspectRow({
      storagePhone,
      normalizedPhone,
      name,
      firstMessage,
      organizationId,
      qrTouch,
      origin
    });
  } else if (firstMessage) {
    const updates = {
      last_message: firstMessage,
      name: prospect.name || name || prospect.name
    };

    if (!prospect.organization_id) {
      updates.organization_id = organizationId;
    }

    // BR-080 — never reassign a valid owner on duplicate/repeated inbound.
    // Sticky HUMAN / workflow ownership are intentionally untouched here.
    await supabaseService.updateProspect(prospect.phone, updates);
    prospect = (await supabaseService.findProspect(prospect.phone)) || prospect;
  }

  const reopened = !created && shouldEmitConversationReopened(prospect);

  await emitProspectLifecycleEvents(prospect, {
    created,
    reopened,
    correlationBase,
    organizationId,
    qrTouch,
    sourceFields
  });

  let qrAttribution = null;
  if (qrTouch && matchedScan) {
    const stamped = await stampCoreLeadSourceAttribution({
      phone: prospect.phone,
      organizationId,
      displayName: prospect.name,
      qrTouch,
      created
    }).catch((error) => {
      console.warn(
        "[whatsappProspectResolver] QR lead_source stamp failed:",
        error.message
      );
      return { coreProspectId: null, leadSource: null };
    });

    const attributionResult = match.historicalInactiveCampaign
      ? ATTRIBUTION_RESULT.HISTORICAL_INACTIVE_CAMPAIGN
      : created
        ? ATTRIBUTION_RESULT.ATTACHED_NEW
        : ATTRIBUTION_RESULT.ATTACHED_EXISTING;

    const consumed = await attribution.consumeMatchedScan({
      scanId: matchedScan.id,
      legacyProspectId: prospect.id || null,
      coreProspectId: stamped.coreProspectId,
      inboundCorrelationId: correlationBase || null,
      inboundProviderMessageId: providerMessageId || null,
      attributionResult,
      expectedOrgId: organizationId
    });

    emitQrEvent(EVENTS.ATTRIBUTION_ATTACHED, {
      organizationId,
      campaignId: matchedCampaign.id,
      campaignKey: matchedCampaign.campaign_key,
      correlationId: matchedScan.correlation_id,
      scanId: matchedScan.id,
      source: qrTouch.source,
      conversationGoal: stamped.leadSource?.conversationGoal || qrTouch.conversationGoal,
      outcome: attributionResult
    });

    qrAttribution = {
      matched: true,
      scanId: matchedScan.id,
      campaignId: matchedCampaign.id,
      campaignKey: matchedCampaign.campaign_key,
      source: qrTouch.source,
      conversationGoal: stamped.leadSource?.conversationGoal || qrTouch.conversationGoal,
      leadSource: stamped.leadSource,
      consumed: Boolean(consumed?.ok),
      idempotentConsume: Boolean(consumed?.idempotent),
      attributionResult,
      historicalInactiveCampaign: Boolean(match.historicalInactiveCampaign)
    };
  }

  logWhatsAppStage("inbound_organization_resolved", {
    organizationId,
    organizationSource,
    created,
    qrAttributed: Boolean(qrAttribution)
  });

  return {
    prospect,
    created,
    storagePhone: prospect.phone,
    organizationId,
    qrAttribution
  };
}

module.exports = {
  locateOrCreateWhatsAppProspect,
  resolveStoragePhone,
  shouldEmitConversationReopened,
  insertWhatsAppProspectRow,
  setQrAttributionServiceForTests,
  mergeQrAttributionIntoLeadSource,
  resolveCreateSourceFields
};
