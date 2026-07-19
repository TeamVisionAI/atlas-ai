/**
 * Sprint 6 — Parse Meta Embedded Signup postMessage events (shared test surface).
 */

const ALLOWED_FACEBOOK_ORIGINS = Object.freeze([
  "https://www.facebook.com",
  "https://web.facebook.com"
]);

function isAllowedFacebookOrigin(origin) {
  return ALLOWED_FACEBOOK_ORIGINS.includes(origin);
}

function parseEmbeddedSignupPostMessage(rawData) {
  if (rawData == null) {
    return null;
  }

  let data = rawData;

  if (typeof rawData === "string") {
    try {
      data = JSON.parse(rawData);
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== "object" || data.type !== "WA_EMBEDDED_SIGNUP") {
    return null;
  }

  const payload = data.data || {};
  const wabaId = payload.waba_id || payload.wabaId || null;
  const phoneNumberId = payload.phone_number_id || payload.phoneNumberId || null;

  return {
    type: data.type,
    event: data.event || null,
    wabaId,
    phoneNumberId,
    raw: data
  };
}

module.exports = {
  ALLOWED_FACEBOOK_ORIGINS,
  isAllowedFacebookOrigin,
  parseEmbeddedSignupPostMessage
};
