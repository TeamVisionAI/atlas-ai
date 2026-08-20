/**
 * Recruit AI v2 — durable context persistence service.
 * Implements BR-081 Phase 2. Persists sanitized context only.
 * Implements BR-120 — dual-load core/legacy prospect keys; new rows use core UUID.
 * Does not send WhatsApp, book appointments, or mutate BR-080 attention.
 */

const {
  createConversationContext,
  mergeConversationContext,
  normalizeLanguage
} = require("./conversationContext");
const { loadConversationContext } = require("./contextLoader");
const {
  sanitizeContextForPersistence,
  assertNoForbiddenPayload
} = require("./contextSanitizer");
const { createMemoryContextRepository } = require("./contextRepository");
const {
  resolveCanonicalProspectIdentity
} = require("../recruitingProspectBridge");

function assertTenantScope({ organizationId, prospectId }) {
  if (!organizationId || !prospectId) {
    const error = new Error("organizationId and prospectId are required");
    error.code = "CONTEXT_SCOPE_REQUIRED";
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Resolve core SoR + legacy cache ids for durable context scope (BR-120).
 * Does not rewrite existing row.prospect_id columns.
 */
async function resolvePersistenceIdentityScope({
  organizationId,
  prospectId,
  legacyProspectId = null,
  prospectPhone = null,
  displayName = null,
  ensureCore = false,
  resolveIdentity = resolveCanonicalProspectIdentity
} = {}) {
  let coreProspectId = null;
  let resolvedLegacyId = legacyProspectId || null;

  if (prospectPhone) {
    const identity = await resolveIdentity({
      phone: prospectPhone,
      organizationId,
      displayName,
      legacyProspectId: resolvedLegacyId,
      ensureCore
    });

    // Implements BR-120 — fail closed on mismatch / ambiguity / conflict (never guess).
    const hardFail = new Set([
      "PROSPECT_IDENTITY_ORG_MISMATCH",
      "PROSPECT_IDENTITY_AMBIGUOUS",
      "PROSPECT_IDENTITY_CONFLICT",
      "PROSPECT_IDENTITY_SCOPE_REQUIRED"
    ]);
    if (identity && identity.ok === false && hardFail.has(identity.reasonCode)) {
      const error = new Error(
        identity.reasonCode || "PROSPECT_IDENTITY_UNRESOLVED"
      );
      error.code = identity.reasonCode;
      error.statusCode = 409;
      throw error;
    }

    coreProspectId = identity.coreProspectId || null;
    resolvedLegacyId = identity.legacyProspectId || resolvedLegacyId;
  }

  if (prospectId && coreProspectId && prospectId !== coreProspectId) {
    resolvedLegacyId = resolvedLegacyId || prospectId;
  } else if (prospectId && !coreProspectId) {
    // Caller may still be on legacy key with no phone resolve — keep as write key.
    coreProspectId = prospectId;
  } else if (!prospectId && coreProspectId) {
    // fine
  } else if (prospectId && coreProspectId && prospectId === coreProspectId) {
    // already canonical
  }

  const writeProspectId = coreProspectId || prospectId || null;
  const alternateProspectIds = [
    ...new Set(
      [writeProspectId, resolvedLegacyId, prospectId].filter(
        (id) => id && id !== writeProspectId
      )
    )
  ];

  return {
    organizationId,
    coreProspectId: writeProspectId,
    legacyProspectId:
      resolvedLegacyId && resolvedLegacyId !== writeProspectId
        ? resolvedLegacyId
        : null,
    alternateProspectIds,
    prospectPhone: prospectPhone || null
  };
}

async function findActiveRowByIdentity(repo, {
  organizationId,
  prospectId,
  alternateProspectIds = [],
  channel = "whatsapp"
}) {
  if (prospectId) {
    const primary = await repo.findActiveByScope({
      organizationId,
      prospectId,
      channel
    });
    if (primary) {
      return primary;
    }
  }

  for (const alternateId of alternateProspectIds) {
    if (!alternateId || alternateId === prospectId) {
      continue;
    }
    const found = await repo.findActiveByScope({
      organizationId,
      prospectId: alternateId,
      channel
    });
    if (found) {
      return found;
    }
  }

  return null;
}

function rowToContext(row, { canonicalProspectId = null } = {}) {
  if (!row) {
    return null;
  }

  const context = mergeConversationContext(
    createConversationContext(),
    row.context_json || {}
  );

  return {
    ...context,
    // BR-120: in-memory JSON truth prefers core UUID without mutating row.prospect_id.
    prospectId: canonicalProspectId || context.prospectId || row.prospect_id,
    organizationId: context.organizationId || row.organization_id,
    preferredLanguage: normalizeLanguage(
      context.preferredLanguage || row.last_language || "unknown"
    ),
    _persistence: {
      id: row.id,
      contextVersion: row.context_version,
      schemaVersion: row.schema_version,
      conversationVersion: row.conversation_version,
      channel: row.channel,
      lastInboundMessageId: row.last_inbound_message_id,
      lastProcessedMessageId: row.last_processed_message_id,
      lastDecisionCode: row.last_decision_code,
      needsHumanAttention: row.needs_human_attention,
      archivedAt: row.archived_at,
      updatedAt: row.updated_at,
      source: row.source || "v2",
      rowProspectId: row.prospect_id
    }
  };
}

/**
 * Never let advisory/capture overwrite a confirmed booking back to proposed.
 * Allows intentional reschedule_requested progression. Blocks confirmed → proposed.
 */
function protectConfirmedAppointmentFromDowngrade(previousContext, nextContext) {
  const prev = previousContext?.appointment || {};
  const next = nextContext?.appointment || {};
  const prevConfirmed =
    String(prev.status || "").toLowerCase() === "confirmed" && Boolean(prev.appointmentId);
  const nextStatus = String(next.status || "").toLowerCase();
  const nextKeepsAuthority =
    (nextStatus === "confirmed" && Boolean(next.appointmentId)) ||
    nextStatus === "reschedule_requested";

  if (!prevConfirmed || nextKeepsAuthority) {
    return nextContext;
  }

  return {
    ...nextContext,
    currentStage: previousContext.currentStage || nextContext.currentStage || "confirmed",
    appointment: {
      ...next,
      status: "confirmed",
      appointmentId: prev.appointmentId,
      confirmedDate: prev.confirmedDate || next.confirmedDate || next.proposedDate || prev.proposedDate || null,
      confirmedTime: prev.confirmedTime || next.confirmedTime || next.proposedTime || prev.proposedTime || null,
      proposedDate: next.proposedDate || prev.proposedDate || prev.confirmedDate || null,
      proposedTime: next.proposedTime || prev.proposedTime || prev.confirmedTime || null,
      previouslyOfferedSlots:
        next.previouslyOfferedSlots || prev.previouslyOfferedSlots || []
    }
  };
}

function createContextPersistenceService({
  repository = null,
  resolveIdentity = resolveCanonicalProspectIdentity
} = {}) {
  const repo = repository || createMemoryContextRepository();

  async function createContext({
    organizationId,
    prospectId,
    channel = "whatsapp",
    context = null,
    messageId = null,
    source = "v2",
    legacyProspectId = null,
    prospectPhone = null,
    displayName = null,
    ensureCore = true
  } = {}) {
    const identity = await resolvePersistenceIdentityScope({
      organizationId,
      prospectId,
      legacyProspectId,
      prospectPhone,
      displayName,
      ensureCore,
      resolveIdentity
    });
    const canonicalProspectId = identity.coreProspectId || prospectId;
    assertTenantScope({ organizationId, prospectId: canonicalProspectId });

    // Prefer an existing active under an alternate identity (legacy↔core) rather than
    // creating a second active for the same person (BR-120). Same-key duplicates still
    // raise CONTEXT_UNIQUE_VIOLATION via repo.insert.
    const existing = await findActiveRowByIdentity(repo, {
      organizationId,
      prospectId: null,
      alternateProspectIds: identity.alternateProspectIds,
      channel
    });
    if (existing) {
      return rowToContext(existing, { canonicalProspectId });
    }

    const base = sanitizeContextForPersistence(
      context ||
        createConversationContext({
          organizationId,
          prospectId: canonicalProspectId
        })
    );
    assertNoForbiddenPayload(base);

    const row = await repo.insert({
      organization_id: organizationId,
      // BR-120: new durable rows key on core prospect UUID.
      prospect_id: canonicalProspectId,
      channel,
      context_json: {
        ...base,
        organizationId,
        prospectId: canonicalProspectId,
        persistenceSource: source
      },
      context_version: 1,
      schema_version: base.schemaVersion || 1,
      conversation_version: 1,
      last_inbound_message_id: messageId,
      last_processed_message_id: null,
      last_language: normalizeLanguage(base.preferredLanguage),
      needs_human_attention: Boolean(base.attention?.needsHumanAttention),
      source
    });

    return rowToContext(row, { canonicalProspectId });
  }

  async function loadContext({
    organizationId,
    prospectId,
    channel = "whatsapp",
    legacyProspectId = null,
    prospectPhone = null,
    displayName = null,
    ensureCore = false
  } = {}) {
    assertTenantScope({ organizationId, prospectId });
    const identity = await resolvePersistenceIdentityScope({
      organizationId,
      prospectId,
      legacyProspectId,
      prospectPhone,
      displayName,
      ensureCore,
      resolveIdentity
    });
    const canonicalProspectId = identity.coreProspectId || prospectId;
    const row = await findActiveRowByIdentity(repo, {
      organizationId,
      prospectId: canonicalProspectId,
      alternateProspectIds: identity.alternateProspectIds,
      channel
    });
    return rowToContext(row, { canonicalProspectId });
  }

  /**
   * Reconstruct from prospect/appointment/conversation inputs when no row exists.
   * Does not invent unsupported facts. Does not persist until after v2 evaluation.
   */
  function reconstructContext(input = {}) {
    const loaded = loadConversationContext({
      ...input,
      prospectId: input.prospectId,
      organizationId: input.organizationId
    });

    return mergeConversationContext(loaded, {
      persistenceSource: "reconstructed",
      conversation: {
        ...(loaded.conversation || {}),
        reconstructedAt: new Date().toISOString()
      }
    });
  }

  async function loadOrReconstruct({
    organizationId,
    prospectId,
    channel = "whatsapp",
    reconstructionInput = null,
    legacyProspectId = null,
    prospectPhone = null,
    displayName = null,
    ensureCore = false
  } = {}) {
    const existing = await loadContext({
      organizationId,
      prospectId,
      channel,
      legacyProspectId,
      prospectPhone,
      displayName,
      ensureCore
    });
    if (existing) {
      return { context: existing, source: "persisted" };
    }

    const identity = await resolvePersistenceIdentityScope({
      organizationId,
      prospectId,
      legacyProspectId,
      prospectPhone,
      displayName,
      ensureCore,
      resolveIdentity
    });
    const canonicalProspectId = identity.coreProspectId || prospectId;

    const reconstructed = reconstructContext({
      ...(reconstructionInput || {}),
      organizationId,
      prospectId: canonicalProspectId
    });

    return { context: reconstructed, source: "reconstructed" };
  }

  async function compareAndSaveContext({
    organizationId,
    prospectId,
    channel = "whatsapp",
    expectedVersion,
    nextContext,
    inboundMessageId = null,
    decisionCode = null,
    prospectClosed = false,
    legacyProspectId = null,
    prospectPhone = null,
    displayName = null,
    ensureCore = true
  } = {}) {
    const identity = await resolvePersistenceIdentityScope({
      organizationId,
      prospectId,
      legacyProspectId,
      prospectPhone,
      displayName,
      ensureCore,
      resolveIdentity
    });
    const canonicalProspectId = identity.coreProspectId || prospectId;
    assertTenantScope({ organizationId, prospectId: canonicalProspectId });

    if (prospectClosed) {
      const error = new Error("Closed prospect cannot accept active context writes");
      error.code = "CONTEXT_PROSPECT_CLOSED";
      error.statusCode = 409;
      throw error;
    }

    // Dual-load: prefer existing active under core OR legacy (never create a second active).
    let row = await findActiveRowByIdentity(repo, {
      organizationId,
      prospectId: canonicalProspectId,
      alternateProspectIds: identity.alternateProspectIds,
      channel
    });

    const sanitized = sanitizeContextForPersistence({
      ...protectConfirmedAppointmentFromDowngrade(
        row ? rowToContext(row, { canonicalProspectId }) : null,
        nextContext
      ),
      organizationId,
      prospectId: canonicalProspectId
    });
    assertNoForbiddenPayload(sanitized);

    // Duplicate inbound protection: same message already processed → no advance.
    if (
      inboundMessageId &&
      row?.last_processed_message_id &&
      row.last_processed_message_id === inboundMessageId
    ) {
      return {
        ok: true,
        idempotent: true,
        code: "CONTEXT_IDEMPOTENT_REPLAY",
        context: rowToContext(row, { canonicalProspectId })
      };
    }

    if (!row) {
      const created = await createContext({
        organizationId,
        prospectId: canonicalProspectId,
        channel,
        context: sanitized,
        messageId: inboundMessageId,
        source: nextContext?.persistenceSource || "v2",
        legacyProspectId: identity.legacyProspectId,
        prospectPhone,
        displayName,
        ensureCore: false
      });

      // Mark processed message on first persist after evaluation.
      if (inboundMessageId && created._persistence?.id) {
        const updated = await repo.compareAndUpdate({
          organizationId,
          id: created._persistence.id,
          expectedVersion: created._persistence.contextVersion,
          patch: {
            context_json: {
              ...sanitized,
              organizationId,
              prospectId: canonicalProspectId
            },
            last_inbound_message_id: inboundMessageId,
            last_processed_message_id: inboundMessageId,
            last_decision_code: decisionCode,
            last_language: normalizeLanguage(sanitized.preferredLanguage),
            needs_human_attention: Boolean(sanitized.attention?.needsHumanAttention)
          }
        });

        if (!updated.ok) {
          const error = new Error(updated.code || "CONTEXT_SAVE_FAILED");
          error.code = updated.code;
          error.statusCode = 409;
          error.current = rowToContext(updated.row, { canonicalProspectId });
          throw error;
        }

        return {
          ok: true,
          idempotent: false,
          code: null,
          context: rowToContext(updated.row, { canonicalProspectId })
        };
      }

      return { ok: true, idempotent: false, code: null, context: created };
    }

    if (expectedVersion == null) {
      const error = new Error("expectedVersion is required for compare-and-save");
      error.code = "CONTEXT_VERSION_REQUIRED";
      error.statusCode = 400;
      throw error;
    }

    // Save targets the loaded row id (may still be legacy-keyed). Do not rewrite prospect_id.
    const result = await repo.compareAndUpdate({
      organizationId,
      id: row.id,
      expectedVersion,
      patch: {
        context_json: {
          ...sanitized,
          organizationId,
          prospectId: canonicalProspectId
        },
        last_inbound_message_id: inboundMessageId || row.last_inbound_message_id,
        last_processed_message_id: inboundMessageId || row.last_processed_message_id,
        last_decision_code: decisionCode || row.last_decision_code,
        last_language: normalizeLanguage(sanitized.preferredLanguage),
        needs_human_attention: Boolean(sanitized.attention?.needsHumanAttention)
      }
    });

    if (!result.ok) {
      const error = new Error(result.code || "CONTEXT_VERSION_CONFLICT");
      error.code = result.code || "CONTEXT_VERSION_CONFLICT";
      error.statusCode = 409;
      error.current = rowToContext(result.row, { canonicalProspectId });
      throw error;
    }

    return {
      ok: true,
      idempotent: false,
      code: null,
      context: rowToContext(result.row, { canonicalProspectId })
    };
  }

  async function saveContext(args) {
    return compareAndSaveContext(args);
  }

  async function archiveContext({
    organizationId,
    prospectId = null,
    id = null,
    channel = "whatsapp",
    reason = "archived",
    legacyProspectId = null,
    prospectPhone = null
  } = {}) {
    if (!organizationId) {
      const error = new Error("organizationId is required");
      error.code = "CONTEXT_SCOPE_REQUIRED";
      error.statusCode = 400;
      throw error;
    }

    let targetId = id;
    let canonicalProspectId = prospectId;
    if (!targetId) {
      const identity = await resolvePersistenceIdentityScope({
        organizationId,
        prospectId,
        legacyProspectId,
        prospectPhone,
        ensureCore: false,
        resolveIdentity
      });
      canonicalProspectId = identity.coreProspectId || prospectId;
      const active = await findActiveRowByIdentity(repo, {
        organizationId,
        prospectId: canonicalProspectId,
        alternateProspectIds: identity.alternateProspectIds,
        channel
      });
      if (!active) {
        return null;
      }
      targetId = active.id;
    }

    const archived = await repo.archive({
      organizationId,
      id: targetId
    });

    if (!archived) {
      return null;
    }

    return {
      ...rowToContext(archived, { canonicalProspectId }),
      archiveReason: reason
    };
  }

  async function listRecentContextVersions({
    organizationId,
    prospectId = null,
    limit = 20
  } = {}) {
    if (!organizationId) {
      const error = new Error("organizationId is required");
      error.code = "CONTEXT_SCOPE_REQUIRED";
      throw error;
    }

    const rows = await repo.listRecent({ organizationId, prospectId, limit });
    return rows.map((row) => rowToContext(row, { canonicalProspectId: prospectId }));
  }

  return {
    createContext,
    loadContext,
    saveContext,
    archiveContext,
    compareAndSaveContext,
    loadOrReconstruct,
    reconstructContext,
    listRecentContextVersions,
    repository: repo
  };
}

module.exports = {
  createContextPersistenceService,
  rowToContext,
  protectConfirmedAppointmentFromDowngrade,
  resolvePersistenceIdentityScope,
  findActiveRowByIdentity
};
