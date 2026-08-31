/**
 * BR-194 — KPI rollups from canonical atlas_client_production only.
 * Never compute premium in Clients, dashboards, or widgets separately.
 * Every tenant rollup is organization-scoped.
 */

const {
  PRODUCTION_METRIC_STATUSES,
  PRODUCTION_SOURCES,
  PRODUCTION_KPI_SCOPES
} = require("./constants");
const { HIERARCHY_MODES } = require("../hierarchyScopeEngine");
const { ROLES } = require("../../security/roles");
const { isSuperAdmin } = require("../../security/saasRoles");

const COUNTABLE = new Set(PRODUCTION_METRIC_STATUSES);

function sameOrg(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function isCountable(item) {
  return COUNTABLE.has(String(item?.status || "").toUpperCase());
}

function numericAmount(item) {
  if (item?.amount == null || item.amount === "") return null;
  const value = Number(item.amount);
  return Number.isFinite(value) ? value : null;
}

function isAgendaConversion(item) {
  return (
    String(item?.source || "") === PRODUCTION_SOURCES.AGENDA_CLIENT_CONVERSION ||
    Boolean(item?.appointmentId)
  );
}

function summarizeRecords(items = []) {
  const countable = (items || []).filter(isCountable);
  const clientIds = new Set();
  let premiumSum = 0;
  let premiumCount = 0;
  let conversions = 0;

  for (const item of countable) {
    if (item.clientId) clientIds.add(String(item.clientId));
    const amount = numericAmount(item);
    if (amount != null) {
      premiumSum += amount;
      premiumCount += 1;
    }
    if (isAgendaConversion(item)) conversions += 1;
  }

  return {
    personalProduction: premiumSum,
    teamProduction: premiumSum,
    clientCount: clientIds.size,
    averagePremium: premiumCount > 0 ? premiumSum / premiumCount : null,
    appointmentToClientConversions: conversions,
    recordCount: countable.length
  };
}

function resolveRequestedKpiScope(requested) {
  const scope = String(requested || PRODUCTION_KPI_SCOPES.MINE)
    .trim()
    .toLowerCase();
  if (Object.values(PRODUCTION_KPI_SCOPES).includes(scope)) {
    return scope;
  }
  return PRODUCTION_KPI_SCOPES.MINE;
}

function canViewOrgProduction(authContext) {
  return (
    authContext?.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
    authContext?.role === ROLES.ADMINISTRATOR ||
    authContext?.role === ROLES.RVP
  );
}

function canViewTeamProduction(authContext) {
  return (
    canViewOrgProduction(authContext) ||
    authContext?.role === ROLES.DIVISION_LEADER ||
    Array.isArray(authContext?.hierarchyUserIds)
  );
}

function canViewPlatformProduction(authContext) {
  if (!authContext) return false;
  if (authContext.controlPlaneOnly === true && authContext.supportModeOrganizationId) {
    return false;
  }
  return isSuperAdmin(authContext.saasRole);
}

/**
 * Resolve owner filter for a KPI rollup. Always organization-scoped except platform.
 */
function resolveKpiOwnerFilter({ authContext, scope } = {}) {
  const requested = resolveRequestedKpiScope(scope);
  const userId = authContext?.userId || null;

  if (requested === PRODUCTION_KPI_SCOPES.PLATFORM) {
    if (!canViewPlatformProduction(authContext)) {
      const error = new Error("Platform production analytics require a platform role.");
      error.code = "PLATFORM_PRODUCTION_FORBIDDEN";
      error.publicCode = "PLATFORM_PRODUCTION_FORBIDDEN";
      error.statusCode = 403;
      throw error;
    }
    return { scope: requested, organizationScoped: false, ownerUserIds: null };
  }

  if (
    requested === PRODUCTION_KPI_SCOPES.ORGANIZATION ||
    requested === PRODUCTION_KPI_SCOPES.RVP
  ) {
    if (!canViewOrgProduction(authContext)) {
      const error = new Error("Organization production rollup is not permitted.");
      error.code = "PRODUCTION_ROLLUP_FORBIDDEN";
      error.publicCode = "PRODUCTION_ROLLUP_FORBIDDEN";
      error.statusCode = 403;
      throw error;
    }
    return { scope: requested, organizationScoped: true, ownerUserIds: null };
  }

  if (
    requested === PRODUCTION_KPI_SCOPES.TEAM ||
    requested === PRODUCTION_KPI_SCOPES.DISTRICT ||
    requested === PRODUCTION_KPI_SCOPES.DIVISION ||
    requested === PRODUCTION_KPI_SCOPES.REGIONAL
  ) {
    if (!canViewTeamProduction(authContext)) {
      return {
        scope: PRODUCTION_KPI_SCOPES.MINE,
        organizationScoped: true,
        ownerUserIds: userId ? [userId] : []
      };
    }
    if (canViewOrgProduction(authContext)) {
      return { scope: requested, organizationScoped: true, ownerUserIds: null };
    }
    return {
      scope: requested,
      organizationScoped: true,
      ownerUserIds: authContext.hierarchyUserIds || (userId ? [userId] : [])
    };
  }

  return {
    scope: PRODUCTION_KPI_SCOPES.MINE,
    organizationScoped: true,
    ownerUserIds: userId ? [userId] : []
  };
}

function assertTenantIsolation(items, organizationId) {
  if (!organizationId) return items || [];
  return (items || []).filter((item) => sameOrg(item.organizationId, organizationId));
}

module.exports = {
  summarizeRecords,
  resolveKpiOwnerFilter,
  canViewPlatformProduction,
  canViewOrgProduction,
  canViewTeamProduction,
  assertTenantIsolation,
  isAgendaConversion
};
