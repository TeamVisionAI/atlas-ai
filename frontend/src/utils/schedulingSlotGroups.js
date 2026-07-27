import { parseTimeToMinutes } from "../components/appointments/workingScheduleTimeUtils";

export function addLocalDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isSameLocalDay(left, right) {
  return startOfLocalDay(left).getTime() === startOfLocalDay(right).getTime();
}

export function startOfLocalWeek(date) {
  const copy = startOfLocalDay(date);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

export function isSameLocalWeek(left, right) {
  return startOfLocalWeek(left).getTime() === startOfLocalWeek(right).getTime();
}

export function parseLocalDateKey(dateKey) {
  if (!dateKey || typeof dateKey !== "string") {
    return null;
  }

  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

export function toLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatSchedulingMonthDay(date, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric"
  }).format(date);
}

/**
 * Today / Tomorrow when applicable; weekday name within the current week;
 * weekday + month/day when the date falls in a later week.
 */
export function formatSchedulingDayLabel(dateKey, reference = new Date(), { translate, locale = "en-US" } = {}) {
  const date = parseLocalDateKey(dateKey);

  if (!date) {
    return dateKey || "";
  }

  if (isSameLocalDay(date, reference)) {
    return translate?.("schedulingDayToday") || "Today";
  }

  if (isSameLocalDay(date, addLocalDays(reference, 1))) {
    return translate?.("schedulingDayTomorrow") || "Tomorrow";
  }

  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);

  if (isSameLocalWeek(date, reference)) {
    return weekday;
  }

  return `${weekday}, ${formatSchedulingMonthDay(date, locale)}`;
}

/**
 * Next Week (Aug 1) — calendar anchor for the following week's availability.
 */
export function formatNextWeekLabel(weekStartDateKey, { translate, locale = "en-US" } = {}) {
  const date = parseLocalDateKey(weekStartDateKey);
  const monthDay = date ? formatSchedulingMonthDay(date, locale) : "";

  if (!monthDay) {
    return translate?.("missionExecutionNextWeek") || "Next Week";
  }

  if (translate) {
    return translate("missionExecutionNextWeekWithDate", { date: monthDay });
  }

  return `Next Week (${monthDay})`;
}

/**
 * Always 12-hour AM/PM — uses timeKey from the scheduling engine (working schedule blocks).
 */
export function formatSchedulingTime12Hour(timeKey, locale = "en-US") {
  if (!timeKey) {
    return "";
  }

  const minutes = parseTimeToMinutes(timeKey);
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const date = new Date(2000, 0, 1, hours, mins);

  return date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

export function formatSlotButtonLabel(slot, locale = "en-US") {
  if (slot?.timeKey) {
    return formatSchedulingTime12Hour(slot.timeKey, locale);
  }

  if (slot?.startTimeISO) {
    const date = new Date(slot.startTimeISO);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString(locale, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
    }
  }

  return "";
}

export function groupSlotsByDay(slots = [], { reference = new Date(), translate, locale = "en-US" } = {}) {
  const map = new Map();

  slots.forEach((slot) => {
    if (!slot?.dateKey || !slot?.timeKey) {
      return;
    }

    if (!map.has(slot.dateKey)) {
      map.set(slot.dateKey, []);
    }

    map.get(slot.dateKey).push(slot);
  });

  return Array.from(map.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, daySlots]) => ({
      dateKey,
      label: formatSchedulingDayLabel(dateKey, reference, { translate, locale }),
      slots: daySlots.sort((left, right) => left.timeKey.localeCompare(right.timeKey))
    }))
    .filter((day) => day.slots.length > 0);
}

export function slotIdentity(slot) {
  return `${slot.dateKey}:${slot.timeKey}`;
}

export function isSameSlot(left, right) {
  return Boolean(left && right && slotIdentity(left) === slotIdentity(right));
}

export function resolveSchedulingDateRange(dayCount = 7) {
  const start = new Date();
  const end = addLocalDays(start, dayCount);

  return {
    date: toLocalDateKey(start),
    dateEnd: toLocalDateKey(end)
  };
}
