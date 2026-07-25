/**
 * Sprint 16.9 — JWT authentication service.
 * Issues signed tokens containing user_id, organization_id, role, and permissions.
 * Stores jti in atlas_sessions for revocation support.
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { resolvePermissionsForUser } = require("./permissionService");
const { normalizeSaasRole } = require("./saasRoles");

const DEFAULT_TTL = process.env.JWT_EXPIRES_IN || "7d";
const REMEMBER_ME_TTL = process.env.JWT_REMEMBER_EXPIRES_IN || "30d";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.ATLAS_JWT_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production.");
  }

  return secret || "atlas-dev-jwt-secret-change-in-production";
}

function createJti() {
  return crypto.randomBytes(16).toString("hex");
}

async function buildTokenPayload(user, { rememberMe = false } = {}) {
  const permissions = await resolvePermissionsForUser(user);
  const role = normalizeSaasRole(user.role) || user.role;

  return {
    sub: user.id,
    user_id: user.id,
    organization_id: user.organization_id,
    role,
    permissions,
    email: user.email,
    name: user.name || user.display_name,
    jti: createJti(),
    remember_me: Boolean(rememberMe)
  };
}

async function signAccessToken(user, options = {}) {
  const payload = await buildTokenPayload(user, options);
  const expiresIn = options.rememberMe ? REMEMBER_ME_TTL : DEFAULT_TTL;

  const token = jwt.sign(payload, getJwtSecret(), {
    expiresIn,
    issuer: "atlas-ai",
    audience: "atlas-app"
  });

  return {
    token,
    expiresIn,
    jti: payload.jti,
    payload
  };
}

function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: "atlas-ai",
      audience: "atlas-app"
    });

    return { valid: true, payload: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function isJwtFormat(token) {
  return typeof token === "string" && token.split(".").length === 3;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  isJwtFormat,
  buildTokenPayload,
  getJwtSecret
};
