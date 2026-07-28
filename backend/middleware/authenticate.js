/**
 * Sprint 16.9 — Unified authentication middleware.
 * Supports JWT tokens and legacy opaque session tokens (dual-auth).
 */

const { findUserBySessionToken, sanitizeUser, findUserById: findAtlasUserById } = require("../services/atlasUserService");
const { findUserById } = require("../services/userService");
const { verifyAccessToken, isJwtFormat } = require("../security/jwtService");
const { buildAuthContextAsync, isActiveContext } = require("../security/authorizationService");
const { normalizeUserRecord } = require("../security/normalizeUserRecord");
const { isSuperAdmin } = require("../security/saasRoles");
const { supabase } = require("../services/supabaseService");
const { extractBearerToken } = require("./extractBearerToken");

async function mergeAtlasUserProfile(user) {
  if (!user?.id) {
    return user;
  }

  const atlasUser = normalizeUserRecord(await findAtlasUserById(user.id));

  if (!atlasUser) {
    return user;
  }

  return normalizeUserRecord({
    ...atlasUser,
    ...user,
    organization_id: atlasUser.organization_id || user.organization_id,
    role: atlasUser.role || user.role,
    status: atlasUser.status || user.status,
    email: atlasUser.email || user.email,
    display_name: atlasUser.display_name || user.display_name || user.name,
    first_name: atlasUser.first_name || user.first_name,
    last_name: atlasUser.last_name || user.last_name,
    password_hash: atlasUser.password_hash || user.password_hash
  });
}

async function resolveUserFromJwt(token) {
  const { valid, payload, error } = verifyAccessToken(token);

  if (!valid) {
    return { user: null, reason: error || "invalid_jwt" };
  }

  if (payload.jti) {
    const { data: session } = await supabase
      .from("atlas_sessions")
      .select("revoked_at, expires_at")
      .eq("jwt_jti", payload.jti)
      .maybeSingle();

    if (session?.revoked_at || (session?.expires_at && Date.parse(session.expires_at) < Date.now())) {
      return { user: null, reason: "revoked_jwt" };
    }
  }

  let user = normalizeUserRecord(await findUserById(payload.sub || payload.user_id));

  if (!user) {
    user = normalizeUserRecord(await findAtlasUserById(payload.sub || payload.user_id));
  }

  user = await mergeAtlasUserProfile(user);

  if (!user) {
    return { user: null, reason: "user_not_found" };
  }

  const tokenOrgId = payload.organization_id;
  const userOrgId = user.organization_id;

  if (
    tokenOrgId &&
    userOrgId &&
    String(tokenOrgId) !== String(userOrgId) &&
    !isSuperAdmin(payload.role)
  ) {
    return { user: null, reason: "organization_mismatch" };
  }

  return { user, jwtPayload: payload };
}

async function authenticate(req, res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Authentication required."
      });
    }

    let user = null;
    let jwtPayload = null;

    if (isJwtFormat(token)) {
      const result = await resolveUserFromJwt(token);
      user = result.user;
      jwtPayload = result.jwtPayload;

      if (!user) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Invalid or expired token."
        });
      }
    } else {
      user = normalizeUserRecord(await findUserBySessionToken(token));
      user = await mergeAtlasUserProfile(user);

      if (!user) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Invalid or expired session."
        });
      }
    }

    const authContext = await buildAuthContextAsync(user, { jwtPayload });

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
    req.jwtPayload = jwtPayload;
    req.tenantContext = {
      organizationId: authContext.organizationId,
      userId: authContext.userId,
      role: authContext.role,
      saasRole: authContext.saasRole,
      permissions: authContext.permissions || [],
      isSuperAdmin: isSuperAdmin(authContext.saasRole)
    };
    return next();
  } catch (error) {
    console.error("[authenticate]", error.message);
    return res.status(500).json({
      error: "AUTH_ERROR",
      message: "Unable to validate credentials."
    });
  }
}

module.exports = {
  authenticate,
  resolveUserFromJwt
};
