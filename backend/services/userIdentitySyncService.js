/**
 * Sprint 19 — Legacy sync helpers; all writes delegate to identityWriteService.
 *
 * Canonical SaaS role is public.users.role.
 * atlas_users.role is the LC1 workspace mirror and must never invent SUPER_ADMIN.
 * If users.role is already SUPER_ADMIN, atlas administrator must not downgrade it.
 */

const identityWriteService = require("./identityWriteService");
const { LEGACY_TO_SAAS, SAAS_ROLES } = require("../security/saasRoles");
const { USER_STATUSES } = require("../security/roles");

function mapLegacyRoleToSaas(role) {
  return LEGACY_TO_SAAS[String(role || "").trim().toLowerCase()] || "REPRESENTATIVE";
}

function resolveUsersRoleFromAtlasSync({ atlasRole, existingUsersRole } = {}) {
  if (String(existingUsersRole || "").trim() === SAAS_ROLES.SUPER_ADMIN) {
    return SAAS_ROLES.SUPER_ADMIN;
  }

  return mapLegacyRoleToSaas(atlasRole);
}

function buildUsersRowFromAtlasUser(atlasUser, { existingUsersRole } = {}) {
  const displayName =
    [atlasUser.first_name, atlasUser.last_name].filter(Boolean).join(" ").trim() ||
    atlasUser.display_name ||
    atlasUser.email;

  return {
    id: atlasUser.id,
    organization_id: atlasUser.organization_id,
    name: displayName,
    email: atlasUser.email,
    rep_id: atlasUser.rep_id || null,
    password_hash: atlasUser.password_hash || null,
    role: resolveUsersRoleFromAtlasSync({
      atlasRole: atlasUser.role,
      existingUsersRole
    }),
    is_active: atlasUser.status === USER_STATUSES.ACTIVE,
    last_login: atlasUser.last_login_at || null,
    created_at: atlasUser.created_at || new Date().toISOString(),
    updated_at: atlasUser.updated_at || new Date().toISOString()
  };
}

async function syncUsersTableFromAtlasUser(atlasUser) {
  if (!atlasUser?.id) {
    return null;
  }

  return identityWriteService.repairIdentityFromAtlas(atlasUser.id);
}

module.exports = {
  syncUsersTableFromAtlasUser,
  buildUsersRowFromAtlasUser,
  mapLegacyRoleToSaas,
  resolveUsersRoleFromAtlasSync
};
