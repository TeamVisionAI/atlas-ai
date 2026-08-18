/**
 * BR-142 — Atlas auto-reply requires positive inbound eligibility.
 * FACEBOOK / CLICK_TO_WHATSAPP labels and existing Recruit AI sessions are not proof.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluateAtlasInboundAutomationEligibility,
  hasPositiveCtwaReferral,
  persistVerifiedAtlasEligibilitySource,
  setAtlasAutomationEnabled
} = require("../core/atlasInboundAutomationEligibility");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");
const { MILESTONES } = require("../core/workflowConstants");
const {
  extractClickToWhatsAppReferral,
  parseWhatsAppWebhookBody
} = require("../services/whatsappWebhookParser");
const { resolveCreateSourceFields } = require("../core/whatsappProspectResolver");

const STATE_FILE = path.join(__dirname, "../data/workflowState.json");
const PHONE = "+17865740523";

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

function middreyProspect(overrides = {}) {
  return {
    id: "prospect-middrey",
    phone: PHONE,
    name: "Middrey",
    organization_id: "00000000-0000-4000-8000-000000000001",
    current_step: "NEW",
    source: WHATSAPP_SOURCE.FACEBOOK,
    entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    ...overrides
  };
}

function unknownProspect(overrides = {}) {
  return {
    id: "prospect-unknown-7338",
    phone: "+17865557338",
    name: "Unknown",
    organization_id: "00000000-0000-4000-8000-000000000001",
    current_step: "NEW",
    source: WHATSAPP_SOURCE.UNKNOWN,
    entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    ...overrides
  };
}

test("personal inbound + no referral/ctwa/QR => no auto reply", async () => {
  await withTempWorkflowState(async () => {
    const { processNormalizedInboundMessage } = require("../core/communicationHub");
    const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
    const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
    let authored = 0;
    liveAuthoringBridge.attemptLiveV2Authoring = async () => {
      authored += 1;
      return { authored: true, replyText: "should not send" };
    };

    try {
      const result = await processNormalizedInboundMessage(
        {
          phone: PHONE,
          text: "Hola",
          channel: "whatsapp",
          providerMessageId: "wamid.middrey-hola"
        },
        { prospect: middreyProspect() }
      );
      assert.equal(authored, 0);
      assert.equal(result.replied, false);
      assert.equal(result.reason, "ATLAS_AUTOMATION_NOT_ELIGIBLE");
    } finally {
      liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
    }
  });
});

test("existing Recruit AI session + personal inbound => no auto reply", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: middreyProspect({
      current_step: "QUALIFICATION"
    }),
    inbound: { text: "Hola" },
    workflowState: {
      canonicalMilestone: MILESTONES.QUALIFICATION,
      workflowOwnership: "ATLAS"
    }
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "NOT_ELIGIBLE");
});

test("source label FACEBOOK alone => no auto reply", () => {
  assert.equal(
    evaluateAtlasInboundAutomationEligibility({
      prospect: middreyProspect({
        source: "FACEBOOK",
        entry_method: "CLICK_TO_WHATSAPP"
      })
    }).eligible,
    false
  );
  assert.equal(
    evaluateAtlasInboundAutomationEligibility({
      prospect: unknownProspect({
        source: "FACEBOOK",
        entry_method: null
      })
    }).eligible,
    false
  );
});

test("valid CTWA referral.source_type=ad => reply allowed", () => {
  const parsed = parseWhatsAppWebhookBody({
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "7338id" },
              contacts: [{ profile: { name: "Ana" } }],
              messages: [
                {
                  from: "17865550001",
                  id: "wamid.ctwa-ad",
                  timestamp: "1710000000",
                  type: "text",
                  text: { body: "Hola" },
                  referral: { source_type: "ad", source_id: "ad-1" }
                }
              ]
            }
          }
        ]
      }
    ]
  });
  assert.equal(parsed[0].ctwaReferral.sourceType, "ad");
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: { ctwaReferral: parsed[0].ctwaReferral, text: "Hola" }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "CTWA_REFERRAL");
});

test("valid ctwa_clid => reply allowed", () => {
  assert.equal(hasPositiveCtwaReferral({ ctwa_clid: "clid-1" }), true);
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: { ctwaReferral: { ctwaClid: "clid-1" } }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "CTWA_REFERRAL");
});

test("valid QR pending/stored attribution => reply allowed", () => {
  assert.equal(
    evaluateAtlasInboundAutomationEligibility({
      prospect: unknownProspect(),
      qrAttributed: true
    }).reason,
    "QR_ATTRIBUTION"
  );
  assert.equal(
    evaluateAtlasInboundAutomationEligibility({
      prospect: unknownProspect({
        source: WHATSAPP_SOURCE.CAR_MAGNET,
        entry_method: WHATSAPP_ENTRY_METHOD.QR
      })
    }).eligible,
    true
  );
});

test("verified CTWA eligibility source survives later turns without referral", async () => {
  await withTempWorkflowState(async () => {
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const prospect = unknownProspect();
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);

    await persistVerifiedAtlasEligibilitySource(prospect.phone, "CTWA_REFERRAL", {
      organizationId: prospect.organization_id,
      prospectId: prospect.id
    });
    assert.equal(await shouldDeliverAutomatedReply(prospect), true);
  });
});

test("create path still stamps CTWA only from verified referral", () => {
  const unknown = resolveCreateSourceFields(null);
  assert.equal(unknown.entryMethod, WHATSAPP_ENTRY_METHOD.UNATTRIBUTED);

  const ctwa = resolveCreateSourceFields(null, {
    ctwaReferral: { source_type: "ad", ctwa_clid: "clid-1" }
  });
  assert.equal(ctwa.entryMethod, WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP);

  assert.equal(extractClickToWhatsAppReferral({ referral: { source_type: "post" } }), null);
});

test("explicit enable still resumes Atlas replies", async () => {
  await withTempWorkflowState(async () => {
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const prospect = middreyProspect();
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);
    await setAtlasAutomationEnabled(PHONE, true, {
      organizationId: prospect.organization_id,
      prospectId: prospect.id
    });
    assert.equal(await shouldDeliverAutomatedReply(prospect), true);
  });
});
