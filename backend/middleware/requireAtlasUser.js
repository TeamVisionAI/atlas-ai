/**
 * Sprint 10.1 / LC1 — Require authenticated Atlas user and attach auth context.
 */

const { findUserBySessionToken, sanitizeUser } = require("../services/atlasUserService");
const { buildAuthContext, isActiveContext } = require("../security/authorizationService");

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

    const authContext = buildAuthContext(user);

    if (!isActiveContext(authContext)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Account is disabled."
      });
    }

    req.atlasUser = user;
    req.atlasSessionToken = token;
    req.authContext = authContext;
    req.sanitizedUser = sanitizeUser(user);
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
