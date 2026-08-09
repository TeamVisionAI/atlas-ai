/**
 * QR Channel Phase 1 constants (BR-128 / BR-129).
 * Car Magnet V1 first controlled campaign — Team Vision + primary RVP.
 */

const TEAM_VISION_ORG_ID = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP_USER_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";

const CAR_MAGNET_V1 = Object.freeze({
  campaignKey: "car_recruiting_01",
  name: "Car Recruiting 01",
  source: "car_magnet",
  campaignType: "car_magnet",
  defaultConversationGoal: "interview",
  orgId: TEAM_VISION_ORG_ID,
  ownerUserId: PRIMARY_RVP_USER_ID
});

const HANDOFF_MODE = Object.freeze({
  PHONE_BIND: "phone_bind",
  MICRO_CODE: "micro_code"
});

const SCAN_STATUS = Object.freeze({
  PENDING_PHONE: "pending_phone",
  PENDING_INBOUND: "pending_inbound",
  CONSUMED: "consumed",
  EXPIRED: "expired",
  SUPERSEDED: "superseded",
  AMBIGUOUS_CONFLICT: "ambiguous_conflict",
  THROTTLED: "throttled"
});

const CAMPAIGN_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive"
});

const OPEN_SCAN_STATUSES = Object.freeze([
  SCAN_STATUS.PENDING_PHONE,
  SCAN_STATUS.PENDING_INBOUND
]);

/** Approved target: 10–15 minutes. Use 15 minutes. */
const SCAN_TTL_MS = 15 * 60 * 1000;

const NATURAL_WHATSAPP_PREFILL =
  "Hola, quiero conocer más sobre la oportunidad.";

/** Digits-only allowlist; env may override via QR_CHANNEL_WHATSAPP_E164. */
const DEFAULT_WHATSAPP_E164 = "17867528080";

const REASON_CODES = Object.freeze({
  OK: "OK",
  TOKEN_INVALID: "TOKEN_INVALID",
  CAMPAIGN_INACTIVE: "CAMPAIGN_INACTIVE",
  CAMPAIGN_NOT_FOUND: "CAMPAIGN_NOT_FOUND",
  OWNER_MISSING: "OWNER_MISSING",
  SCAN_NOT_FOUND: "SCAN_NOT_FOUND",
  SCAN_EXPIRED: "SCAN_EXPIRED",
  SCAN_WRONG_STATUS: "SCAN_WRONG_STATUS",
  BIND_MAC_INVALID: "BIND_MAC_INVALID",
  PHONE_INVALID: "PHONE_INVALID",
  ORG_MISMATCH: "ORG_MISMATCH",
  REDIRECT_NOT_ALLOWLISTED: "REDIRECT_NOT_ALLOWLISTED",
  RATE_LIMITED: "RATE_LIMITED"
});

module.exports = {
  TEAM_VISION_ORG_ID,
  PRIMARY_RVP_USER_ID,
  CAR_MAGNET_V1,
  HANDOFF_MODE,
  SCAN_STATUS,
  CAMPAIGN_STATUS,
  OPEN_SCAN_STATUSES,
  SCAN_TTL_MS,
  NATURAL_WHATSAPP_PREFILL,
  DEFAULT_WHATSAPP_E164,
  REASON_CODES
};
