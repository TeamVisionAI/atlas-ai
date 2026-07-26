/**
 * Sprint 18.2 — Organization hierarchy levels (informational only).
 * Do NOT couple business logic to organization level.
 */

const ORGANIZATION_LEVELS = Object.freeze({
  RVP: "RVP",
  SVP: "SVP",
  NSD: "NSD",
  SNSD: "SNSD"
});

const ORGANIZATION_LEVEL_VALUES = Object.freeze(Object.values(ORGANIZATION_LEVELS));

function isValidOrganizationLevel(level) {
  return ORGANIZATION_LEVEL_VALUES.includes(level);
}

module.exports = {
  ORGANIZATION_LEVELS,
  ORGANIZATION_LEVEL_VALUES,
  isValidOrganizationLevel
};
