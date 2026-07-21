/**
 * Journey #3 — Reminder generation (no delivery).
 */

const meetingStore = require("./MeetingStore");
const { MeetingEvent } = require("./MeetingEvents");
const { MEETING_LIFECYCLE } = require("./MeetingLifecycleService");

const DEFAULT_OFFSETS_MINUTES = Object.freeze([24 * 60, 2 * 60, 30, 5]);

const OFFSET_LABELS = Object.freeze({
  1440: "24 hours",
  120: "2 hours",
  30: "30 minutes",
  5: "5 minutes"
});

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
    zoom: meeting.zoom,
    reminders: meeting.reminders
  };
}

function buildReminderMessage(meeting, offsetMinutes) {
  const label = OFFSET_LABELS[offsetMinutes] || `${offsetMinutes} minutes`;
  const location =
    meeting.zoom?.joinUrl ||
    [meeting.locationName, meeting.address].filter(Boolean).join(" · ") ||
    "your meeting location";

  return `Reminder: Your meeting with ${meeting.prospectName} is in ${label}. Location: ${location}.`;
}

/**
 * @param {Object} meeting
 * @param {number[]} [offsetsMinutes]
 * @returns {Object[]}
 */
function buildReminders(meeting, offsetsMinutes = DEFAULT_OFFSETS_MINUTES) {
  const startMs = new Date(meeting.startTime).getTime();
  const now = Date.now();
  const reminders = [];

  for (const offsetMinutes of offsetsMinutes) {
    const scheduledFor = new Date(startMs - offsetMinutes * 60 * 1000);

    if (scheduledFor.getTime() <= now) {
      continue;
    }

    reminders.push({
      id: crypto.randomUUID(),
      meetingId: meeting.id,
      appointmentId: meeting.appointmentId,
      offsetMinutes,
      scheduledFor: scheduledFor.toISOString(),
      status: "pending",
      message: buildReminderMessage(meeting, offsetMinutes),
      createdAt: new Date().toISOString()
    });
  }

  return reminders;
}

class ReminderService {
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
      eventBus.on(MeetingEvent.ZOOM_CREATED, (payload) => this._onZoomResolved(payload)),
      eventBus.on(MeetingEvent.ZOOM_SKIPPED, (payload) => this._onZoomResolved(payload))
    );
  }

  unsubscribe() {
    for (const off of this._unsubscribers) {
      off();
    }

    this._unsubscribers = [];
  }

  async _onZoomResolved(payload) {
    const meeting = payload.meeting;

    if (!meeting?.id) {
      return;
    }

    const freshMeeting = (await meetingStore.getMeeting(meeting.id)) || meeting;
    const reminders = buildReminders(freshMeeting);

    const updatedMeeting = await meetingStore.updateMeeting(meeting.id, {
      reminders,
      lifecycleStatus: MEETING_LIFECYCLE.REMINDER_GENERATED
    });

    for (const reminder of reminders) {
      this.eventBus?.emit(MeetingEvent.REMINDER_CREATED, {
        meeting: serializeMeeting(updatedMeeting),
        reminder
      });
    }

    if (reminders.length > 0) {
      await meetingStore.appendActivity({
        type: MeetingEvent.REMINDER_CREATED,
        message: `${reminders.length} reminders prepared for ${meeting.prospectName}.`,
        meetingId: meeting.id
      });
    }

    const readyMeeting = await meetingStore.updateMeeting(meeting.id, {
      lifecycleStatus: MEETING_LIFECYCLE.MEETING_READY
    });

    await meetingStore.appendActivity({
      type: MeetingEvent.READY,
      message: `Meeting ready for ${meeting.prospectName}.`,
      meetingId: meeting.id
    });

    this.eventBus?.emit(MeetingEvent.READY, {
      meeting: serializeMeeting(readyMeeting)
    });
  }
}

function createReminderService(options = {}) {
  if (!options.eventBus) {
    throw new Error("ReminderService requires eventBus");
  }

  return new ReminderService({ eventBus: options.eventBus });
}

let singleton = null;

function resetReminderService() {
  if (singleton) {
    singleton.unsubscribe();
  }

  singleton = null;
}

module.exports = {
  ReminderService,
  buildReminders,
  createReminderService,
  resetReminderService,
  DEFAULT_OFFSETS_MINUTES
};
