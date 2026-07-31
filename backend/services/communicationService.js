/**
 * Communication service — personalized prospect communications.
 * Implements BR-027: prospect-facing messages use the assigned representative identity.
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
  resolveOfficeLocationTemplate,
  WHATSAPP_TEMPLATES
} = require("../core/whatsappCommunicationEngine");
const { payloadsMatchForSend } = require("../core/communicationOutboundPayloadEngine");

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
    deliveryMode: DELIVERY_MODES.COPY_OPEN,
    ...extras
  };
}

async function prepareAppointmentCommunication(appointmentId, context, { template, sourceAction }) {
  const organizationId = requireTenantOrganizationId(context.organizationId);
  const appointment = await appointmentApplicationService.getAppointment(appointmentId, organizationId);
  const phone = appointment.prospectPhone;

  if (!isProductionProspect(phone)) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

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
    representativeFallbackUsed: representative.fallbackUsed
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

async function sendAppointmentCommunication(appointmentId, context, { sourceAction, prepared }) {
  const organizationId = requireTenantOrganizationId(context.organizationId);
  const appointment = await appointmentApplicationService.getAppointment(appointmentId, organizationId);
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
    previewMatchesSend: sendMatchesPreview
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
