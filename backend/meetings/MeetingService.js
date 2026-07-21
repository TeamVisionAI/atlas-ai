/**
 * Journey #3 — Meeting orchestration entry point.
 * Listens to appointment.confirmed and starts the meeting lifecycle.
 */

const { AppointmentEvent } = require("../appointments/AppointmentEvents");
const meetingStore = require("./MeetingStore");
const { MeetingEvent } = require("./MeetingEvents");
const { MEETING_LIFECYCLE } = require("./MeetingLifecycleService");

function serializeMeeting(meeting) {
  return {
    id: meeting.id,
    appointmentId: meeting.appointmentId,
    organizationId: meeting.organizationId,
    atlasProspectId: meeting.atlasProspectId,
    prospectName: meeting.prospectName,
    meetingType: meeting.meetingType,
    interviewType: meeting.interviewType,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    timeZone: meeting.timeZone,
    locationName: meeting.locationName,
    address: meeting.address,
    locationLabel: meeting.locationLabel,
    lifecycleStatus: meeting.lifecycleStatus,
    calendar: meeting.calendar,
    zoom: meeting.zoom,
    reminders: meeting.reminders
  };
}

function buildLocationLabel(confirmation, appointment) {
  if (confirmation?.locationName && confirmation?.address) {
    return `${confirmation.locationName} · ${confirmation.address}`;
  }

  if (confirmation?.locationName) {
    return confirmation.locationName;
  }

  return appointment?.locationLabel || "Meeting";
}

/**
 * @param {Object} payload appointment.confirmed payload
 * @returns {Promise<Object>}
 */
async function createMeetingFromAppointment(payload) {
  const appointment = payload.appointment;
  const confirmation = payload.confirmation || {};
  const organization = payload.organization || null;

  const existing = await meetingStore.getMeetingByAppointmentId(appointment.id);

  if (existing) {
    return existing;
  }

  const meetingType = confirmation.meetingType || appointment.interviewType || "office";

  return meetingStore.saveMeeting({
    id: crypto.randomUUID(),
    appointmentId: appointment.id,
    organizationId: organization?.id || appointment.organizationId || null,
    atlasProspectId: appointment.atlasProspectId || payload.prospect?.atlasId || null,
    prospectName: appointment.prospectName,
    meetingType,
    interviewType: appointment.interviewType || meetingType,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    timeZone: appointment.timeZone || "America/New_York",
    locationName: confirmation.locationName || null,
    address: confirmation.address || null,
    locationLabel: buildLocationLabel(confirmation, appointment),
    lifecycleStatus: MEETING_LIFECYCLE.CONFIRMED,
    calendar: {
      calendarEventId: null,
      calendarProvider: null,
      calendarLink: null,
      status: "pending"
    },
    zoom: {
      meetingId: null,
      joinUrl: confirmation.meetingUrl || null,
      hostUrl: null,
      password: null,
      meetingProvider: meetingType === "zoom" ? "zoom" : null,
      status: meetingType === "zoom" ? "pending" : "skipped"
    },
    reminders: []
  });
}

class MeetingService {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this._unsubscribers = [];

    if (this.eventBus) {
      this.subscribe(this.eventBus);
    }
  }

  /**
   * @param {import('../communication/events/EventBus').EventBus} eventBus
   */
  subscribe(eventBus) {
    this.unsubscribe();
    this.eventBus = eventBus;
    this._unsubscribers.push(
      eventBus.on(AppointmentEvent.CONFIRMED, (payload) =>
        this._onAppointmentConfirmed(payload)
      )
    );
  }

  unsubscribe() {
    for (const off of this._unsubscribers) {
      off();
    }

    this._unsubscribers = [];
  }

  async _onAppointmentConfirmed(payload) {
    try {
      const meeting = await createMeetingFromAppointment(payload);

      await meetingStore.appendActivity({
        type: MeetingEvent.CREATED,
        message: `Meeting prepared for ${meeting.prospectName}.`,
        meetingId: meeting.id,
        appointmentId: meeting.appointmentId
      });

      this.eventBus?.emit(MeetingEvent.CREATED, {
        meeting: serializeMeeting(meeting),
        appointment: payload.appointment,
        organization: payload.organization,
        prospect: payload.prospect
      });
    } catch (error) {
      console.error("[MeetingService]", error.message);
    }
  }
}

function createMeetingService(options = {}) {
  if (!options.eventBus) {
    throw new Error("MeetingService requires eventBus");
  }

  return new MeetingService({ eventBus: options.eventBus });
}

let singleton = null;

function resetMeetingService() {
  if (singleton) {
    singleton.unsubscribe();
  }

  singleton = null;
}

module.exports = {
  MeetingService,
  createMeetingFromAppointment,
  createMeetingService,
  resetMeetingService,
  serializeMeeting
};
