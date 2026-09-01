/**
 * BR-204 — Appointment outcome state synchronization.
 * Synthetic fixtures only. No live tenant writes.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveAppointmentViewFilters,
  matchesListFilters,
  isActiveAppointmentForList,
  isCompletedAppointmentForList,
  resolveAppointmentListStatus,
  selectActivePersistedAppointmentForProspect
} = require("../core/appointmentListQuery");
const { isActiveAppointment } = require("../core/activeAppointmentResolver");
const {
  hasCanonicalRecordedOutcome,
  resolveCanonicalAppointmentOutcome,
  detectOutcomeStateMismatch,
  isRecordedInterviewOutcomeValue
} = require("../core/appointmentOutcomeState");
const { planFollowUpFromOutcome } = require("../core/followUps/outcomePolicy");
const { FOLLOW_UP_SURFACES } = require("../core/followUps/constants");
const { buildTodayFocus } = require("../core/executiveDashboardReadModel");
const { isCompletedAppointmentForList: completedForKpi } = require("../core/appointmentListQuery");
const { SIGNAL_TYPES, DISAGREEMENT_SIGNALS } = require("../core/aiQuality/constants");
const { classifyRisk } = require("../core/aiQuality/riskPolicy");
const { APPOINTMENT_OUTCOMES } = require("../core/configuration/appointmentDomain");

const ORG = "00000000-0000-4000-8000-000000000001";
const USER = "40000000-0000-4000-8000-000000000001";
const APPT_ID = "10000000-0000-4000-8000-000000000204";
const CONTACT_ID = "30000000-0000-4000-8000-000000000204";
const TODAY = new Date("2026-09-01T15:00:00.000-04:00");

const agendaServicePath = require.resolve("../application/agendaApplicationService");
const appointmentRepoPath = require.resolve("../repositories/appointmentRepository");
const contactRepoPath = require.resolve("../repositories/agendaContactRepository");

function todayFilters() {
  return {
    organizationId: ORG,
    ...resolveAppointmentViewFilters("today", TODAY, { organizationId: ORG })
  };
}

function completedFilters() {
  return {
    organizationId: ORG,
    ...resolveAppointmentViewFilters("completed")
  };
}

function rachelRow(overrides = {}) {
  return {
    id: APPT_ID,
    organizationId: ORG,
    prospectId: null,
    prospectPhone: "+17865550111",
    agendaContactId: CONTACT_ID,
    agentId: USER,
    purpose: "other",
    status: "scheduled",
    source: "agent_manual",
    startDateTime: "2026-09-01T19:30:00.000Z",
    endDateTime: "2026-09-01T20:00:00.000Z",
    outcome: null,
    outcomeNotes: null,
    history: [],
    metadata: {
      standaloneAgenda: true,
      noRecruitAi: true,
      agendaContactName: "Rachel Reyes",
      lifecycleState: "scheduled"
    },
    ...overrides
  };
}

function surfacesFor(appointment) {
  const unresolved = isActiveAppointmentForList(appointment);
  return {
    followUpPlan: planFollowUpFromOutcome({
      outcome: appointment.outcome,
      surface: FOLLOW_UP_SURFACES.AGENDA,
      today: "2026-09-01"
    }),
    appointmentsUnresolved: unresolved && matchesListFilters(appointment, todayFilters(), TODAY),
    appointmentsCompleted: isCompletedAppointmentForList(appointment),
    workspaceOutcomeRequired: !hasCanonicalRecordedOutcome(appointment),
    agendaUnresolved:
      unresolved && matchesListFilters(appointment, todayFilters(), TODAY)
  };
}

test("docs: BR-204 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-204/);
  assert.match(rules, /FOLLOW_UP_NEEDED/);
});

test("A) FOLLOW_UP_NEEDED is follow-up visible and appointment-complete", () => {
  const recorded = rachelRow({ outcome: "follow_up" });
  const view = surfacesFor(recorded);

  assert.equal(resolveCanonicalAppointmentOutcome(recorded), "follow_up");
  assert.equal(view.followUpPlan.create, true);
  assert.equal(view.appointmentsUnresolved, false);
  assert.equal(view.appointmentsCompleted, true);
  assert.equal(matchesListFilters(recorded, completedFilters()), true);
  assert.equal(view.workspaceOutcomeRequired, false);
  assert.equal(view.agendaUnresolved, false);
  assert.equal(resolveAppointmentListStatus(recorded), "completed");
});

test("B) RECRUITED is complete on every appointment surface", () => {
  const recorded = rachelRow({
    outcome: "recruited",
    status: "completed",
    metadata: { ...rachelRow().metadata, lifecycleState: "completed" }
  });
  const view = surfacesFor(recorded);
  assert.equal(view.appointmentsUnresolved, false);
  assert.equal(view.workspaceOutcomeRequired, false);
  assert.equal(view.agendaUnresolved, false);
  assert.equal(isCompletedAppointmentForList(recorded), true);
});

test("C) NOT_INTERESTED is not pending", () => {
  const recorded = rachelRow({ outcome: "not_interested", status: "scheduled" });
  assert.equal(isActiveAppointmentForList(recorded), false);
  assert.equal(isActiveAppointment(recorded), false);
  assert.equal(surfacesFor(recorded).workspaceOutcomeRequired, false);
});

test("D) NO_SHOW is not pending and stays on completed", () => {
  const recorded = rachelRow({ outcome: "no_show", status: "scheduled" });
  assert.equal(isActiveAppointmentForList(recorded), false);
  assert.equal(isCompletedAppointmentForList(recorded), true);
  assert.equal(resolveAppointmentListStatus(recorded), "no_show");
  assert.equal(planFollowUpFromOutcome({ outcome: "no_show", today: "2026-09-01" }).create, true);
});

test("E) RESCHEDULED original closes; moved replacement stays the single active", () => {
  const original = rachelRow({
    id: "orig",
    outcome: "rescheduled",
    status: "scheduled",
    startDateTime: "2026-09-01T19:30:00.000Z"
  });
  const replacement = rachelRow({
    id: "next",
    outcome: null,
    status: "rescheduled",
    startDateTime: "2026-09-03T19:30:00.000Z",
    metadata: { ...rachelRow().metadata, lifecycleState: "rescheduled" }
  });

  assert.equal(isActiveAppointmentForList(original), false);
  assert.equal(isActiveAppointmentForList(replacement), true);
  assert.equal(
    selectActivePersistedAppointmentForProspect([original, replacement]).id,
    "next"
  );
});

test("F) manual Add to Agenda FOLLOW_UP_NEEDED write path completes the row", async () => {
  const appointmentRepo = require(appointmentRepoPath);
  const contactRepo = require(contactRepoPath);
  const originalFind = appointmentRepo.findById;
  const originalSave = appointmentRepo.save;
  const originalContact = contactRepo.findById;
  const saved = [];
  const appointment = rachelRow();

  appointmentRepo.findById = async (id, organizationId) =>
    id === APPT_ID && organizationId === ORG ? { ...appointment, ...saved.at(-1) } : null;
  appointmentRepo.save = async (row) => {
    saved.push(row);
    return row;
  };
  contactRepo.findById = async () => ({
    id: CONTACT_ID,
    organizationId: ORG,
    ownerUserId: USER,
    name: "Rachel Reyes"
  });

  try {
    delete require.cache[agendaServicePath];
    const { recordStandaloneOutcome } = require(agendaServicePath);
    const recorded = await recordStandaloneOutcome(
      APPT_ID,
      { outcome: APPOINTMENT_OUTCOMES.FOLLOW_UP, followUpDate: "2026-09-04" },
      { organizationId: ORG, userId: USER }
    );
    assert.equal(recorded.outcome, "follow_up");
    assert.equal(recorded.status, "completed");
    assert.equal(recorded.metadata.lifecycleState, "completed");
    assert.equal(isActiveAppointmentForList(recorded), false);
    assert.equal(isCompletedAppointmentForList(recorded), true);
  } finally {
    appointmentRepo.findById = originalFind;
    appointmentRepo.save = originalSave;
    contactRepo.findById = originalContact;
    delete require.cache[agendaServicePath];
  }
});

test("G) duplicate FOLLOW_UP_NEEDED write is idempotent", async () => {
  const appointmentRepo = require(appointmentRepoPath);
  const originalFind = appointmentRepo.findById;
  const originalSave = appointmentRepo.save;
  const saved = [];
  const appointment = rachelRow({
    outcome: "follow_up",
    status: "completed",
    metadata: { ...rachelRow().metadata, lifecycleState: "completed" }
  });

  appointmentRepo.findById = async () => ({ ...appointment });
  appointmentRepo.save = async (row) => {
    saved.push(row);
    return row;
  };

  try {
    delete require.cache[agendaServicePath];
    const { recordStandaloneOutcome } = require(agendaServicePath);
    const first = await recordStandaloneOutcome(
      APPT_ID,
      { outcome: "follow_up" },
      { organizationId: ORG, userId: USER }
    );
    const second = await recordStandaloneOutcome(
      APPT_ID,
      { outcome: "follow_up" },
      { organizationId: ORG, userId: USER }
    );
    assert.equal(saved.length, 0);
    assert.equal(first.outcome, "follow_up");
    assert.equal(second.outcome, "follow_up");
  } finally {
    appointmentRepo.findById = originalFind;
    appointmentRepo.save = originalSave;
    delete require.cache[agendaServicePath];
  }
});

test("H) dashboard pending counts exclude outcome-complete appointments", () => {
  const prospect = {
    phone: "+17865550111",
    name: "Rachel Reyes",
    interview_time: "2026-09-01T19:30:00.000Z"
  };
  const queue = [
    {
      phone: "+17865550111",
      name: "Rachel Reyes",
      canonicalMilestone: "INTERVIEW_RESULT_PENDING",
      missionControlPriorityTier: "PENDING_INTERVIEW_RESULTS"
    }
  ];
  const pending = buildTodayFocus([prospect], queue, {
    organizationId: ORG,
    reference: TODAY,
    appointments: []
  });
  assert.equal(pending.pendingInterviewOutcomes.count, 1);
  assert.equal(pending.interviewsToday.count, 1);

  const complete = buildTodayFocus([prospect], queue, {
    organizationId: ORG,
    reference: TODAY,
    appointments: [rachelRow({ outcome: "follow_up", prospectPhone: "+17865550111" })]
  });
  assert.equal(complete.pendingInterviewOutcomes.count, 0);
  assert.equal(complete.interviewsToday.count, 0);
  assert.equal(completedForKpi(rachelRow({ outcome: "follow_up" })), true);
});

test("I) BR-190 confirm-selected-slot tests remain in the suite", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "recruitAiV2ConfirmSelectedSlotSiBr190.test.js"),
    "utf8"
  );
  assert.match(source, /BR-190/);
  assert.match(source, /hasConfirmableAppointmentProposal/);
});

test("J) BR-197 Today’s Agenda tests remain in the suite", () => {
  const source = fs.readFileSync(path.join(__dirname, "agendaTodayWindowBr197.test.js"), "utf8");
  assert.match(source, /BR-197/);
  assert.match(source, /resolveAppointmentViewFilters/);
});

test("OUTCOME_STATE_MISMATCH is operational HIGH, not semantic disagreement", () => {
  const stale = rachelRow({ outcome: "follow_up", status: "scheduled" });
  const mismatch = detectOutcomeStateMismatch(stale, { unresolved: true });
  assert.equal(mismatch.type, "OUTCOME_STATE_MISMATCH");
  assert.equal(mismatch.severity, "HIGH");
  assert.equal(SIGNAL_TYPES.OUTCOME_STATE_MISMATCH, "OUTCOME_STATE_MISMATCH");
  assert.equal(DISAGREEMENT_SIGNALS.includes(SIGNAL_TYPES.OUTCOME_STATE_MISMATCH), false);
  assert.equal(classifyRisk({ signalType: SIGNAL_TYPES.OUTCOME_STATE_MISMATCH }), "HIGH");
  assert.equal(isRecordedInterviewOutcomeValue("Follow Up Needed"), true);
});
