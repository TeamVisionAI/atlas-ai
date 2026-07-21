/**
 * Journey #2 — Appointment booking, confirmation, and dashboard queries.
 */

const jsonOrganizationRepository = require("../repositories/jsonOrganizationRepository");
const { serializeOrganization } = require("../services/organizationService");
const { resolveInterviewDateTime } = require("./appointmentTimeResolver");
const { buildConfirmation, resolveMeetingDetails } = require("./ConfirmationService");
const appointmentStore = require("./AppointmentStore");
const { AppointmentEvent } = require("./AppointmentEvents");

function isSameDay(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function serializeAppointment(appointment) {
  return {
    id: appointment.id,
    prospectName: appointment.prospectName,
    atlasProspectId: appointment.atlasProspectId,
    interviewType: appointment.interviewType,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    timeZone: appointment.timeZone,
    locationLabel: appointment.locationLabel,
    status: appointment.status,
    confirmation: appointment.confirmation || null
  };
}

async function resolveDefaultOrganizationId() {
  const organization = await jsonOrganizationRepository.findFirstActivatedOrganization();
  return organization?.id || null;
}

function buildLocationLabel(organization, interviewType) {
  const meeting = resolveMeetingDetails(organization, interviewType);

  if (meeting.meetingType === "zoom") {
    return meeting.meetingUrl ? `Zoom · ${meeting.meetingUrl}` : "Zoom";
  }

  if (meeting.address) {
    return `${meeting.locationName} · ${meeting.address}`;
  }

  return meeting.locationName || "Team Vision Office";
}

async function resolveProspect(atlasProspectId) {
  if (!atlasProspectId) {
    return null;
  }

  try {
    const { createProspectService } = require("../prospects");
    const prospect = await createProspectService({}).findByAtlasId(atlasProspectId);
    return prospect || null;
  } catch {
    return null;
  }
}

/**
 * @param {Object} appointment
 * @param {Object|null} organization
 * @param {Object|null} prospect
 * @param {import('../communication/events/EventBus').EventBus|null} eventBus
 */
async function confirmAppointment(appointment, organization, prospect, eventBus = null) {
  const confirmation = buildConfirmation(appointment, organization);
  const confirmedAppointment = await appointmentStore.saveConfirmation(
    appointment.id,
    confirmation
  );

  await appointmentStore.appendActivity({
    type: AppointmentEvent.CONFIRMED,
    message: `Appointment confirmed for ${appointment.prospectName}.`,
    appointmentId: appointment.id,
    prospectName: appointment.prospectName
  });

  eventBus?.emit(AppointmentEvent.CONFIRMED, {
    appointment: serializeAppointment(confirmedAppointment),
    confirmation,
    organization: organization ? serializeOrganization(organization) : null,
    prospect: prospect
      ? {
          atlasId: prospect.atlasId,
          displayName: prospect.displayName || appointment.prospectName
        }
      : {
          atlasId: appointment.atlasProspectId,
          displayName: appointment.prospectName
        }
  });

  return {
    appointment: confirmedAppointment,
    confirmation
  };
}

/**
 * @param {Object} payload workflow.interviewRequested payload
 * @param {import('../communication/events/EventBus').EventBus|null} eventBus
 */
async function createFromInterviewRequest(payload, eventBus = null) {
  const interview = payload.interview || payload.collectedData || {};
  const workflow = payload.workflow || {};
  const organizationId = await resolveDefaultOrganizationId();
  let organization = null;

  if (organizationId) {
    organization = await jsonOrganizationRepository.findById(organizationId);
  }

  const { startTime, endTime, timeZone } = resolveInterviewDateTime(interview);
  const prospectName =
    interview.name ||
    payload.collectedData?.name ||
    workflow.context?.collectedData?.name ||
    "New Prospect";
  const atlasProspectId =
    workflow.atlasProspectId || workflow.context?.atlasProspectId || null;

  const appointment = await appointmentStore.saveAppointment({
    id: crypto.randomUUID(),
    organizationId,
    atlasProspectId,
    prospectName,
    interviewType: interview.interviewType || "office",
    startTime,
    endTime,
    timeZone,
    locationLabel: buildLocationLabel(organization, interview.interviewType),
    status: "scheduled",
    workflowId: workflow.workflowId || null
  });

  await appointmentStore.appendActivity({
    type: AppointmentEvent.SCHEDULED,
    message: `First appointment scheduled with ${prospectName}`,
    appointmentId: appointment.id,
    prospectName
  });

  eventBus?.emit(AppointmentEvent.SCHEDULED, {
    appointment: serializeAppointment(appointment)
  });

  const prospect = await resolveProspect(atlasProspectId);
  return confirmAppointment(appointment, organization, prospect, eventBus);
}

async function getDashboardData(organizationId = null) {
  const appointments = await appointmentStore.listAppointments();
  const scoped = organizationId
    ? appointments.filter((entry) => entry.organizationId === organizationId)
    : appointments;

  const now = new Date();
  const upcoming = scoped
    .filter((entry) => new Date(entry.startTime) >= now)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const todaysMeetings = scoped.filter((entry) => isSameDay(entry.startTime, now));

  return {
    todaysMeetings: todaysMeetings.map(serializeAppointment),
    nextMeeting: upcoming[0] ? serializeAppointment(upcoming[0]) : null,
    atlasActivity: (await appointmentStore.listActivity(8)).map((entry) => ({
      id: entry.id,
      type: entry.type,
      message: entry.message,
      createdAt: entry.createdAt
    }))
  };
}

module.exports = {
  createFromInterviewRequest,
  confirmAppointment,
  getDashboardData,
  serializeAppointment,
  buildLocationLabel
};
