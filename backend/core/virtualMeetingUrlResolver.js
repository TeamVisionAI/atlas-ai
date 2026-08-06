/**
 * BR-076 — Canonical virtual meeting URL selection for Zoom appointments.
 * Snapshots approved URLs onto appointments; never fabricates meetings.
 */

const { MEETING_TYPES, VIRTUAL_PROVIDERS } = require("./configuration/appointmentDomain");

const VIRTUAL_MEETING_URL_SOURCES = Object.freeze({
  PERSISTED_APPOINTMENT: "persisted_appointment",
  EXISTING_BOOKING: "existing_booking",
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
 * Resolve the Zoom/virtual meeting URL with canonical precedence (BR-076).
 *
 * Precedence for Zoom:
 * 1. valid persisted appointment URL (reschedule/update)
 * 2. valid URL from existingBooking
 * 3. valid same-organization Personal Meeting URL
 * 4. null + pending
 *
 * @param {object} input
 * @param {string} [input.organizationId]
 * @param {string} [input.meetingType]
 * @param {string} [input.meetingProvider]
 * @param {object|null} [input.persistedAppointment]
 * @param {object|null} [input.existingBooking]
 * @param {object} [deps]
 */
async function resolveCanonicalVirtualMeetingUrl(input = {}, deps = {}) {
  const meetingType = normalizeMeetingType(input.meetingType);
  const meetingProvider = normalizeProvider(input.meetingProvider);
  const organizationId = input.organizationId || null;

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

  const bookingUrl = extractBookingUrl(input.existingBooking);

  if (bookingUrl) {
    return buildResult({
      url: bookingUrl,
      status: VIRTUAL_URL_STATUSES.CONFIGURED,
      source: VIRTUAL_MEETING_URL_SOURCES.EXISTING_BOOKING,
      provider: VIRTUAL_PROVIDERS.ZOOM
    });
  }

  if (organizationId) {
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
