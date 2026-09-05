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
const { PROVIDERS } = require("../core/availability/availabilityTypes");
const {
  isAvailabilityAuthError,
  isAvailabilityUnavailableError
} = require("../core/availability/availabilityTypes");
const { isIcloudAvailabilityEnabled } = require("../core/availability/icloudAvailabilityFlag");
const icloudAvailabilityProvider = require("../core/availability/icloudAvailabilityProvider");
const googleAvailabilityProvider = require("../core/availability/googleAvailabilityProvider");
const {
  ASSIGNMENT_MODES,
  appointmentBelongsToInterviewer,
  mergePooledSlots,
  resolveAssignmentMode
} = require("../core/interviewerPoolEngine");
const {
  resolveMinimumBookingLeadMinutes,
  isSlotBookableByLeadTime
} = require("../core/schedulingLeadTime");

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

function googleFailureCode(error) {
  return String(error?.publicCode || error?.code || "").trim();
}

function isPrimaryGoogleCalendarFailure(error) {
  const code = googleFailureCode(error);
  return code === "GOOGLE_RECONNECT_REQUIRED" || code === "GOOGLE_UNAVAILABLE";
}

function logIcloudOverlaySkipped({ organizationId, userId, code }) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: "appointment_scheduling_engine",
      stage: "icloud_overlay_skipped",
      organizationId: organizationId || null,
      userId: userId || null,
      code: code || null
    })
  );
}

async function fetchGoogleBusyRanges(organizationId, timeMin, timeMax, timezone, userId = null) {
  // BR-147 / BR-161 — Google adapter wraps queryFreeBusy; behavior unchanged.
  return googleAvailabilityProvider.listBusyWindows({
    organizationId,
    userId,
    timeMin,
    timeMax,
    timezone,
    queryFreeBusyFn: googleCalendarIntegrationService.queryFreeBusy
  });
}

