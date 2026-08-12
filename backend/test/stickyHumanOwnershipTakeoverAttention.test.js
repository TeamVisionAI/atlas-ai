/**
 * Sticky HUMAN ownership vs stall attention (BR-135 clarification).
 * Nancy reproduction: TAKE OVER → stall re-eval → remains HUMAN; Atlas silent.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function clearWorkflowModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}workflowStateStore.js`) ||
      key.includes(`${path.sep}conversationsCenterOwnershipService.js`) ||
      key.includes(`${path.sep}workflowOwnershipEngine.js`) ||
      key.includes(`${path.sep}communicationHub.js`) ||
      key.includes(`${path.sep}conversationsCenterHumanReplyService.js`) ||
      key.includes(`${path.sep}humanAdvancementEngine.js`)
    ) {
      delete require.cache[key];
    }
  }
}

async function withIsolatedWorkflowState(run) {
  const previousEnv = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const tempFile = path.join(
    os.tmpdir(),
    `atlas-sticky-human-${process.pid}-${Date.now()}.json`
  );
  fs.writeFileSync(tempFile, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempFile;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "file";
  clearWorkflowModules();

  try {
    return await run();
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
    clearWorkflowModules();
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
  }
}

const NANCY_PHONE = "+19044607190";

test("A. TAKE OVER → AGENT + manual + HUMAN + composer gate", async () => {
  await withIsolatedWorkflowState(async () => {
    const {
      takeOverConversation,
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { OWNERSHIP } = require("../core/workflowConstants");
    const {
      CONVERSATION_OWNERSHIP_STATE
    } = require("../core/conversationsCenter/constants");

    const taken = await takeOverConversation(NANCY_PHONE, { reason: "take_over" });
    const stored = await loadPersistedWorkflowState(NANCY_PHONE);

    assert.equal(taken.ownershipState, CONVERSATION_OWNERSHIP_STATE.HUMAN);
    assert.equal(stored.workflowOwnership, OWNERSHIP.AGENT);
    assert.equal(stored.manualAgentOwnership, true);
    assert.equal(Boolean(stored.humanTakenOverAt), true);
    assert.equal(stored.needsHumanAttention, false);
    assert.equal(resolveConversationOwnershipState(stored), "HUMAN");
  });
});

test("B–D. HUMAN + stall re-eval (Nancy) stays HUMAN; composer authorized", async () => {
  await withIsolatedWorkflowState(async () => {
    const {
      takeOverConversation,
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { applyStallTransition } = require("../core/workflowOwnershipEngine");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { OWNERSHIP } = require("../core/workflowConstants");
    const {
      CONVERSATION_OWNERSHIP_STATE
    } = require("../core/conversationsCenter/constants");

    await takeOverConversation(NANCY_PHONE, { reason: "take_over" });
    const afterTakeOver = await loadPersistedWorkflowState(NANCY_PHONE);
    const humanTakenOverAt = afterTakeOver.humanTakenOverAt;

    // Prospect Center / Mission Control evaluate path → applyStallTransition
    const stallResult = {
      isStalled: true,
      stallDetectedAt: "2026-08-11T23:32:39.628Z",
      stallEpisodeKey: "2026-08-10T21:14:07.957199+00:00",
      recommendedAction: "call",
      reason: "br_034_stall"
    };
    const transition = await applyStallTransition(
      NANCY_PHONE,
      afterTakeOver,
      stallResult,
      { canonicalMilestone: "QUALIFICATION", workflowOwnership: OWNERSHIP.ATLAS }
    );

    assert.equal(transition.applied, true);
    const afterStall = await loadPersistedWorkflowState(NANCY_PHONE);

    assert.equal(afterStall.needsHumanAttention, true);
    assert.equal(afterStall.manualAgentOwnership, true);
    assert.equal(afterStall.workflowOwnership, OWNERSHIP.AGENT);
    assert.equal(afterStall.humanTakenOverAt, humanTakenOverAt);
    assert.equal(
      resolveConversationOwnershipState(afterStall),
      CONVERSATION_OWNERSHIP_STATE.HUMAN,
      "B/D: stall attention must not demote sticky HUMAN"
    );

    // C: refresh / re-resolve from durable state
    assert.equal(
      resolveConversationOwnershipState(await loadPersistedWorkflowState(NANCY_PHONE)),
      "HUMAN"
    );

    // Composer authorization uses same resolver
    const ownershipState = resolveConversationOwnershipState(afterStall);
    assert.equal(ownershipState, CONVERSATION_OWNERSHIP_STATE.HUMAN);
    assert.notEqual(ownershipState, "NEEDS_ATTENTION");
  });
});

test("E–G. HUMAN sticky → Atlas silence (allowHandoffAck / V2 / CE)", async () => {
  await withIsolatedWorkflowState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { applyStallTransition } = require("../core/workflowOwnershipEngine");
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { OWNERSHIP } = require("../core/workflowConstants");

    await takeOverConversation(NANCY_PHONE, { reason: "take_over" });
    const persisted = await loadPersistedWorkflowState(NANCY_PHONE);
    await applyStallTransition(
      NANCY_PHONE,
      persisted,
      {
        isStalled: true,
        stallDetectedAt: new Date().toISOString(),
        stallEpisodeKey: "2026-08-10T21:14:07.957Z",
        reason: "br_034_stall"
      },
      { canonicalMilestone: "QUALIFICATION", workflowOwnership: OWNERSHIP.ATLAS }
    );

    const prospect = {
      phone: NANCY_PHONE,
      current_step: "QUALIFICATION",
      organization_id: "00000000-0000-4000-8000-000000000001"
    };

    assert.equal(await shouldDeliverAutomatedReply(prospect), false, "F: normal");
    assert.equal(
      await shouldDeliverAutomatedReply(prospect, { allowHandoffAck: true }),
      false,
      "E: allowHandoffAck hole closed"
    );
  });
});

test("H. RETURN TO ATLAS releases sticky HUMAN", async () => {
  await withIsolatedWorkflowState(async () => {
    const {
      takeOverConversation,
      returnConversationToAtlas,
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");

    await takeOverConversation(NANCY_PHONE, { reason: "take_over" });
    const returned = await returnConversationToAtlas(NANCY_PHONE);
    const stored = await loadPersistedWorkflowState(NANCY_PHONE);

    assert.equal(returned.ownershipState, "ATLAS");
    assert.equal(stored.manualAgentOwnership, false);
    assert.equal(stored.humanTakenOverAt, null);
    assert.equal(resolveConversationOwnershipState(stored), "ATLAS");
    assert.equal(
      await shouldDeliverAutomatedReply({
        phone: NANCY_PHONE,
        current_step: "QUALIFICATION"
      }),
      true
    );
  });
});

test("I. ATLAS-owned stall (no TAKE OVER seal) stays NEEDS_ATTENTION", async () => {
  await withIsolatedWorkflowState(async () => {
    const {
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { applyStallTransition } = require("../core/workflowOwnershipEngine");
    const {
      savePersistedWorkflowState,
      loadPersistedWorkflowState
    } = require("../core/workflowStateStore");
    const { OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865550901";
    await savePersistedWorkflowState(phone, {
      workflowOwnership: OWNERSHIP.ATLAS,
      manualAgentOwnership: false,
      needsHumanAttention: false,
      humanTakenOverAt: null
    });

    const persisted = await loadPersistedWorkflowState(phone);
    await applyStallTransition(
      phone,
      persisted,
      {
        isStalled: true,
        stallDetectedAt: new Date().toISOString(),
        stallEpisodeKey: "2026-08-01T00:00:00.000Z",
        reason: "br_034_stall"
      },
      { canonicalMilestone: "QUALIFICATION", workflowOwnership: OWNERSHIP.ATLAS }
    );

    const after = await loadPersistedWorkflowState(phone);
    assert.equal(after.needsHumanAttention, true);
    assert.equal(after.humanTakenOverAt, null);
    assert.equal(resolveConversationOwnershipState(after), "NEEDS_ATTENTION");
  });
});

test("J. Non-stalled HUMAN prospect unchanged", async () => {
  await withIsolatedWorkflowState(async () => {
    const {
      takeOverConversation,
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");

    await takeOverConversation("+17865550902", { reason: "take_over" });
    const stored = await loadPersistedWorkflowState("+17865550902");
    assert.equal(stored.needsHumanAttention, false);
    assert.equal(resolveConversationOwnershipState(stored), "HUMAN");
  });
});

const RUTH_PHONE = "+17879398651";

async function withAdvancementStubs(phone, prospectOverrides, run) {
  const supabaseService = require("../services/supabaseService");
  const milestoneValidation = require("../core/milestoneValidationEngine");
  const humanAdvancementEvents = require("../core/humanAdvancementEvents");
  const missionControlReadModel = require("../core/missionControlReadModel");
  const workflowReadModel = require("../core/workflowReadModel");
  const { buildProfileFromProspect } = require("../core/informationModel");

  const prospect = {
    id: "e2ca5108-d6ad-4654-b9b4-f1a6184e3c56",
    phone,
    name: "Ruth Dismary Vizcaíno",
    organization_id: "00000000-0000-4000-8000-000000000001",
    city: "Tampa",
    state: "FL",
    work_authorized: true,
    interview_type: "Zoom",
    current_step: "DAY_PART",
    notes: null,
    ...prospectOverrides
  };

  const originalFind = supabaseService.findProspect;
  const originalUpdate = supabaseService.updateProspect;
  const originalValidate = milestoneValidation.validateMilestoneAdvancement;
  const originalEmit = humanAdvancementEvents.emitHumanAdvancementEvents;
  const originalMc = missionControlReadModel.getMissionControlState;
  const originalHints = workflowReadModel.fetchMessageHints;

  supabaseService.findProspect = async () => ({ ...prospect });
  supabaseService.updateProspect = async (_phone, updates) => {
    Object.assign(prospect, updates);
    return { ...prospect };
  };
  milestoneValidation.validateMilestoneAdvancement = ({
    targetMilestone,
    prospect: p,
    capturedFields
  }) => ({
    valid: true,
    mergedProfile: {
      ...buildProfileFromProspect(p),
      authorization:
        capturedFields.authorization !== undefined
          ? capturedFields.authorization
          : buildProfileFromProspect(p).authorization,
      interviewType:
        capturedFields.interviewType || buildProfileFromProspect(p).interviewType,
      city: capturedFields.city || buildProfileFromProspect(p).city,
      state: capturedFields.state || buildProfileFromProspect(p).state
    }
  });
  humanAdvancementEvents.emitHumanAdvancementEvents = async () => [];
  missionControlReadModel.getMissionControlState = async () => ({
    brain: { currentStep: prospect.current_step, missingFields: [] }
  });
  workflowReadModel.fetchMessageHints = async () => ({});

  // Force humanAdvancementEngine to pick up stubs via already-loaded deps —
  // it binds findProspect at require time, so clear and re-require after stubs.
  delete require.cache[require.resolve("../core/humanAdvancementEngine.js")];

  try {
    return await run({ prospect });
  } finally {
    supabaseService.findProspect = originalFind;
    supabaseService.updateProspect = originalUpdate;
    milestoneValidation.validateMilestoneAdvancement = originalValidate;
    humanAdvancementEvents.emitHumanAdvancementEvents = originalEmit;
    missionControlReadModel.getMissionControlState = originalMc;
    workflowReadModel.fetchMessageHints = originalHints;
    delete require.cache[require.resolve("../core/humanAdvancementEngine.js")];
  }
}

test("Ruth-1. TAKE OVER → Complete Qualification auth+interview → BR-035 stays HUMAN", async () => {
  await withIsolatedWorkflowState(async () => {
    await withAdvancementStubs(RUTH_PHONE, {}, async () => {
      const {
        takeOverConversation,
        resolveConversationOwnershipState
      } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
      const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
      const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
      const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
      const { OWNERSHIP, MILESTONES } = require("../core/workflowConstants");

      const taken = await takeOverConversation(RUTH_PHONE, { reason: "take_over" });
      assert.equal(taken.ownershipState, "HUMAN");
      const seal = (await loadPersistedWorkflowState(RUTH_PHONE)).humanTakenOverAt;

      const result = await advanceProspectWorkflow(RUTH_PHONE, {
        targetMilestone: MILESTONES.QUALIFICATION,
        capturedFields: {
          authorization: true,
          interviewType: "Zoom"
        },
        interactionNotes: "Required information updated: Work Authorization, Interview Type.",
        interactionType: "phone"
      });

      assert.equal(result.success, true, result.error || result.message);
      const after = await loadPersistedWorkflowState(RUTH_PHONE);
      assert.equal(after.manualAgentOwnership, true);
      assert.equal(after.workflowOwnership, OWNERSHIP.AGENT);
      assert.equal(after.humanTakenOverAt, seal);
      assert.equal(resolveConversationOwnershipState(after), "HUMAN");
      assert.equal(
        await shouldDeliverAutomatedReply({
          phone: RUTH_PHONE,
          current_step: "DAY_PART",
          organization_id: "00000000-0000-4000-8000-000000000001"
        }),
        false
      );
      assert.equal(
        await shouldDeliverAutomatedReply(
          {
            phone: RUTH_PHONE,
            current_step: "DAY_PART",
            organization_id: "00000000-0000-4000-8000-000000000001"
          },
          { allowHandoffAck: true }
        ),
        false
      );
    });
  });
});

test("Ruth-2. HUMAN + City/State qualification submit → remains HUMAN", async () => {
  await withIsolatedWorkflowState(async () => {
    await withAdvancementStubs(RUTH_PHONE, {}, async () => {
      const {
        takeOverConversation,
        resolveConversationOwnershipState
      } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
      const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
      const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
      const { OWNERSHIP, MILESTONES } = require("../core/workflowConstants");

      await takeOverConversation(RUTH_PHONE, { reason: "take_over" });
      const result = await advanceProspectWorkflow(RUTH_PHONE, {
        targetMilestone: MILESTONES.QUALIFICATION,
        capturedFields: { city: "Tampa", state: "FL" },
        interactionNotes: "Required information updated: City, State.",
        interactionType: "phone"
      });

      assert.equal(result.success, true, result.error || result.message);
      const after = await loadPersistedWorkflowState(RUTH_PHONE);
      assert.equal(after.manualAgentOwnership, true);
      assert.equal(after.workflowOwnership, OWNERSHIP.AGENT);
      assert.equal(resolveConversationOwnershipState(after), "HUMAN");
    });
  });
});

test("11. Non-HUMAN qualification advancement → BR-035 still resumes ATLAS", async () => {
  await withIsolatedWorkflowState(async () => {
    await withAdvancementStubs("+17865550911", {}, async () => {
      const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
      const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
      const { OWNERSHIP, MILESTONES } = require("../core/workflowConstants");

      await savePersistedWorkflowState("+17865550911", {
        workflowOwnership: OWNERSHIP.ATLAS,
        manualAgentOwnership: false,
        needsHumanAttention: false,
        humanTakenOverAt: null,
        canonicalMilestone: MILESTONES.NEW_LEAD
      });

      const result = await advanceProspectWorkflow("+17865550911", {
        targetMilestone: MILESTONES.QUALIFICATION,
        capturedFields: { authorization: true, interviewType: "Zoom" },
        interactionType: "phone"
      });

      assert.equal(result.success, true, result.error || result.message);
      const after = await loadPersistedWorkflowState("+17865550911");
      assert.equal(after.manualAgentOwnership, false);
      assert.equal(after.workflowOwnership, OWNERSHIP.ATLAS);
    });
  });
});

test("safety: execution / live path remain OFF", () => {
  const {
    isExecutionEnabled
  } = require("../core/recruitAiV2/sideEffectAuthorizer");
  const {
    isLiveExecutionPathEnabled
  } = require("../core/recruitAiV2/liveExecutionPathConfig");

  assert.equal(isExecutionEnabled(process.env), false);
  assert.equal(isLiveExecutionPathEnabled(process.env), false);
});
