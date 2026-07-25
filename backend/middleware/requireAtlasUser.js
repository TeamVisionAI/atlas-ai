/**
 * Sprint 10.1 / LC1 / 16.9 — Require authenticated Atlas user.
 * Delegates to unified authenticate middleware (JWT + session dual-auth).
 */

const { authenticate } = require("./authenticate");
const { extractBearerToken } = require("./extractBearerToken");

async function requireAtlasUser(req, res, next) {
  return authenticate(req, res, next);
}

module.exports = {
  requireAtlasUser,
  extractBearerToken,
  authenticate
};
