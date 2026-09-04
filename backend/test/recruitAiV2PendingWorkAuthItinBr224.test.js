/**
 * Recruit AI v2 — pending work-auth ITIN / location immutability / tenant branding (BR-224)
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("os");
const path = require("path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const {
  parseWorkAuthorizationAnswer,
  WORK_AUTHORIZATION
} = require("../core/recruitAiV2/qualificationFacts");
const {
  parseLocationAnswer,
  extractLocationCandidateText,
  looksLikeLocationCorrection
} = require("../core/recruitAiV2/locationFacts");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  resolveTeamMemberPhrase,
  isSafeOrganizationDisplayName
} = require("../core/recruitAiV2/tenantBranding");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { recruitingProspectFixture } = require("./helpers/conversationsCenterRecruitingFixture");

const TEAM_LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const FIXED_NOW = new Date("2026-09-03T16:28:00.000-04:00");

function turn(text, context) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
  const structuredDecision = decideConversationTurn({ context, interpretation });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

function lakeNonaAuthPending(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy",
    _testNow: FIXED_NOW,
    ...overrides,
    knownFacts: {
      city: "Lake Nona",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "LOCAL",
      ...(overrides.knownFacts || {})
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?",
      ...(overrides.conversation || {})
    }
  });
}

function replayCanaryThroughAuth(answer) {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "greeting",
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy",
    _testNow: FIXED_NOW
  });
  ctx = turn("¡Hola! Quiero más información. TVR-0826-TLUC", ctx).nextContext;
  ctx = turn("Florida", ctx).nextContext;
  ctx = turn("Lake nona", ctx).nextContext;
  return turn(answer, ctx);
}

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

async function withTempWorkflowState(run) {
  const previousFile = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const tempFile = path.join(
    os.tmpdir(),
    `atlas-br224-own-${process.pid}-${Date.now()}.json`
  );
  fs.writeFileSync(tempFile, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempFile;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "file";
  clearWorkflowModules();
  try {
    return await run();
  } finally {
    if (previousFile === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_FILE = previousFile;
    }
    if (previousBackend === undefined) {
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

test("A) Florida → Lake Nona → Solo ITIN is authorization_denied", () => {
  const r = replayCanaryThroughAuth("Solo ITIN");
  assert.equal(r.interpretation.intent, "provide_authorization");
  assert.equal(r.interpretation.entities.workAuthorization, false);
  assert.equal(
    r.nextContext.knownFacts.workAuthorizationStatus,
    WORK_AUTHORIZATION.NOT_AUTHORIZED
  );
  assert.equal(r.nextContext.knownFacts.city, "Lake Nona");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(r.structuredDecision.customerReplyPlan.templateKey, "authorization_denied");
  assert.match(r.rendered.text, /autorizaci[oó]n legal vigente/i);
  assert.doesNotMatch(r.rendered.text, /Tengo|Team Vision|clarif/i);
});

test("B) Florida → Lake Nona → No tengo is authorization_denied", () => {
  const r = replayCanaryThroughAuth("No tengo");
  assert.equal(r.interpretation.intent, "provide_authorization");
  assert.equal(r.interpretation.entities.workAuthorization, false);
  assert.equal(r.nextContext.knownFacts.city, "Lake Nona");
  assert.notEqual(r.nextContext.knownFacts.city, "Tengo");
  assert.equal(r.structuredDecision.customerReplyPlan.templateKey, "authorization_denied");
});

test("C) Florida → Lake Nona → Te dije que no is authorization_denied", () => {
  const r = replayCanaryThroughAuth("Te dije que no");
  assert.equal(r.interpretation.intent, "provide_authorization");
  assert.equal(r.interpretation.entities.workAuthorization, false);
  assert.equal(r.nextContext.knownFacts.city, "Lake Nona");
  assert.equal(r.structuredDecision.customerReplyPlan.templateKey, "authorization_denied");
});

test("D) No tengo never creates city Tengo", () => {
  assert.equal(parseLocationAnswer("No tengo"), null);
  const extracted = extractLocationCandidateText("No tengo");
  assert.notEqual(String(extracted.text || "").toLowerCase(), "tengo");
  assert.equal(looksLikeLocationCorrection("No tengo"), false);
  const r = turn("No tengo", lakeNonaAuthPending());
  assert.notEqual(r.nextContext.knownFacts.city, "Tengo");
  assert.equal(r.nextContext.knownFacts.city, "Lake Nona");
});

test("E) location stays Lake Nona, Florida after pending-auth denials", () => {
  for (const text of ["Solo ITIN", "No tengo", "Te dije que no", "No tengo documentos"]) {
    const r = turn(text, lakeNonaAuthPending());
    assert.equal(r.nextContext.knownFacts.city, "Lake Nona", text);
    assert.equal(r.nextContext.knownFacts.state, "FL", text);
    assert.equal(r.nextContext.knownFacts.cityCertainty, "confirmed", text);
  }
});

test("F) clear negative does not loop clarification", () => {
  for (const text of ["Solo ITIN", "No tengo", "Te dije que no"]) {
    const r = turn(text, lakeNonaAuthPending());
    assert.notEqual(r.structuredDecision.customerReplyPlan.templateKey, "clarify_once", text);
    assert.notEqual(
      r.structuredDecision.customerReplyPlan.templateKey,
      "acknowledge_location_correction",
      text
    );
    assert.equal(r.nextContext.conversation?.clarificationCount || 0, 0, text);
  }
});

test("G) ITIN-only pending auth is authorization_denied", () => {
  for (const text of ["Solo ITIN", "only ITIN", "ITIN", "I only have an ITIN"]) {
    assert.equal(
      parseWorkAuthorizationAnswer(text, lakeNonaAuthPending()),
      WORK_AUTHORIZATION.NOT_AUTHORIZED,
      text
    );
  }
  const r = turn("Solo ITIN", lakeNonaAuthPending());
  assert.equal(r.structuredDecision.customerReplyPlan.templateKey, "authorization_denied");
});

test("H) HUMAN takeover silent unless Return-to-Atlas already happened", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation,
      returnConversationToAtlas
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const { savePersistedWorkflowState, loadPersistedWorkflowState } =
      require("../core/workflowStateStore");
    const { OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17867150440";
    const prospect = recruitingProspectFixture({
      phone,
      current_step: "QUALIFICATION"
    });
    await savePersistedWorkflowState(
      phone,
      { atlasEligibilitySource: "QR", workflowOwnership: OWNERSHIP.ATLAS },
      { organizationId: TEAM_VISION_ORGANIZATION_ID, prospectId: prospect.id }
    );

    await takeOverConversation(phone, {
      organizationId: TEAM_VISION_ORGANIZATION_ID,
      prospectId: prospect.id
    });
    const humanState = await loadPersistedWorkflowState(phone);
    assert.equal(humanState.manualAgentOwnership, true);
    assert.ok(humanState.humanTakenOverAt);
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);
    assert.equal(
      await shouldDeliverAutomatedReply(prospect, { allowHandoffAck: true }),
      false
    );

    const returned = await returnConversationToAtlas(phone, {
      organizationId: TEAM_VISION_ORGANIZATION_ID,
      prospectId: prospect.id
    });
    assert.equal(returned.next.workflowOwnership, OWNERSHIP.ATLAS);
    assert.equal(returned.next.manualAgentOwnership, false);
    assert.equal(returned.next.humanTakenOverAt, null);
    assert.ok(returned.next.returnedToAtlasAt);
    assert.equal(await shouldDeliverAutomatedReply(prospect), true);
  });
});

test("I) Sí, tengo permiso de trabajo still advances", () => {
  const r = replayCanaryThroughAuth("Sí, tengo permiso de trabajo");
  assert.equal(r.interpretation.intent, "provide_authorization");
  assert.equal(r.interpretation.entities.workAuthorization, true);
  assert.notEqual(r.structuredDecision.customerReplyPlan.templateKey, "authorization_denied");
  assert.equal(r.nextContext.knownFacts.city, "Lake Nona");
});

test("J) No, Doral still corrects location when not a verb remainder", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    conversation: { lastQuestionAsked: "ask_location" }
  });
  const r = turn("No, Doral", ctx);
  assert.equal(r.nextContext.knownFacts.city, "Doral");
  assert.equal(looksLikeLocationCorrection("No, Doral"), true);
  assert.equal(parseLocationAnswer("No, Doral")?.city, "Doral");
});

test("K) pending auth does not treat a bare city as overwrite", () => {
  const r = turn("Tengo", lakeNonaAuthPending());
  assert.equal(r.nextContext.knownFacts.city, "Lake Nona");
  assert.notEqual(r.interpretation.intent, "provide_location");
  assert.notEqual(r.interpretation.intent, "correct_location");
});

test("branding A) Team Vision tenant keeps Team Vision handoff", () => {
  const text = renderCustomerReply({
    templateKey: "safe_uncertain_escalate",
    language: "spanish",
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    organizationName: "Team Vision",
    entities: { requiresHuman: true }
  }).text;
  assert.match(text, /compañero de Team Vision/);
});

test("branding B) Team Legacy uses organization name", () => {
  const text = renderCustomerReply({
    templateKey: "safe_uncertain_escalate",
    language: "spanish",
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy",
    entities: { requiresHuman: true }
  }).text;
  assert.match(text, /un miembro de Team Legacy/);
  assert.doesNotMatch(text, /Team Vision/);
});

test("branding C) missing name uses nuestro equipo, never Team Vision", () => {
  const text = renderCustomerReply({
    templateKey: "safe_uncertain_escalate",
    language: "spanish",
    organizationId: TEAM_LEGACY_ORG,
    entities: { requiresHuman: true }
  }).text;
  assert.match(text, /un miembro de nuestro equipo/);
  assert.doesNotMatch(text, /Team Vision/);
});

test("branding D) English named tenant", () => {
  const text = renderCustomerReply({
    templateKey: "safe_uncertain_escalate",
    language: "english",
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy",
    entities: { requiresHuman: true }
  }).text;
  assert.match(text, /a member of Team Legacy/);
  assert.doesNotMatch(text, /Team Vision/);
});

test("branding E) spoofed Team Vision name on another tenant is rejected", () => {
  assert.equal(
    isSafeOrganizationDisplayName("Team Vision", TEAM_LEGACY_ORG),
    false
  );
  assert.equal(
    resolveTeamMemberPhrase({
      organizationId: TEAM_LEGACY_ORG,
      organizationName: "Team Vision",
      language: "spanish"
    }),
    "un miembro de nuestro equipo"
  );
});

test("fix is systemic: no Nancy / Lake Nona / 0440 special-case", () => {
  const roots = [
    "qualificationFacts.js",
    "locationFacts.js",
    "interpreter.js",
    "factCertainty.js",
    "responseRenderer.js",
    "tenantBranding.js",
    "decisionEngine.js"
  ].map((name) =>
    fs.readFileSync(path.join(__dirname, "../core/recruitAiV2", name), "utf8")
  );
  const joined = roots.join("\n");
  assert.doesNotMatch(joined, /Nancy|Calisto|0440|17867150440/i);
});
