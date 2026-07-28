/**
 * Sprint 20.0 — Role-based workspace navigation, landing pages, and route access.
 */

import { appPath } from "./appRoutes";
import { normalizeRole, roleHasPermission, ROLES, PERMISSIONS } from "../security/workspacePermissions";

export const WORKSPACE_TYPES = Object.freeze({
  ADMINISTRATOR: "administrator",
  MANAGEMENT: "management",
  REPRESENTATIVE: "representative"
});

const MANAGEMENT_ROLES = new Set([ROLES.RVP, ROLES.DIVISION_LEADER]);

export function resolveWorkspaceType(role) {
  const normalized = normalizeRole(role);

  if (normalized === ROLES.ADMINISTRATOR) {
    return WORKSPACE_TYPES.ADMINISTRATOR;
  }

  if (MANAGEMENT_ROLES.has(normalized)) {
    return WORKSPACE_TYPES.MANAGEMENT;
  }

  return WORKSPACE_TYPES.REPRESENTATIVE;
}

export function getRoleLabelKey(role) {
  const normalized = normalizeRole(role);

  const keys = {
    [ROLES.ADMINISTRATOR]: "workspaceRoleAdministrator",
    [ROLES.RVP]: "workspaceRoleOwnerRvp",
    [ROLES.DIVISION_LEADER]: "workspaceRoleDivisionLeader",
    [ROLES.AGENT]: "workspaceRoleFieldTrainer",
    [ROLES.RECRUITER]: "workspaceRoleRepresentative",
    [ROLES.OPERATIONS]: "workspaceRoleOperations",
    [ROLES.SUPPORT]: "workspaceRoleSupport"
  };

  return keys[normalized] || "workspaceRoleRepresentative";
}

export function getWorkspaceLabelKey(workspaceType) {
  const keys = {
    [WORKSPACE_TYPES.ADMINISTRATOR]: "workspaceLabelAdministrator",
    [WORKSPACE_TYPES.MANAGEMENT]: "workspaceLabelManagement",
    [WORKSPACE_TYPES.REPRESENTATIVE]: "workspaceLabelRepresentative"
  };

  return keys[workspaceType] || "workspaceLabelRepresentative";
}

export function getDefaultLandingPath(role) {
  const workspaceType = resolveWorkspaceType(role);

  if (workspaceType === WORKSPACE_TYPES.ADMINISTRATOR) {
    return appPath("executive-dashboard");
  }

  if (workspaceType === WORKSPACE_TYPES.MANAGEMENT) {
    return appPath("team-dashboard");
  }

  return appPath("my-dashboard");
}

