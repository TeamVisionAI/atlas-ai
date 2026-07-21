/**
 * Journey #3 — Meeting domain events.
 */

const MeetingEvent = Object.freeze({
  CREATED: "meeting.created",
  CALENDAR_CREATED: "meeting.calendar.created",
  ZOOM_CREATED: "meeting.zoom.created",
  ZOOM_SKIPPED: "meeting.zoom.skipped",
  REMINDER_CREATED: "meeting.reminder.created",
  READY: "meeting.ready"
});

module.exports = {
  MeetingEvent
};
