/** Time helpers for working schedule timeline (frontend only). */

export const SNAP_MINUTES = 15;
export const MIN_BLOCK_MINUTES = 15;
export const DEFAULT_VIEW_START = 9 * 60;
export const DEFAULT_VIEW_END = 22 * 60;
export const FULL_DAY_START = 0;
export const FULL_DAY_END = 24 * 60;

export function parseTimeToMinutes(time) {
  if (!time || typeof time !== "string") {
    return 0;
  }

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

export function minutesToTime(minutes) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function snapMinutes(minutes, snap = SNAP_MINUTES) {
  return Math.round(minutes / snap) * snap;
}

export function clampMinutes(minutes, min, max) {
  return Math.max(min, Math.min(max, minutes));
}

export function formatTimeLabel(minutes, locale = "en-US") {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const date = new Date(2000, 0, 1, hours, mins);
  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function buildHourTicks(viewStart, viewEnd, fullDay) {
  const ticks = [];
  const step = fullDay ? 3 : 3;
  const startHour = Math.ceil(viewStart / 60);
  const endHour = Math.floor(viewEnd / 60);

  for (let hour = startHour; hour <= endHour; hour += step) {
    ticks.push(hour * 60);
  }

  return ticks;
}

export function blockToPercents(block, viewStart, viewEnd) {
  const start = parseTimeToMinutes(block.start);
  const end = parseTimeToMinutes(block.end);
  const range = viewEnd - viewStart;

  if (range <= 0) {
    return { left: 0, width: 0 };
  }

  const clampedStart = clampMinutes(start, viewStart, viewEnd);
  const clampedEnd = clampMinutes(end, viewStart, viewEnd);

  return {
    left: ((clampedStart - viewStart) / range) * 100,
    width: Math.max(0, ((clampedEnd - clampedStart) / range) * 100)
  };
}
