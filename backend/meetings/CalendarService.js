/**
 * Journey #3 — Google Calendar integration (create only).
 * Journey #7 — Production API calls delegated to GoogleCalendarConnector.
 */

const meetingStore = require("./MeetingStore");
const { MeetingEvent } = require("./MeetingEvents");
const { MEETING_LIFECYCLE } = require("./MeetingLifecycleService");

function serializeMeeting(meeting) {
  return {
    id: meeting.id,
    appointmentId: meeting.appointmentId,
    organizationId: meeting.organizationId,
    prospectName: meeting.prospectName,
    meetingType: meeting.meetingType,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    timeZone: meeting.timeZone,
    locationName: meeting.locationName,
    address: meeting.address,
    lifecycleStatus: meeting.lifecycleStatus,
    calendar: meeting.calendar,
    zoom: meeting.zoom
  };
}

/**
 * @param {Object} meeting
 * @returns {Promise<Object>}
 */
async function createCalendarEvent(meeting) {
  const { getConnectorRegistry } = require("../connectors");
  const connector = getConnectorRegistry().get("google-calendar");

  return connector.send({
    operation: "createEvent",
    meeting,
    organizationId: meeting.organizationId || null
  });
}

class CalendarService {
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
      eventBus.on(MeetingEvent.CREATED, (payload) => this._onMeetingCreated(payload))
    );
  }

  unsubscribe() {
    for (const off of this._unsubscribers) {
      off();
    }

    this._unsubscribers = [];
  }

  async _onMeetingCreated(payload) {
    const meeting = payload.meeting;

    if (!meeting?.id) {
      return;
    }

    try {
      const calendar = await createCalendarEvent(meeting);
      const updatedMeeting = await meetingStore.updateMeeting(meeting.id, {
        calendar,
        lifecycleStatus: MEETING_LIFECYCLE.REMINDER_PENDING
      });

      if (calendar.status === "created" && meeting.appointmentId) {
        try {
          const appointmentStore = require("../appointments/AppointmentStore");
          await appointmentStore.updateAppointment(meeting.appointmentId, {
            calendarEventId: calendar.calendarEventId
          });
        } catch {
          // Appointment link is best-effort.
        }
      }

      await meetingStore.appendActivity({
        type: MeetingEvent.CALENDAR_CREATED,
        message: `Calendar event created for ${meeting.prospectName}.`,
        meetingId: meeting.id
      });

      this.eventBus?.emit(MeetingEvent.CALENDAR_CREATED, {
        meeting: serializeMeeting(updatedMeeting),
        calendar
      });
    } catch (error) {
      console.error("[CalendarService]", error.message);

      const failedCalendar = {
        calendarEventId: null,
        calendarProvider: "google",
        calendarLink: null,
        status: "failed"
      };

      await meetingStore.updateMeeting(meeting.id, { calendar: failedCalendar });
    }
  }
}

function createCalendarService(options = {}) {
  if (!options.eventBus) {
    throw new Error("CalendarService requires eventBus");
  }

  return new CalendarService({ eventBus: options.eventBus });
}

let singleton = null;

function resetCalendarService() {
  if (singleton) {
    singleton.unsubscribe();
  }

  singleton = null;
}

module.exports = {
  CalendarService,
  createCalendarEvent,
  createCalendarService,
  resetCalendarService
};
