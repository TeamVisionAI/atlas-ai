/**
 * BR-226 — Tenant-scoped recruiting coverage cities.
 * Classification only. Office identity stays on officeAddressResolver (BR-225).
 */

const {
  LOCAL_CITIES,
  normalizeLocalValue
} = require("./localAreaConfig");
const {
  isTeamVisionSeedTenant,
  TEAM_VISION_ORGANIZATION_ID
} = require("./teamVisionSeedTenant");
const { CONFIG_SOURCES } = require("./recruitingConfig/constants");

const SIM_TEAM_VISION_ORGANIZATION_ID = "sim-org-team-vision";

function usesTeamVisionSeedCoverage(organizationId) {
  const orgId = String(organizationId || "").trim();
  return (
    !orgId ||
    isTeamVisionSeedTenant(orgId) ||
    orgId === SIM_TEAM_VISION_ORGANIZATION_ID
  );
}

const COVERAGE_CITY_SOURCES = Object.freeze({
  RECRUITING_CONFIG: "recruiting_config",
  TEAM_VISION_SEED: "team_vision_seed",
  UNAVAILABLE: "unavailable"
});

function normalizeCoverageCity(city = "") {
  return normalizeLocalValue(city);
}

function normalizeCoverageCities(localCities) {
  if (!Array.isArray(localCities)) {
    return [];
  }
  const seen = new Set();
  const cities = [];
  for (const raw of localCities) {
    const normalized = normalizeCoverageCity(raw);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    cities.push(normalized);
  }
  return cities;
}

function hasExplicitCityList(localCities) {
  return Array.isArray(localCities);
}

/**
 * Resolve the city list used for LOCAL / OUTSIDE.
 *
 * 1. explicit localCities (persisted recruitingConfig or test stamp)
 * 2. Team Vision seed list only for the seed tenant or unscoped legacy callers
 * 3. otherwise empty — fail closed to OUTSIDE
 */
function resolveCoverageCities({
  organizationId = null,
  localCities = undefined,
  coverageCitiesSource = null
} = {}) {
  if (hasExplicitCityList(localCities)) {
    return {
      cities: normalizeCoverageCities(localCities),
      source: coverageCitiesSource || COVERAGE_CITY_SOURCES.RECRUITING_CONFIG
    };
  }

  if (usesTeamVisionSeedCoverage(organizationId)) {
    return {
      cities: [...LOCAL_CITIES],
      source: COVERAGE_CITY_SOURCES.TEAM_VISION_SEED
    };
  }

  return {
    cities: [],
    source: COVERAGE_CITY_SOURCES.UNAVAILABLE
  };
}

function isLocalCoverageCity(city, cities = []) {
  const normalized = normalizeCoverageCity(city);
  if (!normalized || !Array.isArray(cities) || cities.length === 0) {
    return false;
  }
  return cities.includes(normalized);
}

function coverageInputFromContext(context = {}, facts = {}) {
  return {
    ...facts,
    city: facts.city || context.knownFacts?.city || null,
    state: facts.state || context.knownFacts?.state || null,
    organizationId: context.organizationId || facts.organizationId || null,
    localCities: Array.isArray(facts.localCities)
      ? facts.localCities
      : context.localCities,
    coverageCitiesSource:
      facts.coverageCitiesSource || context.coverageCitiesSource || null
  };
}

function coverageInputFromProfile(profile = {}, extras = {}) {
  return {
    city: extras.city || profile.city || null,
    state: extras.state || profile.state || null,
    organizationId:
      extras.organizationId ||
      profile.organizationId ||
      profile.organization_id ||
      null,
    localCities:
      extras.localCities !== undefined ? extras.localCities : profile.localCities,
    coverageCitiesSource:
      extras.coverageCitiesSource || profile.coverageCitiesSource || null
  };
}

/**
 * Load persisted recruiting coverage cities. DEFAULT_TEMPLATE is not tenant config.
 */
async function loadTenantCoverageCities(organizationId, deps = {}) {
  const orgId = String(organizationId || "").trim() || null;
  if (!orgId) {
    return {
      localCities: [],
      coverageCitiesSource: COVERAGE_CITY_SOURCES.UNAVAILABLE
    };
  }

  let result = null;
  try {
    const getRecruitingConfig =
      deps.getRecruitingConfig ||
      require("../services/recruitingConfigService").getRecruitingConfig;
    result = await getRecruitingConfig(orgId);
  } catch {
    result = null;
  }

  if (
    result?.persisted === true &&
    result?.source === CONFIG_SOURCES.PERSISTED &&
    Array.isArray(result.config?.coverage?.localCities)
  ) {
    return {
      localCities: normalizeCoverageCities(result.config.coverage.localCities),
      coverageCitiesSource: COVERAGE_CITY_SOURCES.RECRUITING_CONFIG
    };
  }

  if (usesTeamVisionSeedCoverage(orgId)) {
    return {
      localCities: [...LOCAL_CITIES],
      coverageCitiesSource: COVERAGE_CITY_SOURCES.TEAM_VISION_SEED
    };
  }

  return {
    localCities: [],
    coverageCitiesSource: COVERAGE_CITY_SOURCES.UNAVAILABLE
  };
}

module.exports = {
  COVERAGE_CITY_SOURCES,
  normalizeCoverageCity,
  normalizeCoverageCities,
  resolveCoverageCities,
  isLocalCoverageCity,
  coverageInputFromContext,
  coverageInputFromProfile,
  loadTenantCoverageCities,
  usesTeamVisionSeedCoverage,
  SIM_TEAM_VISION_ORGANIZATION_ID,
  TEAM_VISION_ORGANIZATION_ID
};
