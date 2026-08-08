/**
 * Sprint 22 — Agent appointment profile (stored in atlas_users.profile_settings).
 */

const crypto = require("crypto");
const { findUserById } = require("./atlasUserService");
const { writeAuditLog } = require("../security/auditLogService");
const identityWriteService = require("./identityWriteService");
const {
  VIRTUAL_PROVIDERS,
  MEETING_LOCATION_TYPES,
  COMMON_SCHEDULE_PRESETS,
  APPOINTMENT_PURPOSES
} = require("../core/configuration/appointmentDomain");

const DEFAULT_WORKING_DAY = Object.freeze({
  dayOfWeek: 1,
  enabled: false,
  blocks: []
});

function buildDefaultWeekSchedule() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: COMMON_SCHEDULE_PRESETS.WEEKDAYS.includes(dayOfWeek),
    blocks:
      dayOfWeek >= 1 && dayOfWeek <= 5
        ? [{ start: "09:00", end: "17:00" }]
        : []
  }));
}

const DEFAULT_APPOINTMENT_PROFILE = Object.freeze({
  workingSchedule: buildDefaultWeekSchedule(),
  schedulePresetApplied: "weekdays",
  defaults: {
    defaultDurationMinutes: 30,
    recruitingInterviewDurationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
    timezone: "America/New_York",
    preferredLanguage: "es"
  },
  virtualMeeting: {
    preferredProvider: VIRTUAL_PROVIDERS.ZOOM,
    allowedAlternatives: [VIRTUAL_PROVIDERS.WHATSAPP_VIDEO]
  },
  inPersonMeeting: {
    allowedLocationTypes: [
      MEETING_LOCATION_TYPES.OFFICE,
      MEETING_LOCATION_TYPES.PUBLIC_LOCATION,
      MEETING_LOCATION_TYPES.PROSPECT_HOME,
      MEETING_LOCATION_TYPES.OTHER
    ]
  },
  office: {
    name: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    parkingNotes: "",
    mapsLink: ""
  },
  favoritePublicLocations: []
});

function normalizeTimeBlock(block = {}) {
  return {
    start: block.start || "09:00",
    end: block.end || "17:00"
  };
}

function normalizePublicLocation(location = {}) {
  return {
    id: location.id || crypto.randomUUID(),
    name: location.name || "",
    address: location.address || "",
    city: location.city || "",
    state: location.state || "",
    postalCode: location.postalCode || "",
    mapsLink: location.mapsLink || "",
    notes: location.notes || ""
  };
}

function normalizeWorkingDay(day = {}) {
  const dayOfWeek =
    typeof day.dayOfWeek === "number" ? day.dayOfWeek : DEFAULT_WORKING_DAY.dayOfWeek;

  const blocks = Array.isArray(day.blocks) ? day.blocks.map(normalizeTimeBlock) : [];

  return {
    dayOfWeek,
    enabled: Boolean(day.enabled),
    blocks: day.enabled && blocks.length === 0 ? [{ start: "09:00", end: "17:00" }] : blocks
  };
}

/**
 * BR-110 — true only when a persisted appointmentProfile with a 7-day
 * workingSchedule exists. Engine defaults applied during normalize must NOT
 * count as deliberately configured recruiter availability.
 */
function isAppointmentProfileConfigured(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  return Array.isArray(raw.workingSchedule) && raw.workingSchedule.length === 7;
}

function normalizeAppointmentProfile(raw = {}, userTimezone = "America/New_York") {
  const source = raw && typeof raw === "object" ? raw : {};

  const workingSchedule =
    Array.isArray(source.workingSchedule) && source.workingSchedule.length === 7
      ? source.workingSchedule.map(normalizeWorkingDay)
      : buildDefaultWeekSchedule();

  return {
    workingSchedule,
    schedulePresetApplied: source.schedulePresetApplied || "weekdays",
    defaults: {
      ...DEFAULT_APPOINTMENT_PROFILE.defaults,
      ...(source.defaults || {}),
      timezone: source.defaults?.timezone || userTimezone
    },
    virtualMeeting: {
      ...DEFAULT_APPOINTMENT_PROFILE.virtualMeeting,
      ...(source.virtualMeeting || {})
    },
    inPersonMeeting: {
      ...DEFAULT_APPOINTMENT_PROFILE.inPersonMeeting,
      ...(source.inPersonMeeting || {})
    },
    office: {
      ...DEFAULT_APPOINTMENT_PROFILE.office,
      ...(source.office || {})
    },
    favoritePublicLocations: Array.isArray(source.favoritePublicLocations)
      ? source.favoritePublicLocations.map(normalizePublicLocation)
      : []
  };
}

