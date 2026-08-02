/**
 * Sprint 20.0 — Workspace navigation, landing pages, and route access.
 *
 * Business nav is capability-based: core recruiting modules appear for every role
 * that holds the required permission. Leadership adds dashboards and extensions;
 * it never removes core Business capabilities (Architecture Guide §4, §13).
 */

import { appPath } from "./appRoutes";
import { isMetaReviewModeEnabled } from "./metaReviewMode";
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
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
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
  },
  whatsapp: {
    id: "whatsapp",
    path: appPath("settings/whatsapp"),
    labelKey: "navWhatsApp"
  },
  metaReviewSettings: {
    id: "settings",
    path: appPath("settings"),
    labelKey: "navSettings"
  }
});

/** Meta App Review — sidebar surfaces only (Dashboard, Prospects, Mission Control, WhatsApp, Settings). */
const META_REVIEW_LANDING_NAV = Object.freeze({
  [WORKSPACE_TYPES.ADMINISTRATOR]: "executiveDashboard",
  [WORKSPACE_TYPES.MANAGEMENT]: "teamDashboard",
  [WORKSPACE_TYPES.REPRESENTATIVE]: "myDashboard"
});

const META_REVIEW_ALLOWED_ROUTE_KEYS = new Set([
  "executive-dashboard",
  "my-dashboard",
  "team-dashboard",
  "mission-control",
  "prospect-center",
  "prospect-workspace",
  "prospect",
  "settings",
  "settings/profile",
  "settings/integrations",
  "settings/whatsapp",
  "settings/whatsapp/success",
  "settings/whatsapp/error",
  "settings/review-users"
]);

function getMetaReviewLandingNavKey(workspaceType) {
  return META_REVIEW_LANDING_NAV[workspaceType] || META_REVIEW_LANDING_NAV[WORKSPACE_TYPES.REPRESENTATIVE];
}

function buildMetaReviewNavItems(user, workspaceType) {
  const landingKey = getMetaReviewLandingNavKey(workspaceType);
  const landingDef = NAV_ITEM_DEFS[landingKey];

  const items = [
    {
      path: landingDef.path,
      end: landingDef.end,
      labelKey: "navDashboard"
    },
    {
      path: NAV_ITEM_DEFS.prospectCenter.path,
      end: NAV_ITEM_DEFS.prospectCenter.end,
      labelKey: "navProspects"
    },
    {
      path: NAV_ITEM_DEFS.missionControl.path,
      end: NAV_ITEM_DEFS.missionControl.end,
      labelKey: NAV_ITEM_DEFS.missionControl.labelKey
    },
    {
      path: NAV_ITEM_DEFS.whatsapp.path,
      end: NAV_ITEM_DEFS.whatsapp.end,
      labelKey: NAV_ITEM_DEFS.whatsapp.labelKey
    }
  ];

  const settingsPath = canAccessRoute("settings", user)
    ? appPath("settings")
    : appPath("settings/profile");

  items.push({
    path: settingsPath,
    end: settingsPath === appPath("settings"),
    labelKey: NAV_ITEM_DEFS.metaReviewSettings.labelKey
  });

  return items;
}

export function isRouteAllowedInMetaReview(routeKey) {
  return META_REVIEW_ALLOWED_ROUTE_KEYS.has(routeKey);
}

/** Core Business capabilities — visible when the user has the module permission. */
const BUSINESS_CORE_NAV_ORDER = Object.freeze([
  "quickCapture",
  "missionControl",
  "prospectCenter",
  "conversations",
  "appointments",
  "followUps",
  "knowledge"
]);

const WORKSPACE_LANDING_NAV = Object.freeze({
  [WORKSPACE_TYPES.ADMINISTRATOR]: ["executiveDashboard"],
  [WORKSPACE_TYPES.MANAGEMENT]: ["teamDashboard"],
  [WORKSPACE_TYPES.REPRESENTATIVE]: ["myDashboard"]
});

/** Leadership extensions beyond core Business (still permission-gated). */
const LEADERSHIP_EXTENSION_NAV = Object.freeze({
  [WORKSPACE_TYPES.ADMINISTRATOR]: ["analytics"],
  [WORKSPACE_TYPES.MANAGEMENT]: ["production", "recruiting", "analytics"],
  [WORKSPACE_TYPES.REPRESENTATIVE]: []
});

/** Administration surfaces — configuration and platform operations. */
const ADMINISTRATION_NAV = Object.freeze({
  [WORKSPACE_TYPES.ADMINISTRATOR]: ["settings", "adminUsers", "operationsCenter"],
  [WORKSPACE_TYPES.MANAGEMENT]: ["settings"],
  [WORKSPACE_TYPES.REPRESENTATIVE]: []
});

function buildNavOrderForWorkspace(workspaceType) {
  return [
    ...(WORKSPACE_LANDING_NAV[workspaceType] || WORKSPACE_LANDING_NAV[WORKSPACE_TYPES.REPRESENTATIVE]),
    ...BUSINESS_CORE_NAV_ORDER,
    ...(LEADERSHIP_EXTENSION_NAV[workspaceType] || []),
    ...(ADMINISTRATION_NAV[workspaceType] || [])
  ];
}

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
  "mission-control": { permission: PERMISSIONS.PROSPECT_READ },
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
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/profile": {},
  "settings/integrations": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/organization": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/scheduling": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/appointments": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/whatsapp": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/whatsapp/success": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/whatsapp/error": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/review-users": {
    permission: PERMISSIONS.ADMIN_USERS
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

  if (isMetaReviewModeEnabled()) {
    return buildMetaReviewNavItems(user, workspaceType);
  }

  const order = buildNavOrderForWorkspace(workspaceType);

  return order
    .map((key) => NAV_ITEM_DEFS[key])
    .filter((def) => canSeeNavItem(def, user, workspaceType, operationsAllowed))
    .map((def) => ({
      path: def.path,
      end: def.end,
      labelKey: def.labelKeyByWorkspace?.[workspaceType] || def.labelKey
    }));
}

