/**
 * Release 1.2 — Default organization roles (permissions only).
 */

const DEFAULT_ROLES = Object.freeze({
  owner: {
    id: "owner",
    label: "Owner",
    permissions: ["*"]
  },
  administrator: {
    id: "administrator",
    label: "Administrator",
    permissions: ["organization.manage", "users.manage", "packages.manage", "connectors.manage"]
  },
  manager: {
    id: "manager",
    label: "Manager",
    permissions: ["users.view", "offices.manage", "policies.manage", "analytics.view"]
  },
  recruiter: {
    id: "recruiter",
    label: "Recruiter",
    permissions: ["candidates.manage", "interviews.manage"]
  },
  trainer: {
    id: "trainer",
    label: "Trainer",
    permissions: ["orientation.manage", "faststart.manage"]
  },
  viewer: {
    id: "viewer",
    label: "Viewer",
    permissions: ["analytics.view"]
  }
});

function listRoles() {
  return Object.values(DEFAULT_ROLES);
}

function getRole(roleId) {
  return DEFAULT_ROLES[roleId] || null;
}

function roleHasPermission(roleId, permission) {
  const role = getRole(roleId);

  if (!role) {
    return false;
  }

  return role.permissions.includes("*") || role.permissions.includes(permission);
}

module.exports = {
  DEFAULT_ROLES,
  listRoles,
  getRole,
  roleHasPermission
};
