/**
 * Sprint 8A.5 — Excludes simulator prospects from production Mission Control surfaces.
 * Simulator phones use the `sim-` prefix (see dev/simulatorSafety.js).
 */

const SIMULATOR_PHONE_PREFIX = "sim-";

function isSimulatorProspect(phone) {
  return Boolean(phone && String(phone).startsWith(SIMULATOR_PHONE_PREFIX));
}

function isProductionProspect(phone) {
  return Boolean(phone) && !isSimulatorProspect(phone);
}

function filterProductionProspects(prospects = []) {
  return prospects.filter((prospect) => isProductionProspect(prospect?.phone));
}

module.exports = {
  SIMULATOR_PHONE_PREFIX,
  isSimulatorProspect,
  isProductionProspect,
  filterProductionProspects
};
