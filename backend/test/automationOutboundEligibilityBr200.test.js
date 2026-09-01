/**
 * BR-200 — no automated WhatsApp outbound without positive Atlas lead provenance.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluateAutomationOutboundEligibility,
  OUTBOUND_REASONS,
  isManualOutboundActor
} = require("../core/automationOutboundEligibility");
const { evaluateAtlasInboundAutomationEligibility } = require("../core/atlasInboundAutomationEligibility");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");
const { SIGNAL_TYPES, DISAGREEMENT_SIGNALS } = require("../core/aiQuality/constants");

const STATE_FILE = path.join(__dirname, "../data/workflowState.json");
const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE = "+17865557477";

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

function personalProspect(overrides = {}) {
  return {
    id: "prospect-personal-family",
    phone: PHONE,
    name: "Family Contact",
    organization_id: ORG,
    owner_user_id: "d8d75c0e-d93e-42c9-950e-004fbfabdc8d",
    current_step: "NEW",
    source: WHATSAPP_SOURCE.PERSONAL_WHATSAPP,
    entry_method: WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    ...overrides
  };
}

function ctwaProspect(overrides = {}) {
  return {
    id: "prospect-ctwa",
    phone: "+17865551888",
    name: "Ad Lead",
    organization_id: ORG,
    owner_user_id: "d8d75c0e-d93e-42c9-950e-004fbfabdc8d",
    current_step: "NEW",
    source: WHATSAPP_SOURCE.FACEBOOK,
    entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    ...overrides
  };
}

function inbound(type, extra = {}) {
  return {
    phone: PHONE,
    text: type === "text" ? "Hola" : `[${type} message]`,
    channel: "whatsapp",
    messageType: type,
    providerMessageId: `wamid.br200-${type}`,
    ...extra
  };
}

async function runHub(normalized, prospect, qrAttributed = false) {
  const { processNormalizedInboundMessage } = require("../core/communicationHub");
  const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
  const outbound = require("../core/whatsappOutboundPipeline");
  const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
  const originalSend = outbound.sendAndPersistWhatsAppMessage;
  const originalSave = require("../core/workflowStateStore").savePersistedWorkflowState;
  const workflowStateStore = require("../core/workflowStateStore");

  let authored = 0;
  let sent = 0;
  let stateWrites = 0;
  liveAuthoringBridge.attemptLiveV2Authoring = async () => {
    authored += 1;
    return { authored: true, replyText: "Recibí el archivo. Un compañero podrá revisarlo." };
  };
  outbound.sendAndPersistWhatsAppMessage = async () => {
    sent += 1;
    return { success: true, simulated: true };
  };
  workflowStateStore.savePersistedWorkflowState = async (...args) => {
    stateWrites += 1;
    return originalSave(...args);
  };

  try {
    const result = await processNormalizedInboundMessage(normalized, {
      prospect,
      qrAttributed
    });
    return { result, authored, sent, stateWrites };
  } finally {
    liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
    outbound.sendAndPersistWhatsAppMessage = originalSend;
    workflowStateStore.savePersistedWorkflowState = originalSave;
  }
}

test("docs: BR-200 documented", () => {
  const docs = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(docs, /## BR-200 — Eligibility Gate Before Any Automated Outbound/);
  assert.match(docs, /evaluateAutomationOutboundEligibility/);
});

test("A) personal text inbound → no automated outbound", async () => {
  await withTempWorkflowState(async () => {
    const { result, authored, sent } = await runHub(inbound("text"), personalProspect());
    assert.equal(authored, 0);
    assert.equal(sent, 0);
    assert.equal(result.replied, false);
    assert.equal(result.reason, "ATLAS_AUTOMATION_NOT_ELIGIBLE");
  });
});

test("B) personal image inbound → no Recibí el archivo and no Recruit AI", async () => {
  await withTempWorkflowState(async () => {
    const { result, authored, sent } = await runHub(inbound("image"), personalProspect());
    assert.equal(authored, 0);
    assert.equal(sent, 0);
    assert.equal(result.replied, false);
    assert.equal(result.reason, "ATLAS_AUTOMATION_NOT_ELIGIBLE");
    assert.notEqual(result.eligibilityReason, "CTWA_REFERRAL");
  });
});

test("C) personal document inbound → silent", async () => {
  await withTempWorkflowState(async () => {
    const { result, authored, sent } = await runHub(inbound("document"), personalProspect());
    assert.equal(authored, 0);
    assert.equal(sent, 0);
    assert.equal(result.replied, false);
  });
});

test("D) personal audio inbound → silent", async () => {
  await withTempWorkflowState(async () => {
    const { result, authored, sent } = await runHub(inbound("audio"), personalProspect());
    assert.equal(sent, 0);
    assert.equal(result.replied, false);
    assert.ok(["ATLAS_AUTOMATION_NOT_ELIGIBLE", "AUDIO_STT_PENDING"].includes(result.reason));
    assert.equal(authored, 0);
  });
});

test("E) HUMAN manual reply still succeeds for a personal contact", async () => {
  const eligibility = evaluateAutomationOutboundEligibility({
    prospect: personalProspect(),
    inboundEvent: inbound("image"),
    actor: "HUMAN",
    source: "conversationsCenterHumanReplyService"
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, OUTBOUND_REASONS.MANUAL_HUMAN_OR_AGENT);
  assert.equal(isManualOutboundActor("HUMAN"), true);
  assert.equal(isManualOutboundActor("AGENT"), true);
  assert.equal(isManualOutboundActor("ATLAS"), false);
});

test("F) valid CTWA ad lead text → automation may run", async () => {
  await withTempWorkflowState(async () => {
    const { result, authored } = await runHub(
      inbound("text", {
        phone: "+17865551888",
        ctwaReferral: { source_type: "ad", ctwa_clid: "clid-br200" }
      }),
      ctwaProspect()
    );
    assert.equal(authored, 1);
    assert.equal(result.reason !== "ATLAS_AUTOMATION_NOT_ELIGIBLE", true);
  });
});

test("G) valid CTWA ad lead image → eligible automation may respond", async () => {
  const eligibility = evaluateAutomationOutboundEligibility({
    prospect: ctwaProspect(),
    inboundEvent: inbound("image", {
      ctwaReferral: { source_type: "ad", ctwa_clid: "clid-br200-img" }
    }),
    actor: "ATLAS"
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, OUTBOUND_REASONS.CTWA_REFERRAL);
  assert.equal(eligibility.inboundType, "image");
});

test("H) valid QR/campaign lead → existing automation works", () => {
  const qr = evaluateAutomationOutboundEligibility({
    prospect: {
      id: "p-qr",
      phone: "+17865551901",
      organization_id: ORG,
      source: "car_magnet",
      entry_method: "QR"
    },
    inboundEvent: inbound("text"),
    actor: "ATLAS"
  });
  assert.equal(qr.eligible, true);

  const campaign = evaluateAutomationOutboundEligibility({
    prospect: { id: "p-camp", phone: "+17865551902", organization_id: ORG },
    inboundEvent: {
      ...inbound("text"),
      campaignIntakeMatch: {
        matched: true,
        purpose: "RECRUITING",
        recruitingEligible: true
      }
    },
    actor: "ATLAS"
  });
  assert.equal(campaign.eligible, true);
  assert.equal(campaign.reason, OUTBOUND_REASONS.CAMPAIGN_INTAKE);
});

test("I) legacy ambiguous provenance → silent", () => {
  const labeled = evaluateAutomationOutboundEligibility({
    prospect: ctwaProspect({
      source: "FACEBOOK",
      entry_method: "CLICK_TO_WHATSAPP"
    }),
    inboundEvent: inbound("image"),
    actor: "ATLAS"
  });
  assert.equal(labeled.eligible, false);
  assert.equal(labeled.reason, OUTBOUND_REASONS.LEGACY_AMBIGUOUS);
  assert.equal(labeled.failClosed, true);

  const metaOnly = evaluateAutomationOutboundEligibility({
    prospect: {
      id: "p-meta",
      phone: "+17865554196",
      organization_id: ORG,
      source: "UNKNOWN",
      entry_method: "UNATTRIBUTED"
    },
    workflowState: { atlasEligibilitySource: "META_AD_DESTINATION" },
    inboundEvent: inbound("image"),
    actor: "ATLAS"
  });
  assert.equal(metaOnly.eligible, false);
  assert.equal(metaOnly.reason, OUTBOUND_REASONS.LEGACY_AMBIGUOUS);
});

test("J) no qualification state mutation after suppressed auto-reply", async () => {
  await withTempWorkflowState(async () => {
    const { result, authored, sent, stateWrites } = await runHub(
      inbound("image"),
      personalProspect()
    );
    assert.equal(result.replied, false);
    assert.equal(authored, 0);
    assert.equal(sent, 0);
    assert.equal(stateWrites, 0);
  });
});

test("K) no appointment/scheduling action after suppressed auto-reply", () => {
  const hub = fs.readFileSync(
    path.join(__dirname, "../core/communicationHub.js"),
    "utf8"
  );
  assert.match(hub, /evaluateAutomationOutboundEligibility/);
  assert.match(
    hub,
    /if \(!eligibility\.eligible \|\| !outboundEligibility\.eligible\)/
  );
  const orch = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/orchestrator.js"),
    "utf8"
  );
  assert.doesNotMatch(
    hub.slice(hub.indexOf("evaluateAutomationOutboundEligibility"), hub.indexOf("atlas_automation_eligible")),
    /executeScheduleInterview|create_appointment/
  );
  void orch;
});

test("L) observability records suppression reason", () => {
  const guard = fs.readFileSync(
    path.join(__dirname, "../core/automationOutboundEligibility.js"),
    "utf8"
  );
  assert.match(guard, /automated_outbound_suppressed_not_eligible/);
  assert.match(guard, /suppressionReason/);
  assert.match(guard, /inboundType/);
  assert.match(guard, /handlerPath/);
  assert.match(guard, /AUTOMATED_OUTBOUND_ELIGIBILITY_BYPASS/);
  assert.equal(
    DISAGREEMENT_SIGNALS.includes(SIGNAL_TYPES.AUTOMATED_OUTBOUND_ELIGIBILITY_BYPASS),
    false
  );
  assert.equal(
    SIGNAL_TYPES.AUTOMATED_OUTBOUND_ELIGIBILITY_BYPASS,
    "AUTOMATED_OUTBOUND_ELIGIBILITY_BYPASS"
  );
});

test("send pipeline last-line guard blocks ATLAS and allows HUMAN", async () => {
  const outbound = require("../core/whatsappOutboundPipeline");
  const originalAuth = require("../core/whatsappOutboundAuthorizationGate");
  let authorized = 0;
  const restore = originalAuth.authorizeWhatsAppOutbound;
  originalAuth.authorizeWhatsAppOutbound = async () => {
    authorized += 1;
    return { status: "authorized_freeform", permittedDeliveryMode: "freeform", message: "ok" };
  };

  try {
    const blocked = await outbound.sendAndPersistWhatsAppMessage({
      to: PHONE,
      message: "Recibí el archivo. Un compañero podrá revisarlo.",
      actor: "ATLAS",
      organizationId: ORG,
      prospectOverride: personalProspect(),
      inboundEvent: inbound("image"),
      handlerPath: "test.atlas"
    });
    assert.equal(blocked.success, false);
    assert.equal(blocked.reason, OUTBOUND_REASONS.PERSONAL_WHATSAPP_NO_LEAD);
    assert.equal(authorized, 0);

    const human = evaluateAutomationOutboundEligibility({
      prospect: personalProspect(),
      actor: "HUMAN"
    });
    assert.equal(human.eligible, true);
  } finally {
    originalAuth.authorizeWhatsAppOutbound = restore;
  }
});

test("BR-142 inbound evaluator is unchanged for unknown personal text", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: personalProspect({
      source: WHATSAPP_SOURCE.UNKNOWN,
      entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED
    }),
    inbound: { text: "Hola" }
  });
  assert.equal(result.eligible, false);
});
