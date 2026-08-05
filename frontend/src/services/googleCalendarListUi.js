/**
 * Google Calendar list UI helpers — keep Settings/Integrations usable when
 * calendar enumeration fails, and avoid repeated failing upstream calls.
 *
 * Meta Review workspace must never pull Google calendar data or surface Google
 * reconnect controls unless already explicitly allowed by that workspace.
 */

export function shouldFetchGoogleCalendarList(googleCalendar, options = {}) {
  if (options.metaReviewWorkspaceActive) {
    return false;
  }

  if (!googleCalendar?.connected) {
    return false;
  }

  if (googleCalendar.reconnectRequired) {
    return false;
  }

  return true;
}

export function resolveGoogleCalendarListUiFailure(
  calendarError,
  googleCalendar = {},
  options = {}
) {
  if (options.metaReviewWorkspaceActive) {
    return {
      calendars: [],
      reconnectRequired: false,
      pageBlocked: false,
      keepIntegrationsVisible: true,
      suppressGoogleError: true
    };
  }

  const reconnectRequired = Boolean(
    calendarError?.reconnectRequired || googleCalendar?.reconnectRequired
  );

  return {
    calendars: [],
    reconnectRequired,
    pageBlocked: false,
    keepIntegrationsVisible: true,
    suppressGoogleError: false
  };
}
