/**
 * Sprint 20.0 — Workspace navigation, landing pages, and route access.
 *
 * Business nav is capability-based: core recruiting modules appear for every role
 * that holds the required permission. Leadership adds dashboards and extensions;
 * it never removes core Business capabilities (Architecture Guide §4, §13).
 */

import { appPath } from "./appRoutes";
import { normalizeRole, roleHasPermission, ROLES, PERMISSIONS } from "../security/workspacePermissions";
import { isSuperAdminUser } from "../security/isSuperAdminUser";

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

/** User-facing title prefers business_rank over LC1 permission role. */
export function getDisplayTitleLabelKey(user) {
  if (isSuperAdminUser(user)) {
    return "workspaceRoleSuperAdmin";
  }

  const rank = String(user?.business_rank || user?.businessRank || "")
    .trim()
    .toUpperCase();

  const rankKeys = {
    RVP: "businessRankRvp",
    SRL: "businessRankSrl",
    RL: "businessRankRl",
    DIV: "businessRankDiv",
    DIS: "businessRankDis",
    REP: "businessRankRep"
  };

  if (rankKeys[rank]) {
    return rankKeys[rank];
  }

  return getRoleLabelKey(user?.role);
}

export function getWorkspaceLabelKey(workspaceType) {
  const keys = {
    [WORKSPACE_TYPES.ADMINISTRATOR]: "workspaceLabelAdministrator",
    [WORKSPACE_TYPES.MANAGEMENT]: "workspaceLabelManagement",
    [WORKSPACE_TYPES.REPRESENTATIVE]: "workspaceLabelRepresentative"
  };

  return keys[workspaceType] || "workspaceLabelRepresentative";
}

