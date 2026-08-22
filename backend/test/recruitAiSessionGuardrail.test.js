/**
 * Recruit AI session guardrail — bounded automation after verified recruiting provenance.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluateAtlasInboundAutomationEligibility,
  persistVerifiedAtlasEligibilitySource,
  setAtlasAutomationEnabled
} = require("../core/atlasInboundAutomationEligibility");
const { evaluateRecruitingSessionActive } = require("../core/recruitingSessionGuard");
const { REOPENED_INACTIVITY_MS } = require("../core/whatsappConstants");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");
const { MILESTONES } = require("../core/workflowConstants");
const { OWNERSHIP } = require("../core/workflowConstants");

const STATE_FILE = path.join(__dirname, "../data/workflowState.json");
const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE = "+17865740523";
const NOW = Date.parse("2026-08-22T12:00:00.000Z");

function recentIso() {
  return new Date(NOW - 60 * 60 * 1000).toISOString();
}

function staleIso() {
  return new Date(NOW - REOPENED_INACTIVITY_MS - 60 * 60 * 1000).toISOString();
}

function ctwaProspect(overrides = {}) {
  return {
    id: "prospect-ctwa",
    phone: PHONE,
    name: "Old CTWA",
    organization_id: ORG,
    current_step: "QUALIFICATION",
    source: WHATSAPP_SOURCE.FACEBOOK,
    entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    updated_at: recentIso(),
    ...overrides
  };
}

async function withTempWorkflowState(run) {
  const previous = fs.existsSync(STATE_FILE)
    ? fs.readFileSync(STATE_FILE, "utf8")
    : null;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, "{}");
  try {
    return await run();
  } finally {
    if (previous == null) {
      try {
        fs.unlinkSync(STATE_FILE);
      } catch {
        /* ignore */
      }
    } else {
      fs.writeFileSync(STATE_FILE, previous);
    }
  }
}

test("1. fresh valid CTWA referral => Recruit AI eligible", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: ctwaProspect({ current_step: "NEW", updated_at: recentIso() }),
    inbound: {
      ctwaReferral: { source_type: "ad", ctwa_clid: "clid-live" },
      text: "Hola"
    }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "CTWA_REFERRAL");
});

test("2. active recruiting conversation next turn => eligible", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: ctwaProspect({
      current_step: "QUALIFICATION",
      updated_at: recentIso()
    }),
    inbound: { text: "Miami" },
    workflowState: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      canonicalMilestone: MILESTONES.QUALIFICATION,
      workflowOwnership: OWNERSHIP.ATLAS
    }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "VERIFIED_ELIGIBILITY_SOURCE");
});

test("3. historical CTWA + closed workflow + unrelated inbound => silent", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: ctwaProspect({ updated_at: recentIso() }),
    inbound: { text: "Hola, cómo estás?" },
    workflowState: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      inboxClosedAt: "2026-08-01T00:00:00.000Z"
    }
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "CONVERSATION_CLOSED_OR_ARCHIVED");
});

test("4. historical CTWA + HUMAN ownership => silent via delivery gate", async () => {
  await withTempWorkflowState(async () => {
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const prospect = ctwaProspect({ updated_at: recentIso() });
    await persistVerifiedAtlasEligibilitySource(prospect.phone, "CTWA_REFERRAL", {
      organizationId: ORG,
      prospectId: prospect.id
    });
    const { savePersistedWorkflowState } = require("../core/workflowStateStore");
    await savePersistedWorkflowState(
      prospect.phone,
      {
        manualAgentOwnership: true,
        humanTakenOverAt: recentIso(),
        workflowOwnership: OWNERSHIP.AGENT
      },
      { organizationId: ORG, prospectId: prospect.id }
    );
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);
  });
});

test("5. archived prospect + unrelated inbound => no recruiting restart", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: ctwaProspect({ updated_at: recentIso() }),
    inbound: { text: "random" },
    workflowState: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      inboxArchivedAt: "2026-08-10T00:00:00.000Z"
    }
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "CONVERSATION_CLOSED_OR_ARCHIVED");
});

