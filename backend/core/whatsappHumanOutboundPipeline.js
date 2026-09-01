/**
 * Native WhatsApp Business app outbound sync (smb_message_echoes).
 * Persists human-authored messages, seals sticky HUMAN ownership, dedupes Atlas-originated wamids.
 * Implements BR-203 — contact-only echoes persist without creating a prospect.
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
const {
  WHATSAPP_CORRELATION_PREFIX,
  HUMAN_WHATSAPP_BUSINESS_APP_REPLY_INTENT
} = require("./whatsappConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const { resolveProspectCommunicationCode } = require("./prospectLanguage");
const { takeOverConversation } = require("./conversationsCenter/conversationsCenterOwnershipService");
const { HANDOFF_REASONS } = require("./conversationsCenter/constants");
const {
  findDeliveryByProviderMessageId,
  recordOutboundDelivery
} = require("../repositories/whatsappOutboundDeliveryRepository");

const AUTOMATED_ECHO_ACTORS = Object.freeze(new Set(["ATLAS", "SYSTEM"]));
const HUMAN_ECHO_ACTORS = Object.freeze(new Set(["HUMAN", "AGENT"]));

function resolveHumanEchoActor(echo = {}) {
  const actor = String(echo.actor || "").trim().toUpperCase();
  if (AUTOMATED_ECHO_ACTORS.has(actor)) {
    return { allowed: false, actor };
  }
  if (HUMAN_ECHO_ACTORS.has(actor)) {
    return { allowed: true, actor };
  }
  return { allowed: true, actor: "AGENT" };
}

function resolveEchoContactName(echo = {}, prospect = null) {
  if (prospect?.name) {
    return prospect.name;
  }
  return (
    echo.contactName ||
    echo.rawValue?.contacts?.[0]?.profile?.name ||
    echo.rawMessage?.profile?.name ||
    null
  );
}

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

  const echoActor = resolveHumanEchoActor(echo);
  if (!echoActor.allowed) {
    logWhatsAppStage("human_echo_automated_actor_blocked", {
      providerMessageId,
      actor: echoActor.actor
    });
    return {
      success: false,
      skipped: false,
      error: "AUTOMATED_ACTOR_NOT_ALLOWED",
      actor: echoActor.actor
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

  const contactOnly = !prospect?.phone;
  const persistPhone = contactOnly ? storagePhone : prospect.phone;
  const body = echo.body || `[${echo.messageType || "unknown"} message]`;
  const webhookPayload = {
    message: echo.rawMessage,
    valueMetadata: {
      messaging_product: echo.rawValue?.messaging_product || "whatsapp",
      metadata: echo.rawValue?.metadata || null,
      changeField: echo.changeField || "smb_message_echoes"
    }
  };

  // Implements BR-203 — persist native human/agent echoes without promoting a contact.
  const logResult = await persistLog({
    phone: persistPhone,
    name: resolveEchoContactName(echo, prospect),
    direction: "outgoing",
    message: body,
    intent: HUMAN_WHATSAPP_BUSINESS_APP_REPLY_INTENT,
    pipeline: contactOnly ? "CONTACT" : prospect.current_step || "NEW",
    currentStep: contactOnly ? "CONTACT" : prospect.current_step || "NEW",
    language: contactOnly ? null : resolveProspectCommunicationCode(prospect),
    city: contactOnly ? null : prospect.city || null,
    state: contactOnly ? null : prospect.state || null,
    ...(contactOnly ? { organizationId } : {}),
    actorOverride: echoActor.actor,
    eventCorrelationId: correlationId,
    providerMessageId,
    rawWebhookPayload: webhookPayload
  });

  if (!logResult.success) {
    logWhatsAppStage("human_echo_persist_failed", {
      providerMessageId,
      phone: persistPhone,
      contactOnly,
      level: "error",
      error: logResult.error?.message || "unknown"
    });
    return {
      success: false,
      error: "MESSAGE_PERSIST_FAILED",
      correlationId,
      contactOnly
    };
  }

  const recordDelivery =
    dependencies.recordOutboundDelivery || recordOutboundDelivery;
  await recordDelivery({
    organizationId,
    prospectPhone: persistPhone,
    intent: "WHATSAPP_BUSINESS_APP_OUTBOUND",
    status: "sent_native_human",
    deliveryMode: "native_app",
    providerMessageId,
    conversationLogId: logResult.log?.id || null,
    metadata: {
      source: "whatsapp_business_app_echo",
      ownerUserId,
      changeField: echo.changeField || "smb_message_echoes",
      contactOnly,
      prospectId: prospect?.id || null
    }
  }).catch((deliveryError) => {
    logWhatsAppStage("human_echo_delivery_record_failed", {
      level: "warn",
      providerMessageId,
      error: deliveryError.message
    });
  });

  let ownership = null;
  if (!contactOnly) {
    ownership = await sealHumanOwnership(prospect.phone, {
      organizationId,
      prospectId: prospect.id || null,
      prospect,
      reason: HANDOFF_REASONS.WHATSAPP_BUSINESS_APP
    });
  }

  logWhatsAppStage("human_echo_persisted", {
    providerMessageId,
    phone: persistPhone,
    conversationLogId: logResult.log?.id || null,
    contactOnly,
    ownershipState: ownership?.ownershipState || null
  });

  return {
    success: true,
    skipped: false,
    contactOnly,
    phone: persistPhone,
    correlationId,
    conversationLogId: logResult.log?.id || null,
    organizationId,
    prospectId: prospect?.id || null,
    ownerUserId,
    ownership
  };
}

module.exports = {
  processHumanWhatsAppOutboundEcho,
  isAtlasOriginatedOutbound,
  buildHumanEchoCorrelationId,
  resolveHumanEchoActor
};
