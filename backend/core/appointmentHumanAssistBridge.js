/**
 * Sprint 22.1 — Bridge conversation escalations to appointment Human Assist.
 */

const appointmentRepository = require("../repositories/appointmentRepository");
const { APPOINTMENT_STATUSES } = require("./configuration/appointmentDomain");
const { buildHumanAssistSummary } = require("./teamVisionAppointmentRules");
const { recordHistoryEvent } = require("./appointmentHistory");

async function findOpenAppointmentForPhone(phone, organizationId) {
  const { items } = await appointmentRepository.search({
    organizationId,
    prospectPhone: phone,
    status: [
      APPOINTMENT_STATUSES.SCHEDULED,
      APPOINTMENT_STATUSES.CONFIRMED,
      APPOINTMENT_STATUSES.PENDING_CONFIRMATION,
      APPOINTMENT_STATUSES.HUMAN_ASSIST_REQUIRED
    ],
    limit: 1
  });

  return items[0] || null;
}

async function escalateConversationToHumanAssist({
  phone,
  organizationId,
  agentId,
  reason,
  summary
}) {
  if (!organizationId || !phone) {
    return null;
  }

  const appointment = await findOpenAppointmentForPhone(phone, organizationId);

  if (!appointment) {
    return null;
  }

  const resolvedSummary = summary || buildHumanAssistSummary(reason, { prospectPhone: phone });
  const timestamp = new Date().toISOString();

  const saved = await appointmentRepository.save({
    ...appointment,
    status: APPOINTMENT_STATUSES.HUMAN_ASSIST_REQUIRED,
    humanAssistRequired: true,
    humanAssistReason: reason,
    history: recordHistoryEvent(appointment, {
      type: "human_assist",
      actor: "ATLAS",
      reason,
      summary: resolvedSummary,
      newValues: { status: APPOINTMENT_STATUSES.HUMAN_ASSIST_REQUIRED }
    }),
    metadata: {
      ...appointment.metadata,
      humanAssist: {
        reason,
        summary: resolvedSummary,
        priority: "high",
        status: "open",
        createdAt: timestamp,
        source: "conversation"
      }
    },
    updatedAt: timestamp
  });

  return saved;
}

module.exports = {
  findOpenAppointmentForPhone,
  escalateConversationToHumanAssist
};
