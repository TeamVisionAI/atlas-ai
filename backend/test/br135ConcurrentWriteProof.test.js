/**
 * BR-135 concurrency — atomic JSONB || merge must keep concurrent durable fields.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const { OWNERSHIP } = require("../core/workflowConstants");
const {
  createAtomicWorkflowStateDb
} = require("./helpers/atomicWorkflowStateDb");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";

test("concurrent HUMAN + stall attention → both fields present", async () => {
  const db = createAtomicWorkflowStateDb({
    phone: "+17865559201",
    prospectId: "p-br135-race",
    organizationId: TEAM_VISION
  });
  const {
    savePersistedWorkflowState
  } = require("../core/workflowStateStore");

  const scope = db.scope();
  await Promise.all([
    savePersistedWorkflowState(
      db.phone,
      {
        workflowOwnership: OWNERSHIP.AGENT,
        manualAgentOwnership: true
      },
      scope
    ),
    savePersistedWorkflowState(
      db.phone,
      {
        needsHumanAttention: true,
        handoffReason: "stall"
      },
      scope
    )
  ]);

  const final = db.snapshot();
  assert.equal(final.workflowOwnership, OWNERSHIP.AGENT);
  assert.equal(final.manualAgentOwnership, true);
  assert.equal(final.needsHumanAttention, true);
  assert.equal(final.handoffReason, "stall");
});

test("concurrent archive + unrelated milestone → archive preserved", async () => {
  const db = createAtomicWorkflowStateDb({
    phone: "+17865559202",
    prospectId: "p-br135-race-arch",
    organizationId: TEAM_VISION
  });
  const {
    savePersistedWorkflowState
  } = require("../core/workflowStateStore");
  const {
    archiveConversation
  } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

  const scope = db.scope();
  await Promise.all([
    archiveConversation(db.phone, scope),
    savePersistedWorkflowState(
      db.phone,
      { canonicalMilestone: "QUALIFICATION" },
      scope
    )
  ]);

  const final = db.snapshot();
  assert.ok(final.inboxArchivedAt);
  assert.equal(final.canonicalMilestone, "QUALIFICATION");
});

test("concurrent TEST + attention → both preserved", async () => {
  const db = createAtomicWorkflowStateDb({
    phone: "+17865559203",
    prospectId: "p-br135-race-test",
    organizationId: TEAM_VISION
  });
  const {
    savePersistedWorkflowState
  } = require("../core/workflowStateStore");
  const {
    markConversationAsTest
  } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

  const scope = db.scope();
  await Promise.all([
    markConversationAsTest(db.phone, scope),
    savePersistedWorkflowState(
      db.phone,
      {
        needsHumanAttention: true,
        handoffReason: "stall",
        workflowOwnership: OWNERSHIP.AGENT,
        manualAgentOwnership: true
      },
      scope
    )
  ]);

  const final = db.snapshot();
  assert.ok(final.inboxMarkedTestAt, "TEST mark must survive concurrent attention write");
  assert.equal(final.workflowOwnership, OWNERSHIP.AGENT);
  assert.equal(final.manualAgentOwnership, true);
  assert.equal(final.handoffReason, "stall");
  // Same-key race on needsHumanAttention (TEST clears it; stall sets true) — last writer wins that key only.
});

test("concurrent Return to Atlas + unrelated update → Atlas ownership wins with milestone", async () => {
  const db = createAtomicWorkflowStateDb({
    phone: "+17865559204",
    prospectId: "p-br135-race-return",
    organizationId: TEAM_VISION,
    initialState: {
      workflowOwnership: OWNERSHIP.AGENT,
      manualAgentOwnership: true,
      needsHumanAttention: false,
      handoffReason: "take_over",
      humanTakenOverAt: "2026-08-10T12:00:00.000Z"
    }
  });
  const {
    savePersistedWorkflowState
  } = require("../core/workflowStateStore");
  const {
    returnConversationToAtlas
  } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

  const scope = db.scope();
  await Promise.all([
    returnConversationToAtlas(db.phone, scope),
    savePersistedWorkflowState(
      db.phone,
      { canonicalMilestone: "INTERVIEW_READY" },
      scope
    )
  ]);

  const final = db.snapshot();
  assert.equal(final.workflowOwnership, OWNERSHIP.ATLAS);
  assert.equal(final.manualAgentOwnership, false);
  assert.equal(final.canonicalMilestone, "INTERVIEW_READY");
});

test("docs: migration 034 uses jsonb || merge RPC", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "../database/migrations/034_br135_merge_prospect_workflow_state.sql"
    ),
    "utf8"
  );
  assert.match(sql, /merge_prospect_workflow_state/);
  assert.match(sql, /COALESCE\(workflow_state,\s*'\{\}'::jsonb\)\s*\|\|\s*p_patch/);
});