test("6. completed/recruited prospect + unrelated inbound => silent", () => {
  const recruited = evaluateAtlasInboundAutomationEligibility({
    prospect: ctwaProspect({ current_step: "RECRUITED", updated_at: recentIso() }),
    inbound: { text: "hey" },
    workflowState: { atlasEligibilitySource: "CTWA_REFERRAL" }
  });
  assert.equal(recruited.eligible, false);
  assert.equal(recruited.reason, "PROSPECT_TERMINAL_STATE");

  const completed = evaluateAtlasInboundAutomationEligibility({
    prospect: ctwaProspect({ updated_at: recentIso() }),
    inbound: { text: "hey" },
    workflowState: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      canonicalMilestone: MILESTONES.INTERVIEW_COMPLETED
    }
  });
  assert.equal(completed.eligible, false);
  assert.equal(completed.reason, "RECRUITING_WORKFLOW_COMPLETED");
});

test("7. active workflow + valid recruiting reply => continues", () => {
  const session = evaluateRecruitingSessionActive({
    prospect: ctwaProspect({
      current_step: "QUALIFICATION",
      updated_at: recentIso()
    }),
    workflowState: { canonicalMilestone: MILESTONES.QUALIFICATION },
    now: NOW
  });
  assert.equal(session.active, true);
});

test("8. UNKNOWN/personal inbound unchanged => silent", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: {
      id: "unknown",
      phone: "+17865557338",
      organization_id: ORG,
      current_step: "NEW",
      source: WHATSAPP_SOURCE.UNKNOWN,
      entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
      updated_at: recentIso()
    },
    inbound: { text: "Hola" }
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "NOT_ELIGIBLE");
});

test("9. one inbound => max one automated response path", async () => {
  await withTempWorkflowState(async () => {
    const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
    const conversationEngine = require("../core/conversationEngine");
    const { processNormalizedInboundMessage } = require("../core/communicationHub");

    const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
    const originalCe = conversationEngine.handleIncomingMessage;

    let attemptCount = 0;
    let ceCount = 0;

    liveAuthoringBridge.attemptLiveV2Authoring = async () => {
      attemptCount += 1;
      return {
        authored: true,
        replyText: "Solo una respuesta",
        nextAction: "continue_qualification",
        v2Result: {}
      };
    };
    conversationEngine.handleIncomingMessage = async () => {
      ceCount += 1;
      return { reply: "legacy should not run" };
    };

    try {
      const prospect = ctwaProspect({ updated_at: recentIso() });
      await persistVerifiedAtlasEligibilitySource(prospect.phone, "CTWA_REFERRAL", {
        organizationId: ORG,
        prospectId: prospect.id
      });

      await processNormalizedInboundMessage(
        {
          phone: PHONE,
          text: "Florida",
          channel: "whatsapp",
          providerMessageId: "wamid.one-turn"
        },
        { prospect }
      );

      assert.equal(attemptCount, 1);
      assert.equal(ceCount, 0);
    } finally {
      liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
      conversationEngine.handleIncomingMessage = originalCe;
    }
  });
});

test("10. stale stored CTWA provenance alone => silent", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: ctwaProspect({
      current_step: "NEW",
      updated_at: staleIso()
    }),
    inbound: { text: "Hola otra vez" },
    workflowState: { atlasEligibilitySource: "CTWA_REFERRAL" }
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "RECRUITING_SESSION_EXPIRED");
});

test("11. explicit enable resumes Atlas replies even when stale", async () => {
  await withTempWorkflowState(async () => {
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const prospect = ctwaProspect({ updated_at: staleIso() });
    await setAtlasAutomationEnabled(PHONE, true, {
      organizationId: ORG,
      prospectId: prospect.id
    });
    assert.equal(await shouldDeliverAutomatedReply(prospect), true);
  });
});

test("12. inbox recruiting eligibility unchanged (presentation only)", () => {
  const {
    evaluateRecruitingInboxEligibility
  } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
  const inbox = evaluateRecruitingInboxEligibility(ctwaProspect({ updated_at: staleIso() }), {
    atlasEligibilitySource: "CTWA_REFERRAL"
  });
  assert.equal(inbox.eligible, true);
  assert.equal(inbox.reason, "VERIFIED_ELIGIBILITY_SOURCE");
});
