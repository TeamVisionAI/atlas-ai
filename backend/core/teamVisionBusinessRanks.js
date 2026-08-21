/**
 * Team Vision business rank hierarchy (distinct from LC1 permission roles).
 * RVP → SRL → RL → DIV → DIS → REP
 */

const BUSINESS_RANKS = Object.freeze({
  RVP: "RVP",
  SRL: "SRL",
  RL: "RL",
  DIV: "DIV",
  DIS: "DIS",
  REP: "REP"
});

const BUSINESS_RANK_ORDER = Object.freeze([
  BUSINESS_RANKS.RVP,
  BUSINESS_RANKS.SRL,
  BUSINESS_RANKS.RL,
  BUSINESS_RANKS.DIV,
  BUSINESS_RANKS.DIS,
  BUSINESS_RANKS.REP
]);

const BUSINESS_RANK_LABELS = Object.freeze({
  [BUSINESS_RANKS.RVP]: "RVP — Regional Vice President",
  [BUSINESS_RANKS.SRL]: "SRL — Senior Regional Leader",
  [BUSINESS_RANKS.RL]: "RL — Regional Leader",
  [BUSINESS_RANKS.DIV]: "DIV — Division Leader",
  [BUSINESS_RANKS.DIS]: "DIS — District Leader",
  [BUSINESS_RANKS.REP]: "REP — Representative"
});

/** Default LC1 permission role for each business rank (never admin by default). */
const BUSINESS_RANK_DEFAULT_PERMISSION_ROLE = Object.freeze({
  [BUSINESS_RANKS.RVP]: "rvp",
  [BUSINESS_RANKS.SRL]: "division_leader",
  [BUSINESS_RANKS.RL]: "division_leader",
  [BUSINESS_RANKS.DIV]: "division_leader",
  [BUSINESS_RANKS.DIS]: "agent",
  [BUSINESS_RANKS.REP]: "recruiter"
});

function normalizeBusinessRank(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (BUSINESS_RANK_ORDER.includes(raw)) {
    return raw;
  }

  const aliases = {
    REGIONAL_VICE_PRESIDENT: BUSINESS_RANKS.RVP,
    SENIOR_REGIONAL_LEADER: BUSINESS_RANKS.SRL,
    REGIONAL_LEADER: BUSINESS_RANKS.RL,
    DIVISION_LEADER: BUSINESS_RANKS.DIV,
    DISTRICT_LEADER: BUSINESS_RANKS.DIS,
    REPRESENTATIVE: BUSINESS_RANKS.REP,
    AGENT: BUSINESS_RANKS.REP
  };

  return aliases[raw] || null;
}

function defaultPermissionRoleForBusinessRank(rank) {
  const normalized = normalizeBusinessRank(rank);
  return normalized ? BUSINESS_RANK_DEFAULT_PERMISSION_ROLE[normalized] : null;
}

function listBusinessRanks() {
  return BUSINESS_RANK_ORDER.map((code) => ({
    code,
    label: BUSINESS_RANK_LABELS[code],
    defaultPermissionRole: BUSINESS_RANK_DEFAULT_PERMISSION_ROLE[code]
  }));
}

module.exports = {
  BUSINESS_RANKS,
  BUSINESS_RANK_ORDER,
  BUSINESS_RANK_LABELS,
  BUSINESS_RANK_DEFAULT_PERMISSION_ROLE,
  normalizeBusinessRank,
  defaultPermissionRoleForBusinessRank,
  listBusinessRanks
};
