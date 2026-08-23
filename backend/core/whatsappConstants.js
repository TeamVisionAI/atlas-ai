/**
 * Sprint 11.1 — Live WhatsApp lead source constants.
 */

const WHATSAPP_ENTRY_METHOD = Object.freeze({
  CLICK_TO_WHATSAPP: "CLICK_TO_WHATSAPP",
  QR: "QR",
  FACEBOOK_LEAD_ADS: "FACEBOOK_LEAD_ADS",
  CAMPAIGN_INTAKE_CODE: "CAMPAIGN_INTAKE_CODE",
  UNATTRIBUTED: "UNATTRIBUTED"
});

const WHATSAPP_SOURCE = Object.freeze({
  FACEBOOK: "FACEBOOK",
  CAR_MAGNET: "car_magnet",
  CAMPAIGN_INTAKE: "CAMPAIGN_INTAKE",
  UNKNOWN: "UNKNOWN"
});

const WHATSAPP_CORRELATION_PREFIX = Object.freeze({
  INBOUND: "whatsapp:inbound:",
  OUTBOUND: "whatsapp:outbound:",
  HUMAN_ECHO: "whatsapp:human_echo:"
});

const REOPENED_INACTIVITY_MS = 72 * 60 * 60 * 1000;

/** Canonical conversation_logs intent for native WhatsApp Business app echoes (smb_message_echoes). */
const HUMAN_WHATSAPP_BUSINESS_APP_REPLY_INTENT =
  "HUMAN_WHATSAPP_BUSINESS_APP_REPLY";

module.exports = {
  WHATSAPP_ENTRY_METHOD,
  WHATSAPP_SOURCE,
  WHATSAPP_CORRELATION_PREFIX,
  REOPENED_INACTIVITY_MS,
  HUMAN_WHATSAPP_BUSINESS_APP_REPLY_INTENT
};
