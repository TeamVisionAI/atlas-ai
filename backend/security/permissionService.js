/**
 * Sprint 16.9 — DB-backed permission resolution with in-memory cache.
 * Permissions are stored in `permissions`, `role_permissions`, and `user_permissions` tables.
 */

const { supabase } = require("../services/supabaseService");
const { normalizeSaasRole, toLegacyRole, isOrgAdmin, isSuperAdmin } = require("./saasRoles");
const { normalizeRole } = require("./roles");
const { permissionsForRole } = require("./permissions");

let permissionCache = {
  rolePermissions: new Map(),
  loadedAt: 0
};

const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadRolePermissionsFromDb() {
  const now = Date.now();

  if (permissionCache.loadedAt && now - permissionCache.loadedAt < CACHE_TTL_MS) {
    return permissionCache.rolePermissions;
  }

  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_code, permission_code, granted")
    .eq("granted", true);

  if (error) {
    if (error.code === "42P01") {
      return null;
    }

    throw error;
  }

  const map = new Map();

  for (const row of data || []) {
    const list = map.get(row.role_code) || [];
    list.push(row.permission_code);
    map.set(row.role_code, list);
  }

  permissionCache = { rolePermissions: map, loadedAt: now };
  return map;
}

async function loadUserPermissionOverrides(userId) {
  const { data, error } = await supabase
    .from("user_permissions")
    .select("permission_code, granted, expires_at")
    .eq("user_id", userId);

  if (error) {
    if (error.code === "42P01") {
      return { grants: [], denials: [] };
    }

    throw error;
  }

  const now = Date.now();
  const grants = [];
  const denials = [];

  for (const row of data || []) {
    if (row.expires_at && Date.parse(row.expires_at) < now) {
      continue;
    }

    if (row.granted) {
      grants.push(row.permission_code);
    } else {
      denials.push(row.permission_code);
    }
  }

  return { grants, denials };
}

function resolvePermissionsFromLegacyRole(role) {
  const legacyRole = normalizeRole(role) || toLegacyRole(role);
  return permissionsForRole(legacyRole);
}

async function resolvePermissionsForUser(user) {
  if (!user) {
    return [];
  }

  const saasRole = normalizeSaasRole(user.role) || user.role;
  const roleMap = await loadRolePermissionsFromDb();
  let permissions = [];

  if (roleMap && roleMap.has(saasRole)) {
    permissions = [...roleMap.get(saasRole)];
  } else {
    permissions = resolvePermissionsFromLegacyRole(saasRole);
  }

  if (isOrgAdmin(saasRole)) {
    return permissions;
  }

  const overrides = await loadUserPermissionOverrides(user.id);
  const set = new Set(permissions);

  for (const grant of overrides.grants) {
    set.add(grant);
  }

  for (const denial of overrides.denials) {
    set.delete(denial);
  }

  return Array.from(set);
}

async function userHasPermission(user, permission) {
  if (!user || !permission) {
    return false;
  }

  const saasRole = normalizeSaasRole(user.role);

  if (isOrgAdmin(saasRole)) {
    return true;
  }

  const permissions = await resolvePermissionsForUser(user);
  return permissions.includes(permission);
}

function invalidatePermissionCache() {
  permissionCache = { rolePermissions: new Map(), loadedAt: 0 };
}

module.exports = {
  loadRolePermissionsFromDb,
  resolvePermissionsForUser,
  userHasPermission,
  invalidatePermissionCache,
  resolvePermissionsFromLegacyRole
};
