/**
 * Sprint 21.2 — Team Vision seed local interview area (Miami-Dade / Broward).
 * BR-226: runtime coverage uses recruitingCoverage.resolveCoverageCities.
 * This list is Team Vision fallback only — never a silent shared tenant default.
 */

const LOCAL_CITIES = [
  "doral",
  "miami",
  "hialeah",
  "homestead",
  "kendall",
  "coral gables",
  "miami beach",
  "fort lauderdale",
  "hollywood",
  "pembroke pines",
  "miramar",
  "weston",
  "davie",
  "plantation",
  "sunrise",
  "miami lakes",
  "miami springs",
  "sweetwater",
  "westchester",
  "south miami",
  "pinecrest",
  "palmetto bay",
  "cutler bay",
  "aventura",
  "sunny isles beach",
  "north miami",
  "north miami beach",
  "tamiami",
  "west miami",
  "medley",
  "virginia gardens"
];

function normalizeLocalValue(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isLocalTeamVisionCity(city = "") {
  return LOCAL_CITIES.includes(normalizeLocalValue(city));
}

module.exports = {
  LOCAL_CITIES,
  normalizeLocalValue,
  isLocalTeamVisionCity
};
