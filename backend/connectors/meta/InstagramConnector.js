/**
 * Journey #7 — Production Instagram Direct Messages connector.
 */

const axios = require("axios");
const { BaseConnector } = require("../shared/BaseConnector");
const { HEALTH_STATUS, createHealthResult } = require("../shared/ConnectorHealth");
const { executeWithRetry } = require("../shared/RetryPolicy");
const { ConnectorEvent } = require("../shared/ConnectorEvents");
const { logConnectorOperation } = require("../shared/connectorLogger");

const CONNECTOR_ID = "instagram";

function instagramTimestampToIso(timestamp) {
  const numeric = Number(timestamp);
  const millis = Number.isNaN(numeric) ? Date.now() : numeric < 1e12 ? numeric * 1000 : numeric;
  return new Date(millis).toISOString();
}

class InstagramConnector extends BaseConnector {
  constructor(config = {}) {
    super({ ...config, connectorId: CONNECTOR_ID });
    this.pageAccessToken =
      config.pageAccessToken || process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || process.env.MESSENGER_PAGE_ACCESS_TOKEN || "";
  }

  validate(payload) {
    const body = payload || {};

    if (body.object !== "instagram" || !Array.isArray(body.entry)) {
      throw new Error("Invalid Instagram webhook payload");
    }

    return true;
  }

  receive(payload) {
    this.validate(payload);
    const messages = [];

    for (const entry of payload.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message?.text) {
          continue;
        }

        messages.push({
          messageId: event.message.mid || null,
          senderId: event.sender?.id || "",
          recipientId: event.recipient?.id || "",
          timestamp: instagramTimestampToIso(event.timestamp),
          text: event.message.text,
          attachments: [],
          mediaPlaceholder: Boolean(event.message.attachments?.length)
        });

        this.eventBus?.emit(ConnectorEvent.MESSAGE_RECEIVED, {
          connector: CONNECTOR_ID,
          channel: CONNECTOR_ID,
          messageId: event.message.mid,
          senderId: event.sender?.id
        });
      }
    }

    if (messages.length === 0) {
      throw new Error("Instagram payload contained no text messages");
    }

    return messages;
  }

  async send(outbound) {
    const { shouldMockExternalComms } = require("../../dev/simulatorGuard");
    const correlationId = outbound.correlationId || null;
    const startedAt = Date.now();

    if (shouldMockExternalComms()) {
      const result = {
        success: true,
        providerMessageId: `sim.instagram.${Date.now()}`,
        simulated: true
      };

      this.eventBus?.emit(ConnectorEvent.MESSAGE_SENT, {
        connector: CONNECTOR_ID,
        correlationId,
        simulated: true
      });

      logConnectorOperation({
        correlationId,
        connector: CONNECTOR_ID,
        operation: "send",
        latencyMs: Date.now() - startedAt,
        status: "simulated"
      });

      return result;
    }

    const recipientId = outbound.recipientId;
    const graphVersion = process.env.META_GRAPH_API_VERSION || "v21.0";

    if (!recipientId || !this.pageAccessToken) {
      throw new Error("Instagram send requires recipientId and page access token");
    }

    const { result, retries } = await executeWithRetry(
      async () => {
        const response = await axios.post(
          `https://graph.facebook.com/${graphVersion}/me/messages`,
          {
            recipient: { id: recipientId },
            message: { text: outbound.text || "" }
          },
          {
            params: { access_token: this.pageAccessToken },
            timeout: 15000
          }
        );

        return {
          success: true,
          providerMessageId: response.data?.message_id || null,
          deliveryStatus: "sent"
        };
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

    this.eventBus?.emit(ConnectorEvent.MESSAGE_SENT, {
      connector: CONNECTOR_ID,
      correlationId,
      providerMessageId: result.providerMessageId
    });

    logConnectorOperation({
      correlationId,
      connector: CONNECTOR_ID,
      operation: "send",
      latencyMs: Date.now() - startedAt,
      retries,
      status: "sent"
    });

    return { ...result, retries };
  }

  async health() {
    if (!this.pageAccessToken) {
      return createHealthResult(HEALTH_STATUS.DISCONNECTED, {
        connector: CONNECTOR_ID,
        detail: "INSTAGRAM_PAGE_ACCESS_TOKEN not configured"
      });
    }

    try {
      const graphVersion = process.env.META_GRAPH_API_VERSION || "v21.0";
      const response = await axios.get(`https://graph.facebook.com/${graphVersion}/me`, {
        params: { access_token: this.pageAccessToken, fields: "id,name" },
        timeout: 10000
      });

      return createHealthResult(HEALTH_STATUS.CONNECTED, {
        connector: CONNECTOR_ID,
        detail: response.data?.name || response.data?.id || "connected"
      });
    } catch (error) {
      const status = error.response?.status;

      if (status === 401 || status === 403) {
        return createHealthResult(HEALTH_STATUS.AUTHENTICATION_ERROR, {
          connector: CONNECTOR_ID,
          detail: "Invalid Instagram access token"
        });
      }

      if (status === 429) {
        return createHealthResult(HEALTH_STATUS.RATE_LIMITED, {
          connector: CONNECTOR_ID,
          detail: "Instagram API rate limited"
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
  InstagramConnector,
  CONNECTOR_ID
};
