/**
 * Contract mirror of public.sync_atlas_users_from_users() field mapping.
 * Used for tests only — identity writes still go through the DB trigger.
 * Keep in lockstep with migration 030 / 017 role CASE + name split.
 */

const ROLE_MAP = Object.freeze({
  SUPER_ADMIN: "administrator",
  ADMIN: "administrator",
  OPERATIONS: "operations",
  SUPPORT: "support",
  RVP: "rvp",
  DIVISION_LEADER: "division_leader",
  REGIONAL_LEADER: "division_leader",
  FIELD_TRAINER: "agent",
  REPRESENTATIVE: "recruiter"
});

function mapLegacyRole(role) {
  if (Object.prototype.hasOwnProperty.call(ROLE_MAP, role)) {
    return ROLE_MAP[role];
  }
  return String(role || "")
    .toLowerCase()
    .replace(/_/g, " ");
}

function splitDisplayName(name) {
  const value = name == null ? "" : String(name);
  const firstSpace = value.indexOf(" ");
  const firstName = firstSpace === -1 ? value : value.slice(0, firstSpace);
  const lastNameRaw = firstSpace === -1 ? "" : value.slice(firstSpace + 1).trim();
  const lastName = lastNameRaw === "" ? null : lastNameRaw;
  return { firstName, lastName, displayName: value };
}

/**
 * @param {object} usersRow — public.users-shaped row (NEW)
 * @returns {object} public.atlas_users fields written by the trigger
 */
function mapUsersRowToAtlasUsersSync(usersRow) {
  const { firstName, lastName, displayName } = splitDisplayName(usersRow.name);

  return {
    id: usersRow.id,
    email: usersRow.email,
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    organization_id: usersRow.organization_id,
    role: mapLegacyRole(usersRow.role),
    status: usersRow.is_active ? "active" : "suspended",
    password_hash: usersRow.password_hash,
    rep_id: usersRow.rep_id,
    last_login_at: usersRow.last_login,
    created_at: usersRow.created_at,
    updated_at: usersRow.updated_at
  };
}

module.exports = {
  ROLE_MAP,
  mapLegacyRole,
  splitDisplayName,
  mapUsersRowToAtlasUsersSync
};
