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

async function prepareInterviewDetailsCommunication(appointmentId, context = {}) {
  const organizationId = requireTenantOrganizationId(context.organizationId);
  const appointment = await appointmentApplicationService.getAppointment(appointmentId, organizationId);
  const phone = appointment.prospectPhone;

  if (!isProductionProspect(phone)) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const representative = await resolveAssignedRepresentative(appointment, context);
  const template = resolveInterviewDetailsTemplate(appointment);
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
      sourceAction: "resend_interview_details"
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

/**
 * Sends personalized interview details for an appointment.
 * Loads data, resolves representative + language, selects template, and records delivery.
 */
async function sendInterviewDetails(appointmentId, context = {}) {
  const prepared = await prepareInterviewDetailsCommunication(appointmentId, context);

  if (!prepared?.success) {
    return prepared;
  }

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
      sourceAction: "resend_interview_details",
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
    console.warn("[communicationService] Preview/send payload mismatch for interview details.", {
      appointmentId
    });
  }

  return buildSuccess("Interview details prepared.", {
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

module.exports = {
  prepareInterviewDetailsCommunication,
  previewInterviewDetailsCommunication,
  sendInterviewDetails
};
