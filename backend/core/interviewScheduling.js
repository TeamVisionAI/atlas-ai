const {
  detectScheduleOverride,
  normalizeHour,
  EN_DAYS,
  ES_DAYS
} = require("./scheduleLanguageParser");
const {
  TIME_ZONE,
  toDateKey,
  formatTimeKey,
  getSlotAvailability,
  bookSlot,
  hasCapacityOnDay,
  getOpenSlotsForPeriod,
  generateSchedulingWindowSlots,
  snapToSchedulingWindow,
  findClosestOpenSlots,
  timeKeyToMinutes
} = require("./capacityEngine");
const { PHASES, defaultState } = require("./schedulingState");
const {
  evaluateOccupationScheduling,
  evaluateSameDayEligibility,
  evaluateSchedulingWindow
} = require("./businessRulesEngine");

const INTERVIEW_TYPES = {
  OFFICE: "In Person",
  ZOOM: "Zoom"
};

const PERIOD_FILTERS = {
  morning: (minutes) => minutes < 12 * 60,
  afternoon: (minutes) => minutes >= 12 * 60 && minutes < 17 * 60,
  beforeFive: (minutes) => minutes < 17 * 60,
  afterFive: (minutes) => minutes >= 17 * 60
};

const EN_DAY_NAMES = EN_DAYS;
const ES_DAY_NAMES = ES_DAYS;

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function isBusinessDay(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function formatTimeLabel(timeKey, language) {
  const [hourValue, minuteValue] = timeKey.split(":").map(Number);
  const period = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue > 12 ? hourValue - 12 : hourValue === 0 ? 12 : hourValue;
  const minute = String(minuteValue).padStart(2, "0");

  if (language === "es") {
    return `${hour}:${minute} ${period}`;
  }

  return `${hour}:${minute} ${period}`;
}

function formatDayLabel(date, language, index = 0) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  if (toDateKey(date) === toDateKey(today)) {
    return language === "es" ? "Hoy" : "Today";
  }

  if (toDateKey(date) === toDateKey(tomorrow)) {
    return language === "es" ? "Mañana" : "Tomorrow";
  }

  return date.toLocaleDateString(language === "es" ? "es-US" : "en-US", {
    weekday: "long",
    timeZone: TIME_ZONE
  });
}

function buildSlotDateTime(dateKey, timeKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  return value;
}

function buildSlotRecord({ dateKey, timeKey, interviewType, language }) {
  const start = buildSlotDateTime(dateKey, timeKey);
  const dayLabel = formatDayLabel(start, language);
  const timeLabel = formatTimeLabel(timeKey, language);

  return {
    dateKey,
    timeKey,
    interviewType,
    startTimeISO: start.toISOString(),
    labelEn: `${dayLabel} at ${formatTimeLabel(timeKey, "en")}`,
    labelEs: `${dayLabel} a las ${formatTimeLabel(timeKey, "es")}`,
    label: language === "es"
      ? `${dayLabel} a las ${timeLabel}`
      : `${dayLabel} at ${timeLabel}`
  };
}

function getAllCandidateTimes() {
  return generateSchedulingWindowSlots();
}

function resolvePeriodSlots(period) {
  const filter = PERIOD_FILTERS[period] || PERIOD_FILTERS.morning;

  return getAllCandidateTimes().filter((timeKey) =>
    filter(timeKeyToMinutes(timeKey))
  );
}

function hasCapacityToday(interviewType) {
  const todayKey = toDateKey(new Date());
  return hasCapacityOnDay(todayKey, interviewType, getAllCandidateTimes());
}

function getDaysWithCapacity(candidateDays, interviewType) {
  return candidateDays.filter((day) =>
    hasCapacityOnDay(toDateKey(day), interviewType, getAllCandidateTimes())
  );
}

