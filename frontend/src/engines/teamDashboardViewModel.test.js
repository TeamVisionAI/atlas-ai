/**
 * Team Dashboard action-first view model tests.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTeamDashboardAppointments,
  buildTeamDashboardKpis,
  buildTeamDashboardPriorities,
  buildTeamDashboardProduction,
  buildTeamDashboardRecommendation,
  buildTeamDashboardViewModel,
  resolveHasTeamScope,
  resolveUserFirstName
} from "./teamDashboardViewModel.js";

const RL_ID = "rl-1";
const REP_ID = "rep-1";
const OTHER_ID = "other-owner";

const translate = (key, params = {}) => {
  let value = key;
  Object.entries(params).forEach(([name, replacement]) => {
    value = value.replace(`{${name}}`, String(replacement));
  });
  return value;
};

test("resolveUserFirstName prefers first_name", () => {
  assert.equal(resolveUserFirstName({ first_name: "Misleisys", display_name: "Other" }), "Misleisys");
  assert.equal(resolveUserFirstName({ display_name: "Ada Lovelace" }), "Ada");
});

test("resolveHasTeamScope false for self-only scoped prospects", () => {
  const prospects = [
    { owner_user_id: RL_ID, phone: "+1" },
    { owner_user_id: RL_ID, phone: "+2" }
  ];
  assert.equal(resolveHasTeamScope(prospects, RL_ID), false);
});

test("resolveHasTeamScope true when subtree owners present", () => {
  const prospects = [
    { owner_user_id: RL_ID, phone: "+1" },
    { owner_user_id: "rep-1", phone: "+2" }
  ];
  assert.equal(resolveHasTeamScope(prospects, RL_ID), true);
});

test("KPI counts derive from scoped queue/prospects only", () => {
  const reference = new Date("2026-08-22T15:00:00");
  const prospects = [
    {
      owner_user_id: RL_ID,
      phone: "+1",
      created_at: "2026-08-22T10:00:00.000Z"
    },
    {
      owner_user_id: OTHER_ID,
      phone: "+9",
      created_at: "2026-08-22T10:00:00.000Z"
    }
  ];
  const queue = [
    {
      phone: "+1",
      canonicalMilestone: "FOLLOW_UP",
      missionControlPriorityTier: "FOLLOW_UP_DUE",
      missionControlPriority: 2
    }
  ];

  const kpis = buildTeamDashboardKpis({
    queue,
    prospects: prospects.filter((row) => row.owner_user_id === RL_ID),
    todayFocus: { highPriorityProspects: { count: 1 }, interviewsToday: { count: 2 } },
    reference
  });

  assert.equal(kpis.find((row) => row.key === "newProspects").count, 1);
  assert.equal(kpis.find((row) => row.key === "followUps").count, 1);
  assert.equal(kpis.find((row) => row.key === "hot").count, 1);
  assert.match(kpis.find((row) => row.key === "appointments").to, /appointments\?view=today/);
});

test("appointments title adapts to team scope", () => {
  const personal = buildTeamDashboardAppointments({ hasTeamScope: false });
  const team = buildTeamDashboardAppointments({ hasTeamScope: true });
  assert.equal(personal.titleKey, "teamDashAppointmentsMine");
  assert.equal(team.titleKey, "teamDashAppointmentsTeam");
});

test("priorities map to actionable labels", () => {
  const priorities = buildTeamDashboardPriorities({
    queue: [
      {
        phone: "+15551212",
        name: "Misleisys Canary",
        canonicalMilestone: "NEW_LEAD",
        missionControlPriority: 1
      }
    ],
    prospects: [{ phone: "+15551212", name: "Misleisys Canary" }],
    translate: (key) => key
  });

  assert.equal(priorities.length, 1);
  assert.equal(priorities[0].actionLabel, "teamDashActionCallProspect");
  assert.match(priorities[0].openPath, /prospect-workspace/);
});

test("recommendation uses scoped top priority", () => {
  const recommendation = buildTeamDashboardRecommendation(
    [{ name: "Misleisys Canary", phone: "+15551212" }],
    translate
  );

  assert.equal(recommendation.name, "Misleisys Canary");
  assert.equal(recommendation.callHref, "tel:+15551212");
});

test("production panel shows coming soon when workflow missing", () => {
  const production = buildTeamDashboardProduction(null);
  assert.equal(production.available, false);
  assert.equal(production.noteKey, "teamDashProductionComingSoon");
});

test("view model excludes executive-only semantics", () => {
  const model = buildTeamDashboardViewModel(
    {
      prioritizedWorkflowQueue: [{ phone: "+1", canonicalMilestone: "NEW_LEAD", missionControlPriority: 1 }],
      todayFocus: { interviewsToday: { count: 0 }, highPriorityProspects: { count: 1 } },
      recommendations: [{ name: "Canary", phone: "+1" }],
      activity: [{ id: "a1", summary: "Prospect created", phone: "+1", timestamp: "2026-08-22T10:00:00.000Z" }],
      productionSnapshot: { workflow: { todaysAppointments: 1, thisWeekInterviews: 2, recruitCount: 0 } }
    },
    { prospects: [{ owner_user_id: REP_ID, phone: "+1", created_at: "2026-08-22T10:00:00.000Z" }] },
    { id: REP_ID, first_name: "Rep", role: "recruiter" },
    translate
  );

  assert.equal(model.hasTeamScope, false);
  assert.ok(model.kpis.length === 4);
  assert.ok(model.priorities.length >= 1);
  assert.equal(model.appointments.titleKey, "teamDashAppointmentsMine");
  assert.ok(model.recommendation);
  assert.equal(model.activity.length, 1);
  assert.equal(model.agencyPulse, undefined);
});
