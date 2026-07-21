/**
 * Journey #7 — Meta webhook orchestrator.
 * Verify signature → detect platform → validate → forward to Communication Gateway.
 */

const crypto = require("crypto");
const { ConnectorEvent } = require("../shared/ConnectorEvents");
const { createConnectorResult } = require("../shared/ConnectorResult");
const { logConnectorOperation } = require("../shared/connectorLogger");

const PLATFORM_MAP = Object.freeze({
  page: "messenger",
  instagram: "instagram",
  whatsapp_business_account: "whatsapp"
});

function detectPlatform(body) {
  return PLATFORM_MAP[body?.object] || null;
}

function verifySignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    return { verified: false, skipped: true };
  }

  if (!signatureHeader) {
    throw new Error("Missing x-hub-signature-256 header");
  }

  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new Error("Invalid Meta webhook signature");
  }

  return { verified: true, skipped: false };
}

class MetaWebhookConnector {
  /**
   * @param {Object} deps
   * @param {import('../shared/ConnectorRegistry').ConnectorRegistry} deps.connectorRegistry
   * @param {import('../../gateway/CommunicationGateway').CommunicationGateway} deps.gateway
   * @param {import('../../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor({ connectorRegistry, gateway, eventBus = null }) {
    this.connectorRegistry = connectorRegistry;
    this.gateway = gateway;
    this.eventBus = eventBus;
  }

  /**
   * @param {Object} params
   * @param {Buffer|string} params.rawBody
   * @param {string|null} [params.signatureHeader]
   * @param {Object} [params.routingContext]
   * @returns {Promise<Object>}
   */
  async handle({ rawBody, signatureHeader = null, routingContext = {} }) {
    const correlationId = routingContext.correlationId || crypto.randomUUID();
    const startedAt = Date.now();

    try {
      verifySignature(rawBody, signatureHeader);

      const body = JSON.parse(
        Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "{}")
      );
      const platform = detectPlatform(body);

      if (!platform) {
        throw new Error(`Unsupported Meta webhook object: ${body?.object || "unknown"}`);
      }

      const connector = this.connectorRegistry.get(platform);
      connector.validate(body);
      connector.receive(body);

      const gatewayResult = await this.gateway.receive(platform, body, {
        ...routingContext,
        correlationId
      });

      logConnectorOperation({
        correlationId,
        connector: "meta-webhook",
        operation: "handle",
        latencyMs: Date.now() - startedAt,
        status: "forwarded",
        detail: platform
      });

      return createConnectorResult({
        success: true,
        correlationId,
        connector: "meta-webhook",
        operation: "handle",
        data: {
          platform,
          acknowledgment: "EVENT_RECEIVED",
          gatewayResult
        },
        latencyMs: Date.now() - startedAt
      });
    } catch (error) {
      this.eventBus?.emit(ConnectorEvent.FAILED, {
        connector: "meta-webhook",
        correlationId,
        error: error.message
      });

      logConnectorOperation({
        correlationId,
        connector: "meta-webhook",
        operation: "handle",
        latencyMs: Date.now() - startedAt,
        status: "failed",
        detail: error.message
      });

      return createConnectorResult({
        success: false,
        correlationId,
        connector: "meta-webhook",
        operation: "handle",
        error: error.message,
        latencyMs: Date.now() - startedAt
      });
    }
  }
}

module.exports = {
  MetaWebhookConnector,
  detectPlatform,
  verifySignature
};
