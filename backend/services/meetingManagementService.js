/**
 * Workspace meeting management (MVP) — saved URLs and addresses for scheduling.
 * Stored in organization_settings.settings.meetingManagement.
 */

const { supabase } = require("./supabaseService");
const { getOfficeLocation } = require("../core/businessRulesEngine");

const MEETING_PREFERENCES = Object.freeze({
  INCLUDE_LINK_IN_WHATSAPP: "include_link_in_whatsapp",
  INCLUDE_LINK_IN_CALENDAR: "include_link_in_calendar",
  INCLUDE_OFFICE_IN_CALENDAR: "include_office_in_calendar"
});

const DEFAULT_MEETING_PREFERENCES = Object.freeze([
  MEETING_PREFERENCES.INCLUDE_LINK_IN_WHATSAPP,
  MEETING_PREFERENCES.INCLUDE_LINK_IN_CALENDAR,
  MEETING_PREFERENCES.INCLUDE_OFFICE_IN_CALENDAR
]);

const DEFAULT_MEETING_MANAGEMENT = Object.freeze({
  personalMeetingUrl: null,
  officeAddress: null,
  meetingPreferences: [...DEFAULT_MEETING_PREFERENCES]
});

function normalizeUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeAddress(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeMeetingPreferences(raw) {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_MEETING_PREFERENCES];
  }

  const allowed = new Set(Object.values(MEETING_PREFERENCES));
  const normalized = raw.filter((item) => allowed.has(item));

  return normalized.length > 0 ? normalized : [...DEFAULT_MEETING_PREFERENCES];
}

function normalizeMeetingManagement(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    personalMeetingUrl: normalizeUrl(source.personalMeetingUrl),
    officeAddress: normalizeAddress(source.officeAddress),
    meetingPreferences: normalizeMeetingPreferences(source.meetingPreferences),
    updatedAt: source.updatedAt || null
  };
}

async function fetchSettingsRow(organizationId) {
  const { data, error } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.settings || {};
}

function defaultOfficeAddress() {
  const office = getOfficeLocation();
  return office.fullAddress || null;
}

async function getMeetingManagement(organizationId) {
  const settings = await fetchSettingsRow(organizationId);
  const meetingManagement = normalizeMeetingManagement(settings.meetingManagement);

  return {
    ...meetingManagement,
    configured: Boolean(meetingManagement.personalMeetingUrl || meetingManagement.officeAddress),
    effectiveOfficeAddress: meetingManagement.officeAddress || defaultOfficeAddress()
  };
}

async function updateMeetingManagement(organizationId, input = {}) {
  const currentSettings = await fetchSettingsRow(organizationId);
  const current = normalizeMeetingManagement(currentSettings.meetingManagement);

  const next = normalizeMeetingManagement({
    personalMeetingUrl:
      input.personalMeetingUrl !== undefined
        ? input.personalMeetingUrl
        : current.personalMeetingUrl,
    officeAddress:
      input.officeAddress !== undefined ? input.officeAddress : current.officeAddress,
    meetingPreferences:
      input.meetingPreferences !== undefined
        ? input.meetingPreferences
        : current.meetingPreferences,
    updatedAt: new Date().toISOString()
  });

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: organizationId,
      settings: {
        ...currentSettings,
        meetingManagement: next
      },
      updated_at: new Date().toISOString()
    },
    { onConflict: "organization_id" }
  );

  if (error) {
    throw error;
  }

  return getMeetingManagement(organizationId);
}

function hasPreference(meetingManagement, preference) {
  return (meetingManagement?.meetingPreferences || []).includes(preference);
}

async function resolveVirtualMeetingUrl(organizationId) {
  const meetingManagement = await getMeetingManagement(organizationId);
  const url = meetingManagement.personalMeetingUrl;

  if (!url) {
    return {
      url: null,
      configured: false,
      message: "Personal meeting URL is not configured under Organization settings."
    };
  }

  return {
    url,
    configured: true,
    message: null
  };
}

async function resolveOfficeAddress(organizationId) {
  const meetingManagement = await getMeetingManagement(organizationId);
  return meetingManagement.effectiveOfficeAddress;
}

async function resolveJoinUrlForProspect(organizationId, prospectPhone) {
  const appointmentRepository = require("../repositories/appointmentRepository");
  const { coerceAppointmentItems } = require("../core/appointmentCollection");

  try {
    const searchResult = await appointmentRepository.search({
      organizationId,
      prospectPhone,
      status: "scheduled"
    });

    const appointments = coerceAppointmentItems(searchResult);

    const upcoming = appointments
      .filter((item) => item.virtualMeetingUrl)
      .sort((left, right) => new Date(left.startDateTime) - new Date(right.startDateTime))[0];

    if (upcoming?.virtualMeetingUrl) {
      return upcoming.virtualMeetingUrl;
    }
  } catch (error) {
    console.error(
      "[meetingManagement] resolveJoinUrlForProspect appointment lookup failed:",
      error.message
    );
  }

  const virtual = await resolveVirtualMeetingUrl(organizationId);
  return virtual.url;
}

async function resolveInterviewLocation(organizationId, interviewType, options = {}) {
  const normalized = String(interviewType || "").trim().toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("virtual")) {
    const virtual = await resolveVirtualMeetingUrl(organizationId);
    return {
      location: virtual.url,
      meetingUrl: virtual.url,
      configured: virtual.configured,
      errorCode: virtual.configured ? null : "MEETING_URL_NOT_CONFIGURED"
    };
  }

  if (normalized.includes("public")) {
    const publicLocation =
      options.publicLocation ||
      options.officeLocation ||
      "Public Location (details to follow)";

    return {
      location: publicLocation,
      meetingUrl: null,
      configured: true,
      errorCode: null
    };
  }

  const officeAddress =
    options.officeLocation ||
    (await resolveOfficeAddress(organizationId));

  if (!officeAddress) {
    return {
      location: null,
      meetingUrl: null,
      configured: false,
      errorCode: "OFFICE_ADDRESS_NOT_CONFIGURED"
    };
  }

  return {
    location: officeAddress,
    meetingUrl: null,
    configured: true,
    errorCode: null
  };
}

module.exports = {
  MEETING_PREFERENCES,
  DEFAULT_MEETING_PREFERENCES,
  getMeetingManagement,
  updateMeetingManagement,
  resolveVirtualMeetingUrl,
  resolveOfficeAddress,
  resolveJoinUrlForProspect,
  resolveInterviewLocation,
  hasPreference,
  normalizeMeetingManagement
};
