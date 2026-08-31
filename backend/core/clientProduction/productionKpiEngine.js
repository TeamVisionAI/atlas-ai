/**
 * BR-194 — KPI rollups from canonical atlas_client_production only.
 * Never compute premium in Clients, dashboards, or widgets separately.
 * Monetary totals are currency-safe. Hierarchy scopes are Mine / Team / Organization
 * (plus permission-gated platform). District / Division / Regional / RVP named
 * groups are not claimed — Atlas hierarchy is org / subtree / self only.
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

function resolveCurrency(item) {
  const raw = String(item?.currency || "USD")
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : "USD";
}

function isAgendaConversion(item) {
  return (
    String(item?.source || "") === PRODUCTION_SOURCES.AGENDA_CLIENT_CONVERSION ||
    Boolean(item?.appointmentId)
  );
}

function emptyMoneyBucket() {
  return { production: 0, averagePremium: null, premiumCount: 0 };
}

function summarizeRecords(items = []) {
  const countable = (items || []).filter(isCountable);
  const clientIds = new Set();
  const monetaryByCurrency = {};
  let conversions = 0;

  for (const item of countable) {
    if (item.clientId) clientIds.add(String(item.clientId));
    const amount = numericAmount(item);
    if (amount != null) {
      const currency = resolveCurrency(item);
      if (!monetaryByCurrency[currency]) {
        monetaryByCurrency[currency] = emptyMoneyBucket();
      }
      monetaryByCurrency[currency].production += amount;
      monetaryByCurrency[currency].premiumCount += 1;
    }
    if (isAgendaConversion(item)) conversions += 1;
  }

  for (const bucket of Object.values(monetaryByCurrency)) {
    bucket.averagePremium =
      bucket.premiumCount > 0 ? bucket.production / bucket.premiumCount : null;
  }

  const currencies = Object.keys(monetaryByCurrency);
  const singleCurrency = currencies.length === 1;
  const emptyMoney = currencies.length === 0;
  const single = singleCurrency ? monetaryByCurrency[currencies[0]] : null;

  return {
    personalProduction: emptyMoney ? 0 : single ? single.production : null,
    teamProduction: emptyMoney ? 0 : single ? single.production : null,
    averagePremium: single ? single.averagePremium : null,
    currency: singleCurrency ? currencies[0] : null,
    mixedCurrency: currencies.length > 1,
    monetaryByCurrency,
    clientCount: clientIds.size,
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
 * Team is the actor's reports_to subtree (hierarchyUserIds).
 * It is never silently expanded to the whole organization.
 */
function resolveTeamOwnerIds(authContext) {
  const userId = authContext?.userId || null;
  if (Array.isArray(authContext?.hierarchyUserIds) && authContext.hierarchyUserIds.length > 0) {
    return authContext.hierarchyUserIds.map(String);
  }
  return userId ? [String(userId)] : [];
}

/**
 * Resolve owner filter for a KPI rollup.
 * Supported: mine | team | organization | platform.
 * Unsupported names (district/division/regional/rvp) fall back to mine — not org-wide.
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

  if (requested === PRODUCTION_KPI_SCOPES.ORGANIZATION) {
    if (!canViewOrgProduction(authContext)) {
      const error = new Error("Organization production rollup is not permitted.");
      error.code = "PRODUCTION_ROLLUP_FORBIDDEN";
      error.publicCode = "PRODUCTION_ROLLUP_FORBIDDEN";
      error.statusCode = 403;
      throw error;
    }
    return { scope: requested, organizationScoped: true, ownerUserIds: null };
  }

  if (requested === PRODUCTION_KPI_SCOPES.TEAM) {
    if (!canViewTeamProduction(authContext)) {
      return {
        scope: PRODUCTION_KPI_SCOPES.MINE,
        organizationScoped: true,
        ownerUserIds: userId ? [userId] : []
      };
    }
    return {
      scope: PRODUCTION_KPI_SCOPES.TEAM,
      organizationScoped: true,
      ownerUserIds: resolveTeamOwnerIds(authContext)
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
  resolveTeamOwnerIds,
  canViewPlatformProduction,
  canViewOrgProduction,
  canViewTeamProduction,
  assertTenantIsolation,
  isAgendaConversion,
  resolveCurrency
};
