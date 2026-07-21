/**
 * Journey #6 — Unified Communication Gateway event constants.
 */

const GatewayEvent = Object.freeze({
  MESSAGE_RECEIVED: "gateway.message.received",
  MESSAGE_NORMALIZED: "gateway.message.normalized",
  MESSAGE_PROCESSED: "gateway.message.processed",
  MESSAGE_SENT: "gateway.message.sent",
  CHANNEL_CONNECTED: "gateway.channel.connected",
  CHANNEL_ERROR: "gateway.channel.error"
});

module.exports = {
  GatewayEvent
};
