/**
 * Native WhatsApp Business app outbound sync (smb_message_echoes).
 * Persists human-authored messages, seals sticky HUMAN ownership, dedupes Atlas-originated wamids.
 */

const workflowEventService = require("../services/workflowEventService");
const { logConversation } = require("../services/logService");
const { findProspectInOrganization } = require("../services/supabaseService");
const {
  resolveWhatsAppInboundOrganizationId,
  WhatsAppInboundOrganizationError
} = require("./whatsappInboundOrganizationResolver");
const { resolveStoragePhone } = require("./whatsappProspectResolver");
const { buildHumanEchoCorrelationId } = require("./whatsappHumanOutboundClaim");
const { WHATSAPP_CORRELATION_PREFIX } = require("./whatsappConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const { resolveProspectCommunicationCode } = require("./prospectLanguage");
const { takeOverConversation } = require("./conversationsCenter/conversationsCenterOwnershipService");
const { HANDOFF_REASONS } = require("./conversationsCenter/constants");
const {
  findDeliveryByProviderMessageId,
  recordOutboundDelivery
} = require("../repositories/whatsappOutboundDeliveryRepository");

function duplicateSkipResult(correlationId, providerMessageId, phone, reason) {
  logWhatsAppStage("human_echo_duplicate_skipped", {
    providerMessageId,
    phone,
    reason
  });

  return {
    success: true,
    skipped: true,
    reason,
    correlationId
  };
}

async function isAtlasOriginatedOutbound(providerMessageId, dependencies = {}) {
  const wamid = String(providerMessageId || "").trim();
  if (!wamid) {
    return false;
  }

  const findDelivery =
    dependencies.findDeliveryByProviderMessageId || findDeliveryByProviderMessageId;
  const findEvent =
    dependencies.findWorkflowEventByCorrelationId ||
    workflowEventService.findWorkflowEventByCorrelationId;

  const delivery = await findDelivery(wamid);
  if (delivery) {
    const status = String(delivery.status || "").toLowerCase();
    // Human echo pipeline records sent_native_human — not Atlas API origin.
    if (status !== "sent_native_human") {
      return true;
    }
  }

  const outboundEvent = await findEvent(`${WHATSAPP_CORRELATION_PREFIX.OUTBOUND}${wamid}`);
  return Boolean(outboundEvent);
}

/**
 * @param {Object} echo — normalized echo from whatsappWebhookParser
 * @param {Object} [dependencies]
 */
async function processHumanWhatsAppOutboundEcho(echo, dependencies = {}) {
  const providerMessageId = String(echo?.providerMessageId || "").trim();
  if (!providerMessageId) {
    return {
      success: false,
      skipped: false,
      error: "MISSING_PROVIDER_MESSAGE_ID"
    };
  }

  const resolveOrg =
    dependencies.resolveWhatsAppInboundOrganizationId ||
    resolveWhatsAppInboundOrganizationId;
  const claimEcho =
    dependencies.claimWhatsAppHumanEchoCorrelation ||
    workflowEventService.claimWhatsAppHumanEchoCorrelation;
  const findProspect =
    dependencies.findProspectInOrganization || findProspectInOrganization;
  const persistLog = dependencies.logConversation || logConversation;
  const sealHumanOwnership =
    dependencies.takeOverConversation || takeOverConversation;

  let organizationResolution;
  try {
    organizationResolution = await resolveOrg({
      phoneNumberId:
        echo.phoneNumberId || echo.rawValue?.metadata?.phone_number_id || null,
      wabaId: echo.wabaId || null
    });
  } catch (error) {
    if (error instanceof WhatsAppInboundOrganizationError) {
      logWhatsAppStage("human_echo_organization_unresolved", {
        providerMessageId,
        level: "warn",
        code: error.code || error.publicCode || null
      });
      return {
        success: false,
        skipped: false,
        error: error.code || "WHATSAPP_ORGANIZATION_UNRESOLVED"
      };
    }
    throw error;
  }

  const organizationId = organizationResolution.organizationId;
  const ownerUserId = organizationResolution.ownerUserId || null;
  const storagePhone = resolveStoragePhone(echo.phone);

  if (await isAtlasOriginatedOutbound(providerMessageId, dependencies)) {
    return duplicateSkipResult(
      buildHumanEchoCorrelationId(providerMessageId),
      providerMessageId,
      storagePhone,
      "ATLAS_ORIGINATED_OUTBOUND"
    );
  }

  const correlationId = buildHumanEchoCorrelationId(providerMessageId);
  const claim = await claimEcho({
    correlationId,
    providerMessageId,
    prospectPhone: storagePhone,
    organizationId
  });

  if (!claim?.claimed) {
    if (claim?.reason === "DUPLICATE_PROVIDER_MESSAGE") {
      return duplicateSkipResult(
        correlationId,
        providerMessageId,
        storagePhone,
        "DUPLICATE_PROVIDER_MESSAGE"
      );
    }
    return {
      success: false,
      skipped: false,
      error: claim?.reason || "HUMAN_ECHO_CLAIM_FAILED",
      correlationId
    };
  }

  const prospect =
    (await findProspect(storagePhone, organizationId)) ||
    (await findProspect(echo.phone, organizationId)) ||
    null;

  if (!prospect?.phone) {
    logWhatsAppStage("human_echo_prospect_not_found", {
      providerMessageId,
      phone: storagePhone,
      organizationId,
      level: "warn"
    });
    return {
      success: false,
      skipped: false,
      error: "PROSPECT_NOT_FOUND",
      correlationId,
      organizationId
    };
  }

  const body = echo.body || `[${echo.messageType || "unknown"} message]`;

  const logResult = await persistLog({
    phone: prospect.phone,
    name: prospect.name || null,
    direction: "outgoing",
    message: body,
    intent: "AGENT_ACTION",
    pipeline: prospect.current_step || "NEW",
    currentStep: prospect.current_step || "NEW",
    language: resolveProspectCommunicationCode(prospect),
    city: prospect.city || null,
    state: prospect.state || null,
    actorOverride: "AGENT",
    eventCorrelationId: correlationId,
    providerMessageId,
    rawWebhookPayload: {
      message: echo.rawMessage,
      valueMetadata: {
        messaging_product: echo.rawValue?.messaging_product || "whatsapp",
        metadata: echo.rawValue?.metadata || null,
        changeField: echo.changeField || "smb_message_echoes"
      }
    }
  });

  if (!logResult.success) {
    logWhatsAppStage("human_echo_persist_failed", {
      providerMessageId,
      phone: prospect.phone,
      level: "error",
      error: logResult.error?.message || "unknown"
    });
    return {
      success: false,
      error: "MESSAGE_PERSIST_FAILED",
      correlationId
    };
  }

  const recordDelivery =
    dependencies.recordOutboundDelivery || recordOutboundDelivery;
  await recordDelivery({
    organizationId,
    prospectPhone: prospect.phone,
    intent: "WHATSAPP_BUSINESS_APP_OUTBOUND",
    status: "sent_native_human",
    deliveryMode: "native_app",
    providerMessageId,
    conversationLogId: logResult.log?.id || null,
    metadata: {
      source: "whatsapp_business_app_echo",
      ownerUserId,
      changeField: echo.changeField || "smb_message_echoes"
    }
  }).catch((deliveryError) => {
    logWhatsAppStage("human_echo_delivery_record_failed", {
      level: "warn",
      providerMessageId,
      error: deliveryError.message
    });
  });

  const ownership = await sealHumanOwnership(prospect.phone, {
    organizationId,
    prospectId: prospect.id || null,
    prospect,
    reason: HANDOFF_REASONS.WHATSAPP_BUSINESS_APP
  });

  logWhatsAppStage("human_echo_persisted", {
    providerMessageId,
    phone: prospect.phone,
    conversationLogId: logResult.log?.id || null,
    ownershipState: ownership.ownershipState || null
  });

  return {
    success: true,
    skipped: false,
    phone: prospect.phone,
    correlationId,
    conversationLogId: logResult.log?.id || null,
    organizationId,
    prospectId: prospect.id || null,
    ownerUserId,
    ownership
  };
}

module.exports = {
  processHumanWhatsAppOutboundEcho,
  isAtlasOriginatedOutbound,
  buildHumanEchoCorrelationId
};
