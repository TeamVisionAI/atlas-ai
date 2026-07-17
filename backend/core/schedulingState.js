const SCHEDULING_PREFIX = "SCHEDULING:";

const PHASES = {
  DAY: "DAY",
  PERIOD: "PERIOD",
  TIME: "TIME",
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
  const schedulingPart = encodeSchedulingState(state);

  if (emailMatch) {
    return `${schedulingPart}|EMAIL:${emailMatch[1].trim()}`;
  }

  if (String(existingNotes || "").startsWith(SCHEDULING_PREFIX)) {
    return schedulingPart;
  }

  if (existingNotes && !String(existingNotes).includes(SCHEDULING_PREFIX)) {
    return schedulingPart;
  }

  return schedulingPart;
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
