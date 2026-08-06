/**
 * Recruit AI v2 — sanitize context before durable persistence.
 * Strips tokens, stack traces, hidden reasoning, and unmasked phones.
 */

const FORBIDDEN_CONTEXT_KEYS = new Set([
  "hiddenReasoning",
  "chainOfThought",
  "reasoning",
  "rawProviderPayload",
  "providerPayload",
  "accessToken",
  "refreshToken",
  "credentials",
  "authorization",
  "stackTrace",
  "stack",
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
]);

const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/g;

function maskPhoneLike(value) {
  return String(value).replace(PHONE_LIKE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 7) {
      return "***";
    }
    return `+***${digits.slice(-4)}`;
  });
}

function sanitizeValue(value, depth = 0) {
  if (value == null) {
    return value;
  }

  if (depth > 8) {
    return null;
  }

  if (typeof value === "string") {
    return maskPhoneLike(value).slice(0, 2000);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_CONTEXT_KEYS.has(key)) {
        continue;
      }
      if (/token|secret|password|credential|stack/i.test(key)) {
        continue;
      }
      out[key] = sanitizeValue(nested, depth + 1);
    }
    return out;
  }

  return null;
}

/**
 * Produce a persistence-safe context_json payload.
 */
function sanitizeContextForPersistence(context = {}) {
  const sanitized = sanitizeValue(context) || {};

  // Never persist full outbound bodies beyond a short preview already in schema.
  if (sanitized.conversation?.lastAtlasOutboundText) {
    sanitized.conversation.lastAtlasOutboundText = String(
      sanitized.conversation.lastAtlasOutboundText
    ).slice(0, 240);
  }

  return sanitized;
}

function assertNoForbiddenPayload(contextJson) {
  const serialized = JSON.stringify(contextJson || {});
  if (/hiddenReasoning|chainOfThought|Bearer\s+[A-Za-z0-9._-]+/i.test(serialized)) {
    const error = new Error("Forbidden fields present in context payload");
    error.code = "CONTEXT_FORBIDDEN_PAYLOAD";
    throw error;
  }
}

module.exports = {
  sanitizeContextForPersistence,
  assertNoForbiddenPayload,
  FORBIDDEN_CONTEXT_KEYS,
  maskPhoneLike
};
