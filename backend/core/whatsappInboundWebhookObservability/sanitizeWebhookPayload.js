/**
 * Sanitize Meta webhook JSON before durable observability persistence.
 * Strips secrets/credentials; preserves unknown message fields for unsupported diagnostics.
 */

const SECRET_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|x-hub-signature(-256)?|access[_-]?token|verify[_-]?token|app[_-]?secret|api[_-]?key|password|secret|token|bearer)$/i;

const SECRET_VALUE_KEY_PATTERN =
  /token|secret|password|authorization|cookie|api[_-]?key|signature/i;

const MAX_DEPTH = 24;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 32_000;

function truncateString(value) {
  const text = String(value);
  if (text.length <= MAX_STRING_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
}

function sanitizeValue(value, depth = 0, parentKey = "") {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > MAX_DEPTH) {
    return "[max_depth]";
  }

  if (typeof value === "string") {
    if (SECRET_VALUE_KEY_PATTERN.test(parentKey)) {
      return "[redacted]";
    }
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item, index) => sanitizeValue(item, depth + 1, `${parentKey}[${index}]`));
  }

  if (typeof value !== "object") {
    return truncateString(value);
  }

  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) || SECRET_VALUE_KEY_PATTERN.test(key)) {
      continue;
    }
    out[key] = sanitizeValue(nested, depth + 1, key);
  }
  return out;
}

/**
 * @param {object|null} headers — request headers (not persisted by default)
 * @returns {object|null}
 */
function sanitizeRequestHeaders(headers) {
  if (!headers || typeof headers !== "object") {
    return null;
  }
  // Headers are never stored — only explicit safe diagnostics if ever needed.
  return null;
}

/**
 * @param {unknown} body — parsed Meta webhook JSON body
 * @returns {object}
 */
function sanitizeWebhookBody(body) {
  return sanitizeValue(body && typeof body === "object" ? body : {}, 0, "body");
}

module.exports = {
  sanitizeWebhookBody,
  sanitizeRequestHeaders,
  sanitizeValue,
  SECRET_KEY_PATTERN,
  SECRET_VALUE_KEY_PATTERN
};
