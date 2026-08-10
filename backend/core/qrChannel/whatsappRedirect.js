/**
 * Allowlisted WhatsApp deep-link builder for QR Channel Phase 1.
 * Never accepts arbitrary redirect targets from query params.
 * Never silently falls back to a hardcoded production number.
 */

const {
  NATURAL_WHATSAPP_PREFILL,
  WHATSAPP_E164_HARD_ALLOWLIST,
  REASON_CODES
} = require("./constants");

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function isWellFormedWhatsAppE164(digits) {
  return /^\d{10,15}$/.test(digits) && !digits.startsWith("0");
}

/**
 * Build the explicit allowlist:
 * - hard-coded approved Team Vision production digit(s)
 * - optional extra digits from QR_CHANNEL_WHATSAPP_ALLOWLIST (comma-separated)
 */
function buildWhatsAppE164Allowlist(env = process.env) {
  const allow = new Set(WHATSAPP_E164_HARD_ALLOWLIST);
  const extra = String(env.QR_CHANNEL_WHATSAPP_ALLOWLIST || "")
    .split(",")
    .map((p) => digitsOnly(p))
    .filter(Boolean);
  for (const d of extra) {
    if (isWellFormedWhatsAppE164(d)) {
      allow.add(d);
    }
  }
  return allow;
}

/**
 * Resolve destination from campaign override or env — never from allowlist alone.
 *
 * Priority:
 *   1. campaign.whatsapp_e164 when present
 *   2. QR_CHANNEL_WHATSAPP_E164
 *
 * Missing / malformed / not-allowlisted → fail closed.
 */
function resolveAllowlistedWhatsAppE164({
  campaignWhatsAppE164 = null,
  env = process.env
} = {}) {
  const allowlist = buildWhatsAppE164Allowlist(env);
  const campaignDigits = digitsOnly(campaignWhatsAppE164 || "");
  const envDigits = digitsOnly(env.QR_CHANNEL_WHATSAPP_E164 || "");
  const rawConfigured = campaignWhatsAppE164 || env.QR_CHANNEL_WHATSAPP_E164;
  const preferred = campaignDigits || envDigits;

  if (!String(rawConfigured || "").trim()) {
    return {
      ok: false,
      reasonCode: REASON_CODES.DESTINATION_CONFIG_MISSING,
      e164: null,
      allowlist
    };
  }

  if (!preferred || !isWellFormedWhatsAppE164(preferred)) {
    return {
      ok: false,
      reasonCode: REASON_CODES.DESTINATION_CONFIG_MALFORMED,
      e164: null,
      allowlist
    };
  }

  if (!allowlist.has(preferred)) {
    return {
      ok: false,
      reasonCode: REASON_CODES.DESTINATION_NOT_ALLOWLISTED,
      e164: null,
      allowlist
    };
  }

  return {
    ok: true,
    reasonCode: REASON_CODES.OK,
    e164: preferred,
    allowlist
  };
}

function buildWhatsAppRedirectUrl({
  campaignWhatsAppE164 = null,
  env = process.env,
  prefill = NATURAL_WHATSAPP_PREFILL
} = {}) {
  const resolved = resolveAllowlistedWhatsAppE164({ campaignWhatsAppE164, env });
  if (!resolved.ok) {
    return {
      ok: false,
      reasonCode: resolved.reasonCode,
      e164: null,
      url: null
    };
  }

  const text = String(prefill ?? NATURAL_WHATSAPP_PREFILL);
  if (text !== NATURAL_WHATSAPP_PREFILL) {
    return {
      ok: false,
      reasonCode: REASON_CODES.REDIRECT_NOT_ALLOWLISTED,
      e164: null,
      url: null
    };
  }

  const url = `https://wa.me/${resolved.e164}?text=${encodeURIComponent(text)}`;
  return {
    ok: true,
    reasonCode: REASON_CODES.OK,
    e164: resolved.e164,
    url,
    prefill: text
  };
}

module.exports = {
  digitsOnly,
  isWellFormedWhatsAppE164,
  buildWhatsAppE164Allowlist,
  resolveAllowlistedWhatsAppE164,
  buildWhatsAppRedirectUrl,
  NATURAL_WHATSAPP_PREFILL
};
