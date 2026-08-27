/**
 * BR-161 — Google availability adapter.
 * Wraps queryFreeBusy; does not change Google booking or fail-open behavior.
 */

const googleCalendarIntegrationService = require("../../services/googleCalendarIntegrationService");
const {
  PROVIDERS,
  normalizeBusyWindow,
  busyWindowToRange
} = require("./availabilityTypes");

async function isConnected(organizationId, userId) {
  if (!organizationId || !userId) {
    return false;
  }
  const status = await googleCalendarIntegrationService.getPersonalIntegrationStatus(
    organizationId,
    userId
  );
  return Boolean(status?.connected);
}

async function listBusyWindows({
  organizationId,
  userId,
  timeMin,
  timeMax,
  timezone = "America/New_York",
  queryFreeBusyFn = null
} = {}) {
  const query = queryFreeBusyFn || googleCalendarIntegrationService.queryFreeBusy;
  const busy = await query(organizationId, timeMin, timeMax, timezone, { userId });
  return (busy || [])
    .map((period) =>
      normalizeBusyWindow(
        {
          start: period.start,
          end: period.end,
          timezone,
          source: PROVIDERS.GOOGLE_CALENDAR,
          allDay: Boolean(period.allDay),
          calendarId: period.calendarId || null
        },
        timezone
      )
    )
    .filter(Boolean)
    .map(busyWindowToRange);
}

module.exports = {
  providerId: PROVIDERS.GOOGLE_CALENDAR,
  isConnected,
  listBusyWindows
};
