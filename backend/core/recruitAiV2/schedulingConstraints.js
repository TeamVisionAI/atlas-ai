/**
 * Recruit AI v2 — availability constraints vs direct time proposals (BR-084 / BR-102).
 * Constraints are not appointment candidates.
 *
 * Lower-bound inclusivity (BR-102 / BR-105 / BR-107):
 * - exclusive: "después de las 5" / "after 5" → time > earliestTime
 * - inclusive: "a partir de las 5" / "starting at 5" → time >= earliestTime
 */

function normalizeAscii(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * True clock meridiem only — do not treat date "mañana" / day-part "tarde" as AM/PM.
 */
function textHasClockMeridiem(text) {
  const t = normalizeAscii(text);
  if (!t) {
    return false;
  }
  if (/\b(am|pm|a\.?m\.?|p\.?m\.?)\b/.test(t)) {
    return true;
  }
  // "3 de la tarde" / "10 de la mañana" after a clock hour.
  return /\b\d{1,2}(?::\d{2})?\s*(?:de\s+la\s+|por\s+la\s+)?(manana|tarde)\b/.test(
    t
  );
}

function padTime(hour, minute = 0) {
  if (!Number.isFinite(hour)) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseClockToken(rawHour, rawMinute) {
  let hour = Number(rawHour);
  const minute = rawMinute != null ? Number(rawMinute) : 0;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return null;
  }
  // Bare 1–7 without meridiem → PM bias for recruiting interviews.
  if (hour >= 1 && hour <= 7) {
    hour += 12;
  } else if (hour === 12) {
    // keep noon/midnight handled by meridiem elsewhere
  }
  if (hour === 24) {
    hour = 12;
  }
  return padTime(hour, Number.isFinite(minute) ? minute : 0);
}

function buildAvailabilityConstraint({
  earliestTime = null,
  latestTime = null,
  dayPart = null,
  explicitCandidateTime = null,
  earliestTimeInclusive = true,
  raw = null
} = {}) {
  return {
    type: "availability_constraint",
    earliestTime,
    latestTime,
    dayPart,
    explicitCandidateTime,
    // Implements BR-102 / BR-107 — explicit lower-bound semantics.
    earliestTimeInclusive: earliestTimeInclusive !== false,
    raw
  };
}

/**
 * Infer inclusivity for legacy constraints that only have raw text.
 * Prefer the explicit earliestTimeInclusive field when present.
 */
function resolveEarliestTimeInclusive(constraint = {}) {
  if (typeof constraint?.earliestTimeInclusive === "boolean") {
    return constraint.earliestTimeInclusive;
  }

  const t = normalizeAscii(constraint?.raw || "");
  if (!t) {
    // Bare earliestTime without phrasing → inclusive (>=), historical filter default.
    return true;
  }

  // Inclusive phrases (check before generic "after").
  if (
    /\ba partir de\b/.test(t) ||
    /\bdesde\b/.test(t) ||
    /\bstarting at\b/.test(t) ||
    /\bfrom\b.+\bonward\b/.test(t) ||
    /\bat or after\b/.test(t) ||
    /\bor later\b/.test(t) ||
    /\bor after\b/.test(t) ||
    /\bo despues\b/.test(t) ||
    /\ben adelante\b/.test(t)
  ) {
    return true;
  }

  // Exclusive phrases.
  if (
    /\bdespues de\b/.test(t) ||
    /\bluego de\b/.test(t) ||
    /\bmas tarde de\b/.test(t) ||
    /\blater than\b/.test(t) ||
    /\bafter\b/.test(t)
  ) {
    return false;
  }

  return true;
}

/**
 * Detect availability constraints (not appointment proposals).
 */
function parseAvailabilityConstraint(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  const t = normalizeAscii(raw);

  if (
    /\b(evenings? only|solo puedo por la noche|por la noche|solo en la noche)\b/.test(
      t
    )
  ) {
    return buildAvailabilityConstraint({
      earliestTime: "17:00",
      dayPart: "evening",
      earliestTimeInclusive: true,
      raw
    });
  }

  if (
    /\b(hasta tarde|until late|working until late|trabajo hasta tarde)\b/.test(t)
  ) {
    return buildAvailabilityConstraint({
      earliestTime: "17:00",
      dayPart: "evening",
      earliestTimeInclusive: true,
      raw
    });
  }

  const until =
    t.match(
      /\b(?:trabajo hasta|work until|salgo a|i'?m off at|off at|hasta)\s+(?:las\s+)?(\d{1,2})(?::(\d{2}))?\b/
    ) ||
    t.match(/\b(?:hasta las)\s+(\d{1,2})(?::(\d{2}))?\b/);

  if (until) {
    const clock = parseClockToken(until[1], until[2]);
    // Free after getting off → exclusive of the bound.
    return buildAvailabilityConstraint({
      earliestTime: clock,
      dayPart: "evening",
      earliestTimeInclusive: false,
      raw
    });
  }

  // Inclusive lower bound — "a partir de" / "desde" / "starting at" / "at or after" / "5 or later".
  // Implements BR-102 — must outrank generic "after" matching.
  const inclusive =
    t.match(
      /\b(?:(?:puedo|me sirve|cualquier hora|anytime|anything|i can(?: do)?)\s+)?(?:a partir de(?: la[s]?)?|desde(?: la[s]?)?)\s+(\d{1,2})(?::(\d{2}))?\b(?:\s*(?:pm|p\.?m\.?)|\s+en adelante)?/
    ) ||
    t.match(
      /\bstarting at\s+(\d{1,2})(?::(\d{2}))?\b(?:\s*(?:pm|p\.?m\.?))?/
    ) ||
    t.match(
      /\bfrom\s+(\d{1,2})(?::(\d{2}))?\b(?:\s*(?:pm|p\.?m\.?))?\s+onward\b/
    ) ||
    t.match(
      /\bat or after\s+(\d{1,2})(?::(\d{2}))?\b(?:\s*(?:pm|p\.?m\.?))?/
    ) ||
    t.match(
      /\b(\d{1,2})(?::(\d{2}))?\s*(?:pm|p\.?m\.?)?\s+(?:o despues|or later|or after)\b/
    );

  if (inclusive) {
    const clock = parseClockToken(inclusive[1], inclusive[2]);
    return buildAvailabilityConstraint({
      earliestTime: clock,
      dayPart: "evening",
      earliestTimeInclusive: true,
      raw
    });
  }

  // Exclusive lower bound — "después de" / "luego de" / "más tarde de" / "after" / "later than".
  // Implements BR-102 — "después de la 5" / bare "after 5" are constraints (PM-biased).
  const exclusive = t.match(
    /\b(?:(?:puedo|me sirve|cualquier hora|anytime|anything|i can(?: do)?)\s+)?(?:despues de(?: la[s]?)?|luego de(?: la[s]?)?|mas tarde de(?: la[s]?)?|later than|after)\s+(\d{1,2})(?::(\d{2}))?\b(?:\s*(?:pm|p\.?m\.?))?/
  );
  if (exclusive) {
    const clock = parseClockToken(exclusive[1], exclusive[2]);
    return buildAvailabilityConstraint({
      earliestTime: clock,
      dayPart: "evening",
      earliestTimeInclusive: false,
      raw
    });
  }

  const beforeCant = t.match(
    /\b(?:antes de las|can'?t before|cannot before|no puedo antes de( las)?)\s+(\d{1,2})(?::(\d{2}))?\b/
  );
  if (beforeCant) {
    const clock = parseClockToken(beforeCant[2], beforeCant[3]);
    // "can't before 5" → available at/after 5.
    return buildAvailabilityConstraint({
      earliestTime: clock,
      dayPart: null,
      earliestTimeInclusive: true,
      raw
    });
  }

  return null;
}

function looksLikeDirectTimeProposal(text) {
  const t = normalizeAscii(String(text || "").replace(/[?!.]+$/g, "").trim());
  if (!t) {
    return false;
  }
  if (parseAvailabilityConstraint(text)) {
    return false;
  }
  return (
    /^(\d{1,2})(:(\d{2}))?$/.test(t) ||
    /^(at|a las|como a las)\s+(\d{1,2})(:(\d{2}))?$/.test(t) ||
    /^(mejor|actually|prefiero|better)\s+(\d{1,2})(:(\d{2}))?$/.test(t)
  );
}

/**
 * Implements BR-101 — confirmed day-part resolves bare hours without AM/PM ask.
 * morning + 10 → 10:00; afternoon + 3 → 15:00.
 */
function applyDayPartToClock(hour, minute, dayPart) {
  const part = String(dayPart || "").toLowerCase();
  if (!Number.isFinite(hour)) {
    return null;
  }
  const mm = Number.isFinite(minute) ? minute : 0;
  if (part === "morning") {
    if (hour >= 13 && hour <= 23) {
      return padTime(hour - 12, mm);
    }
    return padTime(hour === 24 ? 0 : hour, mm);
  }
  if (part === "afternoon" || part === "evening") {
    if (hour >= 1 && hour <= 11) {
      return padTime(hour + 12, mm);
    }
    return padTime(hour, mm);
  }
  return null;
}

/**
 * Resolve AM/PM for a bare hour using constraints / day-part context.
 * Returns { time, needsAmPmClarification }.
 */
function resolveCandidateTime(text, context = {}, scheduleNormalizedHour = null) {
  const raw = String(text || "").trim();
  const t = normalizeAscii(raw.replace(/[?!.]+$/g, ""));
  const constraint = context.knownFacts?.availabilityConstraint || null;
  const dayPart =
    context.knownFacts?.preferredDayPart ||
    constraint?.dayPart ||
    null;

  const mejor = t.match(
    /^(?:mejor|actually|prefiero|better)\s+(\d{1,2})(?::(\d{2}))?$/
  );
  const after = t.match(
    /^(?:after|despues de(?: la[s]?)?|luego de(?: la[s]?)?|a partir de(?: la[s]?)?)\s+(\d{1,2})(?::(\d{2}))?$/
  );
  const at = t.match(/^(?:at|a las|como a las)\s+(\d{1,2})(?::(\d{2}))?$/);
  const bare = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  const m = mejor || after || at || bare;
  // Trust an already-normalized HH:MM from the schedule parser, unless the
  // bare hour is still AM/PM-ambiguous (08–11) without context/meridiem.
  if (
    typeof scheduleNormalizedHour === "string" &&
    /^\d{2}:\d{2}$/.test(scheduleNormalizedHour)
  ) {
    const [hh, mm] = scheduleNormalizedHour.split(":").map(Number);
    // Bare "mañana"/"tarde" are date/day-part tokens; only clock meridiem counts here.
    const hasMeridiemEarly = textHasClockMeridiem(raw);
    const fromDayPart = applyDayPartToClock(hh > 12 ? hh - 12 : hh, mm, dayPart);
    if (!hasMeridiemEarly && fromDayPart) {
      return { time: fromDayPart, needsAmPmClarification: false };
    }
    const hasContext =
      Boolean(constraint?.earliestTime) ||
      dayPart === "evening" ||
      dayPart === "afternoon" ||
      dayPart === "morning";
    if (!hasMeridiemEarly && !hasContext && hh >= 8 && hh <= 11) {
      return {
        time: null,
        needsAmPmClarification: true,
        ambiguousHour: hh,
        ambiguousMinute: mm
      };
    }
    return { time: scheduleNormalizedHour, needsAmPmClarification: false };
  }

  if (!m && scheduleNormalizedHour != null) {
    const asNum = Number(scheduleNormalizedHour);
    if (Number.isFinite(asNum)) {
      return {
        time: padTime(asNum, 0),
        needsAmPmClarification: false
      };
    }
  }
  if (!m) {
    return { time: null, needsAmPmClarification: false };
  }

  let hour = Number(m[1]);
  const minute = m[2] != null ? Number(m[2]) : 0;
  if (!Number.isFinite(hour)) {
    return { time: null, needsAmPmClarification: false };
  }

  const hasMeridiem = textHasClockMeridiem(raw);
  const constraintEarliest = constraint?.earliestTime || null;

  if (hasMeridiem) {
    return { time: parseClockToken(hour > 12 ? hour - 12 : hour, minute), needsAmPmClarification: false };
  }

  // BR-101 — confirmed day-part inherits AM/PM; never ask when known.
  const fromDayPart = applyDayPartToClock(hour, minute, dayPart);
  if (fromDayPart) {
    return { time: fromDayPart, needsAmPmClarification: false };
  }

  // Context: after-5 / evening → 6 means 18:00.
  if (constraintEarliest || dayPart === "evening" || dayPart === "afternoon") {
    if (hour >= 1 && hour <= 11) {
      hour += 12;
    }
    return { time: padTime(hour, minute), needsAmPmClarification: false };
  }

  // No context: 1–7 still biased PM for recruiting; 8–11 ask AM/PM.
  if (hour >= 1 && hour <= 7) {
    return { time: padTime(hour + 12, minute), needsAmPmClarification: false };
  }
  if (hour >= 8 && hour <= 11) {
    return {
      time: null,
      needsAmPmClarification: true,
      ambiguousHour: hour,
      ambiguousMinute: minute
    };
  }

  return { time: padTime(hour, minute), needsAmPmClarification: false };
}

function isTimeLikeToken(text) {
  const t = String(text || "")
    .trim()
    .replace(/[?!.]+$/g, "");
  return /^(\d{1,2})(:\d{2})?$/.test(t) || looksLikeDirectTimeProposal(text);
}

/**
 * True when candidate HH:MM is strictly before earliestTime (legacy string API).
 * Prefer violatesEarliestConstraint for inclusive/exclusive semantics.
 */
function isBeforeEarliestConstraint(candidateTime, earliestTime) {
  const c = String(candidateTime || "");
  const e = String(earliestTime || "");
  if (!/^\d{2}:\d{2}$/.test(c) || !/^\d{2}:\d{2}$/.test(e)) {
    return false;
  }
  return c < e;
}

/**
 * True when candidate violates the normalized earliest bound.
 * Exclusive → reject equality; inclusive → accept equality.
 */
function violatesEarliestConstraint(candidateTime, constraint = {}) {
  const earliestTime =
    typeof constraint === "string" ? constraint : constraint?.earliestTime;
  const c = String(candidateTime || "");
  const e = String(earliestTime || "");
  if (!/^\d{2}:\d{2}$/.test(c) || !/^\d{2}:\d{2}$/.test(e)) {
    return false;
  }

  const inclusive =
    typeof constraint === "string"
      ? true
      : resolveEarliestTimeInclusive(constraint || {});

  return inclusive ? c < e : c <= e;
}

module.exports = {
  parseAvailabilityConstraint,
  buildAvailabilityConstraint,
  resolveEarliestTimeInclusive,
  looksLikeDirectTimeProposal,
  resolveCandidateTime,
  applyDayPartToClock,
  isTimeLikeToken,
  isBeforeEarliestConstraint,
  violatesEarliestConstraint,
  padTime
};
