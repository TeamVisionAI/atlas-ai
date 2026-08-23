/**
 * Sprint 11.1 / BR-075 — Outbound WhatsApp message pipeline.
 * All real WhatsApp Cloud API sends authorize through the customer-care window + template gate.
 */

const crypto = require("crypto");
const axios = require("axios");
const { shouldMockExternalComms } = require("../dev/simulatorGuard");
const { logConversation } = require("../services/logService");
const { findProspectInOrganization } = require("../services/supabaseService");
const { normalizePhoneNumber } = require("./phoneNormalizer");
const { resolveStoragePhone } = require("./whatsappProspectResolver");
const { WHATSAPP_CORRELATION_PREFIX } = require("./whatsappConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const { resolveWhatsAppSendCredentials } = require("./whatsappSendCredentials");
const { onMessageSent } = require("./recruitingWorkflowHooks");
const { resolveProspectCommunicationCode } = require("./prospectLanguage");
const {
  authorizeWhatsAppOutbound,
  DELIVERY_STATUSES,
  buildDeliveryResult
} = require("./whatsappOutboundAuthorizationGate");
const {
  findSuccessfulDeliveryByIdempotencyKey,
  recordOutboundDelivery,
  linkOutboundDeliveryConversationLog
} = require("../repositories/whatsappOutboundDeliveryRepository");
const { recordBusinessEvent } = require("./recruitingBusinessEventBridge");
const { COMMUNICATION_EVENTS } = require("../modules/business-events/domain/EventTypes");
const {
  normalizeZoomDynamicUrlButtonParameter
} = require("./whatsappTemplateVariableBuilder");

function buildOutboundCorrelationId(providerMessageId) {
  return `${WHATSAPP_CORRELATION_PREFIX.OUTBOUND}${providerMessageId}`;
}

function buildTemplateComponents(
  expectedVariableKeys = [],
  variables = {},
  expectedButtonVariableKeys = [],
  buttonVariables = {}
) {
  const components = [];

  if (expectedVariableKeys.length) {
    components.push({
      type: "body",
      parameters: expectedVariableKeys.map((key) => ({
        type: "text",
        text: String(variables[key] ?? "")
      }))
    });
  }

  // BR-092 — Zoom invitation: Meta URL button base is https://zoom.us/j/{{1}}.
  // Parameter must be meeting-id suffix only (never j/{id}, never full URL).
  if (expectedButtonVariableKeys.includes("meeting_url")) {
    const raw = buttonVariables?.meeting_url;
    if (raw == null || String(raw).trim() === "") {
      const err = new Error("ZOOM_BUTTON_PARAM_MISSING");
      err.code = "ZOOM_BUTTON_PARAM_MISSING";
      throw err;
    }

    const normalized = normalizeZoomDynamicUrlButtonParameter(raw);
    if (!normalized.ok || !normalized.parameter) {
      const err = new Error(normalized.reason || "ZOOM_BUTTON_PARAM_INVALID");
      err.code = "ZOOM_BUTTON_PARAM_INVALID";
      throw err;
    }

    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: normalized.parameter }]
    });
  }

  return components.length ? components : undefined;
}

async function resolveProspectForOutbound(to, organizationId = null) {
  const metaTo = normalizePhoneNumber(to) || String(to || "").replace(/\D/g, "");
  const storagePhone = resolveStoragePhone(metaTo);

  if (!organizationId) {
    return null;
  }

  return (
    (await findProspectInOrganization(storagePhone, organizationId)) ||
    (await findProspectInOrganization(to, organizationId)) ||
    (await findProspectInOrganization(`+${metaTo}`, organizationId)) ||
    null
  );
}

