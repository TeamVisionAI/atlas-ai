/**
 * Sprint 18.2 — Generic availability engine.
 * Returns available time slots for any appointment type — no interview-specific logic.
 */

const {
  formatTimeKey,
  timeKeyToMinutes,
  getSlotAvailability,
  toDateKey
} = require("../core/capacityEngine");
const {
  isValidAppointmentType,
  resolveDurationMinutes
} = require("../core/configuration/appointmentTypes");
const { getSchedulingSettings } = require("./organizationService");
const {
  ATLAS_DEFAULT_TIMEZONE,
  zonedTimeToUtcMs
} = require("../core/organizationDateWindow");
const {
  FULL_DAY_MAX_SLOT_RESULTS
} = require("../core/configuration/appointmentDomain");

const SLOT_INTERVAL_MINUTES = 30;

function parseTimeKey(timeKey) {
  const [hour, minute] = String(timeKey).split(":").map(Number);
  return hour * 60 + minute;
}

function generateTimeKeys(startMinutes, endMinutes, intervalMinutes = SLOT_INTERVAL_MINUTES) {
  const slots = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += intervalMinutes) {
    slots.push(formatTimeKey(Math.floor(minutes / 60), minutes % 60));
  }

  return slots;
}

function isWorkingDay(date, workingDays) {
  const day = date.getDay();
  const days = Array.isArray(workingDays) && workingDays.length > 0 ? workingDays : [1, 2, 3, 4, 5];
  return days.includes(day);
}

function resolveDateInput(dateInput) {
  if (dateInput instanceof Date) {
    return dateInput;
  }

  if (typeof dateInput === "string") {
    const parsed = new Date(`${dateInput}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function slotFitsWithinWindow(startMinutes, durationMinutes, windowStart, windowEnd) {
  return startMinutes >= windowStart && startMinutes + durationMinutes <= windowEnd;
}

/**
 * @param {Object} params
 * @param {string|Date} params.date
 * @param {number} [params.duration]
 * @param {string} params.appointmentType
 * @param {string} [params.organizationId]
 * @param {number} [params.maxResults]
 */
async function getAvailableSlots({
  date,
  duration,
  appointmentType,
  organizationId,
  maxResults = FULL_DAY_MAX_SLOT_RESULTS
}) {
  if (!isValidAppointmentType(appointmentType)) {
    const error = new Error("Invalid appointment type.");
    error.statusCode = 400;
    throw error;
  }

  const resolvedDate = resolveDateInput(date);
  const dateKey = toDateKey(resolvedDate);
  const durationMinutes = resolveDurationMinutes(appointmentType, duration);
  const scheduling = organizationId
    ? await getSchedulingSettings(organizationId)
    : {
        workingHours: { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] },
        preferredAppointmentHours: { start: "10:00", end: "16:00" },
        maxConcurrentBusinessAppointments: 2
      };

  if (!isWorkingDay(resolvedDate, scheduling.workingHours?.days)) {
    return {
      date: dateKey,
      appointmentType,
      durationMinutes,
      slots: []
    };
  }

  const workingStart = parseTimeKey(scheduling.workingHours?.start || "09:00");
  const workingEnd = parseTimeKey(scheduling.workingHours?.end || "17:00");
  const preferredStart = parseTimeKey(
    scheduling.preferredAppointmentHours?.start || scheduling.workingHours?.start || "09:00"
  );
  const preferredEnd = parseTimeKey(
    scheduling.preferredAppointmentHours?.end || scheduling.workingHours?.end || "17:00"
  );

  const candidateTimes = generateTimeKeys(workingStart, workingEnd - durationMinutes);
  const capacityType = appointmentType;

  const slots = candidateTimes
    .map((timeKey) => {
      const startMinutes = timeKeyToMinutes(timeKey);
      const availability = getSlotAvailability(dateKey, timeKey, capacityType);
      const withinPreferred = slotFitsWithinWindow(
        startMinutes,
        durationMinutes,
        preferredStart,
        preferredEnd
      );

      return {
        dateKey,
        timeKey,
        startTimeISO: buildIsoTimestamp(
          dateKey,
          timeKey,
          ATLAS_DEFAULT_TIMEZONE
        ),
        durationMinutes,
        appointmentType,
        isOpen: availability.isOpen,
        booked: availability.booked,
        capacity: availability.capacity,
        preferred: withinPreferred
      };
    })
    .filter((slot) => slot.isOpen)
    .sort((left, right) => {
      if (left.preferred !== right.preferred) {
        return left.preferred ? -1 : 1;
      }

      return timeKeyToMinutes(left.timeKey) - timeKeyToMinutes(right.timeKey);
    })
    .slice(0, maxResults);

  return {
    date: dateKey,
    appointmentType,
    durationMinutes,
    slots
  };
}

/**
 * Convert appointment-profile wall clock (dateKey + timeKey) to UTC ISO.
 *
 * Implements BR-050 / BR-079 — host process TZ must never define the instant.
 * Wall time is interpreted in `timeZone` (default America/New_York).
 */
function buildIsoTimestamp(
  dateKey,
  timeKey,
  timeZone = ATLAS_DEFAULT_TIMEZONE
) {
  const zone =
    timeZone && String(timeZone).trim()
      ? String(timeZone).trim()
      : ATLAS_DEFAULT_TIMEZONE;
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  const [hour, minute] = String(timeKey || "").split(":").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour)
  ) {
    throw new Error(
      "buildIsoTimestamp requires valid dateKey (YYYY-MM-DD) and timeKey (HH:mm)"
    );
  }

  const utcMs = zonedTimeToUtcMs(
    year,
    month,
    day,
    hour,
    Number.isFinite(minute) ? minute : 0,
    0,
    0,
    zone
  );
  return new Date(utcMs).toISOString();
}

module.exports = {
  getAvailableSlots,
  generateTimeKeys,
  isWorkingDay,
  buildIsoTimestamp
};
