/**
 * LC1 — Individual authentication service.
 */

const crypto = require("crypto");
const {
  findUserByEmail,
  findUserBySessionToken,
  createSessionForUser,
  revokeSessionByToken,
  sanitizeUser
} = require("../services/atlasUserService");
const { verifyPassword } = require("../security/passwordService");
const { writeAuditLog } = require("../security/auditLogService");
const { supabase } = require("../services/supabaseService");
const { USER_STATUSES } = require("../security/roles");

const RESET_TTL_MS = 60 * 60 * 1000;

async function loginWithPassword({ email, password, rememberMe = false, ipAddress, userAgent }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (!user || user.status === USER_STATUSES.DISABLED) {
    await writeAuditLog({
      userEmail: normalizedEmail,
      action: "auth.login_failed",
      result: "failure",
      metadata: { reason: "invalid_credentials" },
      ipAddress,
      userAgent
    });

    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    error.publicCode = "INVALID_CREDENTIALS";
    throw error;
  }

  if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
    await writeAuditLog({
      organizationId: user.organization_id,
      userId: user.id,
      userEmail: user.email,
      action: "auth.login_failed",
      result: "failure",
      metadata: { reason: "invalid_credentials" },
      ipAddress,
      userAgent
    });

    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    error.publicCode = "INVALID_CREDENTIALS";
    throw error;
  }

  const session = await createSessionForUser(user.id, { rememberMe });

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: user.id,
    userEmail: user.email,
    action: "auth.login",
    result: "success",
    metadata: { rememberMe: Boolean(rememberMe) },
    ipAddress,
    userAgent
  });

  return {
    user: sanitizeUser(user),
    session
  };
}

async function logoutSession(token, { ipAddress, userAgent } = {}) {
  const user = await findUserBySessionToken(token);
  await revokeSessionByToken(token);

  if (user) {
    await writeAuditLog({
      organizationId: user.organization_id,
      userId: user.id,
      userEmail: user.email,
      action: "auth.logout",
      result: "success",
      ipAddress,
      userAgent
    });
  }

  return { success: true };
}

async function requestPasswordReset(email, { ipAddress, userAgent } = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

    await supabase.from("atlas_password_reset_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt
    });

    await writeAuditLog({
      organizationId: user.organization_id,
      userId: user.id,
      userEmail: user.email,
      action: "auth.password_reset_requested",
      result: "success",
      metadata: {
        delivery: "architecture_only",
        resetTokenPreview: `${rawToken.slice(0, 6)}…`
      },
      ipAddress,
      userAgent
    });
  }

  return {
    message:
      "If an account exists for that email, password reset instructions will be sent."
  };
}

module.exports = {
  loginWithPassword,
  logoutSession,
  requestPasswordReset
};
