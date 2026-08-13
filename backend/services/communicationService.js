/**
 * Communication service — personalized prospect communications.
 * Implements BR-027: prospect-facing messages use the assigned representative identity.
 *
 * Interview WhatsApp actions (details / reminder / zoom):
 * - Inside BR-075 window → freeform composer preferred (preview still available)
 * - Outside window → approved Meta template via canonical outbound pipeline (no wa.me)
 */

const appointmentApplicationService = require("../application/appointmentApplicationService");
const {
  previewWhatsAppCommunication,
  recordWhatsAppCopyOpen,
  DELIVERY_MODES
} = require("../application/whatsappCommunicationApplicationService");
const { isProductionProspect } = require("../core/productionProspectFilter");
const { requireTenantOrganizationId } = require("../core/tenantProspectLookup");
const { resolveAssignedRepresentative } = require("../core/representativeProfileEngine");
const {
  resolveInterviewDetailsTemplate,
  resolveInterviewReminderTemplate,
  resolveZoomInvitationTemplate,
  resolveOfficeLocationTemplate
} = require("../core/whatsappCommunicationEngine");
const { payloadsMatchForSend } = require("../core/communicationOutboundPayloadEngine");
const { logInterviewerTrace } = require("../dev/interviewerTrace");
const { resolveRecruiterDisplayName } = require("../core/whatsappCommunicationEngine");
const { evaluateCustomerCareWindow } = require("../core/whatsappCustomerCareWindow");
const { sendTextMessage } = require("./whatsappService");
const {
  buildInterviewDetailsVariables,
  buildInterviewReminderVariables,
  buildZoomInvitationVariables
} = require("../core/whatsappTemplateVariableBuilder");
const { findProspectInOrganization } = require("./supabaseService");

const NATIVE_TEMPLATE_SOURCE_ACTIONS = new Set([
  "resend_interview_details",
  "send_interview_reminder",
  "send_zoom_link"
]);

const SOURCE_ACTION_TO_TEMPLATE_KEY = Object.freeze({
  resend_interview_details: "interview_details",
  send_interview_reminder: "interview_reminder",
  send_zoom_link: "zoom_invitation"
});

const SOURCE_ACTION_TO_PIPELINE_INTENT = Object.freeze({
  resend_interview_details: "INTERVIEW_DETAILS",
  send_interview_reminder: "send_interview_reminder",
  send_zoom_link: "SEND_ZOOM_LINK"
});

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
    deliveryMode: extras.deliveryMode || DELIVERY_MODES.COPY_OPEN,
    ...extras
  };
}

function sanitizeCareWindow(careWindow) {
  if (!careWindow || typeof careWindow !== "object") {
    return null;
  }

  return {
    open: Boolean(careWindow.open),
    reason: careWindow.reason || null,
    latestInboundAt: careWindow.latestInboundAt || null,
    expiresAt: careWindow.expiresAt || null,
    windowMs: careWindow.windowMs || null
  };
}

async function loadCustomerCareWindow(phone, organizationId) {
  const careWindow = await evaluateCustomerCareWindow({
    phone,
    organizationId
  });
  return sanitizeCareWindow(careWindow);
}

