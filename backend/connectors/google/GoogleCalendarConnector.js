/**
 * Journey #7 — Production Google Calendar connector.
 * Uses existing CalendarService data shapes; no business logic.
 */

const { google } = require("googleapis");
const { BaseConnector } = require("../shared/BaseConnector");
const { HEALTH_STATUS, createHealthResult } = require("../shared/ConnectorHealth");
const { executeWithRetry } = require("../shared/RetryPolicy");
const { ConnectorEvent } = require("../shared/ConnectorEvents");
const { logConnectorOperation } = require("../shared/connectorLogger");
const { GoogleOAuthConnector } = require("./GoogleOAuthConnector");

const CONNECTOR_ID = "google-calendar";

function buildEventDescription(meeting) {
  const lines = [
    `Prospect: ${meeting.prospectName}`,
    `Meeting Type: ${meeting.meetingType}`
  ];

  if (meeting.locationName) {
    lines.push(`Location: ${meeting.locationName}`);
  }

  if (meeting.address) {
    lines.push(`Address: ${meeting.address}`);
  }

  return lines.join("\n");
}

class GoogleCalendarConnector extends BaseConnector {
  constructor(config = {}) {
    super({ ...config, connectorId: CONNECTOR_ID });
    this.oauth = config.oauthConnector || new GoogleOAuthConnector();
  }

  validate(payload) {
    if (!payload?.operation) {
      throw new Error("Google Calendar connector requires operation");
    }

    return true;
  }

  receive() {
    throw new Error("Google Calendar connector does not receive inbound messages");
  }

  async send(outbound) {
    this.validate(outbound);

    const { shouldMockExternalComms } = require("../../dev/simulatorGuard");
    const correlationId = outbound.correlationId || null;
    const startedAt = Date.now();
    const operation = outbound.operation;

    if (shouldMockExternalComms()) {
      if (operation === "createEvent") {
        const mockId = `sim-cal-${Date.now()}`;
        return {
          calendarEventId: mockId,
          calendarProvider: "google",
          calendarLink: `https://calendar.google.com/calendar/event?eid=${mockId}`,
          status: "created",
          simulated: true
        };
      }

      if (operation === "readEvent") {
        return {
          calendarEventId: outbound.eventId,
          status: "read",
          simulated: true
        };
      }
    }

    const authClient = await this.oauth.getAuthorizedClient(outbound.organizationId);

    if (!authClient) {
      return {
        calendarEventId: null,
        calendarProvider: "google",
        calendarLink: null,
        status: "failed",
        reason: "CALENDAR_NOT_CONFIGURED"
      };
    }

    const calendar = google.calendar({ version: "v3", auth: authClient });

    if (operation === "createEvent") {
      const meeting = outbound.meeting;
      const start = new Date(meeting.startTime);
      const end = new Date(meeting.endTime || start.getTime() + 30 * 60 * 1000);
      const location = [meeting.locationName, meeting.address].filter(Boolean).join(" · ");

      const event = {
        summary: `Atlas Meeting — ${meeting.prospectName}`,
        description: buildEventDescription(meeting),
        start: {
          dateTime: start.toISOString(),
          timeZone: meeting.timeZone || "America/New_York"
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: meeting.timeZone || "America/New_York"
        }
      };

      if (location) {
        event.location = location;
      }

      const { result, retries } = await executeWithRetry(
        () =>
          calendar.events.insert({
            calendarId: "primary",
            requestBody: event
          }),
        {
          onRetry: ({ retries, error }) => {
            this.eventBus?.emit(ConnectorEvent.RETRY, {
              connector: CONNECTOR_ID,
              correlationId,
              retries,
              error: error.message
            });
          }
        }
      );

      logConnectorOperation({
        correlationId,
        connector: CONNECTOR_ID,
        operation,
        latencyMs: Date.now() - startedAt,
        retries,
        status: "created"
      });

      return {
        calendarEventId: result.data.id,
        calendarProvider: "google",
        calendarLink: result.data.htmlLink || null,
        status: "created"
      };
    }

    if (operation === "readEvent") {
      const { result, retries } = await executeWithRetry(
        () =>
          calendar.events.get({
            calendarId: "primary",
            eventId: outbound.eventId
          }),
        {
          onRetry: ({ retries, error }) => {
            this.eventBus?.emit(ConnectorEvent.RETRY, {
              connector: CONNECTOR_ID,
              correlationId,
              retries,
              error: error.message
            });
          }
        }
      );

      logConnectorOperation({
        correlationId,
        connector: CONNECTOR_ID,
        operation,
        latencyMs: Date.now() - startedAt,
        retries,
        status: "read"
      });

      return {
        calendarEventId: result.data.id,
        calendarLink: result.data.htmlLink || null,
        status: "read"
      };
    }

    if (operation === "updateEvent" || operation === "deleteEvent") {
      throw new Error(`${operation} is not yet implemented`);
    }

    throw new Error(`Unsupported Google Calendar operation: ${operation}`);
  }

  async health() {
    if (!this.oauth.isConfigured()) {
      return createHealthResult(HEALTH_STATUS.DISCONNECTED, {
        connector: CONNECTOR_ID,
        detail: "Google OAuth not configured"
      });
    }

    const refreshToken = await this.oauth.resolveRefreshToken(null);

    if (!refreshToken) {
      return createHealthResult(HEALTH_STATUS.DEGRADED, {
        connector: CONNECTOR_ID,
        detail: "Google OAuth configured but no refresh token available"
      });
    }

    return createHealthResult(HEALTH_STATUS.CONNECTED, {
      connector: CONNECTOR_ID,
      detail: "Google Calendar connector ready"
    });
  }
}

module.exports = {
  GoogleCalendarConnector,
  CONNECTOR_ID
};
