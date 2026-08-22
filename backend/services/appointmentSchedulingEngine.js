/**
 * Sprint 22 — Appointment Scheduling Engine (sole authority for available slots).
 */

const {
  formatTimeKey,
  timeKeyToMinutes,
  toDateKey
} = require("../core/capacityEngine");
const {
  SLOT_INTERVAL_MINUTES,
  FULL_DAY_MAX_SLOT_RESULTS,
  MORNING_RANGE,
  AFTERNOON_RANGE
} = require("../core/configuration/appointmentDomain");
const { buildIsoTimestamp } = require("./availabilityService");
const appointmentRepository = require("../repositories/appointmentRepository");
const {
  getAppointmentProfile,
  resolveDurationForPurpose
} = require("./appointmentProfileService");
const googleCalendarIntegrationService = require("./googleCalendarIntegrationService");
const { getSchedulingSettings } = require("./organizationService");

function parseTimeKey(timeKey) {
  const [hour, minute] = String(timeKey).split(":").map(Number);
  return hour * 60 + minute;
}

function generateTimeKeys(startMinutes, endMinutes, intervalMinutes = SLOT_INTERVAL_MINUTES) {
  const slots = [];

  for (let minutes = startMinutes; minutes < endMinutes; minutes += intervalMinutes) {
    slots.push(formatTimeKey(Math.floor(minutes / 60), minutes % 60));
  }

  return slots;
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

function getDaySchedule(profile, date) {
  const dayOfWeek = date.getDay();
  return profile.workingSchedule.find((day) => day.dayOfWeek === dayOfWeek) || {
    enabled: false,
    blocks: []
  };
}

function matchesTimePreference(startMinutes, preference) {
  if (!preference || preference === "any") {
    return true;
  }

  if (preference === "morning") {
    const start = parseTimeKey(MORNING_RANGE.start);
    const end = parseTimeKey(MORNING_RANGE.end);
    return startMinutes >= start && startMinutes < end;
  }

  if (preference === "afternoon") {
    const start = parseTimeKey(AFTERNOON_RANGE.start);
    const end = parseTimeKey(AFTERNOON_RANGE.end);
    return startMinutes >= start && startMinutes < end;
  }

  return true;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function buildBusyRanges(existingAppointments, bufferBefore, bufferAfter) {
  return existingAppointments.map((appointment) => {
    const start = new Date(appointment.startDateTime).getTime() - bufferBefore * 60 * 1000;
    const end = new Date(appointment.endDateTime).getTime() + bufferAfter * 60 * 1000;

    return { start, end, source: "atlas_appointment" };
  });
}

function isSlotBlocked(slotStartMs, slotEndMs, busyRanges) {
  return busyRanges.some((range) => rangesOverlap(slotStartMs, slotEndMs, range.start, range.end));
}

function isOwnBusyWindow(range, excludedWindow) {
  if (!excludedWindow) {
    return false;
  }

  return (
    Math.abs(range.start - excludedWindow.start) <= 60_000 &&
    Math.abs(range.end - excludedWindow.end) <= 120_000
  );
}

async function fetchGoogleBusyRanges(organizationId, timeMin, timeMax, timezone, userId = null) {
  // BR-147 — personal availability ∩ personal Google free/busy (never org/RVP calendar).
  const busy = await googleCalendarIntegrationService.queryFreeBusy(
    organizationId,
    timeMin,
    timeMax,
    timezone,
    { userId }
  );

  return (busy || []).map((period) => ({
    start: new Date(period.start).getTime(),
    end: new Date(period.end).getTime(),
    source: "google_calendar"
  }));
}

/**
 * @param {Object} params
 * @param {string} params.agentId
 * @param {string} params.organizationId
 * @param {string|Date} params.date
 * @param {string} [params.dateEnd] - inclusive range end for multi-day search
 * @param {string} [params.purpose]
 * @param {number} [params.durationMinutes]
 * @param {string} [params.timePreference] - morning | afternoon | any
 * @param {number} [params.maxResults]
 * @param {string} [params.excludeAppointmentId] - reschedule: ignore this appointment's own block
 * @param {Object} [params.dependencies] - test seams only
 */
async function getAvailableSlots({
  agentId,
  organizationId,
  date,
  dateEnd,
  purpose = "recruiting_interview",
  durationMinutes,
  timePreference = "any",
  maxResults = FULL_DAY_MAX_SLOT_RESULTS,
  excludeAppointmentId = null,
  dependencies = {}
} = {}) {
  const loadProfile =
    dependencies.getAppointmentProfileFn || getAppointmentProfile;
  const searchAppointments =
    dependencies.searchAppointmentsFn ||
    ((filters) => appointmentRepository.search(filters));
  const loadScheduling =
    dependencies.getSchedulingSettingsFn || getSchedulingSettings;
  const loadGoogleBusy =
    dependencies.queryFreeBusyFn || fetchGoogleBusyRanges;
  const now = Number.isFinite(dependencies.nowMs) ? dependencies.nowMs : Date.now();

  const profileResult = await loadProfile(agentId);
  const profile = profileResult.appointmentProfile;
  const timezone = profile.defaults.timezone || profileResult.timezone || "America/New_York";
  const duration =
    durationMinutes || resolveDurationForPurpose(profile, purpose);
  const bufferBefore = profile.defaults.bufferBeforeMinutes || 0;
  const bufferAfter = profile.defaults.bufferAfterMinutes || 0;

  const startDate = resolveDateInput(date);
  const endDate = dateEnd ? resolveDateInput(dateEnd) : startDate;
  const startDateKey = toDateKey(startDate);
  const endDateKey = toDateKey(endDate);
  const multiDayRange = endDateKey !== startDateKey;
  const slotLimit = multiDayRange ? 0 : maxResults;

  const scheduling = organizationId
    ? await loadScheduling(organizationId)
    : { respectPersonalCalendar: true };

  const slots = [];
  let conflictExplanation = null;
  const excludedId = excludeAppointmentId ? String(excludeAppointmentId) : null;

  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const dateKey = toDateKey(cursor);
    const daySchedule = getDaySchedule(profile, cursor);

    if (!daySchedule.enabled || !daySchedule.blocks.length) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const dayStart = new Date(`${dateKey}T00:00:00`);
    const dayEnd = new Date(`${dateKey}T23:59:59`);

    const { items: dayAppointments } = await searchAppointments({
      organizationId,
      agentId,
      from: dayStart.toISOString(),
      to: dayEnd.toISOString(),
      status: ["scheduled", "confirmed", "pending_confirmation", "in_progress"]
    });

    const conflictingAppointments = (dayAppointments || []).filter(
      (appointment) => !excludedId || String(appointment.id) !== excludedId
    );
    const excludedAppointment = (dayAppointments || []).find(
      (appointment) => excludedId && String(appointment.id) === excludedId
    );
    const excludedWindow = excludedAppointment
      ? {
          start: new Date(excludedAppointment.startDateTime).getTime(),
          end: new Date(excludedAppointment.endDateTime).getTime()
        }
      : null;

    const busyRanges = buildBusyRanges(conflictingAppointments, bufferBefore, bufferAfter);

    if (scheduling.respectPersonalCalendar !== false && organizationId) {
      try {
        const googleBusy = await loadGoogleBusy(
          organizationId,
          dayStart.toISOString(),
          dayEnd.toISOString(),
          timezone,
          agentId
        );
        busyRanges.push(
          ...googleBusy.filter((range) => !isOwnBusyWindow(range, excludedWindow))
        );
      } catch {
        // Graceful fallback when calendar not connected
      }
    }

    for (const block of daySchedule.blocks) {
      const blockStart = parseTimeKey(block.start);
      const blockEnd = parseTimeKey(block.end);
      const candidateTimes = generateTimeKeys(
        blockStart,
        blockEnd - duration + SLOT_INTERVAL_MINUTES,
        SLOT_INTERVAL_MINUTES
      );

      for (const timeKey of candidateTimes) {
        if (slotLimit > 0 && slots.length >= slotLimit) {
          break;
        }

        const startMinutes = timeKeyToMinutes(timeKey);

        if (!matchesTimePreference(startMinutes, timePreference)) {
          continue;
        }

        // BR-079 — wall clock in profile timezone, never host TZ.
        const startTimeISO = buildIsoTimestamp(dateKey, timeKey, timezone);
        const slotStartMs = new Date(startTimeISO).getTime();
        const slotEndMs = slotStartMs + duration * 60 * 1000;

        if (slotStartMs < now) {
          continue;
        }

        if (isSlotBlocked(slotStartMs, slotEndMs, busyRanges)) {
          continue;
        }

        const endMinutes = startMinutes + duration;
        const endTimeKey = formatTimeKey(
          Math.floor(endMinutes / 60) % 24,
          endMinutes % 60
        );

        slots.push({
          dateKey,
          timeKey,
          endTimeKey,
          startTimeISO,
          endTimeISO: new Date(slotEndMs).toISOString(),
          durationMinutes: duration,
          timezone,
          availabilitySource: busyRanges.some((r) => r.source === "google_calendar")
            ? "agent_schedule_and_calendar"
            : "agent_schedule",
          preferred: matchesTimePreference(startMinutes, "morning")
            ? timePreference === "morning"
            : timePreference === "afternoon"
        });
      }

      if (slotLimit > 0 && slots.length >= slotLimit) {
        break;
      }
    }

    if (slotLimit > 0 && slots.length >= slotLimit) {
      break;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (!slots.length) {
    conflictExplanation =
      "No available slots in the requested range. Check working schedule, existing appointments, or calendar conflicts.";
  }

  return {
    agentId,
    organizationId,
    purpose,
    durationMinutes: duration,
    timePreference,
    timezone,
    slots,
    conflictExplanation
  };
}

module.exports = {
  getAvailableSlots,
  parseTimeKey,
  generateTimeKeys,
  getDaySchedule,
  matchesTimePreference,
  buildBusyRanges,
  isSlotBlocked,
  isOwnBusyWindow
};