function getOfferedDays(interviewType) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const sameDayDecision = evaluateSameDayEligibility({
    interviewType,
    hasCapacityToday: hasCapacityToday(interviewType)
  });
  let candidates = [];

  if (sameDayDecision.allowSameDay) {
    candidates = [today, tomorrow];
  } else if (interviewType === INTERVIEW_TYPES.ZOOM) {
    candidates = getNextBusinessDays(2, today);
  } else {
    candidates = getNextBusinessDays(2, tomorrow);
  }

  const withCapacity = getDaysWithCapacity(candidates, interviewType);

  if (withCapacity.length >= 2) {
    return withCapacity.slice(0, 2);
  }

  const fallback = getNextBusinessDays(4, today)
    .filter((day) => !withCapacity.some((existing) => toDateKey(existing) === toDateKey(day)));

  return getDaysWithCapacity([...withCapacity, ...fallback], interviewType).slice(0, 2);
}

function getNextBusinessDays(count, startDate = new Date()) {
  const days = [];
  const cursor = startOfDay(startDate);

  while (days.length < count) {
    if (isBusinessDay(cursor)) {
      days.push(new Date(cursor));
    }

    cursor.setDate(cursor.getDate() + 1);

    if (days.length === 0 && cursor.getTime() - startDate.getTime() > 1000 * 60 * 60 * 24 * 14) {
      break;
    }
  }

  return days;
}

function isProspectWorking(occupation, message) {
  return evaluateOccupationScheduling({ occupation, message }).isWorking;
}

function getInterviewTypeLabel(interviewType, language) {
  const isOffice = interviewType === INTERVIEW_TYPES.OFFICE;
  if (language === "es") {
    return isOffice ? "Oficina" : "Zoom";
  }
  return isOffice ? "Office" : "Zoom";
}

function parseInterviewType(message) {
  const text = normalize(message);
  const officePatterns = ["1", "office", "in person", "in-person", "person", "presencial", "oficina"];
  const zoomPatterns = ["2", "zoom", "virtual", "online", "remoto"];

  if (officePatterns.some((pattern) => text.includes(pattern))) {
    return INTERVIEW_TYPES.OFFICE;
  }

  if (zoomPatterns.some((pattern) => text.includes(pattern))) {
    return INTERVIEW_TYPES.ZOOM;
  }

  return null;
}

function getInterviewPreferenceQuestion(language) {
  if (language === "es") {
    return "¿Cómo te gustaría asistir a tu entrevista?\n\n1️⃣ Oficina (presencial)\n\n2️⃣ Zoom (virtual)";
  }

  return "How would you like to attend your interview?\n\n1️⃣ Office (in person)\n\n2️⃣ Zoom (virtual)";
}

function buildInitialSchedulingState(interviewType, occupation) {
  const offeredDays = getOfferedDays(interviewType).map((day) => toDateKey(day));

  return {
    ...defaultState(),
    phase: PHASES.DAY,
    offeredDays,
    isWorking: isProspectWorking(occupation, occupation)
  };
}

function buildDayQuestion(state, language) {
  const labels = state.offeredDays.map((dateKey, index) => {
    const date = buildSlotDateTime(dateKey, "09:00");
    const label = formatDayLabel(date, language, index);
    const emoji = index === 0 ? "1️⃣" : "2️⃣";
    return `${emoji} ${label}`;
  });

  if (language === "es") {
    const joined = labels.map((item) => item.replace(/^\d️⃣ /, "")).join(" y ");
    return `¡Genial! Tenemos citas de entrevista disponibles ${joined}. ¿Qué día te funciona mejor?\n\n${labels.join("\n\n")}`;
  }

  const joined = labels
    .map((item) => item.replace(/^\d️⃣ /, ""))
    .join(" and ");
  return `Great! We have interview appointments available ${joined}. Which day works better for you?\n\n${labels.join("\n\n")}`;
}

function buildPeriodQuestion(state, language) {
  if (state.isWorking) {
    if (language === "es") {
      return "Como actualmente trabajas, ¿te conviene más antes o después de las 5:00 PM?\n\n1️⃣ Antes de las 5:00 PM\n\n2️⃣ Después de las 5:00 PM";
    }

    return "Since you're currently working, would before or after 5:00 PM be more convenient?\n\n1️⃣ Before 5:00 PM\n\n2️⃣ After 5:00 PM";
  }

  if (language === "es") {
    return "¿Preferirías una entrevista en la mañana o en la tarde?\n\n1️⃣ Mañana\n\n2️⃣ Tarde";
  }

  return "Would you prefer a morning or afternoon interview?\n\n1️⃣ Morning\n\n2️⃣ Afternoon";
}