/** BR-149 — RVP/Admin → Executive; SRL/RL/DIV/DIS/REP → Team Dashboard. */
export function getDefaultLandingPath(role) {
  if (roleHasPermission(role, PERMISSIONS.DASHBOARD_EXECUTIVE)) {
    return appPath("executive-dashboard");
  }

  if (roleHasPermission(role, PERMISSIONS.DASHBOARD_TEAM)) {
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
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
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
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.DASHBOARD_TEAM
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
  today: {
    id: "today",
    path: appPath("today"),
    labelKey: "navToday",
    permission: PERMISSIONS.PROSPECT_READ
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
  clients: {
    id: "clients",
    path: appPath("clients"),
    labelKey: "navClients",
    permission: PERMISSIONS.PROSPECT_READ
  },
  production: {
    id: "production",
    path: appPath("production"),
    labelKey: "navProduction",
    permission: PERMISSIONS.PROSPECT_READ
  },
  service: {
    id: "service",
    path: appPath("service"),
    labelKey: "navService",
    permission: PERMISSIONS.PROSPECT_READ
  },
  policyReviews: {
    id: "policy-reviews",
    path: appPath("policy-reviews"),
    labelKey: "navPolicyReviews",
    permission: PERMISSIONS.PROSPECT_READ
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
    permission: PERMISSIONS.KNOWLEDGE_READ
  },
  policyIntelligence: {
    id: "policy-intelligence",
    path: appPath("policy-intelligence"),
    labelKey: "navPolicyIntelligence",
    permission: PERMISSIONS.POLICY_READ
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
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ]
  },
  adminUsers: {
    id: "admin-users",
    path: appPath("admin/users"),
    labelKey: "navAdminUsers",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
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
  platformTenants: {
    id: "platform-tenants",
    path: appPath("platform/tenants"),
    labelKey: "navPlatformTenants",
    end: true,
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    requiresSuperAdmin: true
  },
  platformAiQuality: {
    id: "platform-ai-quality",
    path: appPath("platform/ai-quality"),
    labelKey: "navAiQuality",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    requiresSuperAdmin: true
  },
  whatsapp: {
    id: "whatsapp",
    path: appPath("settings/whatsapp"),
    labelKey: "navWhatsApp"
  }
});

/** Core Business capabilities — visible when the user has the module permission. BR-207 presentation order. */
const BUSINESS_CORE_NAV_ORDER = Object.freeze([
  "quickCapture",
  "missionControl",
  "prospectCenter",
  "conversations",
  "today",
  "appointments",
  "followUps",
  "clients",
  "production",
  "service",
  "knowledge",
  "policyIntelligence",
  "policyReviews"
]);

const WORKSPACE_LANDING_NAV = Object.freeze({
  [WORKSPACE_TYPES.ADMINISTRATOR]: ["executiveDashboard", "teamDashboard"],
  [WORKSPACE_TYPES.MANAGEMENT]: ["executiveDashboard", "teamDashboard"],
  [WORKSPACE_TYPES.REPRESENTATIVE]: ["teamDashboard", "myDashboard"]
});

/** Leadership extensions beyond core Business (still permission-gated). */
const LEADERSHIP_EXTENSION_NAV = Object.freeze({
  [WORKSPACE_TYPES.ADMINISTRATOR]: ["analytics"],
  [WORKSPACE_TYPES.MANAGEMENT]: ["recruiting", "analytics"],
  [WORKSPACE_TYPES.REPRESENTATIVE]: []
});

/** Administration surfaces — configuration and platform operations. */
const ADMINISTRATION_NAV = Object.freeze({
  [WORKSPACE_TYPES.ADMINISTRATOR]: [
    "settings",
    "adminUsers",
    "operationsCenter",
    "platformTenants",
    "platformAiQuality"
  ],
  [WORKSPACE_TYPES.MANAGEMENT]: ["settings", "adminUsers"],
  [WORKSPACE_TYPES.REPRESENTATIVE]: ["settings"]
});

function buildNavOrderForWorkspace(workspaceType) {
  return [
    ...(WORKSPACE_LANDING_NAV[workspaceType] || WORKSPACE_LANDING_NAV[WORKSPACE_TYPES.REPRESENTATIVE]),
    ...BUSINESS_CORE_NAV_ORDER,
    ...(LEADERSHIP_EXTENSION_NAV[workspaceType] || []),
    ...(ADMINISTRATION_NAV[workspaceType] || [])
  ];
}

const USER_MANAGEMENT_ROUTE_RULE = Object.freeze({
  workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
  permission: PERMISSIONS.ADMIN_USERS
});

function matchesRouteAccessRule(rule, user, { operationsAllowed = false } = {}) {
  if (!user) {
    return false;
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

  if (rule.requiresSuperAdmin && !isSuperAdminUser(user)) {
    return false;
  }

  return true;
}

export const ROUTE_ACCESS = Object.freeze({
  "executive-dashboard": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  "my-dashboard": {
    workspaceTypes: [WORKSPACE_TYPES.REPRESENTATIVE]
  },
  "team-dashboard": {
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.DASHBOARD_TEAM
  },
  "mission-control": { permission: PERMISSIONS.PROSPECT_READ },
  "prospect-center": { permission: PERMISSIONS.PROSPECT_READ },
  "prospect-report": { permission: PERMISSIONS.PROSPECT_READ },
  "prospect-workspace": { permission: PERMISSIONS.PROSPECT_READ },
  "quick-capture": { permission: PERMISSIONS.PROSPECT_WRITE },
  conversations: { permission: PERMISSIONS.PROSPECT_COMMUNICATE },
  today: { permission: PERMISSIONS.PROSPECT_READ },
  appointments: { permission: PERMISSIONS.PROSPECT_READ },
  "follow-ups": { permission: PERMISSIONS.PROSPECT_READ },
  clients: { permission: PERMISSIONS.PROSPECT_READ },
  production: { permission: PERMISSIONS.PROSPECT_READ },
  service: { permission: PERMISSIONS.PROSPECT_READ },
  "policy-reviews": { permission: PERMISSIONS.PROSPECT_READ },
  recruiting: {
    workspaceTypes: [WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.PROSPECT_ASSIGN
  },
  analytics: {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.DASHBOARD_EXECUTIVE
  },
  knowledge: { permission: PERMISSIONS.KNOWLEDGE_READ },
  "policy-intelligence": { permission: PERMISSIONS.POLICY_READ },
  settings: {
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ]
  },
  "settings/profile": {},
  "settings/integrations": {
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.INTEGRATIONS_SELF
  },
  "settings/organization": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR, WORKSPACE_TYPES.MANAGEMENT],
    permission: PERMISSIONS.ORG_WRITE
  },
  "settings/scheduling": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/recruiting": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ORG_READ
  },
  "settings/billing": {
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.BILLING_ACCESS
  },
  // BR-147 / BR-110 — personal availability for all recruiting roles
  "settings/appointments": {
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.PROSPECT_WRITE
  },
  "settings/qr-campaigns": {
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.PROSPECT_WRITE
  },
  "settings/whatsapp": {
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.INTEGRATIONS_SELF
  },
  "settings/whatsapp/success": {
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.INTEGRATIONS_SELF
  },
  "settings/whatsapp/error": {
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.INTEGRATIONS_SELF
  },
  "admin/users": USER_MANAGEMENT_ROUTE_RULE,
  "operations-center": {
    permission: PERMISSIONS.OPERATIONS_ACCESS,
    requiresOperationsAccess: true
  },
  "platform/tenants": {
    requiresSuperAdmin: true
  },
  "platform/ai-quality": {
    requiresSuperAdmin: true
  },
  "my-account": {},
  notifications: {}
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

  if (def.requiresSuperAdmin && !isSuperAdminUser(user)) {
    return false;
  }

  return true;
}

