/**
 * BR-049 — Maps conversation scheduling state to mission execution payload.
 * Conversation layer decides; missionExecutionApplicationService executes.
 */

const { parseSchedulingState } = require("./schedulingState");
const { toDateKey, snapToSchedulingWindow } = require("./capacityEngine");

function normalizeInterviewType(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("virtual") || normalized.includes("google meet")) {
    return "Zoom";
  }

  if (normalized.includes("public")) {
    return "Public Location";
  }

  return "In Person";
}

function resolveConversationSchedulePayload(prospect = {}, profile = {}) {
  const schedulingState = parseSchedulingState(prospect.notes);
  const pending = schedulingState.pendingConfirmation;
  const selectedTime = schedulingState.selectedTime;

  let dateKey = pending?.dateKey || schedulingState.selectedDay || selectedTime?.dateKey || null;
  let timeKey = pending?.timeKey || selectedTime?.timeKey || null;

  if ((!dateKey || !timeKey) && prospect.appointment_date) {
    const date = new Date(prospect.appointment_date);
    dateKey = dateKey || toDateKey(date);

    if (!timeKey) {
      timeKey = snapToSchedulingWindow(date.getHours(), date.getMinutes()).timeKey;
    }
  }

  const rawInterviewType =
    profile.interviewType ||
    prospect.interview_type ||
    pending?.interviewType ||
    selectedTime?.interviewType ||
    null;

  return {
    dateKey,
    timeKey,
    interviewType: rawInterviewType ? normalizeInterviewType(rawInterviewType) : null,
    email: profile.email || null
  };
}

module.exports = {
  resolveConversationSchedulePayload
};