function buildTimeQuestion(state, language) {
  const labels = state.offeredTimes.map((slot, index) => {
    const emoji = index === 0 ? "1️⃣" : "2️⃣";
    const timeLabel = formatTimeLabel(slot.timeKey, language);
    return `${emoji} ${timeLabel}`;
  });

  const timesText = state.offeredTimes
    .map((slot) => formatTimeLabel(slot.timeKey, language))
    .join(` ${language === "es" ? "y" : "and"} `);

  if (language === "es") {
    return `Tengo citas disponibles a las ${timesText}. ¿Cuál te funciona mejor?\n\n${labels.join("\n\n")}`;
  }

  return `I have appointments available at ${timesText}. Which works best for you?\n\n${labels.join("\n\n")}`;
}

function parseDaySelection(message, state, language) {
  const text = normalize(message);
  const request = detectScheduleOverride(message, { phase: PHASES.DAY });

  if (request?.dayHint?.kind === "offset") {
    const date = addDays(startOfDay(new Date()), request.dayHint.days);
    const dateKey = toDateKey(date);

    if (state.offeredDays.includes(dateKey)) {
      return dateKey;
    }
  }

  if (request?.dayName) {
    const resolved = resolveOverrideDate(request.dayName);

    if (resolved) {
      const dateKey = toDateKey(resolved);

      if (state.offeredDays.includes(dateKey)) {
        return dateKey;
      }
    }
  }

  if (text === "1" && state.offeredDays[0]) {
    return state.offeredDays[0];
  }

  if (text === "2" && state.offeredDays[1]) {
    return state.offeredDays[1];
  }

  for (const dateKey of state.offeredDays) {
    const date = buildSlotDateTime(dateKey, "09:00");
    const labels = [
      normalize(formatDayLabel(date, "en")),
      normalize(formatDayLabel(date, "es")),
      normalize(date.toLocaleDateString("en-US", { weekday: "long", timeZone: TIME_ZONE })),
      normalize(date.toLocaleDateString("es-US", { weekday: "long", timeZone: TIME_ZONE })),
      "tomorrow",
      "manana",
      "today",
      "hoy"
    ];

    if (labels.some((label) => label && text.includes(label))) {
      if (
        (text.includes("tomorrow") || text.includes("manana")) &&
        toDateKey(date) !== toDateKey(addDays(startOfDay(new Date()), 1))
      ) {
        continue;
      }

      if (
        (text.includes("today") || text.includes("hoy")) &&
        toDateKey(date) !== toDateKey(new Date())
      ) {
        continue;
      }

      return dateKey;
    }
  }

  return null;
}

function parsePeriodSelection(message, state) {
  const text = normalize(message);
  const request = detectScheduleOverride(message, { phase: PHASES.PERIOD });

  if (request?.periodHint) {
    return request.periodHint;
  }

  if (state.isWorking) {
    if (
      text === "1" ||
      text.includes("before") ||
      text.includes("antes") ||
      (text.includes("morning") && !text.includes("tomorrow") && !text.includes("manana")) ||
      (text.includes("manana") && text.includes("en la"))
    ) {
      return "beforeFive";
    }

    if (
      text === "2" ||
      text.includes("after") ||
      text.includes("despues") ||
      text.includes("tarde") ||
      text.includes("pm")
    ) {
      return "afterFive";
    }

    return null;
  }

  if (
    text === "1" ||
    text.includes("morning") ||
    (text.includes("manana") && !text.includes("tomorrow")) ||
    text.includes("am")
  ) {
    return "morning";
  }

  if (
    text === "2" ||
    text.includes("afternoon") ||
    text.includes("tarde") ||
    text.includes("pm")
  ) {
    return "afternoon";
  }

  return null;
}

