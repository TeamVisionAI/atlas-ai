/**
 * Journey #7 — Production WhatsApp Cloud API connector.
 */

const axios = require("axios");
const { BaseConnector } = require("../shared/BaseConnector");
const { HEALTH_STATUS, createHealthResult } = require("../shared/ConnectorHealth");
const { executeWithRetry } = require("../shared/RetryPolicy");
const { ConnectorEvent } = require("../shared/ConnectorEvents");
const { logConnectorOperation } = require("../shared/connectorLogger");
const { parseWhatsAppWebhookBody } = require("../../services/whatsappWebhookParser");
const { resolveWhatsAppSendCredentials } = require("../../core/whatsappSendCredentials");

const CONNECTOR_ID = "whatsapp";

class WhatsAppConnector extends BaseConnector {
  constructor(config = {}) {
    super({ ...config, connectorId: CONNECTOR_ID });
  }

  validate(payload) {
    const body = payload || {};

    if (body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) {
      throw new Error("Invalid WhatsApp webhook payload");
    }

    return true;
  }

  receive(payload) {
    this.validate(payload);
    const messages = parseWhatsAppWebhookBody(payload);

    for (const message of messages) {
      this.eventBus?.emit(ConnectorEvent.MESSAGE_RECEIVED, {
        connector: CONNECTOR_ID,
        channel: CONNECTOR_ID,
        messageId: message.providerMessageId,
        senderId: message.phone
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
        providerMessageId: `sim.whatsapp.${Date.now()}`,
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

    const credentials = await resolveWhatsAppSendCredentials();

    if (!credentials?.accessToken || !credentials?.phoneNumberId) {
      throw new Error("WhatsApp send credentials not configured");
    }

    const recipientId = String(outbound.recipientId || "").replace(/\D/g, "");

    if (!recipientId || !outbound.text) {
      throw new Error("WhatsApp send requires recipientId and text");
    }

    const url = `https://graph.facebook.com/${credentials.graphApiVersion}/${credentials.phoneNumberId}/messages`;

    const { result, retries } = await executeWithRetry(
      async () => {
        const response = await axios.post(
          url,
          {
            messaging_product: "whatsapp",
            to: recipientId,
            type: "text",
            text: { body: outbound.text }
          },
          {
            headers: {
              Authorization: `Bearer ${credentials.accessToken}`,
              "Content-Type": "application/json"
            },
            timeout: 15000
          }
        );

        return {
          success: true,
          providerMessageId: response.data?.messages?.[0]?.id || null,
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
    const credentials = await resolveWhatsAppSendCredentials();

    if (!credentials?.accessToken || !credentials?.phoneNumberId) {
      return createHealthResult(HEALTH_STATUS.DISCONNECTED, {
        connector: CONNECTOR_ID,
        detail: "WhatsApp credentials not configured"
      });
    }

    try {
      const url = `https://graph.facebook.com/${credentials.graphApiVersion}/${credentials.phoneNumberId}`;
      await axios.get(url, {
        params: { access_token: credentials.accessToken },
        timeout: 10000
      });

      return createHealthResult(HEALTH_STATUS.CONNECTED, {
        connector: CONNECTOR_ID,
        detail: `WhatsApp connected (${credentials.source})`
      });
    } catch (error) {
      const status = error.response?.status;

      if (status === 401 || status === 403) {
        return createHealthResult(HEALTH_STATUS.AUTHENTICATION_ERROR, {
          connector: CONNECTOR_ID,
          detail: "Invalid WhatsApp access token"
        });
      }

      if (status === 429) {
        return createHealthResult(HEALTH_STATUS.RATE_LIMITED, {
          connector: CONNECTOR_ID,
          detail: "WhatsApp API rate limited"
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
  WhatsAppConnector,
  CONNECTOR_ID
};