const NAV_ITEM_DEFS = Object.freeze({
  executiveDashboard: {
    id: "executive-dashboard",
    path: appPath("executive-dashboard"),
    labelKey: "navExecutiveDashboard",
    end: true,
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  myDashboard: {
    id: "my-dashboard",
    path: appPath("my-dashboard"),
    labelKey: "navMyDashboard",
    end: true,
    workspaceTypes: [WORKSPACE_TYPES.REPRESENTATIVE]
  },
  teamDashboard: {
    id: "team-dashboard",
    path: appPath("team-dashboard"),
    labelKey: "navTeamDashboard",
    end: true,
    workspaceTypes: [WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  quickCapture: {
    id: "quick-capture",
    path: appPath("quick-capture"),
    labelKey: "navQuickCapture",
    permission: PERMISSIONS.PROSPECT_WRITE
  },
  missionControl: {
    id: "mission-control",
    path: appPath("mission-control"),
    labelKey: "navMissionControl",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.PROSPECT_READ
  },
  prospectCenter: {
    id: "prospect-center",
    path: appPath("prospect-center"),
    labelKeyByWorkspace: {
      [WORKSPACE_TYPES.REPRESENTATIVE]: "navMyProspects",
      [WORKSPACE_TYPES.ADMINISTRATOR]: "navProspectCenter",
      [WORKSPACE_TYPES.MANAGEMENT]: "navProspectCenter"
    },
    permission: PERMISSIONS.PROSPECT_READ
  },
  conversations: {
    id: "conversations",
    path: appPath("conversations"),
    labelKey: "navConversations",
    permission: PERMISSIONS.PROSPECT_COMMUNICATE
  },
  appointments: {
    id: "appointments",
    path: appPath("appointments"),
    labelKeyByWorkspace: {
      [WORKSPACE_TYPES.REPRESENTATIVE]: "navMyCalendar",
      [WORKSPACE_TYPES.ADMINISTRATOR]: "navAppointments",
      [WORKSPACE_TYPES.MANAGEMENT]: "navAppointments"
    },
    permission: PERMISSIONS.PROSPECT_READ
  },
  followUps: {
    id: "follow-ups",
    path: appPath("follow-ups"),
    labelKey: "navFollowUps",
    permission: PERMISSIONS.PROSPECT_READ
  },
  production: {
    id: "production",
    path: appPath("production"),
    labelKey: "navProduction",
    workspaceTypes: [WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  recruiting: {
    id: "recruiting",
    path: appPath("recruiting"),
    labelKey: "navRecruiting",
    workspaceTypes: [WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.PROSPECT_ASSIGN
  },
  analytics: {
    id: "analytics",
    path: appPath("analytics"),
    labelKey: "navAnalytics",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  knowledge: {
    id: "knowledge",
    path: appPath("knowledge"),
    labelKey: "navKnowledge",
    permission: PERMISSIONS.PROSPECT_READ
  },
  myAccount: {
    id: "my-account",
    path: appPath("my-account"),
    labelKey: "navMyAccount"
  },
  settings: {
    id: "settings",
    path: appPath("settings"),
    labelKey: "navSettings",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ORG_READ
  },
  adminUsers: {
    id: "admin-users",
    path: appPath("admin/users"),
    labelKey: "navAdminUsers",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ADMIN_USERS
  },
  operationsCenter: {
    id: "operations-center",
    path: appPath("operations-center"),
    labelKey: "navOperationsCenter",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.OPERATIONS_ACCESS,
    requiresOperationsAccess: true
  }
});

const NAV_ORDER = Object.freeze({
  [WORKSPACE_TYPES.ADMINISTRATOR]: [
    "executiveDashboard",
    "quickCapture",
    "missionControl",
    "prospectCenter",
    "conversations",
    "appointments",
    "followUps",
    "analytics",
    "knowledge",
    "myAccount",
    "settings",
    "adminUsers",
    "operationsCenter"
  ],
  [WORKSPACE_TYPES.REPRESENTATIVE]: [
    "myDashboard",
    "quickCapture",
    "prospectCenter",
    "conversations",
    "appointments",
    "followUps",
    "knowledge",
    "myAccount"
  ],
  [WORKSPACE_TYPES.MANAGEMENT]: [
    "teamDashboard",
    "missionControl",
    "prospectCenter",
    "production",
    "recruiting",
    "analytics",
    "conversations",
    "myAccount"
  ]
});

export const ROUTE_ACCESS = Object.freeze({
  "executive-dashboard": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  "my-dashboard": {
    workspaceTypes: [WORKSPACE_TYPES.REPRESENTATIVE]
  },
  "team-dashboard": {
    workspaceTypes: [WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  "mission-control": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.PROSPECT_READ
  },
  "prospect-center": { permission: PERMISSIONS.PROSPECT_READ },
  "prospect-workspace": { permission: PERMISSIONS.PROSPECT_READ },
  "quick-capture": { permission: PERMISSIONS.PROSPECT_WRITE },
  conversations: { permission: PERMISSIONS.PROSPECT_COMMUNICATE },
  appointments: { permission: PERMISSIONS.PROSPECT_READ },
  "follow-ups": { permission: PERMISSIONS.PROSPECT_READ },
  production: {
    workspaceTypes: [WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  recruiting: {
    workspaceTypes: [WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.PROSPECT_ASSIGN
  },
  analytics: {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  knowledge: { permission: PERMISSIONS.PROSPECT_READ },
  settings: {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ORG_READ
  },
  "admin/users": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ADMIN_USERS
  },
  "operations-center": {
    permission: PERMISSIONS.OPERATIONS_ACCESS,
    requiresOperationsAccess: true
  },
  "my-account": {}
});

function canSeeNavItem(def, user, workspaceType, operationsAllowed) {
  if (def.workspaceTypes && !def.workspaceTypes.includes(workspaceType)) {
    return false;
  }

  if (def.permission && !roleHasPermission(user?.role, def.permission)) {
    return false;
  }

  if (def.requiresOperationsAccess && !operationsAllowed) {
    return false;
  }

  return true;
}

export function buildNavItemsForUser(user, { operationsAllowed = false } = {}) {
  if (!user) {
    return [];
  }

  const workspaceType = resolveWorkspaceType(user.role);
  const order = NAV_ORDER[workspaceType] || NAV_ORDER[WORKSPACE_TYPES.REPRESENTATIVE];

  return order
    .map((key) => NAV_ITEM_DEFS[key])
    .filter((def) => canSeeNavItem(def, user, workspaceType, operationsAllowed))
    .map((def) => ({
      path: def.path,
      end: def.end,
      labelKey: def.labelKeyByWorkspace?.[workspaceType] || def.labelKey
    }));
}

export function canAccessRoute(routeKey, user, { operationsAllowed = false } = {}) {
  if (!user) {
    return false;
  }

  const rule = ROUTE_ACCESS[routeKey];

  if (!rule) {
    return true;
  }

  const workspaceType = resolveWorkspaceType(user.role);

  if (rule.workspaceTypes && !rule.workspaceTypes.includes(workspaceType)) {
    return false;
  }

  if (rule.permission && !roleHasPermission(user.role, rule.permission)) {
    return false;
  }

  if (rule.requiresOperationsAccess && !operationsAllowed) {
    return false;
  }

  return true;
}

export function resolveRouteKey(pathname) {
  const base = appPath();
  const relative = pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\//, "")
    : pathname.replace(/^\//, "");

  if (!relative) {
    return "";
  }

  const normalized = relative.split("/").filter(Boolean);

  if (normalized[0] === "operations-center") {
    return "operations-center";
  }

  if (normalized[0] === "admin" && normalized[1] === "users") {
    return "admin/users";
  }

  if (normalized[0] === "prospect-workspace") {
    return "prospect-workspace";
  }

  if (normalized[0] === "settings") {
    return "settings";
  }

  return normalized[0];
}
