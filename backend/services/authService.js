/**
 * LC1 / LC1.1 — Individual authentication service.
 */

const crypto = require("crypto");
const {
  findUserByEmail,
  findUserBySessionToken,
  createSessionForUser,
  revokeSessionByToken,
  sanitizeUser,
  updateLastLogin
} = require("../services/atlasUserService");
const { signAccessToken } = require("../security/jwtService");
const { hashPassword, verifyPassword } = require("../security/passwordService");
const { hashToken } = require("../security/tokenService");
const { writeAuditLog } = require("../security/auditLogService");
const { writeLoginHistory } = require("../services/loginHistoryService");
const { sendPasswordResetEmail } = require("../services/emailService");
const { supabase } = require("../services/supabaseService");
const { USER_STATUSES, canUserLogin } = require("../security/roles");
const { isPgFallbackEnabled } = require("./pgFallback");
const identityWriteService = require("./identityWriteService");

const RESET_TTL_MS = 60 * 60 * 1000;

async function recordAuthFailure({ email, user, reason, ipAddress, userAgent }) {
  await writeAuditLog({
    organizationId: user?.organization_id,
    userId: user?.id,
    userEmail: email,
    action: "auth.login_failed",
    result: "failure",
    metadata: { reason },
    ipAddress,
    userAgent
  });

  await writeLoginHistory({
    userId: user?.id,
    userEmail: email,
    eventType: "login_failed",
    result: "failure",
    ipAddress,
    userAgent,
    metadata: { reason }
  });
}

async function loginWithPassword({ email, password, rememberMe = false, ipAddress, userAgent }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[auth/login/dev]", {
        email: normalizedEmail,
        userFound: false,
        tableQueried: "atlas_users",
        accessPath: isPgFallbackEnabled() ? "pg_fallback" : "supabase",
        passwordHashPresent: false,
        verifyPassword: false
      });
    }

    await recordAuthFailure({
      email: normalizedEmail,
      reason: "invalid_credentials",
      ipAddress,
      userAgent
    });

    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    error.publicCode = "INVALID_CREDENTIALS";
    throw error;
  }

  if (!canUserLogin(user.status)) {
    await recordAuthFailure({
      email: normalizedEmail,
      user,
      reason: `status_${user.status}`,
      ipAddress,
      userAgent
    });

    const error = new Error("This account is not active.");
    error.statusCode = 403;
    error.publicCode = "ACCOUNT_INACTIVE";
    throw error;
  }

  const passwordHashPresent = Boolean(user.password_hash);
  const passwordValid = passwordHashPresent && verifyPassword(password, user.password_hash);

  if (process.env.NODE_ENV !== "production") {
    console.log("[auth/login/dev]", {
      email: normalizedEmail,
      userFound: true,
      tableQueried: "atlas_users",
      accessPath: isPgFallbackEnabled() ? "pg_fallback" : "supabase",
      passwordHashPresent,
      verifyPassword: passwordValid
    });
  }

  if (!passwordValid) {
    await recordAuthFailure({
      email: normalizedEmail,
      user,
      reason: "invalid_credentials",
      ipAddress,
      userAgent
    });

    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    error.publicCode = "INVALID_CREDENTIALS";
    throw error;
  }

  let accessToken;
  let session;

  try {
    const jwtResult = await signAccessToken(user, { rememberMe });
    accessToken = jwtResult.token;

    session = await createSessionForUser(user.id, {
      rememberMe,
      ipAddress,
      userAgent,
      jwtJti: jwtResult.jti,
      tokenType: "jwt",
      sessionToken: jwtResult.token
    });
  } catch (jwtError) {
    console.warn("[auth/login] JWT issuance fallback to opaque session:", jwtError.message);
    session = await createSessionForUser(user.id, {
      rememberMe,
      ipAddress,
      userAgent
    });
    accessToken = session.token;
  }

  await updateLastLogin(user.id);

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

  await writeLoginHistory({
    userId: user.id,
    userEmail: user.email,
    eventType: "login_success",
    result: "success",
    ipAddress,
    userAgent
  });

  return {
    user: sanitizeUser(user),
    session: {
      ...session,
      token: accessToken
    }
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

  if (user && canUserLogin(user.status)) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

    await supabase.from("atlas_password_reset_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt
    });

    await sendPasswordResetEmail({
      email: user.email,
      firstName: user.first_name,
      token: rawToken,
      expiresAt
    }).catch((emailError) => {
      console.error("[password-reset-email]", emailError.message);
    });

    await writeAuditLog({
      organizationId: user.organization_id,
      userId: user.id,
      userEmail: user.email,
      action: "auth.password_reset_requested",
      result: "success",
      ipAddress,
      userAgent
    });

    await writeLoginHistory({
      userId: user.id,
      userEmail: user.email,
      eventType: "password_reset_requested",
      result: "success",
      ipAddress,
      userAgent
    });
  }

  return {
    message:
      "If an account exists for that email, password reset instructions will be sent."
  };
}

