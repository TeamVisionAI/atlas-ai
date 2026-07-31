/**
 * Pure Mission Control route/query builders (no app route dependencies).
 * Keeps executive navigation helpers testable under node --test.
 */

export const MISSION_CONTROL_QUERY_KEYS = Object.freeze({
  FILTER: "filter",
  PHONE: "phone",
  SORT: "sort",
  AUTOSELECT: "autoselect",
  OWNER: "owner",
  TEAM: "team",
  DATE: "date"
});

export function buildMissionControlQuery({
  filter,
  phone,
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
