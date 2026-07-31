import test from "node:test";
import assert from "node:assert/strict";
import {
  MISSION_CONTROL_QUERY_KEYS,
  buildMissionControlQuery
} from "./missionControlRouteEngine.js";

const EXECUTIVE_FILTERS = {
  INTERVIEWS_TODAY: "interviews-today",
  HIGH_PRIORITY: "high-priority"
};

test("buildMissionControlQuery serializes executive filters and future queue params", () => {
  assert.equal(
    buildMissionControlQuery({ filter: EXECUTIVE_FILTERS.INTERVIEWS_TODAY }),
    `${MISSION_CONTROL_QUERY_KEYS.FILTER}=${EXECUTIVE_FILTERS.INTERVIEWS_TODAY}`
  );

  assert.equal(
    buildMissionControlQuery({
      filter: EXECUTIVE_FILTERS.HIGH_PRIORITY,
      phone: "+15555550100",
      sort: "priority",
      autoselect: "first",
      owner: "4TJLK",
      team: "vision-a",
      date: "2026-07-31"
    }),
    [
      `${MISSION_CONTROL_QUERY_KEYS.FILTER}=${EXECUTIVE_FILTERS.HIGH_PRIORITY}`,
      `${MISSION_CONTROL_QUERY_KEYS.PHONE}=%2B15555550100`,
      `${MISSION_CONTROL_QUERY_KEYS.SORT}=priority`,
      `${MISSION_CONTROL_QUERY_KEYS.AUTOSELECT}=first`,
      `${MISSION_CONTROL_QUERY_KEYS.OWNER}=4TJLK`,
      `${MISSION_CONTROL_QUERY_KEYS.TEAM}=vision-a`,
      `${MISSION_CONTROL_QUERY_KEYS.DATE}=2026-07-31`
    ].join("&")
  );
});