async function confirmPasswordReset({ token, newPassword, ipAddress, userAgent }) {
  const tokenHash = hashToken(token);

  const { data: resetRow, error } = await supabase
    .from("atlas_password_reset_tokens")
    .select("*, user:atlas_users!user_id(*)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!resetRow || resetRow.used_at || Date.parse(resetRow.expires_at) < Date.now()) {
    const resetError = new Error("Invalid or expired reset token.");
    resetError.statusCode = 400;
    throw resetError;
  }

  const passwordHash = hashPassword(newPassword);
  const user = resetRow.user;

  await identityWriteService.confirmPasswordReset(user.id, passwordHash);

  await supabase
    .from("atlas_password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", resetRow.id);

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: user.id,
    userEmail: user.email,
    action: "auth.password_reset_completed",
    result: "success",
    ipAddress,
    userAgent
  });

  await writeLoginHistory({
    userId: user.id,
    userEmail: user.email,
    eventType: "password_reset_completed",
    result: "success",
    ipAddress,
    userAgent
  });

  return { success: true };
}

const INVITATION_USER_EMBED =
  "expires_at, used_at, user:atlas_users!user_id(email, first_name, status)";

const INVITATION_ACCEPT_EMBED = "*, user:atlas_users!user_id(*)";

async function validateInvitationToken(token) {
  const rawToken = String(token || "").trim();

  if (!rawToken) {
    return { valid: false };
  }

  const tokenHash = hashToken(rawToken);

  const { data, error } = await supabase
    .from("atlas_invitation_tokens")
    .select(INVITATION_USER_EMBED)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("[auth/invitation/validate] token lookup failed", {
      code: error.code,
      message: error.message
    });
    throw error;
  }

  if (!data || data.used_at || Date.parse(data.expires_at) < Date.now()) {
    return { valid: false };
  }

  return {
    valid: true,
    email: data.user?.email,
    firstName: data.user?.first_name,
    status: data.user?.status
  };
}

async function acceptInvitation({ token, password, ipAddress, userAgent }) {
  const tokenHash = hashToken(token);

  const { data: inviteRow, error } = await supabase
    .from("atlas_invitation_tokens")
    .select(INVITATION_ACCEPT_EMBED)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("[auth/invitation/accept] token lookup failed", {
      code: error.code,
      message: error.message
    });
    throw error;
  }

  if (!inviteRow || inviteRow.used_at || Date.parse(inviteRow.expires_at) < Date.now()) {
    const inviteError = new Error("Invalid or expired invitation.");
    inviteError.statusCode = 400;
    throw inviteError;
  }

  const user = inviteRow.user;
  const passwordHash = hashPassword(password);

  await identityWriteService.acceptInvitation(user.id, passwordHash);

  await supabase
    .from("atlas_invitation_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", inviteRow.id);

  await writeAuditLog({
    organizationId: user.organization_id,
    userId: user.id,
    userEmail: user.email,
    action: "user.invitation_accepted",
    targetType: "atlas_user",
    targetId: user.id,
    ipAddress,
    userAgent
  });

  await writeLoginHistory({
    userId: user.id,
    userEmail: user.email,
    eventType: "invitation_accepted",
    result: "success",
    ipAddress,
    userAgent
  });

  const session = await createSessionForUser(user.id, { ipAddress, userAgent });
  await updateLastLogin(user.id);

  return {
    user: sanitizeUser({ ...user, status: USER_STATUSES.ACTIVE }),
    session
  };
}

module.exports = {
  loginWithPassword,
  logoutSession,
  requestPasswordReset,
  confirmPasswordReset,
  validateInvitationToken,
  acceptInvitation
};
