/**
 * Sprint 6 — Meta Embedded Signup postMessage handling (browser-safe).
 * Mirrors backend/core/metaEmbeddedSignupMessageParser.js for frontend use.
 *
 * Meta docs accept origins ending in facebook.com (HTTPS). We require the
 * hostname to be facebook.com or a subdomain (rejects attackerfacebook.com).
 */

export const ALLOWED_FACEBOOK_ORIGINS = Object.freeze([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://business.facebook.com",
  "https://facebook.com",
  "https://m.facebook.com"
]);

export function isAllowedFacebookOrigin(origin) {
  if (!origin || typeof origin !== "string") {
    return false;
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

function readPayloadObject(data) {
  if (!data || typeof data !== "object") {
    return {};
  }
  if (data.data && typeof data.data === "object") {
    return data.data;
  }
  return data;
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

  if (!data || typeof data !== "object") {
    return null;
  }

  // Prefer explicit WA_EMBEDDED_SIGNUP; also accept nested type.
  const type = data.type || data.data?.type || null;
  if (type && type !== "WA_EMBEDDED_SIGNUP") {
    return null;
  }

  // Without type, only accept if FINISH-like event or waba ids are present
  // (defensive for Meta payload shape drift); still require type when present.
  const event = data.event || data.data?.event || null;
  const payload = readPayloadObject(data);
  const wabaId = payload.waba_id || payload.wabaId || null;
  const phoneNumberId = payload.phone_number_id || payload.phoneNumberId || null;
  const businessId = payload.business_id || payload.businessId || null;

  if (type !== "WA_EMBEDDED_SIGNUP") {
    return null;
  }

  return {
    type: "WA_EMBEDDED_SIGNUP",
    event,
    wabaId: wabaId ? String(wabaId) : null,
    phoneNumberId: phoneNumberId ? String(phoneNumberId) : null,
    businessId: businessId ? String(businessId) : null,
    sessionInfo: payload.session_info || payload.sessionInfo || null,
    errorMessage:
      payload.error_message || payload.errorMessage || data.error_message || null,
    raw: data
  };
}

export function mergeEmbeddedSignupIds(current, next) {
  return {
    wabaId: next?.wabaId || current?.wabaId || null,
    phoneNumberId: next?.phoneNumberId || current?.phoneNumberId || null,
    businessId: next?.businessId || current?.businessId || null
  };
}
