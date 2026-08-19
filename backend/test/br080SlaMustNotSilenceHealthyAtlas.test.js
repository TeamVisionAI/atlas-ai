/**
 * BR-080 15m SLA must not silence healthy Atlas-owned conversations.
 * CRM escalation metadata may persist; conversational ownership stays ATLAS.
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
const PHONE = "+14075550800";

function clearModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}workflowStateStore.js`) ||
      key.includes(`${path.sep}newLeadAttentionEngine.js`) ||
      key.includes(`${path.sep}communicationHub.js`) ||
      key.includes(`${path.sep}conversationsCenterOwnershipService.js`)
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
    `atlas-br080-sla-continuity-${process.pid}-${Date.now()}.json`
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

function healthyWaitingProspect(overrides = {}) {
  const now = Date.now();
  return {
    id: "prospect-br080-sla-continuity",
    phone: PHONE,
    name: "SLA Continuity Prospect",
    organization_id: ORG,
    owner_user_id: OWNER,
    current_step: "QUALIFICATION",
    entry_method: "QR",
    source: "car_magnet",
    attention_status: "waiting_for_prospect",
    acknowledged_at: null,
    escalation_level: 1,
    new_lead_received_at: new Date(now - 16 * 60 * 1000).toISOString(),
    ...overrides
  };
}

function stubCrmWrites() {
  const supabaseService = require("../services/supabaseService");
  const captured = [];
  const originalUpdate = supabaseService.updateProspectInOrganization;
  supabaseService.updateProspectInOrganization = async (phone, organizationId, updates) => {
    captured.push({ phone, organizationId, updates });
    return { phone, organization_id: organizationId, ...updates };
  };
  return {
    captured,
    restore() {
      supabaseService.updateProspectInOrganization = originalUpdate;
    }
  };
}

async function seedAtlasWaiting() {
  const { savePersistedWorkflowState } = require("../core/workflowStateStore");
  await savePersistedWorkflowState(
    PHONE,
    {
      canonicalMilestone: "QUALIFICATION",
      workflowOwnership: "ATLAS",
      needsHumanAttention: false,
      stalledAt: null,
      stallEpisodeKey: null,
      manualAgentOwnership: false,
      humanTakenOverAt: null,
      handoffReason: null
    },
    { organizationId: ORG, prospectId: "prospect-br080-sla-continuity" }
  );
}

test("healthy waiting_for_prospect 15m SLA keeps ATLAS ownership and CRM metadata", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    try {
      await seedAtlasWaiting();
      const { applyEscalation, evaluateEscalation } = require("../core/newLeadAttentionEngine");
      const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
      const { shouldDeliverAutomatedReply } = require("../core/communicationHub");

      const prospect = healthyWaitingProspect();
      const decision = evaluateEscalation(prospect, Date.now());
      assert.equal(decision.shouldEscalate, true);
      assert.equal(decision.level, 2);

      const result = await applyEscalation(prospect, decision);
      assert.equal(result.escalated, true);
      assert.equal(result.prospect.attention_status, "human_required");
      assert.equal(result.prospect.escalation_level, 2);
      assert.equal(result.prospect.human_attention_reason, "unacknowledged_sla_15m");
      assert.ok(result.prospect.last_escalated_at);

      const crmPatch = crm.captured.find((row) => row.updates.escalation_level === 2);
      assert.ok(crmPatch, "CRM escalation metadata must be written");
      assert.equal(crmPatch.updates.attention_status, "human_required");

      const persisted = await loadPersistedWorkflowState(PHONE, {
        organizationId: ORG,
        prospectId: "prospect-br080-sla-continuity"
      });
      assert.equal(persisted.workflowOwnership, "ATLAS");
      assert.equal(persisted.needsHumanAttention, false);
      assert.equal(persisted.manualAgentOwnership, false);
      assert.equal(persisted.humanTakenOverAt, null);

      assert.equal(
        await shouldDeliverAutomatedReply(result.prospect),
        true,
        "next inbound must still be Atlas-authored"
      );
    } finally {
      crm.restore();
    }
  });
});

test("healthy ai_responding 15m SLA also keeps ATLAS ownership", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    try {
      await seedAtlasWaiting();
      const { applyEscalation, evaluateEscalation } = require("../core/newLeadAttentionEngine");
      const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
      const { shouldDeliverAutomatedReply } = require("../core/communicationHub");

      const prospect = healthyWaitingProspect({ attention_status: "ai_responding" });
      const decision = evaluateEscalation(prospect, Date.now());
      const result = await applyEscalation(prospect, decision);
      assert.equal(result.escalated, true);

      const persisted = await loadPersistedWorkflowState(PHONE);
      assert.equal(persisted.workflowOwnership, "ATLAS");
      assert.equal(persisted.needsHumanAttention, false);
      assert.equal(await shouldDeliverAutomatedReply(result.prospect), true);
    } finally {
      crm.restore();
    }
  });
});

test("Atlas asked → 15m SLA → prospect replies Sí → Atlas still authors automatically", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
    const outbound = require("../core/whatsappOutboundPipeline");
    const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
    const originalSend = outbound.sendAndPersistWhatsAppMessage;
    let sendCount = 0;

    try {
      await seedAtlasWaiting();
      const { applyEscalation, evaluateEscalation } = require("../core/newLeadAttentionEngine");
      const {
        processNormalizedInboundMessage,
        shouldDeliverAutomatedReply
      } = require("../core/communicationHub");

      const prospect = healthyWaitingProspect();
      const afterSla = await applyEscalation(
        prospect,
        evaluateEscalation(prospect, Date.now())
      );

      liveAuthoringBridge.attemptLiveV2Authoring = async () => ({
        authored: true,
        replyText: "¿En qué ciudad vives?",
        nextAction: "ask_city"
      });
      outbound.sendAndPersistWhatsAppMessage = async () => {
        sendCount += 1;
        return { success: true, simulated: true };
      };

      assert.equal(await shouldDeliverAutomatedReply(afterSla.prospect), true);

      const inbound = await processNormalizedInboundMessage(
        {
          phone: PHONE,
          text: "Sí",
          channel: "whatsapp",
          contactName: "SLA Continuity Prospect",
          providerMessageId: `br080-sla-${Date.now()}`
        },
        { prospect: afterSla.prospect }
      );

      assert.notEqual(inbound.reason, "REPLY_SUPPRESSED");
      assert.equal(inbound.replied, true);
      assert.equal(sendCount, 1);
      assert.match(String(inbound.replyText || ""), /ciudad/i);
    } finally {
      liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
      outbound.sendAndPersistWhatsAppMessage = originalSend;
      crm.restore();
    }
  });
});

test("unassigned new 15m SLA still seizes conversational AGENT ownership", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    try {
      await seedAtlasWaiting();
      const { applyEscalation, evaluateEscalation } = require("../core/newLeadAttentionEngine");
      const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
      const { shouldDeliverAutomatedReply } = require("../core/communicationHub");

      const prospect = healthyWaitingProspect({
        attention_status: "new",
        owner_user_id: null,
        assignment_status: "unassigned"
      });
      const result = await applyEscalation(
        prospect,
        evaluateEscalation(prospect, Date.now())
      );
      assert.equal(result.escalated, true);

      const persisted = await loadPersistedWorkflowState(PHONE);
      assert.equal(persisted.workflowOwnership, "AGENT");
      assert.equal(persisted.needsHumanAttention, true);
      assert.equal(await shouldDeliverAutomatedReply(result.prospect), false);
    } finally {
      crm.restore();
    }
  });
});

test("real failure markHumanAttentionRequired still seizes AGENT", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    try {
      await seedAtlasWaiting();
      const { markHumanAttentionRequired } = require("../core/newLeadAttentionEngine");
      const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
      const { shouldDeliverAutomatedReply } = require("../core/communicationHub");

      await markHumanAttentionRequired(
        healthyWaitingProspect(),
        "provider_send_failed"
      );

      const persisted = await loadPersistedWorkflowState(PHONE);
      assert.equal(persisted.workflowOwnership, "AGENT");
      assert.equal(persisted.needsHumanAttention, true);
      assert.equal(persisted.manualAgentOwnership, true);
      assert.equal(
        await shouldDeliverAutomatedReply(healthyWaitingProspect()),
        false
      );
    } finally {
      crm.restore();
    }
  });
});

test("TAKE OVER still silences Atlas after a healthy 15m SLA", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    const outbound = require("../core/whatsappOutboundPipeline");
    const originalSend = outbound.sendAndPersistWhatsAppMessage;
    let sendCount = 0;

    try {
      await seedAtlasWaiting();
      const { applyEscalation, evaluateEscalation } = require("../core/newLeadAttentionEngine");
      const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
      const {
        shouldDeliverAutomatedReply,
        deliverWhatsAppReply
      } = require("../core/communicationHub");

      const prospect = healthyWaitingProspect();
      await applyEscalation(prospect, evaluateEscalation(prospect, Date.now()));

      await savePersistedWorkflowState(PHONE, {
        workflowOwnership: "AGENT",
        manualAgentOwnership: true,
        humanTakenOverAt: new Date().toISOString(),
        needsHumanAttention: false
      });

      const persisted = await loadPersistedWorkflowState(PHONE);
      assert.equal(persisted.manualAgentOwnership, true);
      assert.ok(persisted.humanTakenOverAt);

      outbound.sendAndPersistWhatsAppMessage = async () => {
        sendCount += 1;
        return { success: true, simulated: true };
      };

      assert.equal(await shouldDeliverAutomatedReply(prospect), false);
      assert.equal(
        await shouldDeliverAutomatedReply(prospect, { allowHandoffAck: true }),
        false
      );

      const result = await deliverWhatsAppReply({
        normalized: {
          phone: PHONE,
          text: "Sí",
          channel: "whatsapp",
          providerMessageId: `br080-takeover-${Date.now()}`
        },
        prospect,
        replyText: "Atlas must not send this",
        engineResult: {
          reply: "Atlas must not send this",
          source: "recruit_ai_v2_live_authoring",
          nextAction: "ask_city"
        }
      });

      assert.equal(result.replied, false);
      assert.equal(result.reason, "REPLY_SUPPRESSED");
      assert.equal(sendCount, 0);
    } finally {
      outbound.sendAndPersistWhatsAppMessage = originalSend;
      crm.restore();
    }
  });
});
