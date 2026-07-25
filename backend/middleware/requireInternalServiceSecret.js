/**
 * Production Security — Protect internal service endpoints with a shared secret header.
 * Used for duplicate intake paths that must not be public in production.
 */

function requireInternalServiceSecret(req, res, next) {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  const expected = process.env.ATLAS_INTERNAL_SERVICE_SECRET;

  if (!expected) {
    return res.status(503).json({
      error: "SERVICE_MISCONFIGURED",
      message: "ATLAS_INTERNAL_SERVICE_SECRET is required in production."
    });
  }

  const provided = req.get("x-atlas-internal-secret");

  if (!provided || provided !== expected) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Invalid internal service credentials."
    });
  }

  return next();
}

module.exports = {
  requireInternalServiceSecret
};
