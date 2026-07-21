/**
 * Journey #7 — Production Zoom meeting connector.
 */

const { BaseConnector } = require("../shared/BaseConnector");
const { HEALTH_STATUS, createHealthResult } = require("../shared/ConnectorHealth");
const { executeWithRetry } = require("../shared/RetryPolicy");
const { ConnectorEvent } = require("../shared/ConnectorEvents");
const { logConnectorOperation } = require("../shared/connectorLogger");
const { ZoomOAuthConnector, isZoomConfigured } = require("./ZoomOAuthConnector");

const CONNECTOR_ID = "zoom";

class ZoomConnector extends BaseConnector {
  constructor(config = {}) {
    super({ ...config, connectorId: CONNECTOR_ID });
    this.oauth = config.oauthConnector || new ZoomOAuthConnector();
  }

  validate(payload) {
    if (!payload?.operation) {
      throw new Error("Zoom connector requires operation");
    }

    return true;
  }

  receive() {
    throw new Error("Zoom connector does not receive inbound messages");
  }

  async send(outbound) {
    this.validate(outbound);

    const { shouldMockExternalComms } = require("../../dev/simulatorGuard");
    const correlationId = outbound.correlationId || null;
    const startedAt = Date.now();
    const operation = outbound.operation;

    if (shouldMockExternalComms()) {
      if (operation === "createMeeting") {
        const mockId = `sim-zoom-${Date.now()}`;
        return {
          meetingId: mockId,
          joinUrl: `https://zoom.us/j/${mockId}`,
          hostUrl: `https://zoom.us/s/${mockId}?zak=mock`,
          password: "000000",
          meetingProvider: "zoom",
          status: "created",
          simulated: true
        };
      }

      if (operation === "readMeeting") {
        return {
          meetingId: outbound.meetingId,
          status: "read",
          simulated: true
        };
      }
    }

    if (!isZoomConfigured()) {
      return {
        meetingId: null,
        joinUrl: null,
        hostUrl: null,
        password: null,
        meetingProvider: "zoom",
        status: "failed",
        reason: "ZOOM_NOT_CONFIGURED"
      };
    }

    const accessToken = await this.oauth.fetchAccessToken();

    if (operation === "createMeeting") {
      const meeting = outbound.meeting;
      const start = new Date(meeting.startTime);

      const { result, retries } = await executeWithRetry(
        async () => {
          const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              topic: `Atlas Interview — ${meeting.prospectName}`,
              type: 2,
              start_time: start.toISOString(),
              duration: 30,
              timezone: meeting.timeZone || "America/New_York",
              settings: {
                join_before_host: true,
                waiting_room: true
              }
            })
          });

          if (!response.ok) {
            const error = new Error(`Zoom meeting create failed: ${response.status}`);
            error.status = response.status;
            throw error;
          }

          return response.json();
        },
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
        meetingId: String(result.id),
        joinUrl: result.join_url || null,
        hostUrl: result.start_url || null,
        password: result.password || null,
        meetingProvider: "zoom",
        status: "created"
      };
    }

    if (operation === "readMeeting") {
      const { result, retries } = await executeWithRetry(
        async () => {
          const response = await fetch(
            `https://api.zoom.us/v2/meetings/${outbound.meetingId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );

          if (!response.ok) {
            const error = new Error(`Zoom meeting read failed: ${response.status}`);
            error.status = response.status;
            throw error;
          }

          return response.json();
        },
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
        meetingId: String(result.id),
        joinUrl: result.join_url || null,
        hostUrl: result.start_url || null,
        password: result.password || null,
        meetingProvider: "zoom",
        status: "read"
      };
    }

    throw new Error(`Unsupported Zoom operation: ${operation}`);
  }

  async health() {
    if (!isZoomConfigured()) {
      return createHealthResult(HEALTH_STATUS.DISCONNECTED, {
        connector: CONNECTOR_ID,
        detail: "Zoom credentials not configured"
      });
    }

    try {
      await this.oauth.fetchAccessToken();

      return createHealthResult(HEALTH_STATUS.CONNECTED, {
        connector: CONNECTOR_ID,
        detail: "Zoom Server-to-Server OAuth ready"
      });
    } catch (error) {
      const status = error.status;

      if (status === 401 || status === 403) {
        return createHealthResult(HEALTH_STATUS.AUTHENTICATION_ERROR, {
          connector: CONNECTOR_ID,
          detail: "Invalid Zoom OAuth credentials"
        });
      }

      if (status === 429) {
        return createHealthResult(HEALTH_STATUS.RATE_LIMITED, {
          connector: CONNECTOR_ID,
          detail: "Zoom API rate limited"
        });
      }

      return createHealthResult(HEALTH_STATUS.UNAVAILABLE, {
        connector: CONNECTOR_ID,
        detail: error.message
      });
    }
  }
}

module.exports = {
  ZoomConnector,
  CONNECTOR_ID
};
