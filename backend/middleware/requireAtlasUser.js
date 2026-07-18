/**
 * Sprint 10.1 — Require authenticated Atlas user for protected routes.
 */

const { findUserBySessionToken } = require("../services/atlasUserService");

function extractBearerToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7).trim();
}

async function requireAtlasUser(req, res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Authentication required."
      });
    }

    const user = await findUserBySessionToken(token);

    if (!user) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Invalid or expired session."
      });
    }

    req.atlasUser = user;
    req.atlasSessionToken = token;
    return next();
  } catch (error) {
    console.error("[requireAtlasUser]", error.message);
    return res.status(500).json({
      error: "AUTH_ERROR",
      message: "Unable to validate session."
    });
  }
}

module.exports = {
  requireAtlasUser,
  extractBearerToken
};
