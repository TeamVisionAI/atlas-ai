/**
 * Sprint 11.1 — Live WhatsApp lead source constants.
 */

const WHATSAPP_ENTRY_METHOD = Object.freeze({
  CLICK_TO_WHATSAPP: "CLICK_TO_WHATSAPP",
  QR: "QR",
  FACEBOOK_LEAD_ADS: "FACEBOOK_LEAD_ADS",
  UNATTRIBUTED: "UNATTRIBUTED"
});

const WHATSAPP_SOURCE = Object.freeze({
  FACEBOOK: "FACEBOOK",
  CAR_MAGNET: "car_magnet",
  UNKNOWN: "UNKNOWN"
});

const WHATSAPP_CORRELATION_PREFIX = Object.freeze({
  INBOUND: "whatsapp:inbound:",
  OUTBOUND: "whatsapp:outbound:",
  HUMAN_ECHO: "whatsapp:human_echo:"
});

const REOPENED_INACTIVITY_MS = 72 * 60 * 60 * 1000;

module.exports = {
  WHATSAPP_ENTRY_METHOD,
  WHATSAPP_SOURCE,
  WHATSAPP_CORRELATION_PREFIX,
  REOPENED_INACTIVITY_MS
};