async function prepareAppointmentCommunication(appointmentId, context, { template, sourceAction }) {
  const organizationId = requireTenantOrganizationId(context.organizationId);
  const appointment = await appointmentApplicationService.getAppointment(appointmentId, organizationId);
  const phone = appointment.prospectPhone;

  if (!isProductionProspect(phone)) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const representative = await resolveAssignedRepresentative(appointment, context);

  logInterviewerTrace({
    authenticatedUserId: context.actorUser?.id || null,
    authenticatedUserName: resolveRecruiterDisplayName(context.actorUser),
    interviewerUserId: appointment?.interviewerUserId || null,
    interviewerName: appointment?.interviewerName || null,
    appointmentId: appointment?.id || null,
    source: "communicationPreview.prepareAppointmentCommunication"
  });

  logInterviewerTrace({
    authenticatedUserId: context.actorUser?.id || null,
    authenticatedUserName: resolveRecruiterDisplayName(context.actorUser),
    interviewerUserId: representative?.interviewerUserId || representative?.user?.id || null,
    interviewerName: representative?.profile?.name || representative?.interviewerName || null,
    appointmentId: appointment?.id || null,
    source: "communicationPreview.prepareAppointmentCommunication.resolved"
  });

  const serviceOptions = {
    organizationId,
    tenantScoped: true,
    actorUser: context.actorUser || null,
    representativeUser: representative.user,
    representativeProfile: representative.profile,
    representativeFallbackUsed: representative.fallbackUsed,
    appointment
  };

  const preview = await previewWhatsAppCommunication(
    phone,
    {
      template,
      sourceAction
    },
    serviceOptions
  );

  if (!preview?.success) {
    return preview;
  }

  const customerCareWindow = await loadCustomerCareWindow(phone, organizationId);

  return {
    success: true,
    phone,
    channel: "whatsapp",
    template: preview.template || template,
    message: preview.message,
    language: preview.language,
    zoomUrl: preview.zoomUrl || null,
    outboundPayload: preview.outboundPayload,
    representative: representative.profile,
    representativeFallbackUsed: representative.fallbackUsed,
    customerCareWindow,
    preferComposer: Boolean(customerCareWindow?.open),
    deliveryModeHint: customerCareWindow?.open
      ? "freeform_composer"
      : "approved_template"
  };
}

async function prepareInterviewDetailsCommunication(appointmentId, context = {}) {
  return prepareAppointmentCommunication(appointmentId, context, {
    template: resolveInterviewDetailsTemplate(),
    sourceAction: "resend_interview_details"
  });
}

async function prepareInterviewReminderCommunication(appointmentId, context = {}) {
  return prepareAppointmentCommunication(appointmentId, context, {
    template: resolveInterviewReminderTemplate(),
    sourceAction: "send_interview_reminder"
  });
}

async function prepareZoomInvitationCommunication(appointmentId, context = {}) {
  return prepareAppointmentCommunication(appointmentId, context, {
    template: resolveZoomInvitationTemplate(),
    sourceAction: "send_zoom_link"
  });
}

async function prepareOfficeLocationCommunication(appointmentId, context = {}) {
  return prepareAppointmentCommunication(appointmentId, context, {
    template: resolveOfficeLocationTemplate(),
    sourceAction: "send_office_location"
  });
}

/**
 * Preview-only — same payload assembly as send, without recording delivery.
 */
async function previewInterviewDetailsCommunication(appointmentId, context = {}) {
  const prepared = await prepareInterviewDetailsCommunication(appointmentId, context);

  if (!prepared?.success) {
    return prepared;
  }

  return buildSuccess("Interview invitation preview ready.", prepared);
}

