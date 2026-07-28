/**
 * LC1.1 — Self-service account management.
 */

const { supabase } = require("./supabaseService");
const {
  findUserById,
  sanitizeUser,
  revokeSessionByToken,
  revokeAllSessionsForUser
} = require("./atlasUserService");
const { hashPassword, verifyPassword } = require("../security/passwordService");
const { writeAuditLog } = require("../security/auditLogService");
const {
  uploadProfilePhoto,
  removeProfilePhoto
} = require("./profilePhotoService");
const identityWriteService = require("./identityWriteService");

function presentProfile(user) {
  return {
    ...sanitizeUser(user),
    phone: user.phone || null,
    photo_url: user.photo_url || null,
    timezone: user.timezone || "America/New_York",
    preferred_language: user.preferred_language || "en",
    notification_preferences: user.notification_preferences || {},
    last_login_at: user.last_login_at || null
  };
}

async function getProfile(userId) {
  const user = await findUserById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return presentProfile(user);
}

async function updateProfile(userId, input, auditMeta = {}) {
  const patch = {
    updated_at: new Date().toISOString()
  };

  if (input.firstName !== undefined || input.first_name !== undefined) {
    patch.first_name = String(input.firstName || input.first_name || "").trim();
  }

  if (input.lastName !== undefined || input.last_name !== undefined) {
    patch.last_name = String(input.lastName || input.last_name || "").trim();
  }

  if (patch.first_name !== undefined || patch.last_name !== undefined) {
    const existing = await findUserById(userId);
    patch.display_name = [patch.first_name ?? existing.first_name, patch.last_name ?? existing.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (input.phone !== undefined) {
    patch.phone = input.phone || null;
  }

  if (input.timezone !== undefined) {
    patch.timezone = input.timezone;
  }

  if (input.preferredLanguage !== undefined || input.preferred_language !== undefined) {
    patch.preferred_language = input.preferredLanguage || input.preferred_language;
  }

  if (input.notificationPreferences !== undefined || input.notification_preferences !== undefined) {
    patch.notification_preferences =
      input.notificationPreferences || input.notification_preferences || {};
  }

  const data = await identityWriteService.updateProfile(userId, patch);

  await writeAuditLog({
    organizationId: data.organization_id,
    userId,
    userEmail: data.email,
    action: "user.profile_updated",
    targetType: "atlas_user",
    targetId: userId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return presentProfile(data);
}

async function uploadPhoto(userId, file, auditMeta = {}) {
  const updatedUser = await uploadProfilePhoto(userId, file, auditMeta);
  return presentProfile(updatedUser);
}

async function removePhoto(userId, auditMeta = {}) {
  const updatedUser = await removeProfilePhoto(userId, auditMeta);
  return presentProfile(updatedUser);
}

async function changePassword(userId, { currentPassword, newPassword }, auditMeta = {}) {
  const user = await findUserById(userId);

  if (!user?.password_hash || !verifyPassword(currentPassword, user.password_hash)) {
    const error = new Error("Current password is incorrect.");
    error.statusCode = 401;
    throw error;
  }

  const passwordHash = hashPassword(newPassword);
  const data = await identityWriteService.changePassword(userId, passwordHash);

  await writeAuditLog({
    organizationId: data.organization_id,
    userId,
    userEmail: data.email,
    action: "user.password_changed",
    targetType: "atlas_user",
    targetId: userId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return { success: true };
}

async function listActiveSessions(userId, currentToken) {
  const { data, error } = await supabase
    .from("atlas_sessions")
    .select("id, token, created_at, expires_at, ip_address, user_agent, device_label, remember_me")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((session) => ({
    id: session.id,
    created_at: session.created_at,
    expires_at: session.expires_at,
    ip_address: session.ip_address,
    user_agent: session.user_agent,
    device_label: session.device_label,
    remember_me: session.remember_me,
    current: session.token === currentToken
  }));
}

async function logoutCurrentSession(token, auditMeta = {}) {
  await revokeSessionByToken(token);

  await writeAuditLog({
    userId: auditMeta.userId,
    userEmail: auditMeta.userEmail,
    organizationId: auditMeta.organizationId,
    action: "user.session_revoked",
    targetType: "session",
    metadata: { scope: "current_device" },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return { success: true };
}

async function logoutAllSessions(userId, auditMeta = {}) {
  await revokeAllSessionsForUser(userId);

  await writeAuditLog({
    organizationId: auditMeta.organizationId,
    userId,
    userEmail: auditMeta.userEmail,
    action: "user.session_revoked",
    targetType: "atlas_user",
    targetId: userId,
    metadata: { scope: "all_devices" },
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return { success: true };
}

module.exports = {
  getProfile,
  updateProfile,
  uploadPhoto,
  removePhoto,
  changePassword,
  listActiveSessions,
  logoutCurrentSession,
  logoutAllSessions
};
