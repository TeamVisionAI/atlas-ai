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

/**
 * Sends personalized interview details for an appointment.
 * Loads data, resolves representative + language, selects template, and records delivery.
 */
async function sendInterviewDetails(appointmentId, context = {}) {
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

  const recordResult = await recordWhatsAppCopyOpen(
    phone,
    {
      template: preview.template || template,
      sourceAction: "resend_interview_details",
      deliveryMode: DELIVERY_MODES.COPY_OPEN
    },
    serviceOptions
  );

  if (!recordResult?.success) {
    return recordResult;
  }

  return buildSuccess("Interview details prepared.", {
    channel: "whatsapp",
    template: preview.template || WHATSAPP_TEMPLATES.INTERVIEW_DETAILS,
    message: preview.message,
    phone,
    language: preview.language,
    zoomUrl: preview.zoomUrl || null,
    representative: representative.profile,
    representativeFallbackUsed: representative.fallbackUsed,
    toastKey: "whatsappCopyOpenConfirmation",
    workflowState: recordResult.workflowState || null
  });
}

module.exports = {
  sendInterviewDetails
};
