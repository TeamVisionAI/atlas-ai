/**
 * Conversations Center — HUMAN free-form reply via canonical WhatsApp outbound.
 * Tenant-scoped. Does not invent templates outside the customer-care window.
 */

const {
  CONVERSATION_OWNERSHIP_STATE
} = require("./constants");
const {
  assertConversationsCenterAccess,
  assertConversationsCenterAccessAsync,
  isProspectInConversationsTenantScope
} = require("./conversationsCenterAccess");
const {
  resolveConversationOwnershipState
} = require("./conversationsCenterOwnershipService");
const { loadPersistedWorkflowState } = require("../workflowStateStore");
const {
  sendAndPersistWhatsAppMessage
} = require("../whatsappOutboundPipeline");
const { DELIVERY_STATUSES } = require("../whatsappOutboundAuthorizationGate");
const { findProspect } = require("../../services/supabaseService");
const {
  resolveLastInboundWhatsAppPhoneNumberId
} = require("../whatsappLastInboundAsset");
const { logWhatsAppStage } = require("../whatsappStructuredLogger");

const HUMAN_COMPOSER_INTENT = "HUMAN_COMPOSER_REPLY";

function buildWindowClosedError(delivery) {
  const error = new Error(
    "Outside WhatsApp customer-service window. An approved template is required to message this prospect."
  );
  error.statusCode = 409;
  error.code = "WHATSAPP_TEMPLATE_REQUIRED_OUTSIDE_WINDOW";
  error.delivery = delivery || null;
  return error;
}

/**
 * @param {{
 *   phone: string,
 *   message: string,
 *   userId: string,
 *   organizationId: string,
 *   clientRequestId: string,
 *   authContext?: object,
 *   tenantFeatures?: object,
 *   accessAlreadyAsserted?: boolean,
 *   sendFn?: Function,
 *   findProspectFn?: Function,
 *   resolveInboundPhoneNumberIdFn?: Function,
 *   workflowStateOptions?: object
 * }} input
 */
async function sendHumanComposerReply(input = {}) {
  const {
    phone,
    message,
    userId,
    organizationId,
    clientRequestId,
    authContext = null,
    tenantFeatures = null,
    accessAlreadyAsserted = false,
    sendFn = sendAndPersistWhatsAppMessage,
    findProspectFn = findProspect,
    resolveInboundPhoneNumberIdFn = resolveLastInboundWhatsAppPhoneNumberId,
    workflowStateOptions = {}
  } = input;

  if (accessAlreadyAsserted !== true) {
    if (tenantFeatures != null) {
      assertConversationsCenterAccess({
        userId,
        organizationId,
        authContext,
        tenantFeatures
      });
    } else {
      await assertConversationsCenterAccessAsync({
        userId,
        organizationId,
        authContext
      });
    }
  }

  const text = String(message || "").trim();
  if (!text) {
    const error = new Error("Message text is required");
    error.statusCode = 400;
    error.code = "HUMAN_REPLY_EMPTY";
    throw error;
  }

  const requestId = String(clientRequestId || "").trim();
  if (!requestId || requestId.length < 8) {
    const error = new Error("clientRequestId is required for idempotent send");
    error.statusCode = 400;
    error.code = "HUMAN_REPLY_IDEMPOTENCY_REQUIRED";
    throw error;
  }

  const prospect = await findProspectFn(phone);
  if (
    !prospect ||
    !isProspectInConversationsTenantScope(prospect, organizationId)
  ) {
    const error = new Error("Conversation not found in Conversations Center scope");
    error.statusCode = 404;
    error.code = "CONVERSATION_NOT_FOUND";
    throw error;
  }

  const persisted = await loadPersistedWorkflowState(prospect.phone, {
    organizationId: prospect.organization_id || null,
    prospectId: prospect.id || null,
    ...workflowStateOptions
  });
  const ownershipState = resolveConversationOwnershipState(persisted);

  if (ownershipState !== CONVERSATION_OWNERSHIP_STATE.HUMAN) {
    const error = new Error("Human composer is only available when ownership is HUMAN");
    error.statusCode = 409;
    error.code = "COMPOSER_REQUIRES_HUMAN_OWNERSHIP";
    error.ownershipState = ownershipState;
    throw error;
  }

  const idempotencyKey = `cc-human-reply:${organizationId}:${prospect.phone}:${requestId}`;

  // Implements BR-165 — reply from the same receiving WhatsApp asset.
  const inboundPhoneNumberId = await resolveInboundPhoneNumberIdFn({
    organizationId,
    prospectId: prospect.id || null,
    prospectPhone: prospect.phone || null
  });

  const inboundAssetTail = inboundPhoneNumberId
    ? String(inboundPhoneNumberId).slice(-6)
    : null;

  logWhatsAppStage("human_composer_inbound_asset_resolved", {
    organizationId,
    prospectId: prospect.id || null,
    inboundPhoneNumberIdTail: inboundAssetTail,
    resolved: Boolean(inboundPhoneNumberId)
  });

  const result = await sendFn({
    to: prospect.phone,
    message: text,
    actor: "HUMAN",
    intent: HUMAN_COMPOSER_INTENT,
    organizationId,
    idempotencyKey,
    pipeline: "HUMAN",
    inboundPhoneNumberId: inboundPhoneNumberId || null
  });

  if (!result?.success) {
    const status = result?.status || null;
    const reason = result?.error || result?.delivery?.reason || status;

    if (
      status === DELIVERY_STATUSES.BLOCKED_WINDOW_CLOSED ||
      status === DELIVERY_STATUSES.BLOCKED_TEMPLATE_MISSING ||
      status === DELIVERY_STATUSES.BLOCKED_TEMPLATE_UNAPPROVED ||
      result?.delivery?.windowClosed === true ||
      result?.delivery?.extras?.windowClosed === true ||
      String(reason || "").includes("WINDOW") ||
      (String(reason || "").includes("TEMPLATE") &&
        status !== DELIVERY_STATUSES.PROVIDER_FAILED)
    ) {
      // Free-form human composer must not invent/send templates.
      throw buildWindowClosedError(result.delivery || result);
    }

    const error = new Error(
      typeof reason === "string" && reason
        ? reason
        : "Failed to send WhatsApp message"
    );
    error.statusCode = 502;
    error.code = "HUMAN_REPLY_SEND_FAILED";
    error.delivery = result.delivery || null;
    error.retryable = Boolean(result.retryable);
    throw error;
  }

  return {
    success: true,
    ownershipState,
    duplicateSuppressed: result.status === DELIVERY_STATUSES.DUPLICATE_SUPPRESSED,
    providerMessageId: result.providerMessageId || null,
    conversationLogId: result.conversationLogId || null,
    status: result.status || null,
    simulated: Boolean(result.simulated),
    actor: "HUMAN",
    prospectPhone: prospect.phone,
    prospectId: prospect.id || null,
    inboundPhoneNumberId: inboundPhoneNumberId || null,
    outboundPhoneNumberId:
      result.outboundPhoneNumberId || inboundPhoneNumberId || null
  };
}

module.exports = {
  HUMAN_COMPOSER_INTENT,
  sendHumanComposerReply,
  buildWindowClosedError
};