async function sendNativeApprovedTemplate({
  appointmentId,
  context,
  sourceAction,
  prepared
}) {
  const organizationId = requireTenantOrganizationId(context.organizationId);
  const appointment = await appointmentApplicationService.getAppointment(
    appointmentId,
    organizationId
  );
  const prospect = await findProspectInOrganization(prepared.phone, organizationId);

  if (!prospect) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const templateKey = SOURCE_ACTION_TO_TEMPLATE_KEY[sourceAction];
  const intent = SOURCE_ACTION_TO_PIPELINE_INTENT[sourceAction];

  if (!templateKey || !intent) {
    return buildError(
      "UNSUPPORTED_NATIVE_TEMPLATE_ACTION",
      "This WhatsApp action cannot use the approved-template path."
    );
  }

  let templateVariables = {};
  let templateButtonVariables = {};

  if (templateKey === "interview_details") {
    templateVariables = buildInterviewDetailsVariables(appointment, prospect);
  } else if (templateKey === "interview_reminder") {
    templateVariables = buildInterviewReminderVariables(appointment, prospect);
  } else if (templateKey === "zoom_invitation") {
    const zoomBuilt = buildZoomInvitationVariables(
      prospect,
      prepared.zoomUrl || appointment.virtualMeetingUrl || null
    );
    if (!zoomBuilt.ok) {
      return buildError(
        zoomBuilt.reason || "MEETING_URL_NOT_CONFIGURED",
        "No meeting link is available for the Zoom invitation template.",
        { resourceKey: "zoomInterviewUrl" }
      );
    }
    templateVariables = zoomBuilt.variables;
    templateButtonVariables = zoomBuilt.buttonVariables || {};
  }

  const idempotencyKey = `native-interview-wa:${organizationId}:${appointmentId}:${sourceAction}:${Date.now()}`;

  const result = await sendTextMessage(prepared.phone, prepared.message || "", {
    actor: "HUMAN",
    intent,
    organizationId,
    templateKey,
    templateVariables,
    templateButtonVariables,
    idempotencyKey
  });

  if (!result?.success) {
    const status = result?.status || null;
    const safeMessage =
      status === "blocked_window_closed" || status === "blocked_template_missing"
        ? "Outside the 24-hour WhatsApp window. An approved template is required, or templates are not active yet."
        : "Could not send the approved WhatsApp template.";

    return buildError(status || "TEMPLATE_SEND_FAILED", safeMessage, {
      deliveryMode: DELIVERY_MODES.AUTOMATIC,
      customerCareWindow: prepared.customerCareWindow || null,
      retryable: Boolean(result?.retryable),
      delivery: result?.delivery
        ? {
            status: result.delivery.status || status,
            reason: result.delivery.reason || result.error || null,
            windowOpen: result.delivery.window?.open ?? false
          }
        : null
    });
  }

  return buildSuccess("Approved WhatsApp template sent.", {
    channel: "whatsapp",
    template: prepared.template,
    templateKey,
    phone: prepared.phone,
    language: prepared.language,
    zoomUrl: prepared.zoomUrl || null,
    message: null,
    deliveryMode: DELIVERY_MODES.AUTOMATIC,
    customerCareWindow: prepared.customerCareWindow || null,
    toastKey: "whatsappNativeTemplateSent",
    opensWaMe: false,
    providerMessageId: result.providerMessageId || null,
    deliveryStatus: result.status || null,
    workflowState: null
  });
}

async function sendAppointmentCommunication(appointmentId, context, { sourceAction, prepared }) {
  const organizationId = requireTenantOrganizationId(context.organizationId);
  const customerCareWindow =
    prepared.customerCareWindow ||
    (await loadCustomerCareWindow(prepared.phone, organizationId));

  // Migrated interview actions: outside window → Meta template pipeline (no wa.me).
  if (
    NATIVE_TEMPLATE_SOURCE_ACTIONS.has(sourceAction) &&
    customerCareWindow &&
    customerCareWindow.open === false
  ) {
    return sendNativeApprovedTemplate({
      appointmentId,
      context,
      sourceAction,
      prepared: { ...prepared, customerCareWindow }
    });
  }

  const appointment = await appointmentApplicationService.getAppointment(
    appointmentId,
    organizationId
  );
  const representative = await resolveAssignedRepresentative(appointment, context);
  const serviceOptions = {
    organizationId,
    tenantScoped: true,
    actorUser: context.actorUser || null,
    representativeUser: representative.user,
    representativeProfile: representative.profile,
    representativeFallbackUsed: representative.fallbackUsed,
    appointment
  };

  // Inside window (or non-migrated actions): keep existing copy/open recording for legacy.
  // Frontend native interview path uses HumanWhatsAppComposer instead when window is open.
  const recordResult = await recordWhatsAppCopyOpen(
    prepared.phone,
    {
      template: prepared.template,
      sourceAction,
      deliveryMode: DELIVERY_MODES.COPY_OPEN
    },
    serviceOptions
  );

  if (!recordResult?.success) {
    return recordResult;
  }

  const sendMatchesPreview = payloadsMatchForSend(
    prepared.outboundPayload,
    recordResult.outboundPayload
  );

  if (!sendMatchesPreview) {
    console.warn("[communicationService] Preview/send payload mismatch.", {
      appointmentId,
      sourceAction
    });
  }

  return buildSuccess("Message prepared.", {
    channel: "whatsapp",
    template: prepared.template,
    message: prepared.message,
    phone: prepared.phone,
    language: prepared.language,
    zoomUrl: prepared.zoomUrl || null,
    outboundPayload: recordResult.outboundPayload || prepared.outboundPayload,
    representative: representative.profile,
    representativeFallbackUsed: representative.fallbackUsed,
    toastKey: "whatsappCopyOpenConfirmation",
    workflowState: recordResult.workflowState || null,
    previewMatchesSend: sendMatchesPreview,
    customerCareWindow,
    preferComposer: Boolean(customerCareWindow?.open),
    deliveryMode: DELIVERY_MODES.COPY_OPEN,
    opensWaMe: true
  });
}