async function persistBlockedOrFailedAttempt({
  prospect,
  storagePhone,
  organizationId,
  intent,
  actor,
  authorization,
  status,
  idempotencyKey,
  providerMessageId = null
}) {
  const safeProspect = prospect || {};
  const auditMessage = `[whatsapp_outbound:${status}] intent=${intent}; reason=${authorization.reason || status}`;

  const logResult = await logConversation({
    phone: safeProspect.phone || storagePhone,
    name: safeProspect.name || null,
    direction: "outgoing",
    message: auditMessage,
    intent: `WHATSAPP_OUTBOUND_${String(status).toUpperCase()}`,
    pipeline: safeProspect.current_step || "NEW",
    currentStep: safeProspect.current_step || "NEW",
    language: resolveProspectCommunicationCode(safeProspect),
    city: safeProspect.city || null,
    state: safeProspect.state || null,
    actorOverride: actor
  }).catch(() => ({ success: false }));

  await recordOutboundDelivery({
    organizationId: organizationId || safeProspect.organization_id || null,
    prospectPhone: safeProspect.phone || storagePhone,
    intent,
    idempotencyKey,
    status,
    deliveryMode: authorization.permittedDeliveryMode,
    templateKey: authorization.templateKey,
    metaTemplateName: authorization.metaTemplateName,
    language: authorization.language,
    retryable: true,
    reason: authorization.reason || status,
    providerMessageId,
    conversationLogId: logResult?.log?.id || null,
    metadata: {
      window: authorization.window,
      category: authorization.category || null,
      version: authorization.version || null,
      languageCode: authorization.languageCode || null,
      sanitized: true
    }
  }).catch(() => ({ success: false }));

  await recordBusinessEvent({
    phone: safeProspect.phone || storagePhone,
    eventType: COMMUNICATION_EVENTS.OUTBOUND_BLOCKED,
    actor,
    channel: "whatsapp",
    organizationId: organizationId || safeProspect.organization_id || null,
    summary: `WhatsApp outbound ${status}`,
    payload: {
      status,
      intent,
      reason: authorization.reason || status,
      retryable: true,
      templateKey: authorization.templateKey || null,
      idempotencyKey: idempotencyKey || null
    }
  }).catch(() => null);

  return logResult;
}