export function canManageUsers(user) {
  return roleHasPermission(user?.role, PERMISSIONS.ADMIN_USERS);
}

export function getUserManagementPath() {
  if (isMetaReviewModeEnabled()) {
    return appPath("settings/review-users");
  }

  return appPath("admin/users");
}

export function canAccessRoute(routeKey, user, { operationsAllowed = false } = {}) {
  if (!user) {
    return false;
  }

  if (routeKey === "settings/review-users" && !isMetaReviewModeEnabled()) {
    return false;
  }

  if (isMetaReviewModeEnabled()) {
    if (routeKey === "admin/users") {
      return false;
    }

    if (routeKey === "settings/profile" || routeKey === "settings/integrations") {
      return true;
    }

    if (routeKey === "settings/review-users") {
      return canManageUsers(user);
    }

    if (routeKey.startsWith("settings/whatsapp")) {
      return true;
    }

    if (!isRouteAllowedInMetaReview(routeKey)) {
      return false;
    }
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
    if (normalized.length === 1) {
      return "settings";
    }

    if (normalized[1] === "whatsapp") {
      if (normalized[2] === "success") {
        return "settings/whatsapp/success";
      }

      if (normalized[2] === "error") {
        return "settings/whatsapp/error";
      }

      return "settings/whatsapp";
    }

    return `settings/${normalized[1]}`;
  }

  return normalized[0];
}

const SETTINGS_HUB_SECTIONS = Object.freeze([
  {
    id: "profile",
    routeKey: "settings/profile",
    path: appPath("settings/profile"),
    titleKey: "profile",
    descriptionKey: "configurationHubProfileDescription",
    icon: "profile",
    workspaceTypes: null
  },
  {
    id: "organization",
    routeKey: "settings/organization",
    path: appPath("settings/organization"),
    titleKey: "organization",
    descriptionKey: "configurationHubOrganizationDescription",
    icon: "organization",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.ORG_READ
  },
  {
    id: "integrations",
    routeKey: "settings/integrations",
    path: appPath("settings/integrations"),
    titleKey: "integrations",
    descriptionKey: "configurationHubIntegrationsDescription",
    icon: "integrations",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.ORG_READ
  },
  {
    id: "scheduling",
    routeKey: "settings/scheduling",
    path: appPath("settings/scheduling"),
    titleKey: "scheduling",
    descriptionKey: "configurationHubSchedulingDescription",
    icon: "scheduling",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ORG_READ
  },
  {
    id: "appointments",
    routeKey: "settings/appointments",
    path: appPath("settings/appointments"),
    titleKey: "appointments",
    descriptionKey: "configurationHubAppointmentsDescription",
    icon: "scheduling",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ORG_READ
  },
  {
    id: "review-users",
    routeKey: "settings/review-users",
    path: appPath("settings/review-users"),
    titleKey: "reviewUsers",
    descriptionKey: "configurationHubReviewUsersDescription",
    icon: "organization",
    permission: PERMISSIONS.ADMIN_USERS,
    metaReviewOnly: true
  }
]);

function canAccessSettingsSection(def, user, workspaceType) {
  if (def.workspaceTypes && !def.workspaceTypes.includes(workspaceType)) {
    return false;
  }

  if (def.permission && !roleHasPermission(user?.role, def.permission)) {
    return false;
  }

  return true;
}

const META_REVIEW_SETTINGS_SECTION_IDS = new Set(["profile", "integrations"]);

export function buildSettingsHubSections(user, settingsSections) {
  if (!user) {
    return [];
  }

  const workspaceType = resolveWorkspaceType(user.role);

  let sections = SETTINGS_HUB_SECTIONS.filter((def) => canAccessSettingsSection(def, user, workspaceType));

  if (isMetaReviewModeEnabled()) {
    sections = SETTINGS_HUB_SECTIONS.filter((def) => {
      if (def.metaReviewOnly) {
        return canAccessSettingsSection(def, user, workspaceType);
      }

      if (!META_REVIEW_SETTINGS_SECTION_IDS.has(def.id)) {
        return false;
      }

      if (def.id === "profile" || def.id === "integrations") {
        return true;
      }

      return canAccessSettingsSection(def, user, workspaceType);
    });

    if (sections.length === 0) {
      sections = SETTINGS_HUB_SECTIONS.filter((def) => def.id === "profile");
    }
  }

  return sections.map(
    (def) => ({
      to: def.path,
      title: settingsSections[def.titleKey] || def.titleKey,
      descriptionKey: def.descriptionKey,
      icon: def.icon
    })
  );
}

export function buildSettingsNavItems(user, settingsSections) {
  return buildSettingsHubSections(user, settingsSections).map((section) => ({
    to: section.to,
    label: section.title,
    icon: section.icon,
    end: false
  }));
}

export function getSettingsPathForUser(user) {
  if (!user) {
    return appPath("settings");
  }

  if (canAccessRoute("settings", user)) {
    return appPath("settings");
  }

  return appPath("settings/profile");
}
