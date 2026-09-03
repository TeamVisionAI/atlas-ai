/**
 * Recruit AI cross-tenant branding isolation (BR-224 audit).
 * Proves shared customer copy never falls back to Team Vision for another tenant.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildResponsePlan } = require("../core/recruitAiV2/responsePlan");
const { getLicensePathDetailFaqAnswer } = require("../core/teamVisionWorkflowCopy");
const { buildHumanCoordinatorReply } = require("../core/conversationCopy");

const TEAM_LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRAND_LEAK = /Team Vision|TeamVision|Niovel|Ana Perez/i;

function renderHandoff({ organizationId, organizationName, language = "spanish" }) {
  const context = createConversationContext({
    preferredLanguage: language,
    organizationId,
    organizationName
  });
  const interpretation = interpretInboundMessage({
    message: { text: "no entiendo nada de esto" },
    context,
    options: { flexible: true, now: new Date("2026-09-03T16:40:00.000-04:00") }
  });
  const decision = decideConversationTurn({ context, interpretation });
  decision.customerReplyPlan.templateKey = "safe_uncertain_escalate";
  decision.customerReplyPlan.entities = {
    ...(decision.customerReplyPlan.entities || {}),
    requiresHuman: true
  };
  const plan = buildResponsePlan(decision);
  return renderCustomerReply(plan);
}

test("A) Team Legacy never receives Team Vision from shared Recruit V2 customer copy", () => {
  const rendered = renderHandoff({
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy"
  });
  assert.doesNotMatch(rendered.text, BRAND_LEAK);
  assert.match(rendered.text, /un miembro de Team Legacy/);
});

test("B) arbitrary non-Team-Vision tenant never receives Team Vision", () => {
  const rendered = renderHandoff({
    organizationId: OTHER_ORG,
    organizationName: "Northstar Recruiting"
  });
  assert.doesNotMatch(rendered.text, BRAND_LEAK);
  assert.match(rendered.text, /un miembro de Northstar Recruiting/);
});

test("C) Team Vision tenant may still render Team Vision", () => {
  const rendered = renderHandoff({
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    organizationName: "Team Vision"
  });
  assert.match(rendered.text, /compañero de Team Vision/);
});

test("D) missing tenant display name uses neutral fallback", () => {
  const rendered = renderHandoff({
    organizationId: TEAM_LEGACY_ORG,
    organizationName: null
  });
  assert.match(rendered.text, /un miembro de nuestro equipo/);
  assert.doesNotMatch(rendered.text, BRAND_LEAK);
});

test("E) unsafe organization name does not leak another brand", () => {
  const rendered = renderHandoff({
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Vision Financial"
  });
  assert.match(rendered.text, /un miembro de nuestro equipo/);
  assert.doesNotMatch(rendered.text, /Team Vision/);
});

test("F) shared V1 fallback/error paths are tenant-safe", () => {
  const legacyWindow = buildHumanCoordinatorReply(
    "OUTSIDE_SCHEDULING_WINDOW",
    "es",
    { organizationId: TEAM_LEGACY_ORG, organizationName: "Team Legacy" }
  );
  assert.match(legacyWindow, /Un miembro de Team Legacy/);
  assert.doesNotMatch(legacyWindow, BRAND_LEAK);

  const missingOrg = buildHumanCoordinatorReply("UNKNOWN", "es", {});
  assert.match(missingOrg, /Un miembro de nuestro equipo/);
  assert.doesNotMatch(missingOrg, BRAND_LEAK);

  const tv = buildHumanCoordinatorReply("UNKNOWN", "es", {
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });
  assert.match(tv, /Un compañero de Team Vision/);
});

test("G) V2 appointment/Zoom confirmation copy has no Team Vision name", () => {
  const confirmed = renderCustomerReply({
    templateKey: "appointment_confirmed",
    language: "spanish",
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy",
    entities: { dateLabel: "viernes", requestedTime: "10:00" }
  });
  assert.doesNotMatch(confirmed.text, BRAND_LEAK);

  const zoom = renderCustomerReply({
    templateKey: "zoom_link_canonical_share",
    language: "spanish",
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy",
    entities: { zoomUrl: "https://zoom.example/legacy" }
  });
  assert.match(zoom.text, /zoom\.example\/legacy/);
  assert.doesNotMatch(zoom.text, BRAND_LEAK);
});

test("H) no Niovel/Ana hard-code reaches V2 customer templates", () => {
  const renderer = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/responseRenderer.js"),
    "utf8"
  );
  const branding = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/tenantBranding.js"),
    "utf8"
  );
  assert.doesNotMatch(`${renderer}\n${branding}`, /Niovel|Ana Perez/i);
});

test("live buildResponsePlan forwards organization branding", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy"
  });
  const interpretation = {
    intent: "unknown",
    confidence: 0,
    entities: { requiresHuman: true },
    preferredLanguage: "spanish"
  };
  const decision = decideConversationTurn({ context, interpretation });
  decision.customerReplyPlan.templateKey = "safe_uncertain_escalate";
  decision.customerReplyPlan.entities.requiresHuman = true;
  const plan = buildResponsePlan(decision);
  assert.equal(plan.organizationId, TEAM_LEGACY_ORG);
  assert.equal(plan.organizationName, "Team Legacy");
  assert.doesNotMatch(renderCustomerReply(plan).text, /Team Vision/);
});

test("license path FAQ no longer names Team Vision", () => {
  assert.doesNotMatch(getLicensePathDetailFaqAnswer("es"), /Team Vision/);
  assert.doesNotMatch(getLicensePathDetailFaqAnswer("en"), /Team Vision/);
});
