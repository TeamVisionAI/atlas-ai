/**
 * Sprint 6 — In-memory rate limiting and duplicate exchange protection for embedded signup.
 */

const EXCHANGE_WINDOW_MS = 60 * 1000;
const EXCHANGE_MAX_PER_WINDOW = 8;
const USED_CODE_TTL_MS = 10 * 60 * 1000;

const exchangeBuckets = new Map();
const usedAuthorizationCodes = new Map();

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

module.exports = {
  isRateLimited,
  markAuthorizationCodeUsed,
  isAuthorizationCodeUsed
};
