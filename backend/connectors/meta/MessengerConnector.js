/**
 * Journey #7 — Production Facebook Messenger connector.
 */

const axios = require("axios");
const { BaseConnector } = require("../shared/BaseConnector");
const { HEALTH_STATUS, createHealthResult } = require("../shared/ConnectorHealth");
const { executeWithRetry } = require("../shared/RetryPolicy");
const { ConnectorEvent } = require("../shared/ConnectorEvents");
const { logConnectorOperation } = require("../shared/connectorLogger");
const { parseMessengerWebhook } = require("../../communication/connectors/messenger/messengerWebhookParser");
const {
  sendTextMessage,
  verifyPageToken
} = require("../../communication/connectors/messenger/messengerGraphClient");

const CONNECTOR_ID = "messenger";

class MessengerConnector extends BaseConnector {
  constructor(config = {}) {
    super({ ...config, connectorId: CONNECTOR_ID });
    this.pageAccessToken =
      config.pageAccessToken || process.env.MESSENGER_PAGE_ACCESS_TOKEN || "";
  }

  validate(payload) {
    const body = payload || {};

    if (body.object !== "page" || !Array.isArray(body.entry)) {
      throw new Error("Invalid Messenger webhook payload");
    }

    return true;
  }

  receive(payload) {
    this.validate(payload);
    const messages = parseMessengerWebhook(payload);

    for (const message of messages) {
      this.eventBus?.emit(ConnectorEvent.MESSAGE_RECEIVED, {
        connector: CONNECTOR_ID,
        channel: CONNECTOR_ID,
        messageId: message.id,
        senderId: message.senderId
      });
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
        providerMessageId: `sim.messenger.${Date.now()}`,
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

    if (!recipientId) {
      throw new Error("Messenger send requires recipientId");
    }

    const { result, retries } = await executeWithRetry(
      () =>
        sendTextMessage({
          recipientId,
          text: outbound.text || "",
          pageAccessToken: this.pageAccessToken
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
        detail: "MESSENGER_PAGE_ACCESS_TOKEN not configured"
      });
    }

    try {
      const check = await verifyPageToken(this.pageAccessToken);

      return createHealthResult(check.healthy ? HEALTH_STATUS.CONNECTED : HEALTH_STATUS.DEGRADED, {
        connector: CONNECTOR_ID,
        detail: check.detail
      });
    } catch (error) {
      const status = error.response?.status;

      if (status === 401 || status === 403) {
        return createHealthResult(HEALTH_STATUS.AUTHENTICATION_ERROR, {
          connector: CONNECTOR_ID,
          detail: "Invalid Messenger page access token"
        });
      }

      if (status === 429) {
        return createHealthResult(HEALTH_STATUS.RATE_LIMITED, {
          connector: CONNECTOR_ID,
          detail: "Messenger API rate limited"
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
  MessengerConnector,
  CONNECTOR_ID
};
