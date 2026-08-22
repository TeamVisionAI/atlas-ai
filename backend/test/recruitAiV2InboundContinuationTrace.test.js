/**
 * Production trace regression — Case B (Rosi / Miami stall).
 * CTWA prospect must stay Atlas-owned through 15m SLA and answer Miami on turn 2.
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ORG = "00000000-0000-4000-8000-000000000001";
const OWNER = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PHONE = "+13053479639";

function clearModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}workflowStateStore.js`) ||
      key.includes(`${path.sep}newLeadAttentionEngine.js`) ||
      key.includes(`${path.sep}communicationHub.js`) ||
      key.includes(`${path.sep}conversationsCenterInboxEligibility.js`)
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
    `atlas-inbound-trace-${process.pid}-${Date.now()}.json`
  );
  fs.writeFileSync(tempFile, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempFile;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "file";
  clearModules();

  try {
    return await run(tempFile);
  } finally {
    if (previousEnv == null) delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    else process.env.ATLAS_WORKFLOW_STATE_FILE = previousEnv;
    if (previousBackend == null) delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
    else process.env.ATLAS_WORKFLOW_STATE_BACKEND = previousBackend;
    clearModules();
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
  }
}

function ctwaProspect(overrides = {}) {
  const now = Date.now();
  return {
    id: "prospect-rosi-trace",
    phone: PHONE,
    name: "Rosi",
    organization_id: ORG,
    owner_user_id: OWNER,
    current_step: "NEW",
    entry_method: "CLICK_TO_WHATSAPP",
    source: "FACEBOOK",
    attention_status: "new",
    acknowledged_at: null,
    escalation_level: 0,
    new_lead_received_at: new Date(now - 16 * 60 * 1000).toISOString(),
    ...overrides
  };
}

function stubCrmWrites() {
  const supabaseService = require("../services/supabaseService");
  const originalUpdate = supabaseService.updateProspectInOrganization;
  const captured = [];
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

test("CLICK_TO_WHATSAPP stored origin counts as recruiting for BR-080 attention", () => {
  const {
    evaluateRecruitingInboxEligibility
  } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
  const result = evaluateRecruitingInboxEligibility(ctwaProspect());
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "VERIFIED_STORED_ORIGIN");
});

test("Meta unsupported message type normalizes to [unsupported message] body", () => {
  const { parseWhatsAppWebhookBody } = require("../services/whatsappWebhookParser");
  const parsed = parseWhatsAppWebhookBody({
    entry: [
      {
        id: "waba",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "pnid" },
              contacts: [{ profile: { name: "Miguel" } }],
              messages: [
                {
                  from: "17865020202",
                  id: "wamid.unsupported",
                  timestamp: "1755875022",
                  type: "unsupported"
                }
              ]
            }
          }
        ]
      }
    ]
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].body, "[unsupported message]");
  assert.equal(parsed[0].ctwaReferral, null);
});

test("CTWA first turn → 15m SLA → Miami still delivers recruiting reply", async () => {
  await withIsolatedState(async () => {
    const crm = stubCrmWrites();
    const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
    const outbound = require("../core/whatsappOutboundPipeline");
    const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
    const originalSend = outbound.sendAndPersistWhatsAppMessage;
    let sendCount = 0;

    try {
      const { savePersistedWorkflowState } = require("../core/workflowStateStore");
      const {
        markAiResponding,
        applyEscalation,
        evaluateEscalation
      } = require("../core/newLeadAttentionEngine");
      const {
        processNormalizedInboundMessage,
        shouldDeliverAutomatedReply
      } = require("../core/communicationHub");

      let prospect = ctwaProspect();
      await savePersistedWorkflowState(
        PHONE,
        {
          canonicalMilestone: "NEW_LEAD",
          workflowOwnership: "ATLAS",
          atlasEligibilitySource: "CTWA_REFERRAL"
        },
        { organizationId: ORG, prospectId: prospect.id }
      );

      // Turn 1 — Atlas answered the CTWA opener.
      prospect = await markAiResponding(prospect, { waitingForProspect: true });
      assert.equal(prospect.attention_status, "waiting_for_prospect");

      // 15m unacknowledged SLA while Atlas is waiting for location.
      const afterSla = await applyEscalation(
        prospect,
        evaluateEscalation(prospect, Date.now())
      );
      assert.equal(afterSla.escalated, true);
      assert.equal(afterSla.prospect.human_attention_reason, "unacknowledged_sla_15m");

      const persisted = await require("../core/workflowStateStore").loadPersistedWorkflowState(
        PHONE,
        { organizationId: ORG, prospectId: prospect.id }
      );
      assert.equal(persisted.workflowOwnership, "ATLAS");
      assert.equal(persisted.needsHumanAttention, false);
      assert.equal(await shouldDeliverAutomatedReply(afterSla.prospect), true);

      liveAuthoringBridge.attemptLiveV2Authoring = async () => ({
        eligible: true,
        authored: true,
        fallThrough: false,
        replyText: "Perfecto. ¿Miami, Florida?",
        nextAction: "confirm_location_proposal",
        v2Result: { responsePlan: { templateKey: "confirm_location_proposal" } },
        actingUserId: OWNER,
        organizationId: ORG,
        allowExecution: false,
        stage: "recruit_ai_v2_live_authoring_used"
      });
      outbound.sendAndPersistWhatsAppMessage = async () => {
        sendCount += 1;
        return { success: true, simulated: true };
      };

      const miami = await processNormalizedInboundMessage(
        {
          channel: "whatsapp",
          phone: PHONE,
          text: "Miami",
          contactName: "Rosi",
          providerMessageId: `trace-miami-${Date.now()}`,
          messageType: "text",
          timestamp: new Date().toISOString()
        },
        { prospect: afterSla.prospect }
      );

      assert.notEqual(miami.reason, "REPLY_SUPPRESSED");
      assert.notEqual(miami.reason, "ATLAS_AUTOMATION_NOT_ELIGIBLE");
      assert.equal(miami.replied, true);
      assert.equal(sendCount, 1);
      assert.match(String(miami.replyText || ""), /Miami.*Florida/i);
    } finally {
      liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
      outbound.sendAndPersistWhatsAppMessage = originalSend;
      crm.restore();
    }
  });
});
