/**
 * BR-185 — minimum booking lead time.
 * Slot instants are compared in UTC after wall-clock conversion (BR-050 / BR-079).
 * Does not invent a second timezone system.
 */

const DEFAULT_MINIMUM_BOOKING_LEAD_MINUTES = 120;
const MIN_LEAD_MINUTES = 0;
const MAX_LEAD_MINUTES = 24 * 60;

function resolveMinimumBookingLeadMinutes(value) {
  if (value == null || value === "") {
    return DEFAULT_MINIMUM_BOOKING_LEAD_MINUTES;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_MINIMUM_BOOKING_LEAD_MINUTES;
  }
  return Math.min(MAX_LEAD_MINUTES, Math.max(MIN_LEAD_MINUTES, Math.floor(n)));
}

function earliestBookableMs(nowMs, leadMinutes) {
  const now = Number(nowMs);
  const safeNow = Number.isFinite(now) ? now : Date.now();
  return safeNow + resolveMinimumBookingLeadMinutes(leadMinutes) * 60 * 1000;
}

function isSlotBookableByLeadTime(slotStartMs, nowMs, leadMinutes) {
  const start = Number(slotStartMs);
  if (!Number.isFinite(start)) {
    return false;
  }
  return start >= earliestBookableMs(nowMs, leadMinutes);
}

module.exports = {
  DEFAULT_MINIMUM_BOOKING_LEAD_MINUTES,
  resolveMinimumBookingLeadMinutes,
  earliestBookableMs,
  isSlotBookableByLeadTime
};
