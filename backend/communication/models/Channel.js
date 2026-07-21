/**
 * Sprint 12.0 — Canonical communication channel identifiers.
 */

const CHANNEL = Object.freeze({
  MESSENGER: "messenger",
  INSTAGRAM: "instagram",
  ATLAS_CHAT: "atlas-chat",
  WHATSAPP: "whatsapp",
  SMS: "sms",
  EMAIL: "email"
});

const MVP_CHANNELS = Object.freeze([CHANNEL.MESSENGER, CHANNEL.INSTAGRAM]);

const FUTURE_CHANNELS = Object.freeze([
  CHANNEL.ATLAS_CHAT,
  CHANNEL.WHATSAPP,
  CHANNEL.SMS,
  CHANNEL.EMAIL
]);

/**
 * @param {string} channelId
 * @returns {boolean}
 */
function isKnownChannel(channelId) {
  return Object.values(CHANNEL).includes(channelId);
}

module.exports = {
  CHANNEL,
  MVP_CHANNELS,
  FUTURE_CHANNELS,
  isKnownChannel
};