async function sendViaGraphApi({
  credentials,
  metaTo,
  mode,
  text,
  metaTemplateName,
  languageCode,
  expectedVariableKeys,
  variables,
  expectedButtonVariableKeys = [],
  buttonVariables = {}
}) {
  const components = buildTemplateComponents(
    expectedVariableKeys,
    variables,
    expectedButtonVariableKeys,
    buttonVariables
  );
  const body =
    mode === "template"
      ? {
          messaging_product: "whatsapp",
          to: metaTo,
          type: "template",
          template: {
            name: metaTemplateName,
            language: { code: languageCode },
            ...(components ? { components } : {})
          }
        }
      : {
          messaging_product: "whatsapp",
          to: metaTo,
          type: "text",
          text: { body: text }
        };

  const response = await axios.post(
    `https://graph.facebook.com/${credentials.graphApiVersion}/${credentials.phoneNumberId}/messages`,
    body,
    {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );

  return {
    success: true,
    providerMessageId: response.data?.messages?.[0]?.id || null,
    credentialSource: credentials.source
  };
}

/**
 * Canonical WhatsApp send entry — authorizes then delivers.
 */
async function sendAndPersistWhatsAppMessage({
  to,
  message,
  actor = "ATLAS",
  intent = "WHATSAPP_OUTBOUND",
  organizationId = null,
  templateKey = null,
  templateVariables = {},
  templateButtonVariables = {},
  callerMetaTemplateName = null,
  idempotencyKey = null,
  pipeline = null,
  now = new Date(),
  inboundPhoneNumberId = null
} = {}) {
  if (!to) {
    return {
      success: false,
      status: DELIVERY_STATUSES.PROVIDER_FAILED,
      error: "PHONE_REQUIRED",
      retryable: false
    };
  }

  const metaTo = normalizePhoneNumber(to) || String(to || "").replace(/\D/g, "");
  const storagePhone = resolveStoragePhone(metaTo);
  const prospectRecord = await resolveProspectForOutbound(to, organizationId);
  const prospect = prospectRecord || {};
  const resolvedOrgId = organizationId || prospectRecord?.organization_id || null;

  if (idempotencyKey) {
    const existing = await findSuccessfulDeliveryByIdempotencyKey({
      organizationId: resolvedOrgId,
      idempotencyKey
    }).catch(() => null);

    if (existing) {
      return {
        success: true,
        status: DELIVERY_STATUSES.DUPLICATE_SUPPRESSED,
        simulated: false,
        providerMessageId: existing.provider_message_id || null,
        conversationLogId: existing.conversation_log_id || null,
        retryable: false,
        reason: "IDEMPOTENT_SUCCESS_EXISTS",
        delivery: buildDeliveryResult({
          status: DELIVERY_STATUSES.DUPLICATE_SUPPRESSED,
          intent,
          prospectPhone: prospect?.phone || storagePhone,
          organizationId: resolvedOrgId,
          permittedDeliveryMode: existing.delivery_mode,
          templateKey: existing.template_key,
          reason: "IDEMPOTENT_SUCCESS_EXISTS",
          retryable: false
        })
      };
    }
  }

  const authorization = await authorizeWhatsAppOutbound({
    intent,
    phone: prospect.phone || storagePhone,
    organizationId: resolvedOrgId,
    prospect,
    message,
    templateKey,
    templateVariables,
    templateButtonVariables,
    callerMetaTemplateName,
    now
  });

  const isAuthorized =
    authorization.status === "authorized_freeform" ||
    authorization.status === "authorized_template";

  if (!isAuthorized) {
    await persistBlockedOrFailedAttempt({
      prospect: prospectRecord,
      storagePhone,
      organizationId: resolvedOrgId,
      intent,
      actor,
      authorization,
      status: authorization.status,
      idempotencyKey
    });

    return {
      success: false,
      status: authorization.status,
      error: authorization.reason,
      retryable: Boolean(authorization.retryable),
      delivery: authorization,
      providerMessageId: null,
      conversationLogId: null
    };
  }

  const mode = authorization.permittedDeliveryMode;
  const text =
    mode === "freeform"
      ? String(authorization.message || message || "").trim()
      : `[template:${authorization.metaTemplateName}]`;

  const providerMessageIdSeed = crypto.randomUUID();
  let sendResult = {
    success: true,
    simulated: false,
    providerMessageId: null
  };

  if (shouldMockExternalComms()) {
    logWhatsAppStage("outbound_delivery_mocked", {
      to,
      mode,
      preview: text.slice(0, 80)
    });
    sendResult = {
      success: true,
      simulated: true,
      providerMessageId: `mock_${providerMessageIdSeed}`
    };
  } else {
    const credentials = await resolveWhatsAppSendCredentials(resolvedOrgId, {
      phoneNumberId: inboundPhoneNumberId
    });

    if (!credentials?.accessToken || !credentials?.phoneNumberId) {
      const failedAuth = {
        ...authorization,
        reason: "WHATSAPP_SEND_CREDENTIALS_MISSING",
        status: DELIVERY_STATUSES.RETRY_REQUIRED,
        retryable: true
      };

      await persistBlockedOrFailedAttempt({
        prospect,
        storagePhone,
        organizationId: resolvedOrgId,
        intent,
        actor,
        authorization: failedAuth,
        status: DELIVERY_STATUSES.RETRY_REQUIRED,
        idempotencyKey
      });

      return {
        success: false,
        status: DELIVERY_STATUSES.RETRY_REQUIRED,
        error: "WhatsApp send credentials not configured (Embedded Signup or WHATSAPP_* env).",
        retryable: true,
        delivery: failedAuth
      };
    }

    try {
      const graphResult = await sendViaGraphApi({
        credentials,
        metaTo,
        mode,
        text: authorization.message || message,
        metaTemplateName: authorization.metaTemplateName,
        languageCode: authorization.languageCode,
        expectedVariableKeys: authorization.expectedVariableKeys || [],
        variables: authorization.variables || templateVariables,
        expectedButtonVariableKeys: authorization.expectedButtonVariableKeys || [],
        buttonVariables: authorization.buttonVariables || templateButtonVariables
      });

      sendResult = {
        success: true,
        simulated: false,
        providerMessageId: graphResult.providerMessageId || providerMessageIdSeed,
        credentialSource: graphResult.credentialSource
      };

      logWhatsAppStage("outbound_delivery_sent", {
        to,
        mode,
        providerMessageId: sendResult.providerMessageId,
        credentialSource: sendResult.credentialSource
      });
    } catch (error) {
      const safeReason = error.response?.data?.error?.message || error.message || "PROVIDER_FAILED";
      logWhatsAppStage("outbound_delivery_failed", {
        to,
        level: "error",
        status: error.response?.status || null,
        error: safeReason
      });

      const failedAuth = {
        ...authorization,
        reason: "PROVIDER_FAILED",
        status: DELIVERY_STATUSES.PROVIDER_FAILED,
        retryable: true
      };

      await persistBlockedOrFailedAttempt({
        prospect,
        storagePhone,
        organizationId: resolvedOrgId,
        intent,
        actor,
        authorization: failedAuth,
        status: DELIVERY_STATUSES.PROVIDER_FAILED,
        idempotencyKey
      });

      return {
        success: false,
        status: DELIVERY_STATUSES.PROVIDER_FAILED,
        error: safeReason,
        retryable: true,
        delivery: failedAuth
      };
    }
  }

  const status =
    mode === "template" ? DELIVERY_STATUSES.SENT_TEMPLATE : DELIVERY_STATUSES.SENT_FREEFORM;
  const outboundCorrelationId = buildOutboundCorrelationId(
    sendResult.providerMessageId || providerMessageIdSeed
  );

  const deliveryMetadata = {
    simulated: Boolean(sendResult.simulated),
    window: authorization.window,
    category: authorization.category || null,
    version: authorization.version || null,
    languageCode: authorization.languageCode || null,
    sanitized: true,
    credentialSource: sendResult.credentialSource || null,
    inboundPhoneNumberId: inboundPhoneNumberId || null
  };

  // A — Persist delivery SoR immediately after wamid so Meta status webhooks can match.
  // conversation_log_id is linked after transcript persistence (same row, no duplicate).
  let earlyDelivery = await recordOutboundDelivery({
    organizationId: resolvedOrgId,
    prospectPhone: prospect?.phone || storagePhone,
    intent,
    idempotencyKey,
    status,
    deliveryMode: mode,
    templateKey: authorization.templateKey || null,
    metaTemplateName: authorization.metaTemplateName || null,
    language: authorization.language || null,
    retryable: false,
    reason: authorization.reason || status,
    providerMessageId: sendResult.providerMessageId,
    conversationLogId: null,
    metadata: deliveryMetadata
  }).catch((error) => {
    logWhatsAppStage("outbound_delivery_row_early_persist_failed", {
      to,
      level: "warn",
      providerMessageId: sendResult.providerMessageId || null,
      error: error.message || "unknown"
    });
    return { success: false, error };
  });

  if (!earlyDelivery?.success) {
    logWhatsAppStage("outbound_delivery_row_early_persist_failed", {
      to,
      level: "warn",
      providerMessageId: sendResult.providerMessageId || null,
      error: earlyDelivery?.error?.message || earlyDelivery?.error || "insert_failed"
    });
  }

  const persistBody =
    mode === "template"
      ? `[whatsapp_template:${authorization.metaTemplateName}] intent=${intent}`
      : String(authorization.message || message || "").trim();

  const logResult = await logConversation({
    phone: prospect?.phone || storagePhone,
    name: prospect?.name || null,
    direction: "outgoing",
    message: persistBody,
    intent,
    pipeline: pipeline || prospect?.current_step || "NEW",
    currentStep: prospect?.current_step || "NEW",
    language: resolveProspectCommunicationCode(prospect),
    city: prospect?.city || null,
    state: prospect?.state || null,
    eventCorrelationId: outboundCorrelationId,
    providerMessageId: sendResult.providerMessageId || providerMessageIdSeed,
    actorOverride: actor
  });

  if (!logResult.success) {
    logWhatsAppStage("outbound_persist_failed", {
      to,
      level: "error",
      error: logResult.error?.message || "unknown",
      providerMessageId: sendResult.providerMessageId || null,
      deliveryRowId: earlyDelivery?.row?.id || null
    });
  } else {
    logWhatsAppStage("message_persisted", {
      phone: to,
      direction: "outgoing",
      conversationLogId: logResult.log?.id || null
    });
    logWhatsAppStage("event_emitted", {
      phone: to,
      eventType: "MessageSent"
    });

    if (earlyDelivery?.success && (earlyDelivery.row?.id || sendResult.providerMessageId)) {
      const linked = await linkOutboundDeliveryConversationLog({
        deliveryId: earlyDelivery.row?.id || null,
        providerMessageId: sendResult.providerMessageId,
        conversationLogId: logResult.log?.id
      }).catch((error) => {
        logWhatsAppStage("outbound_delivery_log_link_failed", {
          to,
          level: "warn",
          providerMessageId: sendResult.providerMessageId || null,
          conversationLogId: logResult.log?.id || null,
          error: error.message || "unknown"
        });
        return { success: false };
      });

      if (!linked?.success) {
        logWhatsAppStage("outbound_delivery_log_link_failed", {
          to,
          level: "warn",
          providerMessageId: sendResult.providerMessageId || null,
          conversationLogId: logResult.log?.id || null,
          reason: linked?.reason || "link_failed"
        });
      }
    } else {
      // Early insert failed — best-effort single late insert (no Graph resend).
      await recordOutboundDelivery({
        organizationId: resolvedOrgId,
        prospectPhone: prospect?.phone || storagePhone,
        intent,
        idempotencyKey,
        status,
        deliveryMode: mode,
        templateKey: authorization.templateKey || null,
        metaTemplateName: authorization.metaTemplateName || null,
        language: authorization.language || null,
        retryable: false,
        reason: authorization.reason || status,
        providerMessageId: sendResult.providerMessageId,
        conversationLogId: logResult.log?.id || null,
        metadata: deliveryMetadata
      }).catch(() => ({ success: false }));
    }

    await onMessageSent({
      phone: prospect?.phone || storagePhone,
      message: persistBody,
      organizationId: resolvedOrgId,
      summary: intent === "FACEBOOK_LEAD_WELCOME" ? "Initial outreach" : "Message sent"
    }).catch((error) => {
      console.warn("[whatsappOutboundPipeline] recruiting workflow hook failed:", error.message);
    });
  }

  return {
    success: true,
    status,
    simulated: Boolean(sendResult.simulated),
    providerMessageId: sendResult.providerMessageId,
    conversationLogId: logResult.log?.id || null,
    deliveryId: earlyDelivery?.row?.id || null,
    retryable: false,
    delivery: buildDeliveryResult({
      status,
      intent,
      prospectPhone: prospect?.phone || storagePhone,
      organizationId: resolvedOrgId,
      permittedDeliveryMode: mode,
      templateKey: authorization.templateKey,
      metaTemplateName: authorization.metaTemplateName,
      language: authorization.language,
      retryable: false,
      reason: authorization.reason,
      window: authorization.window,
      extras: {
        category: authorization.category || null,
        version: authorization.version || null,
        languageCode: authorization.languageCode || null
      }
    })
  };
}

module.exports = {
  sendAndPersistWhatsAppMessage,
  buildOutboundCorrelationId,
  buildTemplateComponents,
  resolveProspectForOutbound
};
