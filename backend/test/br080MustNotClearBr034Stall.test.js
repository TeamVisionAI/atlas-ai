/**
 * BR-080 attention must not trigger BR-034 stall clearance or false HUMAN.
 * FJB Ministry Inc. production reproduction (no prospect-id hardcoding).
 */

"use strict";

require("dotenv").config({
  path: require("node:path").join(__dirname, "../../.env")
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ORG = "00000000-0000-4000-8000-000000000001";
const OWNER = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PHONE = "+14075550180";

function clearModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}workflowStateStore.js`) ||
      key.includes(`${path.sep}workflowOwnershipEngine.js`) ||
      key.includes(`${path.sep}workflowReadModel.js`) ||
      key.includes(`${path.sep}workflowReconciliationEngine.js`) ||
      key.includes(`${path.sep}conversationsCenterOwnershipService.js`) ||
      key.includes(`${path.sep}workflowTransitionEvents.js`) ||
      key.includes(`${path.sep}missionControlPriorityEngine.js`)
    ) {
      delete require.cache[key];
    }
  }
}

async function withIsolatedState(run) {
  const previousEnv = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const tempFile = path.join(
    os.tmpdir(),
    `atlas-br080-stall-${process.pid}-${Date.now()}.json`
  );
  fs.writeFileSync(tempFile, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempFile;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "file";
  clearModules();

  try {
    return await run(tempFile);
  } finally {
    if (previousEnv == null) {
      delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_FILE = previousEnv;
    }
    if (previousBackend == null) {
      delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_BACKEND = previousBackend;
    }
    clearModules();
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
  }
}

function br080AttentionState() {
  return {
    canonicalMilestone: "NEW_LEAD",
    workflowOwnership: "AGENT",
    needsHumanAttention: true,
    stalledAt: null,
    stallEpisodeKey: null,
    manualAgentOwnership: false,
    humanTakenOverAt: null,
    handoffReason: null
  };
}

function prospectRow(overrides = {}) {
  return {
    id: "prospect-br080-stall-1",
    phone: PHONE,
    name: "Attention Prospect",
    organization_id: ORG,
    owner_user_id: OWNER,
    city: "Orlando",
    state: "FL",
    current_step: "NEW",
    attention_status: "human_required",
    acknowledged_at: null,
    human_attention_reason: "unacknowledged_sla_15m",
    ...overrides
  };
}

test("1. BR-080 attention + no real stall: queue/read does not clear or resume", async () => {
  await withIsolatedState(async (tempFile) => {
    const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { evaluateWorkflowState } = require("../core/workflowReadModel");
    const { applyStallTransition } = require("../core/workflowOwnershipEngine");
    const transitionEvents = require("../core/workflowTransitionEvents");

    await savePersistedWorkflowState(PHONE, br080AttentionState(), {
      organizationId: ORG,
      prospectId: "prospect-br080-stall-1"
    });
    const before = JSON.parse(fs.readFileSync(tempFile, "utf8"));

    let clearanceEmits = 0;
    const originalClear = transitionEvents.emitStallClearanceEvents;
    transitionEvents.emitStallClearanceEvents = async () => {
      clearanceEmits += 1;
      return [];
    };

    const prospect = prospectRow();
    const brain = { currentStep: "CITY", missingFields: ["authorization"] };
    const messageHints = {
      lastOutboundAt: "2026-08-13T07:32:33.000Z",
      lastInboundAt: "2026-08-13T08:33:28.000Z"
    };

    const evaluated = await evaluateWorkflowState({
      phone: PHONE,
      prospect,
      brain,
      agentState: {},
      messageHints,
      persistTransitions: false
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(tempFile, "utf8")), before);

    const persistOn = await evaluateWorkflowState({
      phone: PHONE,
      prospect,
      brain,
      agentState: {},
      messageHints,
      persistTransitions: true
    });

    const direct = await applyStallTransition(
      PHONE,
      await loadPersistedWorkflowState(PHONE),
      {
        isStalled: false,
        cleared: true,
        reason: "prospect_replied",
        lastAtlasOutboundAt: messageHints.lastOutboundAt
      },
      { canonicalMilestone: "NEW_LEAD", workflowOwnership: "ATLAS" }
    );

    transitionEvents.emitStallClearanceEvents = originalClear;

    const after = await loadPersistedWorkflowState(PHONE);
    assert.equal(direct.applied, false);
    assert.equal(clearanceEmits, 0);
    assert.equal(evaluated.transition.applied, false);
    assert.equal(evaluated.needsHumanAttention, true);
    assert.equal(evaluated.workflowOwnership, "AGENT");
    assert.equal(persistOn.needsHumanAttention, true);
    assert.equal(after.needsHumanAttention, true);
    assert.equal(after.stalledAt, null);
    assert.equal(after.stallEpisodeKey, null);
    assert.equal(after.acknowledged_at, undefined);
  });
});

test("2. BR-080 + inbound reply: no false BR-034 clearance; still NEEDS_ATTENTION", async () => {
  await withIsolatedState(async () => {
    const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { reconcileStallAfterProspectReply } = require("../core/workflowReadModel");
    const { resolveConversationOwnershipState } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

    await savePersistedWorkflowState(PHONE, br080AttentionState());
    const result = await reconcileStallAfterProspectReply(prospectRow(), {
      messageHints: {
        lastOutboundAt: "2026-08-13T07:32:33.000Z",
        lastInboundAt: "2026-08-13T08:33:28.000Z"
      },
      agentState: {}
    });

    const stored = await loadPersistedWorkflowState(PHONE);
    assert.equal(result.applied, false);
    assert.equal(result.reason, "NO_DURABLE_STALL_EPISODE");
    assert.equal(stored.needsHumanAttention, true);
    assert.equal(stored.workflowOwnership, "AGENT");
    assert.equal(resolveConversationOwnershipState(stored), "NEEDS_ATTENTION");
  });
});

test("3. Real BR-034 stall + prospect reply still clears", async () => {
  await withIsolatedState(async () => {
    const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const transitionEvents = require("../core/workflowTransitionEvents");
    let resumed = 0;
    const originalClear = transitionEvents.emitStallClearanceEvents;
    transitionEvents.emitStallClearanceEvents = async () => {
      resumed += 1;
      return [{ event_type: "WorkflowOwnershipChanged" }, { event_type: "WorkflowResumed" }];
    };
    delete require.cache[require.resolve("../core/workflowReadModel")];
    const { reconcileStallAfterProspectReply } = require("../core/workflowReadModel");
    const { resolveConversationOwnershipState } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

    await savePersistedWorkflowState(PHONE, {
      canonicalMilestone: "QUALIFICATION",
      workflowOwnership: "AGENT",
      needsHumanAttention: true,
      stalledAt: "2026-08-12T12:00:00.000Z",
      stallEpisodeKey: "2026-08-11T12:00:00.000Z",
      manualAgentOwnership: true,
      humanTakenOverAt: null,
      handoffReason: "stall"
    });

    const result = await reconcileStallAfterProspectReply(prospectRow({ current_step: "QUALIFICATION" }), {
      messageHints: {
        lastOutboundAt: "2026-08-11T12:00:00.000Z",
        lastInboundAt: "2026-08-13T08:33:28.000Z"
      },
      agentState: {}
    });

    transitionEvents.emitStallClearanceEvents = originalClear;

    const stored = await loadPersistedWorkflowState(PHONE);
    assert.equal(result.applied, true);
    assert.equal(result.transition, "stall_cleared_prospect_reply");
    assert.equal(stored.stalledAt, null);
    assert.equal(stored.stallEpisodeKey, null);
    assert.equal(stored.needsHumanAttention, false);
    assert.equal(stored.manualAgentOwnership, false);
    assert.equal(stored.workflowOwnership, "ATLAS");
    assert.equal(resolveConversationOwnershipState(stored), "ATLAS");
    assert.equal(resumed, 1);
  });
});

test("4. MC/queue read does not mutate workflow_state or emit ownership/ack", async () => {
  await withIsolatedState(async (tempFile) => {
    const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { evaluateWorkflowState } = require("../core/workflowReadModel");
    const transitionEvents = require("../core/workflowTransitionEvents");
    const fsSync = fs;

    const prioritySrc = fsSync.readFileSync(
      path.join(__dirname, "../core/missionControlPriorityEngine.js"),
      "utf8"
    );
    const dashboardSrc = fsSync.readFileSync(
      path.join(__dirname, "../routes/dashboard.js"),
      "utf8"
    );
    const prospectCenterSrc = fsSync.readFileSync(
      path.join(__dirname, "../core/prospectCenterReadModel.js"),
      "utf8"
    );
    const followUpsSrc = fsSync.readFileSync(
      path.join(__dirname, "../core/followUpsReadModel.js"),
      "utf8"
    );
    const executiveSrc = fsSync.readFileSync(
      path.join(__dirname, "../core/executiveDashboardReadModel.js"),
      "utf8"
    );
    assert.match(prioritySrc, /evaluateWorkflowState\(\{/);
    assert.doesNotMatch(prioritySrc, /persistTransitions:\s*true/);
    assert.match(dashboardSrc, /buildPrioritizedWorkflowQueue/);
    assert.match(prospectCenterSrc, /buildPrioritizedWorkflowQueue/);
    assert.match(followUpsSrc, /buildPrioritizedWorkflowQueue/);
    assert.match(executiveSrc, /buildPrioritizedWorkflowQueue/);

    await savePersistedWorkflowState(PHONE, {
      ...br080AttentionState(),
      stalledAt: "2026-08-12T12:00:00.000Z",
      stallEpisodeKey: "2026-08-11T12:00:00.000Z",
      manualAgentOwnership: true,
      handoffReason: "stall"
    });
    const before = JSON.stringify(await loadPersistedWorkflowState(PHONE));
    const fileBefore = fs.readFileSync(tempFile, "utf8");

    let emits = 0;
    const originalEsc = transitionEvents.emitStallEscalationEvents;
    const originalClear = transitionEvents.emitStallClearanceEvents;
    transitionEvents.emitStallEscalationEvents = async () => {
      emits += 1;
      return [];
    };
    transitionEvents.emitStallClearanceEvents = async () => {
      emits += 1;
      return [];
    };

    await evaluateWorkflowState({
      phone: PHONE,
      prospect: prospectRow(),
      brain: { currentStep: "CITY", missingFields: ["authorization"] },
      agentState: {},
      messageHints: {
        lastOutboundAt: "2026-08-11T12:00:00.000Z",
        lastInboundAt: "2026-08-13T08:33:28.000Z"
      },
      persistTransitions: false
    });

    transitionEvents.emitStallEscalationEvents = originalEsc;
    transitionEvents.emitStallClearanceEvents = originalClear;

    assert.equal(emits, 0);
    assert.equal(JSON.stringify(await loadPersistedWorkflowState(PHONE)), before);
    assert.equal(fs.readFileSync(tempFile, "utf8"), fileBefore);
  });
});

test("5. Conversations: BR-080 AGENT + attention + no seal → NEEDS_ATTENTION", () => {
  const {
    resolveConversationOwnershipState
  } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

  assert.equal(
    resolveConversationOwnershipState({
      workflowOwnership: "AGENT",
      manualAgentOwnership: false,
      humanTakenOverAt: null,
      needsHumanAttention: true
    }),
    "NEEDS_ATTENTION"
  );
});

test("6. Attention cleared + no sticky seal → ATLAS, not HUMAN", () => {
  const {
    resolveConversationOwnershipState
  } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

  assert.equal(
    resolveConversationOwnershipState({
      workflowOwnership: "AGENT",
      manualAgentOwnership: false,
      humanTakenOverAt: null,
      needsHumanAttention: false
    }),
    "ATLAS"
  );
});

test("7. Explicit TAKE OVER remains HUMAN", async () => {
  await withIsolatedState(async () => {
    const {
      takeOverConversation,
      resolveConversationOwnershipState,
      hasActiveStickyHumanHold
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");

    const taken = await takeOverConversation(PHONE, { reason: "take_over" });
    const stored = await loadPersistedWorkflowState(PHONE);
    assert.equal(taken.ownershipState, "HUMAN");
    assert.equal(hasActiveStickyHumanHold(stored), true);
    assert.equal(resolveConversationOwnershipState(stored), "HUMAN");
  });
});

test("8. RETURN TO ATLAS remains ATLAS", async () => {
  await withIsolatedState(async () => {
    const {
      takeOverConversation,
      returnConversationToAtlas,
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");

    await takeOverConversation(PHONE, { reason: "take_over" });
    const returned = await returnConversationToAtlas(PHONE);
    const stored = await loadPersistedWorkflowState(PHONE);
    assert.equal(returned.ownershipState, "ATLAS");
    assert.equal(stored.manualAgentOwnership, false);
    assert.equal(stored.humanTakenOverAt, null);
    assert.equal(resolveConversationOwnershipState(stored), "ATLAS");
  });
});

test("9. BR-080 acknowledgement path unchanged (TAKE OVER still acks)", async () => {
  await withIsolatedState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

    const prospect = prospectRow({ attention_status: "human_required", acknowledged_at: null });
    let ackCalls = 0;
    const result = await takeOverConversation(PHONE, {
      prospect,
      actor: { userId: OWNER },
      acknowledgeLeadFn: async (row, actor) => {
        ackCalls += 1;
        assert.equal(row.phone, PHONE);
        assert.equal(actor.userId, OWNER);
        return {
          prospect: {
            ...row,
            attention_status: "acknowledged",
            acknowledged_at: "2026-08-13T12:00:00.000Z",
            acknowledged_by_user_id: actor.userId
          }
        };
      }
    });

    assert.equal(result.ownershipState, "HUMAN");
    assert.equal(ackCalls, 1);
    assert.equal(result.attentionAck.attempted, true);
  });
});

test("10. tenant/org isolation unchanged", async () => {
  await withIsolatedState(async () => {
    const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { evaluateWorkflowState } = require("../core/workflowReadModel");
    const readModelSrc = fs.readFileSync(
      path.join(__dirname, "../core/workflowReadModel.js"),
      "utf8"
    );
    assert.match(readModelSrc, /organizationId: prospect\?\.organization_id/);
    assert.match(readModelSrc, /prospectId: prospect\?\.id/);

    await savePersistedWorkflowState(PHONE, br080AttentionState(), {
      organizationId: ORG,
      prospectId: "prospect-br080-stall-1"
    });

    await evaluateWorkflowState({
      phone: PHONE,
      prospect: prospectRow(),
      brain: { currentStep: "NEW", missingFields: [] },
      agentState: {},
      messageHints: {
        lastOutboundAt: "2026-08-13T07:32:33.000Z",
        lastInboundAt: "2026-08-13T08:33:28.000Z"
      },
      persistTransitions: false
    });

    const tv = await loadPersistedWorkflowState(PHONE, {
      organizationId: ORG,
      prospectId: "prospect-br080-stall-1"
    });
    assert.equal(tv.needsHumanAttention, true);
    assert.equal(tv.workflowOwnership, "AGENT");
    assert.equal(tv.manualAgentOwnership, false);
    assert.equal(tv.humanTakenOverAt, null);
  });
});
