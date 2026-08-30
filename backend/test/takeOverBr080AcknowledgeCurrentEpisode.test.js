/**
 * TAKE OVER acknowledges the current BR-080 attention episode (canonical acknowledgeLead).
 * Sticky HUMAN remains independent; future stall may alert without resurrecting Old New.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  takeOverConversation,
  returnConversationToAtlas,
  resolveConversationOwnershipState,
  hasActiveStickyHumanHold
} = require("../core/conversationsCenter/conversationsCenterOwnershipService");
const {
  applyStallTransition
} = require("../core/workflowOwnershipEngine");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("../core/workflowStateStore");
const { OWNERSHIP } = require("../core/workflowConstants");
const {
  buildProspectCenterItem
} = require("../core/prospectCenterReadModel");
const {
  shouldGenerateNewLeadAttentionMission
} = require("../core/missionEngine");
const {
  canTakeOverConversation,
  canReturnConversationToAtlas,
  resolveEffectiveOwnership,
  isHumanComposerEnabled
} = require("../../frontend/src/engines/conversationsCenterPresentation.js");
const { shouldDeliverAutomatedReply } = require("../core/communicationHub");

const PHONE = "+17865558080";
const ACTOR = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const ORG = "00000000-0000-4000-8000-000000000001";

const OWNERSHIP_SRC = path.join(
  __dirname,
  "../core/conversationsCenter/conversationsCenterOwnershipService.js"
);
const ROUTE_SRC = path.join(__dirname, "../routes/conversationsCenter.js");

function unackedProspect(overrides = {}) {
  return {
    id: "p-takeover-br080",
    phone: PHONE,
    organization_id: ORG,
    owner_user_id: ACTOR,
    attention_status: "new",
    acknowledged_at: null,
    acknowledged_by_user_id: null,
    new_lead_received_at: "2026-08-12T01:00:00.000Z",
    human_attention_reason: "needs_human",
    ...overrides
  };
}

function memoryAcknowledgeLead() {
  const calls = [];
  async function acknowledgeLeadFn(prospect, actor) {
    calls.push({ prospect, actor });
    if (prospect.acknowledged_at || prospect.attention_status === "acknowledged") {
      return { prospect, alreadyAcknowledged: true };
    }
    const now = "2026-08-12T04:00:00.000Z";
    const updates = {
      attention_status: "acknowledged",
      acknowledged_at: now,
      acknowledged_by_user_id: actor.userId || null
    };
    return {
      prospect: { ...prospect, ...updates },
      alreadyAcknowledged: false
    };
  }
  return { calls, acknowledgeLeadFn };
}

async function withMemoryWorkflow(run) {
  const previous = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";
  try {
    await savePersistedWorkflowState(
      PHONE,
      {
        workflowOwnership: OWNERSHIP.ATLAS,
        manualAgentOwnership: false,
        needsHumanAttention: true,
        humanTakenOverAt: null,
        stallEpisodeKey: "2026-08-12T00:00:00.000Z",
        stalledAt: "2026-08-12T00:00:00.000Z",
        handoffReason: "stall"
      },
      { backend: "memory" }
    );
    return await run();
  } finally {
    if (previous == null) {
      delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_BACKEND = previous;
    }
  }
}

test("A. Unacknowledged BR-080 new lead → TAKE OVER acks + sticky HUMAN", async () => {
  await withMemoryWorkflow(async () => {
    const { calls, acknowledgeLeadFn } = memoryAcknowledgeLead();
    const prospect = unackedProspect();
    const result = await takeOverConversation(PHONE, {
      backend: "memory",
      prospect,
      actor: { userId: ACTOR, userEmail: "rvp@example.com" },
      acknowledgeLeadFn,
      reason: "take_over"
    });

    assert.equal(result.ownershipState, "HUMAN");
    assert.equal(result.next.manualAgentOwnership, true);
    assert.ok(result.next.humanTakenOverAt);
    assert.equal(result.next.needsHumanAttention, false);
    assert.equal(result.next.workflowOwnership, OWNERSHIP.AGENT);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].actor.userId, ACTOR);
    assert.equal(result.attentionAck.attentionStatus, "acknowledged");
    assert.equal(result.attentionAck.acknowledgedAt, "2026-08-12T04:00:00.000Z");
    assert.equal(result.attentionAck.alreadyAcknowledged, false);
  });
});

test("B/C. Prospect Center New + humanAttention clear for acknowledged episode", () => {
  const prospect = unackedProspect({
    attention_status: "acknowledged",
    acknowledged_at: "2026-08-12T04:00:00.000Z"
  });
  const item = buildProspectCenterItem(prospect, {
    phone: PHONE,
    name: "Lead",
    canonicalMilestone: "GREETING",
    currentStep: "GREETING",
    missionControlPriority: "medium",
    needsHumanAttention: false,
    workflowOwnership: OWNERSHIP.AGENT,
    stalledAt: null
  });

  assert.equal(item.badges.new, false);
  assert.equal(item.badges.needsManualAcknowledge, false);
  assert.equal(item.badges.humanAttention, false);
  assert.equal(item.isNew, false);
  assert.equal(item.needsManualAcknowledge, false);
});

test("C2. Pre-ack human_required still red; post-ack clears BR-080 humanAttention", () => {
  const before = buildProspectCenterItem(
    unackedProspect({ attention_status: "human_required" }),
    {
      phone: PHONE,
      needsHumanAttention: false,
      workflowOwnership: OWNERSHIP.ATLAS,
      canonicalMilestone: "GREETING",
      currentStep: "GREETING",
      missionControlPriority: "high",
      stalledAt: null
    }
  );
  assert.equal(before.badges.humanAttention, true);
  assert.equal(before.badges.needsManualAcknowledge, true);

  const after = buildProspectCenterItem(
    unackedProspect({
      attention_status: "acknowledged",
      acknowledged_at: "2026-08-12T04:00:00.000Z"
    }),
    {
      phone: PHONE,
      needsHumanAttention: false,
      workflowOwnership: OWNERSHIP.AGENT,
      canonicalMilestone: "GREETING",
      currentStep: "GREETING",
      missionControlPriority: "medium",
      stalledAt: null
    }
  );
  assert.equal(after.badges.humanAttention, false);
  assert.equal(after.badges.new, false);
});

test("D. NewLeadAttention mission no longer unacknowledged after ack", () => {
  const context = {
    prospect: unackedProspect({
      attention_status: "acknowledged",
      acknowledged_at: "2026-08-12T04:00:00.000Z"
    })
  };
  assert.equal(shouldGenerateNewLeadAttentionMission(context), false);

  const stillOpen = {
    prospect: unackedProspect({ attention_status: "new", acknowledged_at: null })
  };
  assert.equal(shouldGenerateNewLeadAttentionMission(stillOpen), true);
});

test("E. Already acknowledged lead → TAKE OVER idempotent", async () => {
  await withMemoryWorkflow(async () => {
    const { calls, acknowledgeLeadFn } = memoryAcknowledgeLead();
    const prospect = unackedProspect({
      attention_status: "acknowledged",
      acknowledged_at: "2026-08-11T12:00:00.000Z",
      acknowledged_by_user_id: ACTOR
    });
    const result = await takeOverConversation(PHONE, {
      backend: "memory",
      prospect,
      actor: { userId: ACTOR },
      acknowledgeLeadFn
    });
    assert.equal(result.ownershipState, "HUMAN");
    assert.equal(result.attentionAck.alreadyAcknowledged, true);
    assert.equal(calls.length, 1);
  });
});

test("F. TAKE OVER does not invoke Return to Atlas", () => {
  const ownership = fs.readFileSync(OWNERSHIP_SRC, "utf8");
  const takeOverBlock = ownership.split("async function takeOverConversation")[1]
    .split("async function returnConversationToAtlas")[0];
  assert.doesNotMatch(takeOverBlock, /returnConversationToAtlas\(/);
  assert.match(takeOverBlock, /acknowledgeCurrentBr080EpisodeOnTakeOver|acknowledgeLead/);
  assert.match(fs.readFileSync(ROUTE_SRC, "utf8"), /acknowledgeLead|prospect,\s*\n\s*actor/);
});

test("G. sticky HUMAN presentation: composer + RETURN visible; TAKE OVER hidden", async () => {
  await withMemoryWorkflow(async () => {
    const { acknowledgeLeadFn } = memoryAcknowledgeLead();
    const result = await takeOverConversation(PHONE, {
      backend: "memory",
      prospect: unackedProspect(),
      actor: { userId: ACTOR },
      acknowledgeLeadFn
    });
    const ownershipState = resolveConversationOwnershipState(result.next);
    const effective = resolveEffectiveOwnership(ownershipState);
    assert.equal(ownershipState, "HUMAN");
    assert.equal(effective, "HUMAN");
    assert.equal(isHumanComposerEnabled(effective), true);
    assert.equal(canReturnConversationToAtlas(effective), true);
    assert.equal(canTakeOverConversation(effective), false);
    assert.equal(hasActiveStickyHumanHold(result.next), true);
  });
});

test("H. Atlas sends nothing under HUMAN hold", async () => {
  await withMemoryWorkflow(async () => {
    const { acknowledgeLeadFn } = memoryAcknowledgeLead();
    await takeOverConversation(PHONE, {
      backend: "memory",
      prospect: unackedProspect(),
      actor: { userId: ACTOR },
      acknowledgeLeadFn
    });
    const allow = await shouldDeliverAutomatedReply(
      { phone: PHONE, organization_id: ORG, id: "p-takeover-br080", current_step: "GREETING" },
      { allowHandoffAck: true, backend: "memory" }
    );
    assert.equal(allow, false);
  });
});

test("I. After TAKE OVER, qualification-style workflow patch keeps HUMAN + BR-080 ack", async () => {
  await withMemoryWorkflow(async () => {
    const acked = {
      attention_status: "acknowledged",
      acknowledged_at: "2026-08-12T04:00:00.000Z"
    };
    const { acknowledgeLeadFn } = memoryAcknowledgeLead();
    await takeOverConversation(PHONE, {
      backend: "memory",
      prospect: unackedProspect(),
      actor: { userId: ACTOR },
      acknowledgeLeadFn
    });
    const seal = (await loadPersistedWorkflowState(PHONE, { backend: "memory" }))
      .humanTakenOverAt;
    await savePersistedWorkflowState(
      PHONE,
      {
        // BR-035-like advancement must not clear sticky seal (covered elsewhere);
        // here: unrelated patch leaves seal + ownership.
        canonicalMilestone: "QUALIFICATION"
      },
      { backend: "memory" }
    );
    const after = await loadPersistedWorkflowState(PHONE, { backend: "memory" });
    assert.equal(after.manualAgentOwnership, true);
    assert.equal(after.humanTakenOverAt, seal);
    assert.equal(resolveConversationOwnershipState(after), "HUMAN");

    const item = buildProspectCenterItem(unackedProspect(acked), {
      phone: PHONE,
      needsHumanAttention: false,
      workflowOwnership: after.workflowOwnership,
      canonicalMilestone: after.canonicalMilestone || "QUALIFICATION",
      currentStep: "QUALIFICATION",
      missionControlPriority: "medium",
      stalledAt: null
    });
    assert.equal(item.badges.new, false);
    assert.equal(item.badges.needsManualAcknowledge, false);
  });
});

test("J. Later NEW stall: HUMAN sticky; new attention may surface; Old New does not return", async () => {
  await withMemoryWorkflow(async () => {
    const { acknowledgeLeadFn } = memoryAcknowledgeLead();
    await takeOverConversation(PHONE, {
      backend: "memory",
      prospect: unackedProspect(),
      actor: { userId: ACTOR },
      acknowledgeLeadFn
    });
    const before = await loadPersistedWorkflowState(PHONE, { backend: "memory" });
    const stall = await applyStallTransition(
      PHONE,
      before,
      {
        isStalled: true,
        cleared: false,
        stallEpisodeKey: "2026-08-12T05:00:00.000Z",
        stallDetectedAt: "2026-08-12T05:00:00.000Z"
      },
      { workflowOwnership: OWNERSHIP.AGENT, canonicalMilestone: "QUALIFICATION" },
      { backend: "memory" }
    );
    assert.equal(stall.applied, true);
    assert.equal(stall.next.manualAgentOwnership, true);
    assert.equal(stall.next.humanTakenOverAt, before.humanTakenOverAt);
    assert.equal(stall.next.needsHumanAttention, true);
    assert.equal(resolveConversationOwnershipState(stall.next), "HUMAN");

    const ackedProspect = unackedProspect({
      attention_status: "acknowledged",
      acknowledged_at: "2026-08-12T04:00:00.000Z"
    });
    const item = buildProspectCenterItem(ackedProspect, {
      phone: PHONE,
      needsHumanAttention: true,
      workflowOwnership: OWNERSHIP.AGENT,
      canonicalMilestone: "QUALIFICATION",
      currentStep: "QUALIFICATION",
      missionControlPriority: "high",
      stalledAt: stall.next.stalledAt
    });
    // New/unacknowledged must NOT resurrect; stall may show humanAttention via workflow flag.
    assert.equal(item.badges.new, false);
    assert.equal(item.badges.needsManualAcknowledge, false);
    assert.equal(item.badges.humanAttention, true);
    assert.equal(shouldGenerateNewLeadAttentionMission({ prospect: ackedProspect }), false);
  });
});

test("K. Explicit RETURN TO ATLAS releases sticky HUMAN (unchanged)", async () => {
  await withMemoryWorkflow(async () => {
    const { acknowledgeLeadFn } = memoryAcknowledgeLead();
    await takeOverConversation(PHONE, {
      backend: "memory",
      prospect: unackedProspect(),
      actor: { userId: ACTOR },
      acknowledgeLeadFn
    });
    const returned = await returnConversationToAtlas(PHONE, { backend: "memory" });
    assert.equal(returned.ownershipState, "ATLAS");
    assert.equal(returned.next.manualAgentOwnership, false);
    assert.equal(returned.next.humanTakenOverAt, null);
  });
});

test("route + BR docs seal TAKE OVER → acknowledgeLead", () => {
  const route = fs.readFileSync(ROUTE_SRC, "utf8");
  assert.match(route, /prospect,/);
  assert.match(route, /actor:/);
  assert.match(route, /attention:/);

  const br080 = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(br080, /TAKE OVER[\s\S]*acknowledgeLead/);
  assert.match(br080, /Automatic acknowledgement triggers[\s\S]*TAKE OVER/);
});

test("P. Meta / execution boundary unchanged by this hotfix", () => {
  const ownership = fs.readFileSync(OWNERSHIP_SRC, "utf8");
  assert.doesNotMatch(ownership, /RECRUIT_AI_V2_EXECUTION_ENABLED\s*=\s*['"]true['"]/);
  assert.doesNotMatch(ownership, /LIVE_EXECUTION_PATH/);
  assert.doesNotMatch(ownership, /Meta Reviewer|ads? budget/i);
  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
  assert.notEqual(process.env.RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED, "true");
});
