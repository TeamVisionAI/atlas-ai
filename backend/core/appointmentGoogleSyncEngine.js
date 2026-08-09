/**
 * BR-039 / BR-050 — Google Calendar sync for persisted appointments.
 * Create when no event id exists; update when present; never silently skip
 * after reconnect leaves a missing/stale event id.
 */

const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const {
  isMissingGoogleEventError,
  isAlreadyAbsentGoogleEventError
} = require("./googleCalendarAbsence");

const SYNC_STATUSES = Object.freeze({
  SYNCED: "synced",
  RETRY_REQUIRED: "retry_required",
  SKIPPED_NOT_CONNECTED: "skipped_not_connected",
  SKIPPED_MOCK: "skipped_mock"
});

function buildCalendarEventPayload(appointment, overrides = {}) {
  return {
    summary:
      overrides.summary ||
      `interview — ${appointment.metadata?.prospectName || appointment.prospectPhone || "Prospect"}`,
    description: overrides.description || appointment.meetingNotes || "",
    startTimeISO: overrides.startTimeISO || appointment.startDateTime,
    endTimeISO: overrides.endTimeISO || appointment.endDateTime,
    timezone: overrides.timezone || appointment.timezone || "America/New_York",
    location: overrides.location || appointment.meetingAddress || appointment.virtualMeetingUrl || null,
    attendeeEmail: overrides.attendeeEmail || appointment.metadata?.prospectEmail || null,
    zoomUrl: overrides.zoomUrl || appointment.virtualMeetingUrl || null
  };
}

/**
 * Sync appointment → Google Calendar.
 * @returns {{
 *   calendarEventId: string|null,
 *   calendarProvider: string|null,
 *   calendarSyncStatus: string,
 *   calendarSyncError: string|null,
 *   action: 'updated'|'created'|'skipped'|'failed',
 *   createdDuplicatePrevented: boolean
 * }}
 */
async function syncAppointmentGoogleCalendar(appointment, options = {}) {
  const organizationId = options.organizationId || appointment.organizationId;
  const deps = options.deps || {};
  const getStatus = deps.getIntegrationStatus || googleCalendarIntegrationService.getIntegrationStatus;
  const updateEvent = deps.updateCalendarEvent || googleCalendarIntegrationService.updateCalendarEvent;
  const createEvent = deps.createCalendarEvent || googleCalendarIntegrationService.createCalendarEvent;
  const payload = buildCalendarEventPayload(appointment, options.eventOverrides || {});

  const status = await getStatus(organizationId);

  if (!status?.connected || status.reconnectRequired) {
    return {
      calendarEventId: appointment.calendarEventId || null,
      calendarProvider: appointment.calendarProvider || null,
      calendarSyncStatus: SYNC_STATUSES.SKIPPED_NOT_CONNECTED,
      calendarSyncError: status?.reconnectRequired
        ? "GOOGLE_RECONNECT_REQUIRED"
        : "GOOGLE_NOT_CONNECTED",
      action: "skipped",
      createdDuplicatePrevented: false
    };
  }

  let eventId = appointment.calendarEventId || null;
  let action = "skipped";
  let createdDuplicatePrevented = false;

  if (eventId) {
    try {
      const updated = await updateEvent(organizationId, eventId, payload);
      action = "updated";
      eventId = updated?.id || eventId;
      return {
        calendarEventId: eventId,
        calendarProvider: "google_calendar",
        calendarSyncStatus: SYNC_STATUSES.SYNCED,
        calendarSyncError: null,
        action,
        createdDuplicatePrevented: true
      };
    } catch (error) {
      if (!isMissingGoogleEventError(error)) {
        return {
          calendarEventId: eventId,
          calendarProvider: appointment.calendarProvider || "google_calendar",
          calendarSyncStatus: SYNC_STATUSES.RETRY_REQUIRED,
          calendarSyncError: String(error.message || "GOOGLE_UPDATE_FAILED").slice(0, 200),
          action: "failed",
          createdDuplicatePrevented: false
        };
      }
      // Stale/missing event after reconnect — fall through to create once.
      eventId = null;
    }
  }

  try {
    const created = await createEvent(organizationId, payload);

    if (!created?.id) {
      return {
        calendarEventId: null,
        calendarProvider: null,
        calendarSyncStatus: SYNC_STATUSES.RETRY_REQUIRED,
        calendarSyncError: "GOOGLE_CREATE_RETURNED_NULL",
        action: "failed",
        createdDuplicatePrevented: false
      };
    }

    return {
      calendarEventId: created.id,
      calendarProvider: "google_calendar",
      calendarSyncStatus: created.simulated ? SYNC_STATUSES.SKIPPED_MOCK : SYNC_STATUSES.SYNCED,
      calendarSyncError: null,
      action: "created",
      createdDuplicatePrevented
    };
  } catch (error) {
    return {
      calendarEventId: appointment.calendarEventId || null,
      calendarProvider: appointment.calendarProvider || null,
      calendarSyncStatus: SYNC_STATUSES.RETRY_REQUIRED,
      calendarSyncError: String(error.message || "GOOGLE_CREATE_FAILED").slice(0, 200),
      action: "failed",
      createdDuplicatePrevented: false
    };
  }
}

module.exports = {
  SYNC_STATUSES,
  isMissingGoogleEventError,
  isAlreadyAbsentGoogleEventError,
  buildCalendarEventPayload,
  syncAppointmentGoogleCalendar
};
