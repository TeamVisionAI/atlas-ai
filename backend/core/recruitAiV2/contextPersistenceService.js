/**
 * Recruit AI v2 — durable context persistence service.
 * Implements BR-081 Phase 2. Persists sanitized context only.
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

const META_REVIEW_HINTS = ["meta review", "meta_review", "metareview", "reviewer@meta"];

function isMetaReviewScope({ organizationId, prospectId, channel } = {}) {
  const haystack = [organizationId, prospectId, channel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return META_REVIEW_HINTS.some((hint) => haystack.includes(hint));
}

function assertTenantScope({ organizationId, prospectId }) {
  if (!organizationId || !prospectId) {
    const error = new Error("organizationId and prospectId are required");
    error.code = "CONTEXT_SCOPE_REQUIRED";
    error.statusCode = 400;
    throw error;
  }
}

function rowToContext(row) {
  if (!row) {
    return null;
  }

  const context = mergeConversationContext(
    createConversationContext(),
    row.context_json || {}
  );

  return {
    ...context,
    prospectId: context.prospectId || row.prospect_id,
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
      source: row.source || "v2"
    }
  };
}

function createContextPersistenceService({ repository = null } = {}) {
  const repo = repository || createMemoryContextRepository();

  async function createContext({
    organizationId,
    prospectId,
    channel = "whatsapp",
    context = null,
    messageId = null,
    source = "v2"
  } = {}) {
    assertTenantScope({ organizationId, prospectId });

    if (isMetaReviewScope({ organizationId, prospectId, channel })) {
      const error = new Error("Meta Review fixtures cannot persist Recruit AI v2 context");
      error.code = "CONTEXT_META_REVIEW_ISOLATED";
      error.statusCode = 403;
      throw error;
    }

    const base = sanitizeContextForPersistence(
      context ||
        createConversationContext({
          organizationId,
          prospectId
        })
    );
    assertNoForbiddenPayload(base);

    const row = await repo.insert({
      organization_id: organizationId,
      prospect_id: prospectId,
      channel,
      context_json: {
        ...base,
        organizationId,
        prospectId,
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

    return rowToContext(row);
  }

  async function loadContext({
    organizationId,
    prospectId,
    channel = "whatsapp"
  } = {}) {
    assertTenantScope({ organizationId, prospectId });
    const row = await repo.findActiveByScope({
      organizationId,
      prospectId,
      channel
    });
    return rowToContext(row);
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
    reconstructionInput = null
  } = {}) {
    const existing = await loadContext({ organizationId, prospectId, channel });
    if (existing) {
      return { context: existing, source: "persisted" };
    }

    const reconstructed = reconstructContext({
      organizationId,
      prospectId,
      ...(reconstructionInput || {})
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
    prospectClosed = false
  } = {}) {
    assertTenantScope({ organizationId, prospectId });

    if (prospectClosed) {
      const error = new Error("Closed prospect cannot accept active context writes");
      error.code = "CONTEXT_PROSPECT_CLOSED";
      error.statusCode = 409;
      throw error;
    }

    if (isMetaReviewScope({ organizationId, prospectId, channel })) {
      const error = new Error("Meta Review fixtures cannot persist Recruit AI v2 context");
      error.code = "CONTEXT_META_REVIEW_ISOLATED";
      error.statusCode = 403;
      throw error;
    }

    let row = await repo.findActiveByScope({
      organizationId,
      prospectId,
      channel
    });

    const sanitized = sanitizeContextForPersistence({
      ...nextContext,
      organizationId,
      prospectId
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
        context: rowToContext(row)
      };
    }

    if (!row) {
      const created = await createContext({
        organizationId,
        prospectId,
        channel,
        context: sanitized,
        messageId: inboundMessageId,
        source: nextContext?.persistenceSource || "v2"
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
              prospectId
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
          error.current = rowToContext(updated.row);
          throw error;
        }

        return {
          ok: true,
          idempotent: false,
          code: null,
          context: rowToContext(updated.row)
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

    const result = await repo.compareAndUpdate({
      organizationId,
      id: row.id,
      expectedVersion,
      patch: {
        context_json: {
          ...sanitized,
          organizationId,
          prospectId
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
      error.current = rowToContext(result.row);
      throw error;
    }

    return {
      ok: true,
      idempotent: false,
      code: null,
      context: rowToContext(result.row)
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
    reason = "archived"
  } = {}) {
    if (!organizationId) {
      const error = new Error("organizationId is required");
      error.code = "CONTEXT_SCOPE_REQUIRED";
      error.statusCode = 400;
      throw error;
    }

    let targetId = id;
    if (!targetId) {
      const active = await repo.findActiveByScope({
        organizationId,
        prospectId,
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
      ...rowToContext(archived),
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
    return rows.map(rowToContext);
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
  isMetaReviewScope
};
