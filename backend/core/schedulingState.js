const SCHEDULING_PREFIX = "SCHEDULING:";

const PHASES = {
  DAY: "DAY",
  PERIOD: "PERIOD",
  TIME: "TIME",
  CONFIRM: "CONFIRM",
  OVERRIDE: "OVERRIDE"
};

function defaultState() {
  return {
    phase: PHASES.DAY,
    offeredDays: [],
    selectedDay: null,
    period: null,
    offeredTimes: [],
    selectedTime: null,
    pendingConfirmation: null,
    isWorking: true,
    overrideRequest: null
  };
}

function parseSchedulingState(notes) {
  if (!notes) {
    return defaultState();
  }

  const match = String(notes).match(/SCHEDULING:({[\s\S]*?})(?:\||$)/);

  if (!match) {
    return defaultState();
  }

  try {
    return {
      ...defaultState(),
      ...JSON.parse(match[1])
    };
  } catch (error) {
    return defaultState();
  }
}

function encodeSchedulingState(state) {
  return `${SCHEDULING_PREFIX}${JSON.stringify(state)}`;
}

function mergeNotesWithSchedulingState(existingNotes, state) {
  const emailMatch = String(existingNotes || "").match(/EMAIL:([^|]+)/i);
  const qualCaptureMatch = String(existingNotes || "").match(/QUAL_CAPTURE:{[\s\S]*?}(?:\||$)/);
  const schedulingPart = encodeSchedulingState(state);
  const qualPart = qualCaptureMatch ? qualCaptureMatch[0].replace(/\|$/, "") : null;
  const parts = [qualPart, schedulingPart].filter(Boolean);

  if (emailMatch) {
    parts.push(`EMAIL:${emailMatch[1].trim()}`);
  }

  return parts.join("|");
}

function clearSchedulingFromNotes(existingNotes, email) {
  if (email) {
    return `EMAIL:${email}`;
  }

  return null;
}

module.exports = {
  PHASES,
  defaultState,
  parseSchedulingState,
  encodeSchedulingState,
  mergeNotesWithSchedulingState,
  clearSchedulingFromNotes
};