export function buildNavItemsForUser(
  user,
  { operationsAllowed = false, conversationsCenterAllowed = null, knowledgeHubAllowed = null } = {}
) {
  if (!user) {
    return [];
  }

  const workspaceType = resolveWorkspaceType(user.role);
  const order = buildNavOrderForWorkspace(workspaceType);

  return order
    .map((key) => NAV_ITEM_DEFS[key])
    .filter((def) => canSeeNavItem(def, user, workspaceType, operationsAllowed))
    .filter((def) => {
      if (def.id === "conversations" && conversationsCenterAllowed === false) {
        return false;
      }
      if (def.id === "knowledge" && knowledgeHubAllowed === false) {
        return false;
      }
      return true;
    })
    .map((def) => ({
      path: def.path,
      end: def.end,
      labelKey: def.labelKeyByWorkspace?.[workspaceType] || def.labelKey
    }));
}

export function canManageUsers(user, options = {}) {
  return matchesRouteAccessRule(USER_MANAGEMENT_ROUTE_RULE, user, options);
}

export function getUserManagementPath() {
  return appPath("admin/users");
}

export function canAccessRoute(routeKey, user, { operationsAllowed = false } = {}) {
  if (!user) {
    return false;
  }

  const rule = ROUTE_ACCESS[routeKey];

  if (!rule) {
    return true;
  }

  return matchesRouteAccessRule(rule, user, { operationsAllowed });
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

  if (normalized[0] === "platform" && normalized[1] === "tenants") {
    return "platform/tenants";
  }

  if (normalized[0] === "platform" && normalized[1] === "ai-quality") {
    return "platform/ai-quality";
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
    permission: PERMISSIONS.ORG_WRITE
  },
  {
    id: "integrations",
    routeKey: "settings/integrations",
    path: appPath("settings/integrations"),
    titleKey: "integrations",
    descriptionKey: "configurationHubIntegrationsDescription",
    icon: "integrations",
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.INTEGRATIONS_SELF
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
    id: "recruiting",
    routeKey: "settings/recruiting",
    path: appPath("settings/recruiting"),
    titleKey: "recruiting",
    descriptionKey: "configurationHubRecruitingDescription",
    icon: "recruiting",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.ORG_READ
  },
  {
    id: "billing",
    routeKey: "settings/billing",
    path: appPath("settings/billing"),
    titleKey: "billing",
    descriptionKey: "configurationHubBillingDescription",
    icon: "billing",
    workspaceTypes: [WORKSPACE_TYPES.ADMINISTRATOR],
    permission: PERMISSIONS.BILLING_ACCESS
  },
  {
    id: "appointments",
    routeKey: "settings/appointments",
    path: appPath("settings/appointments"),
    titleKey: "appointments",
    descriptionKey: "configurationHubAppointmentsDescription",
    icon: "scheduling",
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.PROSPECT_WRITE
  },
  {
    id: "qr-campaigns",
    routeKey: "settings/qr-campaigns",
    path: appPath("settings/qr-campaigns"),
    titleKey: "qrCampaigns",
    descriptionKey: "configurationHubQrCampaignsDescription",
    icon: "integrations",
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT,
      WORKSPACE_TYPES.REPRESENTATIVE
    ],
    permission: PERMISSIONS.PROSPECT_WRITE
  },
  {
    id: "campaign-intake-codes",
    routeKey: "settings/campaign-intake-codes",
    path: appPath("settings/campaign-intake-codes"),
    titleKey: "campaignIntakeCodes",
    descriptionKey: "configurationHubCampaignIntakeCodesDescription",
    icon: "integrations",
    workspaceTypes: [
      WORKSPACE_TYPES.ADMINISTRATOR,
      WORKSPACE_TYPES.MANAGEMENT
    ],
    permission: PERMISSIONS.ORG_WRITE
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

export function buildSettingsHubSections(user, settingsSections) {
  if (!user) {
    return [];
  }

  const workspaceType = resolveWorkspaceType(user.role);

  const sections = SETTINGS_HUB_SECTIONS.filter((def) =>
    canAccessSettingsSection(def, user, workspaceType)
  );

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
