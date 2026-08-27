/**
 * BR-076 — Canonical virtual meeting URL selection for Zoom appointments.
 * Snapshots approved URLs onto appointments; never fabricates meetings.
 */

const { MEETING_TYPES, VIRTUAL_PROVIDERS } = require("./configuration/appointmentDomain");

const VIRTUAL_MEETING_URL_SOURCES = Object.freeze({
  PERSISTED_APPOINTMENT: "persisted_appointment",
  EXISTING_BOOKING: "existing_booking",
  USER_MEETING_SETTINGS: "user_meeting_settings",
  ORGANIZATION_MEETING_SETTINGS: "organization_meeting_settings",
  UNAVAILABLE: "unavailable"
});

const VIRTUAL_URL_STATUSES = Object.freeze({
  CONFIGURED: "configured",
  PENDING: "pending",
  WHATSAPP_SCHEDULED: "whatsapp_scheduled",
  PHONE_SCHEDULED: "phone_scheduled",
  NOT_APPLICABLE: "not_applicable"
});

/**
 * Approved HTTPS Zoom join URLs only (no credentials logged by callers).
 * @param {unknown} value
 * @returns {boolean}
 */
function isApprovedHttpsZoomUrl(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  try {
    const parsed = new URL(value.trim());

    if (parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    return (
      host === "zoom.us" ||
      host.endsWith(".zoom.us") ||
      host === "zoom.gov" ||
      host.endsWith(".zoom.gov")
    );
  } catch {
    return false;
  }
}

function pickApprovedZoomUrl(...candidates) {
  for (const candidate of candidates) {
    if (isApprovedHttpsZoomUrl(candidate)) {
      return String(candidate).trim();
    }
  }

  return null;
}

function normalizeMeetingType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeProvider(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isVirtualMeeting(meetingType) {
  return normalizeMeetingType(meetingType) === MEETING_TYPES.VIRTUAL;
}

function isZoomProvider(meetingProvider, meetingType) {
  const provider = normalizeProvider(meetingProvider);

  if (provider === VIRTUAL_PROVIDERS.ZOOM || provider === "zoom") {
    return true;
  }

  // Virtual appointments default to Zoom when provider omitted/legacy.
  return isVirtualMeeting(meetingType) && !provider;
}

function extractBookingUrl(existingBooking = null) {
  if (!existingBooking || typeof existingBooking !== "object") {
    return null;
  }

  return pickApprovedZoomUrl(
    existingBooking.meetingUrl,
    existingBooking.zoomLink,
    existingBooking.zoomUrl,
    existingBooking.meetLink
  );
}

function extractPersistedUrl(appointment = null) {
  if (!appointment || typeof appointment !== "object") {
    return null;
  }

  return pickApprovedZoomUrl(
    appointment.virtualMeetingUrl,
    appointment.virtual_meeting_url
  );
}

function buildResult({ url = null, status, source, provider = null } = {}) {
  return {
    url: url || null,
    status,
    source,
    provider: provider || null
  };
}

/**
 * Resolve the Zoom/virtual meeting URL with canonical precedence (BR-076 + BR-147).
 *
 * Precedence for Zoom (BR-076 + BR-147 + BR-162):
 * 1. valid persisted appointment URL (same appointment snapshot)
 * 2. assigned interviewer personal Zoom URL
 * 3. existingBooking URL only when no interviewer is assigned
 * 4. organization Personal Meeting URL only when no interviewer is assigned (legacy)
 * 5. null + pending — never another interviewer's Zoom, never Support/admin identity
 *
 * @param {object} input
 * @param {string} [input.organizationId]
 * @param {string} [input.interviewerUserId]
 * @param {string} [input.meetingType]
 * @param {string} [input.meetingProvider]
 * @param {object|null} [input.persistedAppointment]
 * @param {object|null} [input.existingBooking]
 * @param {boolean} [input.allowTenantZoomFallback]
 * @param {object} [deps]
 */
async function resolveCanonicalVirtualMeetingUrl(input = {}, deps = {}) {
  const meetingType = normalizeMeetingType(input.meetingType);
  const meetingProvider = normalizeProvider(input.meetingProvider);
  const organizationId = input.organizationId || null;
  const interviewerUserId = String(
    input.interviewerUserId || input.interviewer_user_id || ""
  ).trim() || null;
  const allowTenantZoomFallback =
    input.allowTenantZoomFallback === true || !interviewerUserId;

  if (!isVirtualMeeting(meetingType)) {
    return buildResult({
      url: null,
      status: VIRTUAL_URL_STATUSES.NOT_APPLICABLE,
      source: VIRTUAL_MEETING_URL_SOURCES.UNAVAILABLE,
      provider: meetingProvider || null
    });
  }

  if (meetingProvider === VIRTUAL_PROVIDERS.WHATSAPP_VIDEO) {
    return buildResult({
      url: null,
      status: VIRTUAL_URL_STATUSES.WHATSAPP_SCHEDULED,
      source: VIRTUAL_MEETING_URL_SOURCES.UNAVAILABLE,
      provider: meetingProvider
    });
  }

  if (meetingProvider === VIRTUAL_PROVIDERS.PHONE_CALL) {
    return buildResult({
      url: null,
      status: VIRTUAL_URL_STATUSES.PHONE_SCHEDULED,
      source: VIRTUAL_MEETING_URL_SOURCES.UNAVAILABLE,
      provider: meetingProvider
    });
  }

  if (!isZoomProvider(meetingProvider, meetingType)) {
    return buildResult({
      url: null,
      status: VIRTUAL_URL_STATUSES.PENDING,
      source: VIRTUAL_MEETING_URL_SOURCES.UNAVAILABLE,
      provider: meetingProvider || VIRTUAL_PROVIDERS.OTHER
    });
  }

  const persistedUrl = extractPersistedUrl(input.persistedAppointment);

  if (persistedUrl) {
    return buildResult({
      url: persistedUrl,
      status: VIRTUAL_URL_STATUSES.CONFIGURED,
      source: VIRTUAL_MEETING_URL_SOURCES.PERSISTED_APPOINTMENT,
      provider: VIRTUAL_PROVIDERS.ZOOM
    });
  }

  if (!interviewerUserId) {
    const bookingUrl = extractBookingUrl(input.existingBooking);

    if (bookingUrl) {
      return buildResult({
        url: bookingUrl,
        status: VIRTUAL_URL_STATUSES.CONFIGURED,
        source: VIRTUAL_MEETING_URL_SOURCES.EXISTING_BOOKING,
        provider: VIRTUAL_PROVIDERS.ZOOM
      });
    }
  }

  if (interviewerUserId) {
    const getAppointmentProfile =
      deps.getAppointmentProfile ||
      require("../services/appointmentProfileService").getAppointmentProfile;

    try {
      const profileResult = await getAppointmentProfile(interviewerUserId);
      const userUrl = pickApprovedZoomUrl(
        profileResult?.appointmentProfile?.virtualMeeting?.personalMeetingUrl
      );
      if (userUrl) {
        return buildResult({
          url: userUrl,
          status: VIRTUAL_URL_STATUSES.CONFIGURED,
          source: VIRTUAL_MEETING_URL_SOURCES.USER_MEETING_SETTINGS,
          provider: VIRTUAL_PROVIDERS.ZOOM
        });
      }
    } catch {
      // Assigned interviewer with no readable personal Zoom fails closed.
    }

    if (!allowTenantZoomFallback) {
      return buildResult({
        url: null,
        status: VIRTUAL_URL_STATUSES.PENDING,
        source: VIRTUAL_MEETING_URL_SOURCES.UNAVAILABLE,
        provider: VIRTUAL_PROVIDERS.ZOOM
      });
    }
  }

  if (organizationId && allowTenantZoomFallback) {
    const getMeetingManagement =
      deps.getMeetingManagement ||
      require("../services/meetingManagementService").getMeetingManagement;

    const meetingManagement = await getMeetingManagement(organizationId);
    const orgUrl = pickApprovedZoomUrl(meetingManagement?.personalMeetingUrl);

    if (orgUrl) {
      return buildResult({
        url: orgUrl,
        status: VIRTUAL_URL_STATUSES.CONFIGURED,
        source: VIRTUAL_MEETING_URL_SOURCES.ORGANIZATION_MEETING_SETTINGS,
        provider: VIRTUAL_PROVIDERS.ZOOM
      });
    }
  }

  return buildResult({
    url: null,
    status: VIRTUAL_URL_STATUSES.PENDING,
    source: VIRTUAL_MEETING_URL_SOURCES.UNAVAILABLE,
    provider: VIRTUAL_PROVIDERS.ZOOM
  });
}

/**
 * Safe diagnostics — never includes the meeting URL.
 */
function buildVirtualMeetingUrlDiagnostics(resolution = {}) {
  return {
    status: resolution.status || null,
    source: resolution.source || null,
    provider: resolution.provider || null,
    hasUrl: Boolean(resolution.url)
  };
}

module.exports = {
  VIRTUAL_MEETING_URL_SOURCES,
  VIRTUAL_URL_STATUSES,
  isApprovedHttpsZoomUrl,
  pickApprovedZoomUrl,
  isVirtualMeeting,
  isZoomProvider,
  resolveCanonicalVirtualMeetingUrl,
  buildVirtualMeetingUrlDiagnostics
};
