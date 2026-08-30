/**
 * BR-080 — a delivered Atlas reply satisfies first-response SLA.
 * Must not enter Needs Attention solely for an unacknowledged new lead.
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
const PHONE = "+14075550986";

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
    `atlas-br080-first-response-${process.pid}-${Date.now()}.json`
  );
  fs.writeFileSync(tempFile, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempFile;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "file";
  clearModules();

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
    clearModules();
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
  }
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

function newLeadProspect(overrides = {}) {
  const now = Date.now();
  return {
    id: "prospect-br080-first-response",
    phone: PHONE,
    name: "First Response Prospect",
    organization_id: ORG,
    owner_user_id: OWNER,
    current_step: "NEW",
    status: "NEW",
    entry_method: null,
    source: null,
    attention_status: "new",
    acknowledged_at: null,
    escalation_level: 0,
    human_attention_reason: null,
    new_lead_received_at: new Date(now - 16 * 60 * 1000).toISOString(),
    created_at: new Date(now - 16 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" },
    ...overrides
  };
}

async function seedAtlasOwned() {
  const { savePersistedWorkflowState } = require("../core/workflowStateStore");
  await savePersistedWorkflowState(
    PHONE,
    {
      canonicalMilestone: "NEW_LEAD",
      workflowOwnership: "ATLAS",
      needsHumanAttention: false,
      stalledAt: null,
      stallEpisodeKey: null,
      manualAgentOwnership: false,
      humanTakenOverAt: null,
      handoffReason: null,
      atlasEligibilitySource: "CTWA_REFERRAL"
    },
    { organizationId: ORG, prospectId: "prospect-br080-first-response" }
  );
}

test("markAiResponding uses persisted CTWA eligibility when row source fields are blank", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    try {
      await seedAtlasOwned();
      const { markAiResponding } = require("../core/newLeadAttentionEngine");
      const after = await markAiResponding(newLeadProspect({
        new_lead_received_at: new Date().toISOString(),
        escalation_level: 0
      }), { waitingForProspect: true });
      assert.equal(after.attention_status, "waiting_for_prospect");
      assert.ok(crm.captured.some((row) => row.updates.attention_status === "waiting_for_prospect"));
    } finally {
      crm.restore();
    }
  });
});

test("inbound → Atlas delivered reply within SLA → no Needs Attention after SLA timer", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    try {
      await seedAtlasOwned();
      const {
        markAiResponding,
        evaluateEscalation,
        applyEscalation,
        processLeadEscalationsForOrganization
      } = require("../core/newLeadAttentionEngine");
      const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
      const {
        resolveConversationOwnershipState
      } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

      const createdAt = new Date(Date.now() - 12 * 1000).toISOString();
      let prospect = newLeadProspect({
        attention_status: "new",
        new_lead_received_at: createdAt,
        created_at: createdAt,
        escalation_level: 0
      });

      prospect = await markAiResponding(prospect, { waitingForProspect: true });
      assert.equal(prospect.attention_status, "waiting_for_prospect");

      const afterTimer = {
        ...prospect,
        new_lead_received_at: new Date(Date.now() - 16 * 60 * 1000).toISOString()
      };
      const decision = evaluateEscalation(afterTimer, Date.now());
      assert.equal(decision.shouldEscalate, false);
      assert.equal(decision.reason, "first_response_satisfied");

      const applied = await applyEscalation(afterTimer, decision);
      assert.equal(applied.escalated, false);

      const poll = await processLeadEscalationsForOrganization(ORG, {
        nowMs: Date.now(),
        loadProspects: async () => [afterTimer],
        lookupDeliveredFirstResponse: async () => true
      });
      assert.equal(poll.escalated, 0);

      const persisted = await loadPersistedWorkflowState(PHONE, {
        organizationId: ORG,
        prospectId: "prospect-br080-first-response"
      });
      assert.equal(persisted.needsHumanAttention, false);
      assert.equal(persisted.workflowOwnership, "ATLAS");
      assert.equal(resolveConversationOwnershipState(persisted), "ATLAS");
      assert.equal(
        crm.captured.some((row) => row.updates.attention_status === "human_required"),
        false
      );
    } finally {
      crm.restore();
    }
  });
});

test("poller skips 15m unacknowledged SLA when outbound was delivered but attention stayed new", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    try {
      await seedAtlasOwned();
      const { processLeadEscalationsForOrganization } = require("../core/newLeadAttentionEngine");
      const { loadPersistedWorkflowState } = require("../core/workflowStateStore");

      const prospect = newLeadProspect({ attention_status: "new" });
      const poll = await processLeadEscalationsForOrganization(ORG, {
        nowMs: Date.now(),
        loadProspects: async () => [prospect],
        lookupDeliveredFirstResponse: async () => true
      });
      assert.equal(poll.escalated, 0);
      assert.ok(crm.captured.some((row) => row.updates.attention_status === "waiting_for_prospect"));

      const persisted = await loadPersistedWorkflowState(PHONE, {
        organizationId: ORG,
        prospectId: "prospect-br080-first-response"
      });
      assert.equal(persisted.needsHumanAttention, false);
      assert.equal(persisted.workflowOwnership, "ATLAS");
    } finally {
      crm.restore();
    }
  });
});

test("stale unacknowledged_sla Needs Attention is repaired after delivered first response", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    try {
      const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
      await savePersistedWorkflowState(
        PHONE,
        {
          canonicalMilestone: "NEW_LEAD",
          workflowOwnership: "AGENT",
          needsHumanAttention: true,
          manualAgentOwnership: false,
          humanTakenOverAt: null,
          stalledAt: null,
          handoffReason: null,
          atlasEligibilitySource: "CTWA_REFERRAL"
        },
        { organizationId: ORG, prospectId: "prospect-br080-first-response" }
      );

      const { processLeadEscalationsForOrganization } = require("../core/newLeadAttentionEngine");
      const {
        resolveConversationOwnershipState
      } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

      const prospect = newLeadProspect({
        attention_status: "human_required",
        human_attention_reason: "unacknowledged_sla_15m",
        escalation_level: 2
      });
      const poll = await processLeadEscalationsForOrganization(ORG, {
        nowMs: Date.now(),
        loadProspects: async () => [prospect],
        lookupDeliveredFirstResponse: async () => true
      });
      assert.equal(poll.escalated, 0);
      assert.equal(poll.repaired, 1);
      assert.ok(crm.captured.some((row) => row.updates.attention_status === "waiting_for_prospect"));
      assert.ok(crm.captured.some((row) => row.updates.human_attention_reason === null));

      const persisted = await loadPersistedWorkflowState(PHONE, {
        organizationId: ORG,
        prospectId: "prospect-br080-first-response"
      });
      assert.equal(persisted.needsHumanAttention, false);
      assert.equal(persisted.workflowOwnership, "ATLAS");
      assert.equal(resolveConversationOwnershipState(persisted), "ATLAS");
    } finally {
      crm.restore();
    }
  });
});

test("real provider failure Needs Attention is not repaired by first-response SLA", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    try {
      const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
      await savePersistedWorkflowState(
        PHONE,
        {
          canonicalMilestone: "NEW_LEAD",
          workflowOwnership: "AGENT",
          needsHumanAttention: true,
          manualAgentOwnership: true,
          handoffReason: "provider_send_failed",
          atlasEligibilitySource: "CTWA_REFERRAL"
        },
        { organizationId: ORG, prospectId: "prospect-br080-first-response" }
      );

      const { processLeadEscalationsForOrganization } = require("../core/newLeadAttentionEngine");
      const prospect = newLeadProspect({
        attention_status: "human_required",
        human_attention_reason: "provider_send_failed",
        escalation_level: 2
      });
      const poll = await processLeadEscalationsForOrganization(ORG, {
        nowMs: Date.now(),
        loadProspects: async () => [prospect],
        lookupDeliveredFirstResponse: async () => true
      });
      assert.equal(poll.repaired, 0);
      const persisted = await loadPersistedWorkflowState(PHONE, {
        organizationId: ORG,
        prospectId: "prospect-br080-first-response"
      });
      assert.equal(persisted.needsHumanAttention, true);
    } finally {
      crm.restore();
    }
  });
});
