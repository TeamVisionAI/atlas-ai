/**
 * Team Vision business ranks (mirrors backend/core/teamVisionBusinessRanks.js).
 * Distinct from LC1 permission roles (administrator / rvp / recruiter / …).
 */

export const BUSINESS_RANKS = Object.freeze({
  RVP: "RVP",
  SRL: "SRL",
  RL: "RL",
  DIV: "DIV",
  DIS: "DIS",
  REP: "REP"
});

export const BUSINESS_RANK_ORDER = Object.freeze([
  BUSINESS_RANKS.RVP,
  BUSINESS_RANKS.SRL,
  BUSINESS_RANKS.RL,
  BUSINESS_RANKS.DIV,
  BUSINESS_RANKS.DIS,
  BUSINESS_RANKS.REP
]);

export const BUSINESS_RANK_LABELS = Object.freeze({
  [BUSINESS_RANKS.RVP]: "RVP — Regional Vice President",
  [BUSINESS_RANKS.SRL]: "SRL — Senior Regional Leader",
  [BUSINESS_RANKS.RL]: "RL — Regional Leader",
  [BUSINESS_RANKS.DIV]: "DIV — Division Leader",
  [BUSINESS_RANKS.DIS]: "DIS — District Leader",
  [BUSINESS_RANKS.REP]: "REP — Representative"
});

export const BUSINESS_RANK_DEFAULT_PERMISSION_ROLE = Object.freeze({
  [BUSINESS_RANKS.RVP]: "rvp",
  [BUSINESS_RANKS.SRL]: "division_leader",
  [BUSINESS_RANKS.RL]: "division_leader",
  [BUSINESS_RANKS.DIV]: "division_leader",
  [BUSINESS_RANKS.DIS]: "agent",
  [BUSINESS_RANKS.REP]: "recruiter"
});

export function listBusinessRanks() {
  return BUSINESS_RANK_ORDER.map((code) => ({
    code,
    label: BUSINESS_RANK_LABELS[code],
    defaultPermissionRole: BUSINESS_RANK_DEFAULT_PERMISSION_ROLE[code]
  }));
}
