/**
 * BR-142 — Atlas auto-reply requires positive inbound eligibility.
 * Shared 7338 must not auto-reply to unknown/personal inbound.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluateAtlasInboundAutomationEligibility,
  hasPositiveCtwaReferral,
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
const PHONE = "+17865557338";

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

function unknownProspect(overrides = {}) {
  return {
    id: "prospect-unknown-7338",
    phone: PHONE,
    name: "Unknown",
    organization_id: "00000000-0000-4000-8000-000000000001",
    current_step: "NEW",
    source: WHATSAPP_SOURCE.UNKNOWN,
    entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    ...overrides
  };
}

test("greeting text is not CTWA evidence", () => {
  assert.equal(hasPositiveCtwaReferral(null), false);
  assert.equal(hasPositiveCtwaReferral({ source_type: "post" }), false);
  assert.equal(
    evaluateAtlasInboundAutomationEligibility({
      prospect: unknownProspect(),
      inbound: { text: "Hola", body: "Hi" }
    }).eligible,
    false
  );
});

test("1. CTWA ad referral → Atlas eligible", () => {
  assert.equal(
    hasPositiveCtwaReferral({ source_type: "ad", ctwa_clid: "clid-1" }),
    true
  );

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
                  id: "wamid.ctwa-1",
                  timestamp: "1710000000",
                  type: "text",
                  text: { body: "Hola" },
                  referral: {
                    source_type: "ad",
                    source_id: "ad-1",
                    ctwa_clid: "clid-1"
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].ctwaReferral.ctwaClid, "clid-1");
  assert.equal(parsed[0].body, "Hola");

  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect({ current_step: "NEW" }),
    inbound: { ctwaReferral: parsed[0].ctwaReferral, text: "Hola" }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "CTWA_REFERRAL");

  const stamped = resolveCreateSourceFields(null, {
    ctwaReferral: parsed[0].ctwaReferral
  });
  assert.equal(stamped.entryMethod, WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP);
});

test("2. QR attribution → Atlas eligible", () => {
  const qrProspect = unknownProspect({
    source: WHATSAPP_SOURCE.CAR_MAGNET,
    entry_method: WHATSAPP_ENTRY_METHOD.QR
  });
  const stored = evaluateAtlasInboundAutomationEligibility({
    prospect: qrProspect
  });
  assert.equal(stored.eligible, true);
  assert.equal(stored.reason, "QR_ATTRIBUTION");

  const thisTurn = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    qrAttributed: true
  });
  assert.equal(thisTurn.eligible, true);
  assert.equal(thisTurn.reason, "QR_ATTRIBUTION");
});

test("3. existing eligible Atlas prospect → Atlas eligible", () => {
  const ctwa = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect({
      source: WHATSAPP_SOURCE.FACEBOOK,
      entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP
    })
  });
  assert.equal(ctwa.eligible, true);
  assert.equal(ctwa.reason, "ELIGIBLE_ORIGIN");

  const workflow = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect({
      current_step: "QUALIFICATION",
      source: WHATSAPP_SOURCE.UNKNOWN,
      entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED
    })
  });
  assert.equal(workflow.eligible, true);
  assert.equal(workflow.reason, "ACTIVE_AUTOMATED_WORKFLOW");
});

test("4. unknown new number is not eligible (persist/log is allowed)", () => {
  const created = resolveCreateSourceFields(null);
  assert.equal(created.source, WHATSAPP_SOURCE.UNKNOWN);
  assert.equal(created.entryMethod, WHATSAPP_ENTRY_METHOD.UNATTRIBUTED);

  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect({ current_step: "NEW" }),
    inbound: { text: "Hola" },
    workflowState: { canonicalMilestone: MILESTONES.NEW_LEAD }
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "NOT_ELIGIBLE");

  const pipeline = fs.readFileSync(
    path.join(__dirname, "../core/whatsappInboundPipeline.js"),
    "utf8"
  );
  const persistIdx = pipeline.indexOf("persistInboundLog");
  const hubIdx = pipeline.indexOf("runHub(");
  assert.ok(persistIdx > 0 && hubIdx > persistIdx);
  assert.match(pipeline, /ATLAS_AUTOMATION_NOT_ELIGIBLE/);
});

test("5. known non-automated/personal contact → no Atlas reply", async () => {
  await withTempWorkflowState(async () => {
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const { processNormalizedInboundMessage } = require("../core/communicationHub");

    const prospect = unknownProspect({ current_step: "NEW" });
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);

    let authored = 0;
    const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
    const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
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
          providerMessageId: "wamid.personal-1"
        },
        { prospect }
      );
      assert.equal(authored, 0);
      assert.equal(result.replied, false);
      assert.equal(result.reason, "ATLAS_AUTOMATION_NOT_ELIGIBLE");
    } finally {
      liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
    }
  });
});

test("6. explicit enable Atlas → replies resume", async () => {
  await withTempWorkflowState(async () => {
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const prospect = unknownProspect({ current_step: "NEW" });

    assert.equal(await shouldDeliverAutomatedReply(prospect), false);

    await setAtlasAutomationEnabled(PHONE, true, {
      organizationId: prospect.organization_id,
      prospectId: prospect.id
    });

    const after = evaluateAtlasInboundAutomationEligibility({
      prospect,
      workflowState: { atlasAutomationEnabled: true }
    });
    assert.equal(after.eligible, true);
    assert.equal(after.reason, "EXPLICITLY_ENABLED");
    assert.equal(await shouldDeliverAutomatedReply(prospect), true);
  });
});

test("parser extracts only ad/ctwa_clid referrals", () => {
  assert.equal(
    extractClickToWhatsAppReferral({
      referral: { source_type: "ad", ctwa_clid: "x" }
    }).ctwaClid,
    "x"
  );
  assert.equal(
    extractClickToWhatsAppReferral({
      referral: { source_type: "post", source_url: "https://fb.me/x" }
    }),
    null
  );
});
