/**
 * Canonical authenticated session identity for Support Mode scoping.
 * JWT: payload.jti (issued per login, stored as atlas_sessions.jwt_jti)
 * Opaque: bearer token (atlas_sessions.token)
 */

const { isJwtFormat } = require("./jwtService");

function resolveAuthSessionId({ jwtPayload = null, sessionToken = null } = {}) {
  const jti = jwtPayload?.jti ? String(jwtPayload.jti).trim() : "";

  if (jti) {
    return `jwt:${jti}`;
  }

  const token = String(sessionToken || "").trim();

  if (token && !isJwtFormat(token)) {
    return `opaque:${token}`;
  }

  return null;
}

module.exports = {
  resolveAuthSessionId
};
