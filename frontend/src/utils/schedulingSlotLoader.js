import {
  addLocalDays,
  parseLocalDateKey,
  startOfLocalDay,
  toLocalDateKey
} from "./schedulingSlotGroups";

export const SCHEDULING_WINDOW_HOURS = 48;
export const SCHEDULING_RECOMMENDED_MAX = 6;
export const SCHEDULING_DAY_FETCH_MAX = 12;
export const SCHEDULING_MAX_SCAN_DAYS = 21;

export function getSlotTimestamp(slot) {
  if (!slot) {
    return 0;
  }

  const localDate = parseLocalDateKey(slot.dateKey);

  if (localDate && slot.timeKey) {
    const [hours, minutes] = slot.timeKey.split(":").map(Number);
    localDate.setHours(hours, minutes || 0, 0, 0);
    return localDate.getTime();
  }

  if (slot.startTimeISO) {
    const parsed = Date.parse(slot.startTimeISO);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function sortSlotsChronologically(slots = []) {
  return [...slots].sort((left, right) => getSlotTimestamp(left) - getSlotTimestamp(right));
}

export function filterFutureSlots(slots = [], referenceMs = Date.now()) {
  return slots.filter((slot) => getSlotTimestamp(slot) >= referenceMs);
}

export function filterSlotsWithinHours(slots = [], hours = SCHEDULING_WINDOW_HOURS, referenceMs = Date.now()) {
  const windowEnd = referenceMs + hours * 60 * 60 * 1000;

  return filterFutureSlots(slots, referenceMs).filter(
    (slot) => getSlotTimestamp(slot) <= windowEnd
  );
}

export function pickRecommendedSlots(slots = [], max = SCHEDULING_RECOMMENDED_MAX) {
  return sortSlotsChronologically(slots).slice(0, max);
}

export function groupSlotsByDateKey(slots = []) {
  const map = new Map();

  slots.forEach((slot) => {
    if (!slot?.dateKey) {
      return;
    }

    if (!map.has(slot.dateKey)) {
      map.set(slot.dateKey, []);
    }

    map.get(slot.dateKey).push(slot);
  });

  map.forEach((daySlots, dateKey) => {
    map.set(dateKey, sortSlotsChronologically(daySlots));
  });

  return map;
}

async function fetchDaySlots(fetchAvailability, dateKey, duration) {
  const result = await fetchAvailability({
    date: dateKey,
    purpose: "recruiting_interview",
    duration,
    maxResults: SCHEDULING_DAY_FETCH_MAX
  });

  return sortSlotsChronologically(result?.slots || []);
}

/**
 * Loads the smallest set of day queries needed for the initial scheduling view.
 * 1) Scan only within the next 48 hours (day-by-day, not a full week).
 * 2) If empty, advance to the next calendar day with availability.
 */
export async function loadInitialSchedulingSlots(fetchAvailability, duration, options = {}) {
  const windowHours = options.windowHours ?? SCHEDULING_WINDOW_HOURS;
  const recommendedMax = options.recommendedMax ?? SCHEDULING_RECOMMENDED_MAX;
  const now = options.referenceMs ?? Date.now();
  const windowEnd = now + windowHours * 60 * 60 * 1000;

  const cacheByDay = new Map();
  let cursor = startOfLocalDay(new Date(now));
  let viewMode = "48h";
  let scannedDays = 0;
  let windowSlots = [];

  while (scannedDays < SCHEDULING_MAX_SCAN_DAYS) {
    const dayStartMs = cursor.getTime();

    if (dayStartMs > windowEnd) {
      break;
    }

    const dateKey = toLocalDateKey(cursor);
    const daySlots = filterFutureSlots(await fetchDaySlots(fetchAvailability, dateKey, duration), now);
    cacheByDay.set(dateKey, daySlots);

    const inWindow = filterSlotsWithinHours(daySlots, windowHours, now);
    windowSlots = sortSlotsChronologically([...windowSlots, ...inWindow]);

    cursor = addLocalDays(cursor, 1);
    scannedDays += 1;
  }

  if (windowSlots.length === 0) {
    viewMode = "next_available";

    while (scannedDays < SCHEDULING_MAX_SCAN_DAYS) {
      const dateKey = toLocalDateKey(cursor);
      const daySlots = filterFutureSlots(
        cacheByDay.has(dateKey)
          ? cacheByDay.get(dateKey)
          : await fetchDaySlots(fetchAvailability, dateKey, duration),
        now
      );

      if (!cacheByDay.has(dateKey)) {
        cacheByDay.set(dateKey, daySlots);
      }

      if (daySlots.length) {
        windowSlots = daySlots;
        break;
      }

      cursor = addLocalDays(cursor, 1);
      scannedDays += 1;
    }
  }

  const recommendedSlots = pickRecommendedSlots(windowSlots, recommendedMax);

  return {
    recommendedSlots,
    windowSlots,
    cacheByDay,
    viewMode,
    hasMoreInWindow: windowSlots.length > recommendedSlots.length
  };
}

export async function loadDaySchedulingSlots(fetchAvailability, dateKey, duration, cacheByDay) {
  if (cacheByDay?.has(dateKey)) {
    return cacheByDay.get(dateKey);
  }

  const daySlots = filterFutureSlots(await fetchDaySlots(fetchAvailability, dateKey, duration));
  cacheByDay?.set(dateKey, daySlots);
  return daySlots;
}

export async function loadWeekSchedulingSlots(fetchAvailability, startDateKey, duration, cacheByDay) {
  const start = parseLocalDateKey(startDateKey);

  if (!start) {
    return [];
  }

  const merged = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const dateKey = toLocalDateKey(addLocalDays(start, offset));
    const daySlots = await loadDaySchedulingSlots(fetchAvailability, dateKey, duration, cacheByDay);
    merged.push(...daySlots);
  }

  return sortSlotsChronologically(merged);
}

/**
 * Upcoming calendar days the user can jump to (excludes today).
 */
export function buildSelectableDayOptions(reference = new Date(), count = 8) {
  const options = [];
  let cursor = addLocalDays(startOfLocalDay(reference), 1);

  while (options.length < count) {
    options.push({
      dateKey: toLocalDateKey(cursor),
      date: new Date(cursor)
    });
    cursor = addLocalDays(cursor, 1);
  }

  return options;
}

export function resolveNextWeekStart(reference = new Date()) {
  const cursor = startOfLocalDay(reference);
  const day = cursor.getDay();
  const daysUntilNextMonday = day === 0 ? 1 : 8 - day;
  return toLocalDateKey(addLocalDays(cursor, daysUntilNextMonday));
}