function parseTimeSelection(message, state) {
  const text = normalize(message);

  if (text === "1" && state.offeredTimes[0]) {
    return state.offeredTimes[0];
  }

  if (text === "2" && state.offeredTimes[1]) {
    return state.offeredTimes[1];
  }

  for (const slot of state.offeredTimes) {
    const labels = [
      normalize(formatTimeLabel(slot.timeKey, "en")),
      normalize(formatTimeLabel(slot.timeKey, "es")),
      slot.timeKey
    ];

    if (labels.some((label) => label && text.includes(label))) {
      return slot;
    }
  }

  const request = detectScheduleOverride(message, {
    phase: state.phase,
    selectedDay: state.selectedDay
  });

  if (!request?.normalizedHour && request?.hour !== null && request?.hour !== undefined) {
    request.normalizedHour = normalizeHour(request.hour, request.meridiem);
  }

  if (request?.normalizedHour !== null && request?.normalizedHour !== undefined && state.selectedDay) {
    const snapped = snapToSchedulingWindow(request.normalizedHour, request.minute || 0);
    const slot = {
      dateKey: state.selectedDay,
      timeKey: snapped.timeKey,
      interviewType: state.offeredTimes[0]?.interviewType
    };

    if (slot.interviewType) {
      return slot;
    }
  }

  return null;
}

function buildOfferedTimes(dateKey, interviewType, period) {
  const candidateTimes = resolvePeriodSlots(period);
  return getOpenSlotsForPeriod(dateKey, interviewType, candidateTimes).map((slot) => ({
    dateKey,
    timeKey: slot.timeKey,
    interviewType
  }));
}

function finalizeSlotSelection(state, selectedTime, language) {
  if (!selectedTime?.dateKey || !selectedTime?.timeKey) {
    return {
      success: false,
      reason: "INVALID"
    };
  }

  const booking = bookSlot(selectedTime.dateKey, selectedTime.timeKey, selectedTime.interviewType);

  if (!booking.success) {
    return {
      success: false,
      reason: "FULL"
    };
  }

  const slot = buildSlotRecord({
    dateKey: selectedTime.dateKey,
    timeKey: selectedTime.timeKey,
    interviewType: selectedTime.interviewType,
    language
  });

  return {
    success: true,
    slot,
    state: {
      ...state,
      phase: PHASES.TIME,
      selectedTime,
      offeredTimes: state.offeredTimes
    }
  };
}

function resolveRequestDate(override, state) {
  if (override.dayHint?.kind === "offset") {
    return startOfDay(addDays(new Date(), override.dayHint.days));
  }

  if (override.dayName) {
    return resolveOverrideDate(override.dayName);
  }

  if (state?.selectedDay) {
    return buildSlotDateTime(state.selectedDay, "09:00");
  }

  return startOfDay(addDays(new Date(), 1));
}

