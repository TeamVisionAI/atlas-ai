/**
 * Cancel / rollback must demote durable INTERVIEW_SCHEDULED → INTERVIEW_READY.
 * Source projection fix for Conversations Active inbox (no CC-only workaround).
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const WORKFLOW_FILE = path.join(__dirname, "../data/workflowState.json");

async function withTempWorkflow(run) {
  const previous = fs.existsSync(WORKFLOW_FILE)
    ? fs.readFileSync(WORKFLOW_FILE, "utf8")
    : null;
  fs.mkdirSync(path.dirname(WORKFLOW_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_FILE, "{}");
  try {
    return await run();
  } finally {
    if (previous == null) {
      try {
        fs.unlinkSync(WORKFLOW_FILE);
      } catch {
        /* ignore */
      }
    } else {
      fs.writeFileSync(WORKFLOW_FILE, previous);
    }
  }
}

test("A. demote helper: INTERVIEW_SCHEDULED → INTERVIEW_READY", async () => {
  await withTempWorkflow(async () => {
    const {
      savePersistedWorkflowState,
      loadPersistedWorkflowState
    } = require("../core/workflowStateStore");
    const {
      demotePersistedScheduleClaimAfterCancel
    } = require("../core/appointmentMilestoneTruth");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865558001";
    await savePersistedWorkflowState(phone, {
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      workflowOwnership: OWNERSHIP.WAITING_EVENT
    });

    const result = await demotePersistedScheduleClaimAfterCancel(phone);
    assert.equal(result.demoted, true);
    assert.equal(result.previousMilestone, MILESTONES.INTERVIEW_SCHEDULED);
    assert.equal(result.canonicalMilestone, MILESTONES.INTERVIEW_READY);

    const persisted = await loadPersistedWorkflowState(phone);
    assert.equal(persisted.canonicalMilestone, MILESTONES.INTERVIEW_READY);
    assert.notEqual(persisted.canonicalMilestone, MILESTONES.INTERVIEW_SCHEDULED);
  });
});

test("B. demote helper: INTERVIEW_DUE → INTERVIEW_READY", async () => {
  await withTempWorkflow(async () => {
    const { savePersistedWorkflowState } = require("../core/workflowStateStore");
    const {
      demotePersistedScheduleClaimAfterCancel
    } = require("../core/appointmentMilestoneTruth");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865558002";
    await savePersistedWorkflowState(phone, {
      canonicalMilestone: MILESTONES.INTERVIEW_DUE,
      workflowOwnership: OWNERSHIP.WAITING_EVENT
    });

    const result = await demotePersistedScheduleClaimAfterCancel(phone);
    assert.equal(result.demoted, true);
    assert.equal(result.canonicalMilestone, MILESTONES.INTERVIEW_READY);
  });
});

test("B2. demote preserves HUMAN / manual ownership hold", async () => {
  await withTempWorkflow(async () => {
    const {
      savePersistedWorkflowState,
      loadPersistedWorkflowState
    } = require("../core/workflowStateStore");
    const {
      demotePersistedScheduleClaimAfterCancel
    } = require("../core/appointmentMilestoneTruth");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865558003";
    await savePersistedWorkflowState(phone, {
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      workflowOwnership: OWNERSHIP.AGENT,
      manualAgentOwnership: true,
      needsHumanAttention: false
    });

    await demotePersistedScheduleClaimAfterCancel(phone);
    const persisted = await loadPersistedWorkflowState(phone);
    assert.equal(persisted.canonicalMilestone, MILESTONES.INTERVIEW_READY);
    assert.equal(persisted.workflowOwnership, OWNERSHIP.AGENT);
    assert.equal(persisted.manualAgentOwnership, true);
  });
});

test("B3. non-scheduled milestones are untouched (CLOSED stays CLOSED)", async () => {
  await withTempWorkflow(async () => {
    const {
      savePersistedWorkflowState,
      loadPersistedWorkflowState
    } = require("../core/workflowStateStore");
    const {
      demotePersistedScheduleClaimAfterCancel
    } = require("../core/appointmentMilestoneTruth");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865558004";
    await savePersistedWorkflowState(phone, {
      canonicalMilestone: MILESTONES.CLOSED,
      workflowOwnership: OWNERSHIP.CLOSED
    });

    const result = await demotePersistedScheduleClaimAfterCancel(phone);
    assert.equal(result.demoted, false);
    assert.equal((await loadPersistedWorkflowState(phone)).canonicalMilestone, MILESTONES.CLOSED);
  });
});

test("cancelAppointment source wires demotion after prospect SCHEDULE reset", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  assert.match(src, /demotePersistedScheduleClaimAfterCancel/);
  assert.match(src, /current_step:\s*"SCHEDULE"/);
  const cancelIdx = src.indexOf("async function cancelAppointment");
  const demoteIdx = src.indexOf("demotePersistedScheduleClaimAfterCancel", cancelIdx);
  const stepIdx = src.indexOf('current_step: "SCHEDULE"', cancelIdx);
  assert.ok(cancelIdx > 0);
  assert.ok(stepIdx > cancelIdx);
  assert.ok(demoteIdx > stepIdx);
});

test("rollback persisted appointment uses cancelAppointment (inherits demotion)", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  assert.match(src, /rollbackPersistedAppointment/);
  assert.match(src, /appointmentApplicationService\.cancelAppointment/);
});

test("C. post-cancel projection fields imply Active for CC consumers", async () => {
  await withTempWorkflow(async () => {
    const { savePersistedWorkflowState } = require("../core/workflowStateStore");
    const {
      demotePersistedScheduleClaimAfterCancel
    } = require("../core/appointmentMilestoneTruth");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    // Simulate success projection then cancel demotion + current_step SCHEDULE.
    const phone = "+17865558005";
    await savePersistedWorkflowState(phone, {
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
      workflowOwnership: OWNERSHIP.WAITING_EVENT
    });
    await demotePersistedScheduleClaimAfterCancel(phone);

    const persisted = await require("../core/workflowStateStore").loadPersistedWorkflowState(
      phone
    );
    const prospect = { phone, current_step: "SCHEDULE" };

    // Mirror conversationsCenterLifecycle scheduled check without requiring #102 on main.
    const milestone = String(persisted.canonicalMilestone || "").toUpperCase();
    const step = String(prospect.current_step || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, " ");
    const scheduledClaim =
      milestone === MILESTONES.INTERVIEW_SCHEDULED ||
      milestone === MILESTONES.INTERVIEW_DUE ||
      step === "confirmed" ||
      step === "interview scheduled" ||
      step === "scheduled";

    assert.equal(scheduledClaim, false);
    assert.equal(persisted.canonicalMilestone, MILESTONES.INTERVIEW_READY);
  });
});

test("BR-039 read demotion still maps missing appointment → INTERVIEW_READY", () => {
  const {
    applyAppointmentMilestoneTruth
  } = require("../core/appointmentMilestoneTruth");
  const { MILESTONES } = require("../core/workflowConstants");

  const gated = applyAppointmentMilestoneTruth(MILESTONES.INTERVIEW_SCHEDULED, null);
  assert.equal(gated.downgraded, true);
  assert.equal(gated.milestone, MILESTONES.INTERVIEW_READY);
});
