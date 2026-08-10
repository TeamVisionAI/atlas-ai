/**
 * Systemic HUMAN takeover silence — Andrea + Wajairo dual-conversation regression.
 *
 * For each HUMAN-owned thread:
 * TAKE OVER persisted before new inbound → inbound recorded path → automated outbound = 0.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ANDREA = {
  name: "Andrea",
  phone: "+17865551001",
  aliasPathPhone: " 17865551001"
};

const WAJAIRO = {
  name: "Wajairo",
  phone: "+17865551002",
  aliasPathPhone: "17865551002"
};

function clearWorkflowModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}workflowStateStore.js`) ||
      key.includes(`${path.sep}conversationsCenterOwnershipService.js`) ||
      key.includes(`${path.sep}communicationHub.js`)
    ) {
      delete require.cache[key];
    }
  }
}

async function withIsolatedWorkflowState(run) {
  const previousEnv = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const tempFile = path.join(
    os.tmpdir(),
    `atlas-workflow-silence-${process.pid}-${Date.now()}.json`
  );
  fs.writeFileSync(tempFile, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempFile;
  clearWorkflowModules();

  try {
    return await run();
  } finally {
    if (previousEnv == null) {
      delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_FILE = previousEnv;
    }
    clearWorkflowModules();
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
  }
}

async function simulateAutomatedOutboundAttempt(phone, outbound) {
  const {
    deliverWhatsAppReply,
    shouldDeliverAutomatedReply
  } = require("../core/communicationHub");

  const prospect = {
    phone,
    current_step: "QUALIFICATION",
    organization_id: "00000000-0000-4000-8000-000000000001"
  };

  assert.equal(
    shouldDeliverAutomatedReply(prospect),
    false,
    `${phone}: gate must suppress before delivery`
  );
  assert.equal(
    shouldDeliverAutomatedReply(prospect, { allowHandoffAck: true }),
    false,
    `${phone}: TAKE OVER must not reopen via allowHandoffAck`
  );

  const before = outbound.sendCount;
  const result = await deliverWhatsAppReply({
    normalized: {
      phone,
      text: "nuevo inbound despues de take over",
      channel: "whatsapp",
      providerMessageId: `test-${phone}-${Date.now()}`
    },
    prospect,
    replyText: "Atlas no debe enviar esto",
    engineResult: {
      reply: "Atlas no debe enviar esto",
      outboundIntent: "CONVERSATION_ENGINE_REPLY",
      source: "recruit_ai_v2_live_authoring",
      nextAction: "ask_day_part"
    },
    outboundIntent: "CONVERSATION_ENGINE_REPLY"
  });

  assert.equal(result.replied, false, `${phone}: replied must be false`);
  assert.equal(result.reason, "REPLY_SUPPRESSED", `${phone}: suppressed`);
  assert.equal(
    outbound.sendCount,
    before,
    `${phone}: automated outbound count must remain 0`
  );
}

test("Andrea + Wajairo: independent HUMAN takeovers keep automated outbound at 0", async () => {
  await withIsolatedWorkflowState(async () => {
    const {
      takeOverConversation,
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      loadPersistedWorkflowState,
      workflowStateKey
    } = require("../core/workflowStateStore");
    const outbound = require("../core/whatsappOutboundPipeline");

    const originalSend = outbound.sendAndPersistWhatsAppMessage;
    const tracker = { sendCount: 0 };
    outbound.sendAndPersistWhatsAppMessage = async () => {
      tracker.sendCount += 1;
      return { success: true, simulated: true };
    };

    try {
      for (const person of [ANDREA, WAJAIRO]) {
        const taken = takeOverConversation(person.aliasPathPhone, {
          reason: "take_over"
        });
        assert.equal(taken.ownershipState, "HUMAN", person.name);

        const stored = loadPersistedWorkflowState(person.phone);
        assert.equal(
          resolveConversationOwnershipState(stored),
          "HUMAN",
          `${person.name}: ownership persisted under storage phone`
        );
        assert.equal(stored.manualAgentOwnership, true, person.name);
        assert.equal(stored.needsHumanAttention, false, person.name);
        assert.equal(
          workflowStateKey(person.aliasPathPhone),
          person.phone,
          `${person.name}: alias collapses to E.164 key`
        );

        await simulateAutomatedOutboundAttempt(person.phone, tracker);
      }

      assert.equal(
        tracker.sendCount,
        0,
        "both Andrea and Wajairo combined automated outbound must remain 0"
      );
    } finally {
      outbound.sendAndPersistWhatsAppMessage = originalSend;
    }
  });
});

test("phone-key alias after TAKE OVER still silences inbound storagePhone", async () => {
  await withIsolatedWorkflowState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const {
      savePersistedWorkflowState,
      loadPersistedWorkflowState,
      workflowStateKey
    } = require("../core/workflowStateStore");
    const { OWNERSHIP } = require("../core/workflowConstants");

    savePersistedWorkflowState("17865551999", {
      workflowOwnership: OWNERSHIP.ATLAS,
      needsHumanAttention: false,
      manualAgentOwnership: false
    });

    takeOverConversation("+17865551999");
    assert.equal(workflowStateKey("17865551999"), "+17865551999");
    assert.equal(
      loadPersistedWorkflowState("17865551999").manualAgentOwnership,
      true
    );
    assert.equal(
      shouldDeliverAutomatedReply({
        phone: "+17865551999",
        current_step: "QUALIFICATION"
      }),
      false
    );
  });
});

test("execution remains OFF", () => {
  const {
    isExecutionEnabled
  } = require("../core/recruitAiV2/sideEffectAuthorizer");
  const {
    isLiveExecutionPathEnabled
  } = require("../core/recruitAiV2/liveExecutionPathConfig");

  assert.equal(isExecutionEnabled(process.env), false);
  assert.equal(isLiveExecutionPathEnabled(process.env), false);
});
