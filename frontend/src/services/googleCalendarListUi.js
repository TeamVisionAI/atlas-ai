/**
 * Google Calendar list UI helpers — keep Settings/Integrations usable when
 * calendar enumeration fails, and avoid repeated failing upstream calls.
 */

export function shouldFetchGoogleCalendarList(googleCalendar) {
  if (!googleCalendar?.connected) {
    return false;
  }

  if (googleCalendar.reconnectRequired) {
    return false;
  }

  return true;
}

export function resolveGoogleCalendarListUiFailure(calendarError, googleCalendar = {}) {
  const reconnectRequired = Boolean(
    calendarError?.reconnectRequired || googleCalendar?.reconnectRequired
  );

  return {
    calendars: [],
    reconnectRequired,
    pageBlocked: false,
    keepIntegrationsVisible: true
  };
}
