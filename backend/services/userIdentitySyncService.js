/**
 * Sprint 19 — Legacy sync helpers; all writes delegate to identityWriteService.
 */

const identityWriteService = require("./identityWriteService");
const { LEGACY_TO_SAAS } = require("../security/saasRoles");
const { USER_STATUSES } = require("../security/roles");

function mapLegacyRoleToSaas(role) {
  return LEGACY_TO_SAAS[String(role || "").trim().toLowerCase()] || "REPRESENTATIVE";
}

function buildUsersRowFromAtlasUser(atlasUser) {
  const displayName =
    [atlasUser.first_name, atlasUser.last_name].filter(Boolean).join(" ").trim() ||
    atlasUser.display_name ||
    atlasUser.email;

  return {
    id: atlasUser.id,
    organization_id: atlasUser.organization_id,
    name: displayName,
    email: atlasUser.email,
    password_hash: atlasUser.password_hash || null,
    role: mapLegacyRoleToSaas(atlasUser.role),
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
  mapLegacyRoleToSaas
};
