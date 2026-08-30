/**
 * BR-178 — once a durable follow-up exists for a prospect, hide the derived legacy row.
 */

function coverageKeysForDurable(item = {}) {
  return [item.phone, item.entityId, item.subjectPhone]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function coverageKeysForLegacy(item = {}) {
  return [item.phone, item.entityId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function isLegacyCoveredByDurable(durableItems = [], legacyItem = {}) {
  const covered = new Set((durableItems || []).flatMap(coverageKeysForDurable));
  return coverageKeysForLegacy(legacyItem).some((key) => covered.has(key));
}

module.exports = {
  coverageKeysForDurable,
  coverageKeysForLegacy,
  isLegacyCoveredByDurable
};
