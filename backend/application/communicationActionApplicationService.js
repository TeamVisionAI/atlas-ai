/**
 * Channel-aware communication action application service.
 * Routes delivery through email/calendar or WhatsApp based on prospect contact info.
 */

const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const {
  requireTenantOrganizationId,
  isTenantScopedRequest
} = require("../core/tenantProspectLookup");
const {
  findProspectInOrganization,
  findProspectForSystemIngress
} = require("../services/supabaseService");
const { isProductionProspect } = require("../core/productionProspectFilter");
const { loadAgentState, mergeAgentState } = require("../core/agentActionState");
const { buildAgentActionTimelineMessage } = require("../core/agentActionCopy");
const { logConversation } = require("../services/logService");
const {
  DELIVERY_CHANNELS,
  resolveProspectEmail,
  resolveCalendarEventId,
  shouldAttemptEmailDelivery
} = require("../core/communicationChannelEngine");
const {
  WHATSAPP_TEMPLATES,
  DELIVERY_MODES,
  getTemplateFlagKey
} = require("../core/whatsappCommunicationEngine");
const {
  previewWhatsAppCommunication,
  recordWhatsAppCopyOpen
} = require("./whatsappCommunicationApplicationService");

function buildError(error, message, extras = {}) {
  return {
    success: false,
    error,
    message,
    ...extras
  };
}

function buildSuccess(message, extras = {}) {
  return {
    success: true,
    message,
    ...extras
  };
}

async function resolveTenantProspect(phone, options = {}) {
  const tenantScoped = isTenantScopedRequest(options);

  if (tenantScoped) {
    const organizationId = requireTenantOrganizationId(options.organizationId);
    return findProspectInOrganization(phone, organizationId);
  }

  if (options.organizationId) {
    return findProspectInOrganization(phone, options.organizationId);
  }

  return findProspectForSystemIngress(phone);
}

async function logAgentTimeline(prospect, message) {
  await logConversation({
    phone: prospect.phone,
    name: prospect.name,
    direction: "outgoing",
    message,
    intent: "AGENT_ACTION",
    pipeline: "AGENT",
    currentStep: prospect.current_step || "AGENT",
    language: prospect.language || "en",
    city: prospect.city,
    state: prospect.state
  });
}

async function recordZoomLinkSent(phone, agentState) {
  const flagKey = getTemplateFlagKey(WHATSAPP_TEMPLATES.ZOOM_INVITATION);

  if (!flagKey) {
    return agentState;
  }

  return mergeAgentState(phone, {
    flags: { [flagKey]: true }
  });
}

async function executeEmailZoomInvitation(prospect, organizationId, options = {}) {
  const attendeeEmail = resolveProspectEmail(prospect);
  const calendarEventId = await resolveCalendarEventId(prospect, organizationId);

  if (!attendeeEmail) {
    return { success: false, reason: "NO_EMAIL" };
  }

  if (!calendarEventId) {
    return { success: false, reason: "NO_CALENDAR_EVENT" };
  }

  const preview = await previewWhatsAppCommunication(
    prospect.phone,
    { sourceAction: "send_zoom_link" },
    options
  );

  const eventPatch = {};

  if (preview?.zoomUrl) {
    eventPatch.description = `Join your interview here:\n${preview.zoomUrl}`;
    eventPatch.location = preview.zoomUrl;
  }

  await googleCalendarIntegrationService.resendCalendarInvitation(
    organizationId,
    calendarEventId,
    attendeeEmail,
    eventPatch
  );

  await logAgentTimeline(
    prospect,
    buildAgentActionTimelineMessage("Agent resent Zoom invitation via email")
  );

  const agentState = loadAgentState(prospect.phone);
  const workflowState = await recordZoomLinkSent(prospect.phone, agentState);

  return {
    success: true,
    channel: DELIVERY_CHANNELS.EMAIL,
    deliveryMode: "calendar_invitation",
    attendeeEmail,
    calendarEventId,
    toastKey: "zoomInvitationSentByEmail",
    whatsappFallback: preview?.success
      ? {
          message: preview.message,
          template: preview.template,
          zoomUrl: preview.zoomUrl || null
        }
      : null,
    workflowState: {
      flags: workflowState.flags,
      outcome: workflowState.outcome
    }
  };
}

async function executeWhatsAppZoomInvitation(phone, params, options, { infoToastKey = null, toastKey = null } = {}) {
  const preview = await previewWhatsAppCommunication(
    phone,
    { sourceAction: "send_zoom_link" },
    options
  );

  if (!preview?.success) {
    return preview;
  }

  const recordResult = await recordWhatsAppCopyOpen(
    phone,
    {
      sourceAction: "send_zoom_link",
      template: preview.template,
      deliveryMode: DELIVERY_MODES.COPY_OPEN
    },
    options
  );

  if (!recordResult?.success) {
    return recordResult;
  }

  return buildSuccess("WhatsApp message prepared.", {
    channel: DELIVERY_CHANNELS.WHATSAPP,
    deliveryMode: DELIVERY_MODES.COPY_OPEN,
    template: preview.template,
    message: preview.message,
    zoomUrl: preview.zoomUrl || null,
    toastKey: toastKey || infoToastKey || "zoomInvitationPreparedForWhatsApp",
    infoToastKey,
    workflowState: recordResult.workflowState || null
  });
}

/**
 * Executes intelligent Zoom invitation delivery.
 * Email/calendar when available; WhatsApp fallback otherwise.
 */
async function executeZoomInvitationAction(phone, params = {}, options = {}) {
  if (!isProductionProspect(phone)) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const prospect = await resolveTenantProspect(phone, options);

  if (!prospect) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const organizationId = requireTenantOrganizationId(options.organizationId);
  const forceWhatsApp = params.channel === DELIVERY_CHANNELS.WHATSAPP;

  if (
    shouldAttemptEmailDelivery({
      prospect,
      organizationId,
      forceWhatsApp
    })
  ) {
    try {
      const emailResult = await executeEmailZoomInvitation(prospect, organizationId, options);

      if (emailResult.success) {
        return buildSuccess("Zoom invitation sent by email.", emailResult);
      }
    } catch (error) {
      console.error("[communicationAction] email zoom invitation failed:", error.message);
    }
  }

  const hasEmail = Boolean(resolveProspectEmail(prospect));

  return executeWhatsAppZoomInvitation(phone, params, options, {
    infoToastKey: forceWhatsApp || !hasEmail ? null : "zoomInvitationEmailFallbackWhatsApp",
    toastKey: forceWhatsApp
      ? "whatsappCopyOpenConfirmation"
      : hasEmail
        ? "whatsappCopyOpenConfirmation"
        : "zoomInvitationPreparedForWhatsApp"
  });
}

async function executeCommunicationAction(phone, params = {}, options = {}) {
  const sourceAction = params.sourceAction || null;

  if (sourceAction === "send_zoom_link") {
    return executeZoomInvitationAction(phone, params, options);
  }

  return buildError("UNSUPPORTED_ACTION", "This communication action is not channel-aware yet.", {
    sourceAction
  });
}

module.exports = {
  DELIVERY_CHANNELS,
  executeCommunicationAction,
  executeZoomInvitationAction
};