async function fetchIcloudBusyRanges(organizationId, timeMin, timeMax, timezone, userId = null) {
  // Implements BR-161 — personal iCloud busy overlay only when flagged + connected.
  if (!userId || !isIcloudAvailabilityEnabled({ organizationId, userId })) {
    return [];
  }

  return icloudAvailabilityProvider.listBusyWindows({
    organizationId,
    userId,
    timeMin,
    timeMax,
    timezone
  });
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
 * @param {string} [params.interviewerUserId] - explicit interviewer (BR-162)
 * @param {string} [params.assignmentMode] - auto | explicit
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
  interviewerUserId = null,
  assignmentMode = null,
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
  const loadIcloudBusy =
    dependencies.queryIcloudBusyFn || fetchIcloudBusyRanges;
  const now = Number.isFinite(dependencies.nowMs) ? dependencies.nowMs : Date.now();

  const profileResult = await loadProfile(agentId);
  const profile = profileResult.appointmentProfile;
  const timezone = profile.defaults.timezone || profileResult.timezone || "America/New_York";
  const duration =
    durationMinutes || resolveDurationForPurpose(profile, purpose);
  const bufferBefore = profile.defaults.bufferBeforeMinutes || 0;
  const bufferAfter = profile.defaults.bufferAfterMinutes || 0;
  // Implements BR-185 — automated offers require minimum notice from timezone-aware now.
  const leadMinutes = resolveMinimumBookingLeadMinutes(
    dependencies.minimumBookingLeadMinutes ?? profile.defaults?.minimumBookingLeadMinutes
  );

  const startDate = resolveDateInput(date);
  const endDate = dateEnd ? resolveDateInput(dateEnd) : startDate;
  const startDateKey = toDateKey(startDate);
  const endDateKey = toDateKey(endDate);
  const multiDayRange = endDateKey !== startDateKey;
  const slotLimit = multiDayRange ? 0 : maxResults;

  const scheduling = organizationId
    ? await loadScheduling(organizationId)
    : { respectPersonalCalendar: true, interviewerPool: { enabled: false, members: [] } };

  const pool = scheduling.interviewerPool || { enabled: false, members: [] };
  const mode = resolveAssignmentMode({
    assignmentMode,
    poolEnabled: pool.enabled
  });
  const explicitInterviewerId = String(interviewerUserId || "").trim() || null;

  if (mode === ASSIGNMENT_MODES.AUTO && pool.enabled) {
    const memberSlotLists = [];

    for (const member of pool.members) {
      const single = await getAvailableSlots({
        agentId: member.userId,
        interviewerUserId: member.userId,
        assignmentMode: ASSIGNMENT_MODES.EXPLICIT,
        organizationId,
        date,
        dateEnd,
        purpose,
        durationMinutes,
        timePreference,
        maxResults,
        excludeAppointmentId,
        dependencies: {
          ...dependencies,
          getSchedulingSettingsFn: async () => ({
            ...scheduling,
            interviewerPool: { enabled: false, members: [] }
          })
        }
      });

      memberSlotLists.push({
        member,
        slots: single.slots || []
      });
    }

    const pooledSlots = mergePooledSlots(memberSlotLists);
    return {
      agentId,
      organizationId,
      purpose,
      durationMinutes: durationMinutes || pooledSlots[0]?.durationMinutes || null,
      timePreference,
      timezone: pooledSlots[0]?.timezone || "America/New_York",
      assignmentMode: ASSIGNMENT_MODES.AUTO,
      slots: pooledSlots,
      conflictExplanation: pooledSlots.length
        ? null
        : "No available slots in the requested range. Check working schedule, existing appointments, or calendar conflicts."
    };
  }

  if (explicitInterviewerId) {
    agentId = explicitInterviewerId;
  }

  const slots = [];
  let conflictExplanation = null;
  let icloudOverlaySkippedReason = null;
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
      from: dayStart.toISOString(),
      to: dayEnd.toISOString(),
      status: ["scheduled", "confirmed", "pending_confirmation", "in_progress"]
    });

    const conflictingAppointments = (dayAppointments || []).filter((appointment) => {
      if (excludedId && String(appointment.id) === excludedId) {
        return false;
      }

      return appointmentBelongsToInterviewer(appointment, agentId);
    });
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
      } catch (googleError) {
        // Authoritative Google calendar auth/unavailable must not invent slots.
        if (isPrimaryGoogleCalendarFailure(googleError)) {
          return {
            agentId,
            organizationId,
            purpose,
            durationMinutes: duration,
            timePreference,
            timezone,
            slots: [],
            conflictExplanation:
              "Google Calendar is unavailable. Slots are not offered until it can be read.",
            availabilityBlockedReason:
              googleFailureCode(googleError) || "GOOGLE_UNAVAILABLE"
          };
        }
        // Google overlay remains fail-open (unchanged).
      }

      try {
        const icloudBusy = await loadIcloudBusy(
          organizationId,
          dayStart.toISOString(),
          dayEnd.toISOString(),
          timezone,
          agentId
        );
        busyRanges.push(
          ...(icloudBusy || []).filter((range) => !isOwnBusyWindow(range, excludedWindow))
        );
      } catch (icloudError) {
        // Implements BR-161 — optional iCloud overlay degrades; Google stays primary.
        if (
          isAvailabilityAuthError(icloudError) ||
          isAvailabilityUnavailableError(icloudError)
        ) {
          const overlayCode =
            icloudError.code || icloudError.publicCode || "ICLOUD_UNAVAILABLE";
          logIcloudOverlaySkipped({
            organizationId,
            userId: agentId,
            code: overlayCode
          });
          icloudOverlaySkippedReason = overlayCode;
        } else {
          throw icloudError;
        }
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

        if (!isSlotBookableByLeadTime(slotStartMs, now, leadMinutes)) {
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
          assignedInterviewerUserId: agentId || null,
          assignmentMode: ASSIGNMENT_MODES.EXPLICIT,
          availabilitySource: busyRanges.some(
            (r) =>
              r.source === PROVIDERS.GOOGLE_CALENDAR ||
              r.source === PROVIDERS.ICLOUD_CALENDAR ||
              String(r.source || "").includes(PROVIDERS.GOOGLE_CALENDAR) ||
              String(r.source || "").includes(PROVIDERS.ICLOUD_CALENDAR)
          )
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
    conflictExplanation,
    icloudOverlaySkippedReason
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
  isOwnBusyWindow,
  isPrimaryGoogleCalendarFailure
};
