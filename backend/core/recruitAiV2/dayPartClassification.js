/**
 * Recruiting day-part classification (BR-119 / BR-164 / BR-231).
 * Canonical windows stay unchanged for booking and slot filters.
 * Day-first claims require a true morning slot, not a near-noon boundary.
 */

function slotTimeKey(slot) {
  return String(slot?.time || slot?.timeKey || "");
}

function slotDateKey(slot) {
  return String(slot?.date || slot?.dateKey || "");
}

function slotMinutes(slot) {
  const raw = slotTimeKey(slot).trim();
  if (!raw || !raw.includes(":")) {
    return null;
  }
  const [hourRaw, minuteRaw] = raw.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour)) {
    return null;
  }
  return hour * 60 + (Number.isFinite(minute) ? minute : 0);
}

/**
 * Canonical classifier: morning < 12:00, afternoon strictly after 12:00,
 * evening >= 17:00. Noon is neither morning nor afternoon.
 */
function classifySlotDayPart(slot) {
  const minutes = slotMinutes(slot);
  if (minutes == null) {
    return null;
  }
  if (minutes < 12 * 60) {
    return "morning";
  }
  if (minutes >= 17 * 60) {
    return "evening";
  }
  if (minutes > 12 * 60) {
    return "afternoon";
  }
  return null;
}

function slotBelongsToCanonicalDayPart(slot, dayPart) {
  const part = String(dayPart || "").toLowerCase();
  if (!part) {
    return false;
  }
  if (part === "evening") {
    const minutes = slotMinutes(slot);
    return minutes != null && minutes >= 17 * 60;
  }
  return classifySlotDayPart(slot) === part;
}

/**
 * 11:30–11:59 is still canonical morning for booking, but it is too close to
 * noon to advertise a day as "en la mañana".
 */
function isNearMorningBoundarySlot(slot) {
  const minutes = slotMinutes(slot);
  return minutes != null && minutes >= 11 * 60 + 30 && minutes < 12 * 60;
}

function slotSupportsDayFirstDayPartClaim(slot, dayPart) {
  const part = String(dayPart || "").toLowerCase();
  if (part === "morning") {
    const minutes = slotMinutes(slot);
    return minutes != null && minutes < 11 * 60 + 30;
  }
  return slotBelongsToCanonicalDayPart(slot, part);
}

function uniqueSlots(slots = []) {
  const seen = new Set();
  const out = [];
  for (const slot of slots) {
    const id = `${slotDateKey(slot)}|${slotTimeKey(slot)}`;
    if (!id || id === "|" || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(slot);
  }
  return out;
}

function sortSlots(slots = []) {
  return [...slots].sort((left, right) => {
    const dateCmp = slotDateKey(left).localeCompare(slotDateKey(right));
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return (slotMinutes(left) || 0) - (slotMinutes(right) || 0);
  });
}

function uniqueDays(slots = []) {
  const days = [];
  for (const slot of slots) {
    const key = slotDateKey(slot);
    if (key && !days.includes(key)) {
      days.push(key);
    }
  }
  return days;
}

/**
 * Split returned slots into days that honestly support the requested day-part
 * versus a same-day earliest alternative when that day has no true match.
 */
function buildDayFirstDayPartView({
  offeredSlots = [],
  extraSlots = [],
  requestedDayPart = null
} = {}) {
  const part = String(requestedDayPart || "").toLowerCase() || null;
  const offered = uniqueSlots(offeredSlots);
  const pool = sortSlots(uniqueSlots([...offered, ...(extraSlots || [])]));

  if (!part) {
    return {
      requestedDayPart: null,
      claimDays: uniqueDays(offered),
      claimSlots: offered,
      earliestAlternative: null,
      unavailableDayPartDate: null,
      nextDayPartDay: null
    };
  }

  const claimSlots = pool.filter((slot) =>
    slotSupportsDayFirstDayPartClaim(slot, part)
  );
  const claimDays = uniqueDays(claimSlots);
  const firstDate = slotDateKey(pool[0] || offered[0] || {});
  const firstDateHasClaim = Boolean(firstDate && claimDays.includes(firstDate));
  const earliestOnFirst =
    pool.find((slot) => slotDateKey(slot) === firstDate) || null;
  const earliestAlternative =
    !firstDateHasClaim && earliestOnFirst ? earliestOnFirst : null;
  const nextDayPartDay =
    claimDays.find((day) => day !== firstDate) ||
    (firstDateHasClaim ? firstDate : null) ||
    null;

  return {
    requestedDayPart: part,
    claimDays,
    claimSlots,
    earliestAlternative,
    unavailableDayPartDate: earliestAlternative ? firstDate : null,
    nextDayPartDay
  };
}

module.exports = {
  slotTimeKey,
  slotDateKey,
  slotMinutes,
  classifySlotDayPart,
  slotBelongsToCanonicalDayPart,
  isNearMorningBoundarySlot,
  slotSupportsDayFirstDayPartClaim,
  buildDayFirstDayPartView
};
