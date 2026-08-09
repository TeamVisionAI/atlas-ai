/**
 * Allowlisted WhatsApp deep-link builder for QR Channel Phase 1.
 * Never accepts arbitrary redirect targets from query params.
 */

const {
  NATURAL_WHATSAPP_PREFILL,
  DEFAULT_WHATSAPP_E164,
  REASON_CODES
} = require("./constants");

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function resolveAllowlistedWhatsAppE164({
  campaignWhatsAppE164 = null,
  env = process.env
} = {}) {
  const fromEnv = digitsOnly(env.QR_CHANNEL_WHATSAPP_E164 || "");
  const fromCampaign = digitsOnly(campaignWhatsAppE164 || "");
  const fallback = digitsOnly(DEFAULT_WHATSAPP_E164);

  const allowlist = new Set(
    [fromEnv, fromCampaign, fallback].filter((d) => d && d.length >= 10 && d.length <= 15)
  );

  // Prefer campaign override when present and allowlisted; else env; else default.
  const preferred = fromCampaign || fromEnv || fallback;
  if (!allowlist.has(preferred)) {
    return { ok: false, reasonCode: REASON_CODES.REDIRECT_NOT_ALLOWLISTED, e164: null };
  }
  return { ok: true, reasonCode: REASON_CODES.OK, e164: preferred, allowlist };
}

function buildWhatsAppRedirectUrl({
  campaignWhatsAppE164 = null,
  env = process.env,
  prefill = NATURAL_WHATSAPP_PREFILL
} = {}) {
  const resolved = resolveAllowlistedWhatsAppE164({ campaignWhatsAppE164, env });
  if (!resolved.ok) {
    return resolved;
  }

  const text = String(prefill ?? NATURAL_WHATSAPP_PREFILL);
  if (text !== NATURAL_WHATSAPP_PREFILL) {
    // Phase 1 Mode A: only the approved natural sentence.
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
  resolveAllowlistedWhatsAppE164,
  buildWhatsAppRedirectUrl,
  NATURAL_WHATSAPP_PREFILL
};
