/**
 * Canonical WhatsApp outbound authorization gate (BR-075 / BR-078).
 * Free-form text only inside the customer-care window; outside requires an approved Meta template.
 */

const { evaluateCustomerCareWindow } = require("./whatsappCustomerCareWindow");
const { resolveApprovedTemplate } = require("./whatsappApprovedTemplateRegistry");
const { isProspectOptedOut } = require("./whatsappTemplateVariableBuilder");

const DELIVERY_STATUSES = Object.freeze({
  SENT_FREEFORM: "sent_freeform",
  SENT_TEMPLATE: "sent_template",
  BLOCKED_WINDOW_CLOSED: "blocked_window_closed",
  BLOCKED_TEMPLATE_MISSING: "blocked_template_missing",
  BLOCKED_TEMPLATE_UNAPPROVED: "blocked_template_unapproved",
  RETRY_REQUIRED: "retry_required",
  PROVIDER_FAILED: "provider_failed",
  DUPLICATE_SUPPRESSED: "duplicate_suppressed"
});

function buildDeliveryResult({
  status,
  intent,
  prospectPhone = null,
  organizationId = null,
  permittedDeliveryMode = null,
  templateKey = null,
  metaTemplateName = null,
  language = null,
  retryable = false,
  reason = null,
  window = null,
  timestamp = new Date().toISOString(),
  extras = {}
}) {
  return {
    channel: "whatsapp",
    status,
    intent,
    prospectPhone,
    organizationId,
    permittedDeliveryMode,
    templateKey,
    metaTemplateName,
    language,
    retryable,
    reason,
    window: window
      ? {
          open: window.open,
          expiresAt: window.expiresAt,
          latestInboundAt: window.latestInboundAt,
          source: window.source,
          windowMs: window.windowMs
        }
      : null,
    timestamp,
    ...extras
  };
}

/**
 * Authorize an outbound WhatsApp attempt. Does not send.
 */
async function authorizeWhatsAppOutbound({
  intent,
  phone,
  organizationId = null,
  prospect = {},
  message = null,
  templateKey = null,
  templateVariables = {},
  templateButtonVariables = {},
  callerMetaTemplateName = null,
  now = new Date(),
  evaluateWindow = evaluateCustomerCareWindow,
  resolveTemplate = resolveApprovedTemplate
} = {}) {
  const safeProspect = prospect || {};
  const text = message == null ? "" : String(message).trim();

  if (isProspectOptedOut(safeProspect)) {
    return buildDeliveryResult({
      status: DELIVERY_STATUSES.BLOCKED_TEMPLATE_UNAPPROVED,
      intent,
      prospectPhone: phone,
      organizationId,
      permittedDeliveryMode: null,
      retryable: false,
      reason: "PROSPECT_OPTED_OUT",
      extras: { authorized: false }
    });
  }

  if (
    organizationId &&
    safeProspect.organization_id &&
    String(safeProspect.organization_id) !== String(organizationId)
  ) {
    return buildDeliveryResult({
      status: DELIVERY_STATUSES.BLOCKED_TEMPLATE_UNAPPROVED,
      intent,
      prospectPhone: phone,
      organizationId,
      permittedDeliveryMode: null,
      retryable: false,
      reason: "CROSS_ORGANIZATION_REJECTED",
      extras: { authorized: false }
    });
  }

  const window = await evaluateWindow({ phone, organizationId, now });

  if (window.open) {
    if (!text) {
      return buildDeliveryResult({
        status: DELIVERY_STATUSES.BLOCKED_TEMPLATE_MISSING,
        intent,
        prospectPhone: phone,
        organizationId,
        permittedDeliveryMode: "freeform",
        retryable: false,
        reason: "FREEFORM_BODY_REQUIRED_INSIDE_WINDOW",
        window
      });
    }

    return buildDeliveryResult({
      status: "authorized_freeform",
      intent,
      prospectPhone: phone,
      organizationId,
      permittedDeliveryMode: "freeform",
      retryable: false,
      reason: "WINDOW_OPEN",
      window,
      extras: { authorized: true, message: text }
    });
  }

  const template = resolveTemplate({
    intent,
    templateKey,
    prospect: safeProspect,
    variables: templateVariables,
    buttonVariables: templateButtonVariables,
    callerMetaTemplateName
  });

  if (!template.ok) {
    const status =
      template.status === "blocked_template_unapproved"
        ? DELIVERY_STATUSES.BLOCKED_TEMPLATE_UNAPPROVED
        : DELIVERY_STATUSES.BLOCKED_TEMPLATE_MISSING;

    return buildDeliveryResult({
      status,
      intent,
      prospectPhone: phone,
      organizationId,
      permittedDeliveryMode: "template",
      templateKey: template.templateKey,
      metaTemplateName: template.metaTemplateName,
      language: template.language,
      retryable: true,
      reason: template.reason || window.reason || DELIVERY_STATUSES.BLOCKED_WINDOW_CLOSED,
      window,
      extras: {
        authorized: false,
        missingVariables: template.missingVariables || null,
        category: template.category || null,
        windowClosed: true
      }
    });
  }

  return buildDeliveryResult({
    status: "authorized_template",
    intent,
    prospectPhone: phone,
    organizationId,
    permittedDeliveryMode: "template",
    templateKey: template.templateKey,
    metaTemplateName: template.metaTemplateName,
    language: template.language,
    retryable: false,
    reason: "APPROVED_TEMPLATE",
    window,
    extras: {
      authorized: true,
      languageCode: template.languageCode,
      variables: template.variables,
      buttonVariables: template.buttonVariables,
      expectedVariableKeys: template.expectedVariableKeys,
      expectedButtonVariableKeys: template.expectedButtonVariableKeys,
      category: template.category,
      version: template.version,
      zoomUrlDeliveryMode: template.zoomUrlDeliveryMode
    }
  });
}

module.exports = {
  DELIVERY_STATUSES,
  buildDeliveryResult,
  authorizeWhatsAppOutbound
};
