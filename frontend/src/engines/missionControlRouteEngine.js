/**
 * Pure Mission Control route/query builders (no app route dependencies).
 * Keeps executive navigation helpers testable under node --test.
 */

export const MISSION_CONTROL_QUERY_KEYS = Object.freeze({
  FILTER: "filter",
  PHONE: "phone",
  PROSPECT_ID: "prospectId",
  SORT: "sort",
  AUTOSELECT: "autoselect",
  OWNER: "owner",
  TEAM: "team",
  DATE: "date"
});

export function buildMissionControlQuery({
  filter,
  phone,
  prospectId,
  sort,
  autoselect,
  owner,
  team,
  date
} = {}) {
  const params = new URLSearchParams();

  if (filter) {
    params.set(MISSION_CONTROL_QUERY_KEYS.FILTER, filter);
  }

  if (phone) {
    params.set(MISSION_CONTROL_QUERY_KEYS.PHONE, phone);
  }

  if (prospectId) {
    params.set(MISSION_CONTROL_QUERY_KEYS.PROSPECT_ID, String(prospectId));
  }

  if (sort) {
    params.set(MISSION_CONTROL_QUERY_KEYS.SORT, sort);
  }

  if (autoselect) {
    params.set(MISSION_CONTROL_QUERY_KEYS.AUTOSELECT, autoselect);
  }

  if (owner) {
    params.set(MISSION_CONTROL_QUERY_KEYS.OWNER, owner);
  }

  if (team) {
    params.set(MISSION_CONTROL_QUERY_KEYS.TEAM, team);
  }

  if (date) {
    params.set(MISSION_CONTROL_QUERY_KEYS.DATE, date);
  }

  return params.toString();
}

/**
 * Resolve which phone Mission Control should focus from deep-link params.
 * Prefer explicit phone; otherwise map canonical prospectId → phone via dashboard prospects
 * (already tenant/RVP filtered by getDashboard). Presentation/routing only.
 */
export function resolveMissionControlFocusPhone({
  phone = null,
  prospectId = null,
  prospects = []
} = {}) {
  if (phone) {
    return phone;
  }

  if (!prospectId || !Array.isArray(prospects) || !prospects.length) {
    return null;
  }

  const match = prospects.find(
    (prospect) => String(prospect?.id || "") === String(prospectId)
  );
  return match?.phone || null;
}
