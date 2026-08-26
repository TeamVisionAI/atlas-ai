/**
 * Sprint 8A.5 — Excludes simulator prospects from production Mission Control surfaces.
 * BR-159 — operational surfaces also exclude personal/unknown contacts.
 * Simulator phones use the `sim-` prefix (see dev/simulatorSafety.js).
 */

const SIMULATOR_PHONE_PREFIX = "sim-";
const {
  isOperationalProspectRecord,
  filterOperationalProspects
} = require("./prospectPromotionEligibility");

function isSimulatorProspect(phone) {
  return Boolean(phone && String(phone).startsWith(SIMULATOR_PHONE_PREFIX));
}

function isProductionProspect(phone) {
  return Boolean(phone) && !isSimulatorProspect(phone);
}

function filterProductionProspects(prospects = [], options = {}) {
  const production = prospects.filter((prospect) => isProductionProspect(prospect?.phone));
  if (options.operationalOnly === true) {
    return filterOperationalProspects(production);
  }
  return production;
}

module.exports = {
  SIMULATOR_PHONE_PREFIX,
  isSimulatorProspect,
  isProductionProspect,
  isOperationalProspectRecord,
  filterOperationalProspects,
  filterProductionProspects
};