function resolveOverrideDate(dayName) {
  if (!dayName) {
    return null;
  }

  let desiredDay = EN_DAY_NAMES.indexOf(dayName);

  if (desiredDay === -1) {
    desiredDay = ES_DAY_NAMES.indexOf(dayName);
  }

  if (desiredDay === -1) {
    return null;
  }

  const cursor = startOfDay(new Date());

  for (let i = 0; i < 14; i += 1) {
    if (cursor.getDay() === desiredDay) {
      return new Date(cursor);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
}

function isMenuSelection(message) {
  return /^(1|2)$/.test(normalize(message));
}

function shouldHandleScheduleOverride(message, override, state) {
  if (!override || override.periodHint) {
    return false;
  }

  if (isMenuSelection(message) && [PHASES.DAY, PHASES.PERIOD, PHASES.TIME].includes(state.phase)) {
    return false;
  }

  return Boolean(
    override.normalizedHour !== null ||
      override.hour !== null ||
      override.dayHint ||
      override.dayName ||
      (override.timeOnly && state.selectedDay)
  );
}

function buildExactTimeReply(timeKey, language) {
  const label = formatTimeLabel(timeKey, language);

  if (language === "es") {
    return `Perfecto. Tengo disponible a las ${label}.`;
  }

  return `Perfect. I have ${label} available.`;
}

function buildOverrideClosestQuestion(requestedTimeKey, offeredTimes, language) {
  const requestedLabel = formatTimeLabel(requestedTimeKey, language);
  const labels = offeredTimes.map((slot, index) => {
    const emoji = index === 0 ? "1️⃣" : "2️⃣";
    return `${emoji} ${formatTimeLabel(slot.timeKey, language)}`;
  });

  const timesText = offeredTimes
    .map((slot) => formatTimeLabel(slot.timeKey, language))
    .join(` ${language === "es" ? "o" : "or"} `);

  if (language === "es") {
    return `A las ${requestedLabel} ya no tengo disponibilidad.\n\nLo más cercano es ${timesText}.\n\n¿Cuál prefieres?\n\n${labels.join("\n\n")}`;
  }

  return `${requestedLabel} is no longer available.\n\nThe closest options are ${timesText}.\n\nWhich do you prefer?\n\n${labels.join("\n\n")}`;
}

function buildOverrideResponse({ override, interviewType, language, state }) {
  const date = resolveRequestDate(override, state);
  const dateKey = toDateKey(date);
  const hour =
    override.normalizedHour ??
    normalizeHour(override.hour, override.meridiem) ??
    10;
  const minute = override.minute || 0;

  const windowDecision = evaluateSchedulingWindow({ hour, minute });

  if (windowDecision.needsHumanCoordinator) {
    return {
      handled: true,
      humanHandoff: true,
      handoffReason: "OUTSIDE_SCHEDULING_WINDOW"
    };
  }

  const closest = findClosestOpenSlots({
    dateKey,
    hour,
    minute,
    interviewType
  });

  if (!closest.slots.length) {
    return {
      handled: false
    };
  }

  const offeredTimes = closest.slots.map((slot) => ({
    dateKey: slot.dateKey,
    timeKey: slot.timeKey,
    interviewType
  }));

  const nextState = {
    ...state,
    phase: PHASES.OVERRIDE,
    selectedDay: dateKey,
    overrideRequest: override.raw,
    offeredTimes
  };

  if (closest.exact && closest.slots.length === 1) {
    return {
      handled: true,
      autoBook: true,
      selectedTime: offeredTimes[0],
      state: nextState,
      reply: buildExactTimeReply(closest.requestedTimeKey, language)
    };
  }

  return {
    handled: true,
    autoBook: false,
    state: {
      ...nextState,
      phase: PHASES.TIME
    },
    reply: buildOverrideClosestQuestion(
      closest.requestedTimeKey,
      offeredTimes,
      language
    )
  };
}

function getScheduleQuestion(state, interviewType, language) {
  switch (state.phase) {
    case PHASES.DAY:
      return buildDayQuestion(state, language);
    case PHASES.PERIOD:
      return buildPeriodQuestion(state, language);
    case PHASES.TIME:
    case PHASES.OVERRIDE:
      return buildTimeQuestion(state, language);
    default:
      return buildDayQuestion(state, language);
  }
}

function validateScheduleStep(message, context = {}) {
  const state = context.schedulingState || defaultState();
  const interviewType = context.interviewType || INTERVIEW_TYPES.ZOOM;
  const language = context.language || "en";

  if (detectScheduleOverride(message, { phase: state.phase, selectedDay: state.selectedDay })) {
    return {
      valid: true,
      override: true
    };
  }

  switch (state.phase) {
    case PHASES.DAY: {
      const selectedDay = parseDaySelection(message, state, language);

      if (!selectedDay) {
        return { valid: false, reason: "SCHEDULE_DAY_REQUIRED" };
      }

      return { valid: true, value: { phase: PHASES.DAY, selectedDay } };
    }

    case PHASES.PERIOD: {
      const period = parsePeriodSelection(message, state);

      if (!period) {
        return { valid: false, reason: "SCHEDULE_PERIOD_REQUIRED" };
      }

      return { valid: true, value: { phase: PHASES.PERIOD, period } };
    }

    case PHASES.TIME:
    case PHASES.OVERRIDE: {
      const selectedTime = parseTimeSelection(message, state);

      if (!selectedTime) {
        return { valid: false, reason: "SCHEDULE_TIME_REQUIRED" };
      }

      return { valid: true, value: { phase: PHASES.TIME, selectedTime } };
    }

    default:
      return { valid: false, reason: "SCHEDULE_DAY_REQUIRED" };
  }
}

function advanceScheduleState(state, validationValue, interviewType, language) {
  if (validationValue.phase === PHASES.DAY) {
    return {
      ...state,
      phase: PHASES.PERIOD,
      selectedDay: validationValue.selectedDay
    };
  }

  if (validationValue.phase === PHASES.PERIOD) {
    const offeredTimes = buildOfferedTimes(
      state.selectedDay,
      interviewType,
      validationValue.period
    );

    if (!offeredTimes.length) {
      return {
        ...state,
        phase: PHASES.DAY,
        offeredDays: getOfferedDays(interviewType).map((day) => toDateKey(day)),
        selectedDay: null,
        period: null,
        emptyPeriod: validationValue.period
      };
    }

    return {
      ...state,
      phase: PHASES.TIME,
      period: validationValue.period,
      offeredTimes
    };
  }

  return state;
}

function buildEmptyPeriodReply(state, interviewType, language) {
  const refreshedState = {
    ...state,
    phase: PHASES.DAY,
    selectedDay: null,
    period: null,
    offeredTimes: [],
    offeredDays: getOfferedDays(interviewType).map((day) => toDateKey(day))
  };

  if (language === "es") {
    return `Ese horario ya no tiene disponibilidad. Veamos otro día.\n\n${buildDayQuestion(refreshedState, language)}`;
  }

  return `That time block is fully booked. Let's look at another day.\n\n${buildDayQuestion(refreshedState, language)}`;
}

function buildScheduleReply({ acknowledgement, transition, question, language, personality }) {
  const { responseBuilder } = require("./responseBuilder");
  const tonePersonality = personality || {
    tone: "professional",
    typingDelay: 1500,
    responseStyle: "professional",
    sensitiveContext: false
  };

  return responseBuilder({
    tone: tonePersonality.tone,
    acknowledgement,
    transition,
    question,
    typingDelay: tonePersonality.typingDelay,
    responseStyle: tonePersonality.responseStyle,
    sensitiveContext: tonePersonality.sensitiveContext
  }).text;
}

function handleScheduleTurn({ prospect, message, language, personality }) {
  const interviewType = prospect.interview_type || INTERVIEW_TYPES.ZOOM;
  let state = parseSchedulingState(prospect.notes);
  const override = detectScheduleOverride(message, {
    phase: state.phase,
    selectedDay: state.selectedDay
  });

  const shouldHandleOverride = shouldHandleScheduleOverride(message, override, state);

  if (shouldHandleOverride) {
    const overrideResult = buildOverrideResponse({
      override,
      interviewType,
      language,
      state
    });

    if (overrideResult.handled && overrideResult.humanHandoff) {
      return {
        prospectUpdates: {
          notes: mergeNotesWithSchedulingState(prospect.notes, {
            ...state,
            overrideRequest: override.raw
          }),
          current_step: "HANDOFF",
          last_message: message
        },
        humanHandoff: true,
        handoffReason: overrideResult.handoffReason || "OUTSIDE_SCHEDULING_WINDOW"
      };
    }

    if (overrideResult.handled && overrideResult.autoBook) {
      const finalized = finalizeSlotSelection(state, overrideResult.selectedTime, language);

      if (!finalized.success) {
        const fallback = findClosestOpenSlots({
          dateKey: overrideResult.selectedTime.dateKey,
          hour: timeKeyToMinutes(overrideResult.selectedTime.timeKey) / 60,
          minute: timeKeyToMinutes(overrideResult.selectedTime.timeKey) % 60,
          interviewType
        });

        return {
          replyText: buildScheduleReply({
            acknowledgement: language === "es" ? "Entiendo." : "I understand.",
            transition:
              language === "es"
                ? "Ese horario acaba de llenarse."
                : "That time just filled up.",
            question: buildOverrideClosestQuestion(
              overrideResult.selectedTime.timeKey,
              fallback.slots,
              language
            ),
            personality
          }),
          prospectUpdates: {
            notes: mergeNotesWithSchedulingState(prospect.notes, {
              ...overrideResult.state,
              offeredTimes: fallback.slots,
              phase: PHASES.TIME
            }),
            appointment_type: PHASES.TIME
          }
        };
      }

      const emailQuestion =
        language === "es"
          ? "¿Cuál es el mejor correo electrónico para enviarte la confirmación?"
          : "What is the best email address to send your interview confirmation?";

      return {
        replyText: buildScheduleReply({
          acknowledgement: overrideResult.reply || (language === "es" ? "Perfecto." : "Perfect."),
          transition:
            interviewType === INTERVIEW_TYPES.ZOOM
              ? language === "es"
                ? "Solo necesito un último dato."
                : "I just need one last detail."
              : "",
          question: interviewType === INTERVIEW_TYPES.ZOOM ? emailQuestion : "",
          personality
        }),
        prospectUpdates: {
          interview_time: finalized.slot.label,
          appointment_date: finalized.slot.startTimeISO,
          appointment_type: null,
          notes: null,
          current_step: interviewType === INTERVIEW_TYPES.ZOOM ? "EMAIL" : "CONFIRMED",
          last_message: message
        },
        complete: true
      };
    }

    if (overrideResult.handled) {
      return {
        replyText: overrideResult.reply,
        prospectUpdates: {
          notes: mergeNotesWithSchedulingState(prospect.notes, overrideResult.state),
          appointment_type: overrideResult.state.phase,
          last_message: message
        }
      };
    }
  }

  if (state.phase === PHASES.DAY) {
    const selectedDay = parseDaySelection(message, state, language);

    if (!selectedDay) {
      return {
        replyText: buildScheduleReply({
          acknowledgement: language === "es" ? "Entendido." : "Got it.",
          question: buildDayQuestion(state, language),
          personality
        }),
        prospectUpdates: {
          appointment_type: PHASES.DAY,
          last_message: message
        }
      };
    }

    const nextState = advanceScheduleState(
      state,
      { phase: PHASES.DAY, selectedDay },
      interviewType,
      language
    );

    return {
      replyText: buildScheduleReply({
        acknowledgement: language === "es" ? "Perfecto." : "Great.",
        question: buildPeriodQuestion(nextState, language),
        personality
      }),
      prospectUpdates: {
        notes: mergeNotesWithSchedulingState(prospect.notes, nextState),
        appointment_type: PHASES.PERIOD,
        last_message: message
      }
    };
  }

  if (state.phase === PHASES.PERIOD) {
    const period = parsePeriodSelection(message, state);

    if (!period) {
      return {
        replyText: buildScheduleReply({
          acknowledgement: language === "es" ? "Entendido." : "Got it.",
          question: buildPeriodQuestion(state, language),
          personality
        }),
        prospectUpdates: {
          appointment_type: PHASES.PERIOD,
          last_message: message
        }
      };
    }

    const nextState = advanceScheduleState(
      state,
      { phase: PHASES.PERIOD, period },
      interviewType,
      language
    );

    if (nextState.emptyPeriod) {
      const refreshedState = {
        ...nextState,
        offeredDays: getOfferedDays(interviewType).map((day) => toDateKey(day))
      };

      return {
        replyText: buildEmptyPeriodReply(refreshedState, interviewType, language),
        prospectUpdates: {
          notes: mergeNotesWithSchedulingState(prospect.notes, refreshedState),
          appointment_type: PHASES.DAY
        }
      };
    }

    return {
      replyText: buildScheduleReply({
        acknowledgement: language === "es" ? "Gracias." : "Thanks.",
        question: buildTimeQuestion(nextState, language),
        personality
      }),
      prospectUpdates: {
        notes: mergeNotesWithSchedulingState(prospect.notes, nextState),
        appointment_type: PHASES.TIME,
        last_message: message
      }
    };
  }

  const selectedTime = parseTimeSelection(message, state);

  if (!selectedTime) {
    return {
      replyText: buildScheduleReply({
        acknowledgement: language === "es" ? "Entendido." : "Got it.",
        question: buildTimeQuestion(state, language),
        personality
      }),
      prospectUpdates: {
        appointment_type: PHASES.TIME,
        last_message: message
      }
    };
  }

  const finalized = finalizeSlotSelection(state, selectedTime, language);

  if (!finalized.success) {
    const refreshedTimes = buildOfferedTimes(
      state.selectedDay,
      interviewType,
      state.period || "morning"
    );
    const retryState = {
      ...state,
      offeredTimes: refreshedTimes,
      phase: PHASES.TIME
    };

    return {
      replyText: buildScheduleReply({
        acknowledgement:
          language === "es"
            ? "Ese horario acaba de llenarse."
            : "That appointment just filled up.",
        question: buildTimeQuestion(retryState, language),
        personality
      }),
      prospectUpdates: {
        notes: mergeNotesWithSchedulingState(prospect.notes, retryState),
        appointment_type: PHASES.TIME
      }
    };
  }

  return {
    replyText: buildScheduleReply({
      acknowledgement: language === "es" ? "Gracias." : "Thanks.",
      question:
        language === "es"
          ? "¿Cuál es el mejor correo electrónico para enviarte la confirmación?"
          : "What is the best email address to send your interview confirmation?",
      personality: {
        ...personality,
        tone: "professional"
      }
    }),
    prospectUpdates: {
      interview_time: finalized.slot.label,
      appointment_date: finalized.slot.startTimeISO,
      appointment_type: null,
      notes: null,
      current_step: "EMAIL",
      last_message: message
    },
    complete: true
  };
}

function parseSchedulingState(notes) {
  const { parseSchedulingState: parseState } = require("./schedulingState");
  return parseState(notes);
}

function mergeNotesWithSchedulingState(existingNotes, state) {
  const { mergeNotesWithSchedulingState: mergeState } = require("./schedulingState");
  return mergeState(existingNotes, state);
}

function buildConfirmationDetails({ interviewType, slotLabel, email, language }) {
  const formatLabel = getInterviewTypeLabel(interviewType, language);

  if (language === "es") {
    return {
      acknowledgement: `✅ Excelente. Tu entrevista por ${formatLabel} quedó confirmada para ${slotLabel}.`,
      transition: `Enviaremos la confirmación a ${email}. Un agente de Team Vision se comunicará contigo si es necesario realizar algún ajuste.`,
      question: "¡Esperamos conocerte!"
    };
  }

  return {
    acknowledgement: `✅ Excellent. Your ${formatLabel} interview is confirmed for ${slotLabel}.`,
    transition: `We'll send the confirmation to ${email}. A Team Vision agent will contact you if any adjustment is needed.`,
    question: "We look forward to meeting you!"
  };
}

module.exports = {
  TIME_ZONE,
  INTERVIEW_TYPES,
  PHASES,
  getInterviewPreferenceQuestion,
  getOfferedDays,
  formatDayLabel,
  buildSlotDateTime,
  getInterviewTypeLabel,
  parseInterviewType,
  isProspectWorking,
  buildInitialSchedulingState,
  buildDayQuestion,
  buildPeriodQuestion,
  buildTimeQuestion,
  getScheduleQuestion,
  validateScheduleStep,
  advanceScheduleState,
  finalizeSlotSelection,
  detectScheduleOverride,
  buildOverrideResponse,
  parseTimeSelection,
  handleScheduleTurn,
  buildConfirmationDetails,
  buildSlotRecord,
  formatTimeLabel,
  formatDayLabel,
  buildOfferedTimes,
  resolvePeriodSlots
};
