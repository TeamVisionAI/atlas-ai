/**
 * Recruit AI v2 — non-text WhatsApp media dialogue guard (BR-118).
 *
 * Structured messageType is authoritative. Placeholder text like
 * "[document message]" is a defensive fallback only.
 *
 * Does not invent conversational intents from media placeholders.
 * Does not mutate appointment/calendar. Execution remains fail-closed.
 */

const {
  INTENTS,
  NEXT_ACTIONS,
  REASON_CODES,
  LANGUAGES,
  APPOINTMENT_STATUS
} = require("./constants");

const NON_TEXT_MEDIA_TYPES = Object.freeze(
  new Set([
    "document",
    "image",
    "audio",
    "video",
    "sticker",
    "location",
    "contacts",
    "contact",
    "reaction"
  ])
);

const TEXT_LIKE_MEDIA_TYPES = Object.freeze(
  new Set(["text", "button", "interactive"])
);

const PLACEHOLDER_MEDIA_RE = /^\[([a-z0-9_]+) message\]$/i;

function normalizeMessageType(value) {
  const t = String(value || "")
    .trim()
    .toLowerCase();
  return t || null;
}

/**
 * Classify inbound as non-text media using structured type first.
 */
function classifyInboundMedia(message = {}, options = {}) {
  const structuredType = normalizeMessageType(
    message.messageType ||
      message.type ||
      options.messageType ||
      options.inboundMessageType ||
      null
  );

  if (structuredType && TEXT_LIKE_MEDIA_TYPES.has(structuredType)) {
    return {
      isNonTextMedia: false,
      mediaType: structuredType,
      detection: "structured_text_like"
    };
  }

  if (structuredType && NON_TEXT_MEDIA_TYPES.has(structuredType)) {
    return {
      isNonTextMedia: true,
      mediaType: structuredType,
      detection: "structured_message_type"
    };
  }

  // Defensive fallback — placeholders from whatsappWebhookParser / inbound pipeline.
  const text = String(message.text || message.body || "").trim();
  const match = text.match(PLACEHOLDER_MEDIA_RE);
  if (match) {
    const placeholderType = normalizeMessageType(match[1]);
    if (placeholderType && !TEXT_LIKE_MEDIA_TYPES.has(placeholderType)) {
      return {
        isNonTextMedia: true,
        mediaType: placeholderType,
        detection: "placeholder_text_fallback"
      };
    }
  }

  return {
    isNonTextMedia: false,
    mediaType: structuredType || "text",
    detection: "none"
  };
}

/**
 * Confirmed speak-only / deferred booking handoff where media must not reopen dialogue.
 */
function isPostConfirmDeferredSchedulingState(context = {}) {
  const appointment = context.appointment || {};
  const conversation = context.conversation || {};
  const lastOffer = conversation.lastOfferMade || null;
  const hasProposedSlot = Boolean(
    appointment.proposedDate && appointment.proposedTime
  );
  const statusProposed =
    appointment.status === APPOINTMENT_STATUS.PROPOSED ||
    appointment.status === "proposed";

  if (
    lastOffer === "appointment_confirm_deferred" &&
    statusProposed &&
    hasProposedSlot
  ) {
    return true;
  }

  // Equivalent: explicit confirm already received; create proposed but not performed.
  if (
    statusProposed &&
    hasProposedSlot &&
    (conversation.lastProspectIntent === INTENTS.SCHEDULE_CONFIRM ||
      conversation.lastQuestionAsked === "confirm_slot") &&
    lastOffer === "appointment_confirm_deferred"
  ) {
    return true;
  }

  return lastOffer === "appointment_confirm_deferred" && hasProposedSlot;
}

function buildNonTextMediaInterpretation({
  context = {},
  media = {},
  message = {},
  options = {}
} = {}) {
  const language =
    context.preferredLanguage === LANGUAGES.SPANISH
      ? LANGUAGES.SPANISH
      : context.preferredLanguage === LANGUAGES.ENGLISH
        ? LANGUAGES.ENGLISH
        : LANGUAGES.SPANISH;

  return {
    intent: INTENTS.NON_TEXT_MEDIA,
    confidence: 1,
    preferredLanguage: language,
    languageMeta: context.languageMeta || null,
    entities: {
      mediaType: media.mediaType || null,
      mediaDetection: media.detection || null,
      rawText: String(message.text || "").slice(0, 80),
      postConfirmDeferred: isPostConfirmDeferredSchedulingState(context)
    },
    reasonCodes: [REASON_CODES.NON_TEXT_MEDIA_RECEIVED],
    channel: options.channel || "whatsapp"
  };
}

/**
 * Soft media acknowledgment — preserve dialogue state (empty contextPatch).
 * Renders locale-aware short ack; never clarify_once / never invent intents.
 */
function decideNonTextMediaTurn({ context = {}, interpretation = null, media = {} } = {}) {
  const language =
    interpretation?.preferredLanguage ||
    context.preferredLanguage ||
    LANGUAGES.SPANISH;
  const postConfirm = isPostConfirmDeferredSchedulingState(context);

  return {
    conversationId: context.conversationId || null,
    prospectId: context.prospectId || null,
    organizationId: context.organizationId || null,
    preferredLanguage: language,
    intent: INTENTS.NON_TEXT_MEDIA,
    entities: {
      ...(interpretation?.entities || {}),
      mediaType: media.mediaType || interpretation?.entities?.mediaType || null,
      postConfirmDeferred: postConfirm
    },
    context: {
      missingFields: [],
      knownFacts: context.knownFacts || {},
      appointmentStatus: context.appointment?.status || null
    },
    availability: { status: "not_checked" },
    decision: {
      nextAction: NEXT_ACTIONS.ACKNOWLEDGE_NON_TEXT_MEDIA,
      shouldEscalate: false,
      requiresExplicitConfirmation: false,
      mayCreateAppointment: false,
      executionAuthorized: false,
      maySendOutbound: true,
      sideEffectsEnabled: false
    },
    confidence: 1,
    reasonCodes: [
      REASON_CODES.SIDE_EFFECTS_DISABLED,
      REASON_CODES.FORBID_INTERNAL_DIAGNOSTICS,
      REASON_CODES.NON_TEXT_MEDIA_RECEIVED,
      REASON_CODES.NON_TEXT_MEDIA_DIALOGUE_SKIPPED,
      ...(postConfirm ? [REASON_CODES.NON_TEXT_MEDIA_POST_CONFIRM_HANDLED] : [])
    ],
    customerReplyPlan: {
      acknowledgeRequest: true,
      forbidInternalDiagnostics: true,
      templateKey: "acknowledge_non_text_media",
      language,
      entities: {
        mediaType: media.mediaType || null,
        postConfirmDeferred: postConfirm
      }
    },
    // Empty patch — must not bump clarification or reopen scheduling.
    contextPatch: {}
  };
}

module.exports = {
  NON_TEXT_MEDIA_TYPES,
  TEXT_LIKE_MEDIA_TYPES,
  PLACEHOLDER_MEDIA_RE,
  classifyInboundMedia,
  isPostConfirmDeferredSchedulingState,
  buildNonTextMediaInterpretation,
  decideNonTextMediaTurn
};
