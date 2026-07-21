/**
 * Journey #3 — Meeting lifecycle state machine.
 */

const MEETING_LIFECYCLE = Object.freeze({
  SCHEDULED: "scheduled",
  CONFIRMED: "confirmed",
  REMINDER_PENDING: "reminder_pending",
  REMINDER_GENERATED: "reminder_generated",
  MEETING_READY: "meeting_ready",
  COMPLETED: "completed",
  OUTCOME: "outcome"
});

const TRANSITIONS = Object.freeze({
  [MEETING_LIFECYCLE.CONFIRMED]: [MEETING_LIFECYCLE.REMINDER_PENDING],
  [MEETING_LIFECYCLE.REMINDER_PENDING]: [MEETING_LIFECYCLE.REMINDER_GENERATED],
  [MEETING_LIFECYCLE.REMINDER_GENERATED]: [MEETING_LIFECYCLE.MEETING_READY]
});

function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) || from === to;
}

function isVirtualMeeting(meeting) {
  const type = String(meeting?.meetingType || meeting?.interviewType || "").toLowerCase();
  return type.includes("zoom") || type === "zoom";
}

function isMeetingReady(meeting) {
  const calendarReady = meeting.calendar?.status === "created";
  const zoomReady =
    !isVirtualMeeting(meeting) ||
    meeting.zoom?.status === "created" ||
    meeting.zoom?.status === "skipped";
  const remindersReady = Array.isArray(meeting.reminders) && meeting.reminders.length > 0;

  return calendarReady && zoomReady && remindersReady;
}

function nextLifecycleStatus(meeting, targetStatus) {
  const current = meeting.lifecycleStatus || MEETING_LIFECYCLE.CONFIRMED;

  if (!canTransition(current, targetStatus)) {
    return current;
  }

  return targetStatus;
}

function resolveAttentionItems(meeting) {
  if (meeting.lifecycleStatus === MEETING_LIFECYCLE.MEETING_READY) {
    return [];
  }

  const items = [];

  if (meeting.calendar?.status !== "created") {
    items.push("Calendar event pending");
  }

  if (isVirtualMeeting(meeting) && meeting.zoom?.status !== "created") {
    items.push("Zoom meeting pending");
  }

  if (!meeting.reminders?.length) {
    items.push("Reminders not generated");
  }

  return items;
}

module.exports = {
  MEETING_LIFECYCLE,
  canTransition,
  isVirtualMeeting,
  isMeetingReady,
  nextLifecycleStatus,
  resolveAttentionItems
};
