/**
 * Sprint 18.2 — Configuration profile service.
 * Extends user profile with workspace configuration fields.
 */

const { supabase } = require("./supabaseService");
const { findUserById } = require("./atlasUserService");
const { writeAuditLog } = require("../security/auditLogService");

const DEFAULT_PROFILE_SETTINGS = Object.freeze({
  businessHours: {
    start: "09:00",
    end: "17:00",
    days: [1, 2, 3, 4, 5]
  },
  defaultOffice: null
});

function normalizeProfileSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    businessHours: {
      ...DEFAULT_PROFILE_SETTINGS.businessHours,
      ...(source.businessHours || {})
    },
    defaultOffice: source.defaultOffice ?? null
  };
}

function presentConfigurationProfile(user) {
  const profileSettings = normalizeProfileSettings(user.profile_settings);

  return {
    id: user.id,
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    email: user.email,
    phone: user.phone || null,
    timezone: user.timezone || "America/New_York",
    language: user.preferred_language || "en",
    businessHours: profileSettings.businessHours,
    defaultOffice: profileSettings.defaultOffice
  };
}

async function getConfigurationProfile(userId) {
  const user = await findUserById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return presentConfigurationProfile(user);
}

async function updateConfigurationProfile(userId, input, auditMeta = {}) {
  const existing = await findUserById(userId);

  if (!existing) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

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
    patch.display_name = [
      patch.first_name ?? existing.first_name,
      patch.last_name ?? existing.last_name
    ]
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

  if (input.language !== undefined || input.preferredLanguage !== undefined) {
    patch.preferred_language = input.language || input.preferredLanguage;
  }

  const profileSettings = normalizeProfileSettings(existing.profile_settings);

  if (input.businessHours !== undefined) {
    profileSettings.businessHours = {
      ...profileSettings.businessHours,
      ...input.businessHours
    };
  }

  if (input.defaultOffice !== undefined) {
    profileSettings.defaultOffice = input.defaultOffice || null;
  }

  patch.profile_settings = profileSettings;

  const { data, error } = await supabase
    .from("atlas_users")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await writeAuditLog({
    organizationId: data.organization_id,
    userId,
    userEmail: data.email,
    action: "configuration.profile_updated",
    targetType: "atlas_user",
    targetId: userId,
    ipAddress: auditMeta.ipAddress,
    userAgent: auditMeta.userAgent
  });

  return presentConfigurationProfile(data);
}

module.exports = {
  DEFAULT_PROFILE_SETTINGS,
  getConfigurationProfile,
  updateConfigurationProfile,
  presentConfigurationProfile
};
