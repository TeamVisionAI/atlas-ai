/**
 * Sprint 12.1 — Rep ID validation and normalization.
 * Format: exactly 5 uppercase alphanumeric characters (e.g. 4TJLK).
 * Nullable for backward compatibility until backfill completes.
 */

const REP_ID_LENGTH = 5;
const REP_ID_PATTERN = /^[A-Z0-9]{5}$/;

function buildInvalidRepIdError() {
  const error = new Error(
    `Rep ID must be exactly ${REP_ID_LENGTH} uppercase letters or digits.`
  );
  error.statusCode = 400;
  error.publicCode = "INVALID_REP_ID";
  return error;
}

function normalizeRepId(value, { allowNull = true } = {}) {
  if (value === null || value === undefined) {
    if (allowNull) {
      return null;
    }

    throw buildInvalidRepIdError();
  }

  const normalized = String(value).trim().toUpperCase();

  if (!normalized) {
    if (allowNull) {
      return null;
    }

    throw buildInvalidRepIdError();
  }

  if (!REP_ID_PATTERN.test(normalized)) {
    throw buildInvalidRepIdError();
  }

  return normalized;
}

function isValidRepId(value) {
  if (value === null || value === undefined) {
    return false;
  }

  try {
    normalizeRepId(value, { allowNull: false });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  REP_ID_LENGTH,
  REP_ID_PATTERN,
  normalizeRepId,
  isValidRepId,
  buildInvalidRepIdError
};
