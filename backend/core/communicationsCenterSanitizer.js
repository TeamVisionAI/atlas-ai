/**
 * Communications Center — safe output sanitization.
 * Never mutates source DB objects. Never logs original sensitive values.
 */

const { maskPhoneLast4, maskProviderMessageId } = require("./communicationsCenterMasks");

const MAX_DEPTH = 8;
const SENSITIVE_KEY =
  /(?:^|_)(phone|email|token|secret|password|authorization|api[_-]?key|bearer|prompt|stack|wa_id|recipient|normalized.?address|idempotency_key|storage_path|playback_path|meta_media_id|fetch_error|transcode_error|access_token)(?:$|_)/i;
const PHONE_KEY = /(?:^|_)(phone|wa_id|recipient|normalized.?address)(?:$|_)/i;
const EMAIL_KEY = /(?:^|_)email(?:$|_)/i;
const SECRET_KEY = /(?:^|_)(token|secret|password|authorization|api[_-]?key|bearer|access_token|meta_media_id|storage_path|playback_path)(?:$|_)/i;
const DIAGNOSTIC_KEY = /(?:^|_)(stack|prompt|raw.?error|fetch_error|transcode_error)(?:$|_)/i;

const E164_RE = /\+\d{10,15}\b/g;
const US_FORMATTED_RE = /\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-]+\b/gi;
const LONG_TOKEN_RE = /\b(?!wamid\.)[A-Za-z0-9_-]{40,}\b/g;
const ADVANCE_CORR_RE = /^(advance:)(\+\d{10,15}|[\d().\-\s+]{10,})(:.*)?$/i;

function maskEmail(value) {
  const text = String(value || "");
  const at = text.indexOf("@");

  if (at < 1) {
    return "***";
  }

  return `${text.slice(0, 1)}***@${text.slice(at + 1)}`;
}

function sanitizePhoneLikeFragment(fragment) {
  const digits = String(fragment || "").replace(/\D/g, "");

  if (digits.length >= 4) {
    return `***${digits.slice(-4)}`;
  }

  return "<masked-contact>";
}

function sanitizeCorrelationId(value) {
  if (value == null) {
    return value;
  }

  const text = String(value);
  const advance = text.match(ADVANCE_CORR_RE);

  if (advance) {
    return `${advance[1]}<masked-contact>${advance[3] || ""}`;
  }

  return sanitizeSensitiveString(text);
}

function sanitizeSensitiveString(value) {
  if (value == null) {
    return value;
  }

  let text = String(value);

  text = text.replace(BEARER_RE, "Bearer <redacted>");
  text = text.replace(EMAIL_RE, (match) => maskEmail(match));
  text = text.replace(E164_RE, (match) => sanitizePhoneLikeFragment(match));
  text = text.replace(US_FORMATTED_RE, (match) => sanitizePhoneLikeFragment(match));

  // Long opaque tokens that are not UUIDs
  text = text.replace(LONG_TOKEN_RE, (match) => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(match)) {
      return match;
    }

    return `${match.slice(0, 4)}…`;
  });

  return text;
}

function sanitizeByKey(key, value) {
  const name = String(key || "");

  if (/correlation/i.test(name)) {
    return sanitizeCorrelationId(value);
  }

  if (/provider.?message.?id|wamid/i.test(name)) {
    return maskProviderMessageId(value);
  }

  if (PHONE_KEY.test(name)) {
    if (value == null || value === "") {
      return value;
    }

    if (typeof value === "number") {
      return value;
    }

    return maskPhoneLast4(value);
  }

  if (EMAIL_KEY.test(name)) {
    return maskEmail(value);
  }

  if (SECRET_KEY.test(name)) {
    return "<redacted>";
  }

  if (DIAGNOSTIC_KEY.test(name)) {
    return "<redacted>";
  }

  if (typeof value === "string") {
    return sanitizeSensitiveString(value);
  }

  return value;
}

function sanitizeValue(value, options = {}, depth = 0, seen = new WeakSet()) {
  const maxDepth = options.maxDepth ?? MAX_DEPTH;

  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeSensitiveString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  if (depth >= maxDepth) {
    return "[Truncated]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, options, depth + 1, seen));
  }

  const out = {};

  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key) && (typeof child === "string" || typeof child === "number")) {
      out[key] = sanitizeByKey(key, child);
      continue;
    }

    if (typeof child === "string") {
      out[key] = sanitizeByKey(key, child);
      continue;
    }

    out[key] = sanitizeValue(child, options, depth + 1, seen);
  }

  return out;
}

/**
 * Deep-clone + sanitize a Communications Center API payload.
 * Source objects are never mutated.
 */
function sanitizeCommunicationsCenterResponse(payload, options = {}) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const clone = JSON.parse(JSON.stringify(payload));
  return sanitizeValue(clone, options);
}

function assertNoRawContactLeak(payload) {
  const text = JSON.stringify(payload || {});
  const violations = [];

  if (/\+\d{10,15}\b/.test(text)) {
    violations.push("e164");
  }

  if (/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/.test(text)) {
    violations.push("us_formatted_phone");
  }

  if (/\bBearer\s+[A-Za-z0-9._\-]{8,}/i.test(text)) {
    violations.push("bearer_token");
  }

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
    // allow masked emails like a***@x.com
    const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    if (emails.some((email) => !/\*{3}/.test(email))) {
      violations.push("email");
    }
  }

  return {
    ok: violations.length === 0,
    violations
  };
}

module.exports = {
  sanitizeCommunicationsCenterResponse,
  sanitizeCorrelationId,
  sanitizeSensitiveString,
  sanitizeValue,
  maskEmail,
  maskPhoneLast4,
  maskProviderMessageId,
  assertNoRawContactLeak,
  MAX_DEPTH
};
