/**
 * Sprint 6 — In-memory rate limiting and duplicate exchange protection for embedded signup.
 */

const crypto = require("crypto");

const EXCHANGE_WINDOW_MS = 60 * 1000;
const EXCHANGE_MAX_PER_WINDOW = 8;
const USED_CODE_TTL_MS = 10 * 60 * 1000;
const FINGERPRINT_TTL_MS = 10 * 60 * 1000;

const exchangeBuckets = new Map();
const usedAuthorizationCodes = new Map();
const attemptedCodeFingerprints = new Map();

function getClientKey(req) {
  return req.ip || req.headers["x-forwarded-for"] || "unknown";
}

function pruneUsedCodes(now = Date.now()) {
  for (const [code, expiresAt] of usedAuthorizationCodes.entries()) {
    if (expiresAt <= now) {
      usedAuthorizationCodes.delete(code);
    }
  }
}

function isRateLimited(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const bucket = exchangeBuckets.get(key) || { count: 0, resetAt: now + EXCHANGE_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + EXCHANGE_WINDOW_MS;
  }

  bucket.count += 1;
  exchangeBuckets.set(key, bucket);

  return bucket.count > EXCHANGE_MAX_PER_WINDOW;
}

function markAuthorizationCodeUsed(code) {
  pruneUsedCodes();
  usedAuthorizationCodes.set(code, Date.now() + USED_CODE_TTL_MS);
}

function isAuthorizationCodeUsed(code) {
  pruneUsedCodes();
  const expiresAt = usedAuthorizationCodes.get(code);
  return Boolean(expiresAt && expiresAt > Date.now());
}

function pruneAttemptedFingerprints(now = Date.now()) {
  for (const [fingerprint, record] of attemptedCodeFingerprints.entries()) {
    if (record.expiresAt <= now) {
      attemptedCodeFingerprints.delete(fingerprint);
    }
  }
}

function fingerprintAuthorizationCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex").slice(0, 16);
}

function recordCodeFingerprintAttempt(fingerprint) {
  pruneAttemptedFingerprints();
  const now = Date.now();
  const existing = attemptedCodeFingerprints.get(fingerprint);

  if (existing) {
    existing.attemptCount += 1;
    return {
      duplicate: true,
      attemptCount: existing.attemptCount,
      firstAttemptAt: existing.firstAttemptAt
    };
  }

  attemptedCodeFingerprints.set(fingerprint, {
    firstAttemptAt: now,
    attemptCount: 1,
    expiresAt: now + FINGERPRINT_TTL_MS
  });

  return {
    duplicate: false,
    attemptCount: 1,
    firstAttemptAt: now
  };
}

module.exports = {
  isRateLimited,
  markAuthorizationCodeUsed,
  isAuthorizationCodeUsed,
  fingerprintAuthorizationCode,
  recordCodeFingerprintAttempt
};
