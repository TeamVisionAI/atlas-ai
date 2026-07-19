/**
 * Sprint 6 — Meta Embedded Signup postMessage handling (browser-safe).
 * Mirrors backend/core/metaEmbeddedSignupMessageParser.js for frontend use.
 */

export const ALLOWED_FACEBOOK_ORIGINS = [
  "https://www.facebook.com",
  "https://web.facebook.com"
];

export function isAllowedFacebookOrigin(origin) {
  return ALLOWED_FACEBOOK_ORIGINS.includes(origin);
}

export function parseEmbeddedSignupPostMessage(rawData) {
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
    errorMessage: data.data?.error_message || data.data?.errorMessage || null,
    raw: data
  };
}

export function mergeEmbeddedSignupIds(current, next) {
  return {
    wabaId: next?.wabaId || current?.wabaId || null,
    phoneNumberId: next?.phoneNumberId || current?.phoneNumberId || null
  };
}
