/**
 * Sprint 19.1 — Sanitize list endpoint query params from HTTP clients.
 */

function isBlankQueryValue(value) {
  if (value === undefined || value === null) {
    return true;
  }

  const text = String(value).trim().toLowerCase();

  return !text || text === "undefined" || text === "null";
}

function sanitizeListQuery(query = {}) {
  const sanitized = { ...query };

  for (const key of ["q", "status", "role"]) {
    if (isBlankQueryValue(sanitized[key])) {
      delete sanitized[key];
    } else {
      sanitized[key] = String(sanitized[key]).trim();
    }
  }

  return sanitized;
}

module.exports = {
  isBlankQueryValue,
  sanitizeListQuery
};
