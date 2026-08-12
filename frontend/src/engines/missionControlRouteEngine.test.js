import test from "node:test";
import assert from "node:assert/strict";
import {
  MISSION_CONTROL_QUERY_KEYS,
  buildMissionControlQuery,
  resolveMissionControlFocusPhone
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
      prospectId: "29853100-f151-4ca8-b07d-624fd20c6685",
      sort: "priority",
      autoselect: "first",
      owner: "4TJLK",
      team: "vision-a",
      date: "2026-07-31"
    }),
    [
      `${MISSION_CONTROL_QUERY_KEYS.FILTER}=${EXECUTIVE_FILTERS.HIGH_PRIORITY}`,
      `${MISSION_CONTROL_QUERY_KEYS.PHONE}=%2B15555550100`,
      `${MISSION_CONTROL_QUERY_KEYS.PROSPECT_ID}=29853100-f151-4ca8-b07d-624fd20c6685`,
      `${MISSION_CONTROL_QUERY_KEYS.SORT}=priority`,
      `${MISSION_CONTROL_QUERY_KEYS.AUTOSELECT}=first`,
      `${MISSION_CONTROL_QUERY_KEYS.OWNER}=4TJLK`,
      `${MISSION_CONTROL_QUERY_KEYS.TEAM}=vision-a`,
      `${MISSION_CONTROL_QUERY_KEYS.DATE}=2026-07-31`
    ].join("&")
  );
});

test("buildMissionControlQuery supports prospectId-only Conversations deep link", () => {
  assert.equal(
    buildMissionControlQuery({
      prospectId: "29853100-f151-4ca8-b07d-624fd20c6685"
    }),
    `${MISSION_CONTROL_QUERY_KEYS.PROSPECT_ID}=29853100-f151-4ca8-b07d-624fd20c6685`
  );
});

test("resolveMissionControlFocusPhone prefers phone then maps prospectId", () => {
  const prospects = [
    { id: "aaa", phone: "+15555550111" },
    { id: "bbb", phone: "+15555550222" }
  ];

  assert.equal(
    resolveMissionControlFocusPhone({
      phone: "+15555550999",
      prospectId: "aaa",
      prospects
    }),
    "+15555550999"
  );

  assert.equal(
    resolveMissionControlFocusPhone({
      prospectId: "bbb",
      prospects
    }),
    "+15555550222"
  );

  assert.equal(
    resolveMissionControlFocusPhone({
      prospectId: "missing",
      prospects
    }),
    null
  );
});