/**
 * Sends personalized interview details for an appointment.
 * Loads data, resolves representative + language, selects template, and records delivery.
 */
async function sendInterviewDetails(appointmentId, context = {}) {
  const prepared = await prepareInterviewDetailsCommunication(appointmentId, context);

  if (!prepared?.success) {
    return prepared;
  }

  return sendAppointmentCommunication(appointmentId, context, {
    sourceAction: "resend_interview_details",
    prepared
  });
}

/**
 * Preview-only — interview reminder uses the same payload assembly as send.
 */
async function previewInterviewReminderCommunication(appointmentId, context = {}) {
  const prepared = await prepareInterviewReminderCommunication(appointmentId, context);

  if (!prepared?.success) {
    return prepared;
  }

  return buildSuccess("Interview reminder preview ready.", prepared);
}

async function previewZoomInvitationCommunication(appointmentId, context = {}) {
  const prepared = await prepareZoomInvitationCommunication(appointmentId, context);

  if (!prepared?.success) {
    return prepared;
  }

  return buildSuccess("Zoom invitation preview ready.", prepared);
}

async function previewOfficeLocationCommunication(appointmentId, context = {}) {
  const prepared = await prepareOfficeLocationCommunication(appointmentId, context);

  if (!prepared?.success) {
    return prepared;
  }

  return buildSuccess("Office location preview ready.", prepared);
}

/**
 * Sends a personalized interview reminder for an appointment.
 */
async function sendInterviewReminder(appointmentId, context = {}) {
  const prepared = await prepareInterviewReminderCommunication(appointmentId, context);

  if (!prepared?.success) {
    return prepared;
  }

  const result = await sendAppointmentCommunication(appointmentId, context, {
    sourceAction: "send_interview_reminder",
    prepared
  });

  if (!result?.success) {
    return result;
  }

  return {
    ...result,
    message: result.message || "Interview reminder prepared."
  };
}

async function sendZoomInvitation(appointmentId, context = {}) {
  const prepared = await prepareZoomInvitationCommunication(appointmentId, context);

  if (!prepared?.success) {
    return prepared;
  }

  return sendAppointmentCommunication(appointmentId, context, {
    sourceAction: "send_zoom_link",
    prepared
  });
}

async function sendOfficeLocation(appointmentId, context = {}) {
  const prepared = await prepareOfficeLocationCommunication(appointmentId, context);

  if (!prepared?.success) {
    return prepared;
  }

  return sendAppointmentCommunication(appointmentId, context, {
    sourceAction: "send_office_location",
    prepared
  });
}

module.exports = {
  prepareAppointmentCommunication,
  prepareInterviewDetailsCommunication,
  prepareInterviewReminderCommunication,
  prepareZoomInvitationCommunication,
  prepareOfficeLocationCommunication,
  previewInterviewDetailsCommunication,
  previewInterviewReminderCommunication,
  previewZoomInvitationCommunication,
  previewOfficeLocationCommunication,
  sendInterviewDetails,
  sendInterviewReminder,
  sendZoomInvitation,
  sendOfficeLocation
};