function applySchedulePreset(preset) {
  const days =
    preset === "every_day"
      ? COMMON_SCHEDULE_PRESETS.EVERY_DAY
      : preset === "weekends"
        ? COMMON_SCHEDULE_PRESETS.WEEKENDS
        : COMMON_SCHEDULE_PRESETS.WEEKDAYS;

  return buildDefaultWeekSchedule().map((day) => ({
    ...day,
    enabled: days.includes(day.dayOfWeek),
    blocks: days.includes(day.dayOfWeek) ? [{ start: "09:00", end: "17:00" }] : []
  }));
}

function resolveDurationForPurpose(profile, purpose) {
  const defaults = profile?.defaults || DEFAULT_APPOINTMENT_PROFILE.defaults;

  if (purpose === APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW) {
    return (
      defaults.recruitingInterviewDurationMinutes || defaults.defaultDurationMinutes || 30
    );
  }

  return defaults.defaultDurationMinutes || 30;
}

async function getAppointmentProfile(userId) {
  const user = await findUserById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const profileSettings = user.profile_settings || {};
  const rawProfile = profileSettings.appointmentProfile;
  const profileConfigured = isAppointmentProfileConfigured(rawProfile);
  const appointmentProfile = normalizeAppointmentProfile(
    rawProfile,
    user.timezone || "America/New_York"
  );

  return {
    userId: user.id,
    organizationId: user.organization_id,
    timezone: user.timezone || appointmentProfile.defaults.timezone,
    language: user.preferred_language || appointmentProfile.defaults.preferredLanguage,
    appointmentProfile,
    // BR-110 — distinguish persisted schedule vs engine default fallback.
    profileConfigured
  };
}

async function updateAppointmentProfile(userId, input = {}, auditMeta = {}) {
  const user = await findUserById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const existing = normalizeAppointmentProfile(
    user.profile_settings?.appointmentProfile,
    user.timezone || "America/New_York"
  );

  let workingSchedule = existing.workingSchedule;

  if (input.schedulePreset) {
    workingSchedule = applySchedulePreset(input.schedulePreset);
  } else if (input.workingSchedule) {
    workingSchedule = input.workingSchedule.map(normalizeWorkingDay);
  }

  const appointmentProfile = normalizeAppointmentProfile(
    {
      ...existing,
      workingSchedule,
      schedulePresetApplied: input.schedulePreset || existing.schedulePresetApplied,
      defaults: input.defaults ? { ...existing.defaults, ...input.defaults } : existing.defaults,
      virtualMeeting: input.virtualMeeting
        ? { ...existing.virtualMeeting, ...input.virtualMeeting }
        : existing.virtualMeeting,
      inPersonMeeting: input.inPersonMeeting
        ? { ...existing.inPersonMeeting, ...input.inPersonMeeting }
        : existing.inPersonMeeting,
      office: input.office ? { ...existing.office, ...input.office } : existing.office,
      favoritePublicLocations:
        input.favoritePublicLocations !== undefined
          ? input.favoritePublicLocations
          : existing.favoritePublicLocations
    },
    user.timezone || "America/New_York"
  );

  const profileSettings = {
    ...(user.profile_settings || {}),
    appointmentProfile
  };

  const patch = {
    profile_settings: profileSettings,
    updated_at: new Date().toISOString()
  };

  if (input.defaults?.timezone) {
    patch.timezone = input.defaults.timezone;
  }

  if (input.defaults?.preferredLanguage) {
    patch.preferred_language = input.defaults.preferredLanguage;
  }

  const data = await identityWriteService.updateProfile(userId, patch);

  await writeAuditLog({
    organizationId: data.organization_id,
    userId,
    userEmail: data.email,
    action: "configuration.appointment_profile_updated",
    targetType: "atlas_user",
    targetId: userId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return getAppointmentProfile(userId);
}

module.exports = {
  DEFAULT_APPOINTMENT_PROFILE,
  buildDefaultWeekSchedule,
  applySchedulePreset,
  normalizeAppointmentProfile,
  isAppointmentProfileConfigured,
  resolveDurationForPurpose,
  getAppointmentProfile,
  updateAppointmentProfile
};
