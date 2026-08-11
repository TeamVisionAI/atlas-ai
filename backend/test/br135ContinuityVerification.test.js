/**
 * BR-135 + V2 continuity — restart mid-flow + HUMAN suppression boundaries.
 *
 * Continuity of knownFacts: recruit_ai_conversation_contexts (already durable).
 * HUMAN ownership silence: prospects.workflow_state (BR-135).
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createConversationContext
} = require("../core/recruitAiV2/conversationContext");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const {
  takeOverConversation
} = require("../core/conversationsCenter/conversationsCenterOwnershipService");
const {
  shouldDeliverAutomatedReply
} = require("../core/communicationHub");
const workflowStateStore = require("../core/workflowStateStore");
const { OWNERSHIP } = require("../core/workflowConstants");
const { STAGES } = require("../core/recruitAiV2/constants");
const {
  createAtomicWorkflowStateDb
} = require("./helpers/atomicWorkflowStateDb");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const PROSPECT_ID = "af02e5a9-bafd-442a-b333-346d099b8378";
const PHONE = "+17865559301";

test("mid-flow V2 knownFacts survive process clear; next turn does not GREETING restart", async () => {
  const seedContext = createConversationContext({
    organizationId: TEAM_VISION,
    prospectId: PROSPECT_ID,
    preferredLanguage: "spanish",
    timezone: "America/New_York"
  });
  seedContext.currentStage = STAGES.QUALIFICATION;
  seedContext.knownFacts = {
    ...seedContext.knownFacts,
    city: "Davenport",
    cityCertainty: "confirmed",
    state: "FL",
    stateCertainty: "confirmed",
    workAuthorization: true,
    workAuthorizationStatus: "authorized",
    preferredMeetingType: "in_person"
  };
  seedContext.conversation = {
    ...seedContext.conversation,
    lastQuestionAsked: "ask_day_part",
    clarificationCount: 0
  };

  const repo = createMemoryContextRepository([
    {
      organization_id: TEAM_VISION,
      prospect_id: PROSPECT_ID,
      channel: "whatsapp",
      context_json: seedContext,
      context_version: 1,
      conversation_version: 1
    }
  ]);

  // Simulate process restart: clear ephemeral workflow memory only.
  workflowStateStore.clearMemoryWorkflowStateStore();

  const loaded = await repo.findActiveByScope({
    organizationId: TEAM_VISION,
    prospectId: PROSPECT_ID,
    channel: "whatsapp"
  });
  assert.ok(loaded);
  const context = loaded.context_json;
  assert.equal(context.knownFacts.city, "Davenport");
  assert.equal(context.knownFacts.state, "FL");
  assert.equal(context.knownFacts.workAuthorization, true);
  assert.equal(context.conversation.lastQuestionAsked, "ask_day_part");
  assert.notEqual(context.currentStage, STAGES.GREETING);

  const interpretation = await interpretInboundMessage({
    text: "por la tarde",
    context
  });
  const decision = decideConversationTurn({
    context,
    interpretation
  });

  const nextAction = String(decision?.decision?.nextAction || "");
  assert.equal(/greet/i.test(nextAction), false);
  assert.equal(/ask_city|ask_authorization|ask_full_name/i.test(nextAction), false);
  assert.ok(nextAction.length > 0, `must produce a mid-flow nextAction, got=${nextAction}`);
});

test("HUMAN takeover survives DB SoR across memory clear; inbound stays silent", async () => {
  const db = createAtomicWorkflowStateDb({
    phone: PHONE,
    prospectId: PROSPECT_ID,
    organizationId: TEAM_VISION
  });
  const scope = db.scope();

  await takeOverConversation(PHONE, scope);
  workflowStateStore.clearMemoryWorkflowStateStore();

  const persisted = await workflowStateStore.loadPersistedWorkflowState(PHONE, {
    ...scope,
    backend: "database"
  });
  assert.equal(persisted.workflowOwnership, OWNERSHIP.AGENT);
  assert.equal(persisted.manualAgentOwnership, true);

  const prospect = {
    id: PROSPECT_ID,
    organization_id: TEAM_VISION,
    phone: PHONE,
    current_step: "QUALIFICATION"
  };

  // Hub loads without test mocks — stub only the store load to durable snapshot.
  const original = workflowStateStore.loadPersistedWorkflowState;
  workflowStateStore.loadPersistedWorkflowState = async () => persisted;
  try {
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);
  } finally {
    workflowStateStore.loadPersistedWorkflowState = original;
  }
});

test("production backend defaults to database; file forbidden", () => {
  assert.equal(
    workflowStateStore.resolveWorkflowStateBackend({
      NODE_ENV: "production"
    }),
    "database"
  );
  assert.throws(
    () =>
      workflowStateStore.resolveWorkflowStateBackend({
        NODE_ENV: "production",
        ATLAS_WORKFLOW_STATE_BACKEND: "file"
      }),
    (err) => err && err.code === "WORKFLOW_STATE_EPHEMERAL_FORBIDDEN"
  );
});

test("DB load error fails closed for automation decision (suppress, do not throw-open)", async () => {
  const prospect = {
    id: PROSPECT_ID,
    organization_id: TEAM_VISION,
    phone: PHONE,
    current_step: "QUALIFICATION"
  };

  const original = workflowStateStore.loadPersistedWorkflowState;
  workflowStateStore.loadPersistedWorkflowState = async () => {
    const err = new Error("db down");
    err.code = "WORKFLOW_STATE_DB_UNAVAILABLE";
    throw err;
  };
  try {
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);
  } finally {
    workflowStateStore.loadPersistedWorkflowState = original;
  }
});

test("execution remains OFF", () => {
  const {
    isExecutionEnabled
  } = require("../core/recruitAiV2/sideEffectAuthorizer");
  assert.equal(isExecutionEnabled(process.env), false);
});
