/**
 * Recruit AI v2 — sanitize context before durable persistence.
 * Strips tokens, stack traces, hidden reasoning, and unmasked phones.
 *
 * Implements BR-117 — never treat ISO calendar dates / datetimes as phones.
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

/** Whole-string or embedded ISO calendar date / datetime tokens. */
const ISO_TEMPORAL_TOKEN =
  /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;

/** UUIDs (org/prospect/agent ids) must not be treated as phone numbers. */
const UUID_TOKEN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const TEMP_MARKER_PREFIX = "\u0000ISO";
const TEMP_MARKER_SUFFIX = "\u0000";

function isExactIsoTemporal(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(
      s
    );
  }
  return true;
}

function isExactUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

/**
 * Mask phone-like substrings while preserving ISO date / datetime grammar
 * and UUID identifiers. Structured slot dates must round-trip unchanged.
 */
function maskPhoneLike(value) {
  const original = String(value);
  const trimmed = original.trim();
  if (isExactIsoTemporal(trimmed) || isExactUuid(trimmed)) {
    return trimmed;
  }

  const preserved = [];
  const protect = (match) => {
    const index = preserved.length;
    preserved.push(match);
    return `${TEMP_MARKER_PREFIX}${index}${TEMP_MARKER_SUFFIX}`;
  };

  let withPlaceholders = original.replace(UUID_TOKEN, protect);
  withPlaceholders = withPlaceholders.replace(ISO_TEMPORAL_TOKEN, protect);

  const masked = withPlaceholders.replace(PHONE_LIKE, (match) => {
    // Placeholders must never be phone-masked.
    if (match.includes(TEMP_MARKER_PREFIX)) {
      return match;
    }
    const digits = match.replace(/\D/g, "");
    if (digits.length < 7) {
      return "***";
    }
    return `+***${digits.slice(-4)}`;
  });

  return masked.replace(
    new RegExp(`${TEMP_MARKER_PREFIX}(\\d+)${TEMP_MARKER_SUFFIX}`, "g"),
    (_, index) => preserved[Number(index)] || ""
  );
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
  maskPhoneLike,
  isExactIsoTemporal,
  isExactUuid
};
