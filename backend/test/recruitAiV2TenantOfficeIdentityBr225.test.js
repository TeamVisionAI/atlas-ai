/**
 * BR-225 — tenant office / identity isolation.
 * Proves provenance, not merely that Team Legacy can coincidentally share Doral text.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const {
  OFFICE_ADDRESS_SOURCES,
  selectCustomerFacingOfficeAddress,
  resolveCanonicalOfficeAddress,
  extractOfficeCity
} = require("../core/officeAddressResolver");
const { getOfficeLocation } = require("../core/businessRulesEngine");
const { getLocalOfficeDayPartMessage } = require("../core/teamVisionWorkflowCopy");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildResponsePlan } = require("../core/recruitAiV2/responsePlan");
const { buildWelcomeMessage } = require("../core/recruitingWorkflowOrchestrator");
const {
  buildManualInterviewReminderFallback,
  resolveManualReminderContactName
} = require("../core/manualInterviewReminderFallback");
const { resolveQrInterstitialBranding } = require("../core/qrChannel/qrInterstitialBranding");
const { renderPhoneBindInterstitial } = require("../core/qrChannel/interstitialHtml");

const TEAM_LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TV_DORAL = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const OTHER_OFFICE = "100 Main Street, Suite 4, Tampa, FL 33602";
const DORAL_LEAK = /Team Vision Office|2500 NW 79th|Doral office/i;

function mm(officeAddress) {
  return async () => ({
    personalMeetingUrl: null,
    officeAddress: officeAddress || null,
    meetingPreferences: [],
    configured: Boolean(officeAddress)
  });
}

function renderLocalOffice({
  organizationId,
  organizationName = null,
  officeAddress = null,
  officeAddressSource = null,
  language = "spanish"
} = {}) {
  const context = createConversationContext({
    preferredLanguage: language,
    organizationId,
    organizationName,
    officeAddress,
    officeAddressSource,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      coverage: "LOCAL"
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "sí, tengo permiso" },
    context,
    options: { flexible: true, now: new Date("2026-09-03T16:40:00.000-04:00") }
  });
  const decision = decideConversationTurn({ context, interpretation });
  return renderCustomerReply(buildResponsePlan(decision));
}

test("A) Team Vision in-person uses Team Vision configured office", async () => {
  const resolved = await resolveCanonicalOfficeAddress(
    { organizationId: TEAM_VISION_ORGANIZATION_ID, meetingType: "in_person" },
    { getMeetingManagement: mm(null) }
  );
  assert.equal(resolved.address, TV_DORAL);
  assert.equal(resolved.source, OFFICE_ADDRESS_SOURCES.ORGANIZATION_PROFILE);
  const rendered = renderLocalOffice({
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    organizationName: "Team Vision",
    officeAddress: resolved.address,
    officeAddressSource: resolved.source
  });
  assert.match(rendered.text, /2500 NW 79th Ave, Suite 189/);
  assert.equal(extractOfficeCity(resolved.address), "Doral");
});

test("B) Team Legacy in-person uses Team Legacy configured office source", async () => {
  const resolved = await resolveCanonicalOfficeAddress(
    { organizationId: TEAM_LEGACY_ORG, meetingType: "in_person" },
    { getMeetingManagement: mm(TV_DORAL) }
  );
  assert.equal(resolved.address, TV_DORAL);
  assert.equal(resolved.source, OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT);
  assert.notEqual(resolved.source, OFFICE_ADDRESS_SOURCES.ORGANIZATION_PROFILE);
  const rendered = renderLocalOffice({
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy",
    officeAddress: resolved.address,
    officeAddressSource: resolved.source
  });
  assert.match(rendered.text, /2500 NW 79th Ave, Suite 189/);
  assert.equal(rendered.templateKey, "continue_qualification_after_authorization");
});

test("C) Team Legacy never reaches Team Vision global office fallback", async () => {
  const resolved = await resolveCanonicalOfficeAddress(
    { organizationId: TEAM_LEGACY_ORG, meetingType: "in_person" },
    { getMeetingManagement: mm(null) }
  );
  assert.equal(resolved.address, null);
  assert.equal(resolved.source, OFFICE_ADDRESS_SOURCES.UNAVAILABLE);
  const selected = selectCustomerFacingOfficeAddress({
    organizationId: TEAM_LEGACY_ORG
  });
  assert.equal(selected.address, null);
  const copy = getLocalOfficeDayPartMessage("es", { organizationId: TEAM_LEGACY_ORG });
  assert.doesNotMatch(copy, DORAL_LEAK);
  assert.match(copy, /Zoom/i);
});

test("D) arbitrary tenant with a different address receives its own address", () => {
  const rendered = renderLocalOffice({
    organizationId: OTHER_ORG,
    organizationName: "Northstar Recruiting",
    officeAddress: OTHER_OFFICE,
    officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
  });
  assert.match(rendered.text, /100 Main Street, Suite 4, Tampa, FL 33602/);
  assert.doesNotMatch(rendered.text, /2500 NW 79th|Doral/i);
});

test("E) arbitrary tenant with NO address never receives Doral", () => {
  const rendered = renderLocalOffice({
    organizationId: OTHER_ORG,
    organizationName: "Northstar Recruiting"
  });
  assert.doesNotMatch(rendered.text, DORAL_LEAK);
  assert.match(rendered.text, /Zoom/i);
});

test("F) changing tenant office config changes rendered office without code edits", async () => {
  const first = await resolveCanonicalOfficeAddress(
    { organizationId: TEAM_LEGACY_ORG, meetingType: "in_person" },
    { getMeetingManagement: mm(TV_DORAL) }
  );
  const nextAddress = "9 Legacy Way, Suite 2, Hialeah, FL 33010";
  const second = await resolveCanonicalOfficeAddress(
    { organizationId: TEAM_LEGACY_ORG, meetingType: "in_person" },
    { getMeetingManagement: mm(nextAddress) }
  );
  assert.equal(first.source, OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT);
  assert.equal(second.source, OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT);
  assert.equal(second.address, nextAddress);
  const rendered = renderLocalOffice({
    organizationId: TEAM_LEGACY_ORG,
    officeAddress: second.address,
    officeAddressSource: second.source
  });
  assert.match(rendered.text, /9 Legacy Way, Suite 2/);
  assert.doesNotMatch(rendered.text, /2500 NW 79th/);
});

test("G) Where is the office uses tenant office", () => {
  const travel = renderCustomerReply({
    templateKey: "confirm_in_person_travel_doral",
    language: "spanish",
    organizationId: TEAM_LEGACY_ORG,
    officeAddress: TV_DORAL,
    officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT,
    entities: {}
  });
  assert.match(travel.text, /2500 NW 79th Ave, Suite 189/);
  assert.match(travel.text, /Doral/);
  assert.equal(
    selectCustomerFacingOfficeAddress({
      organizationId: TEAM_LEGACY_ORG,
      officeAddress: TV_DORAL,
      officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
    }).source,
    OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
  );
});

test("H) in-person confirmation uses tenant office", () => {
  const rendered = renderCustomerReply({
    templateKey: "meeting_preference_in_person_office_confirm_slot",
    language: "english",
    organizationId: OTHER_ORG,
    officeAddress: OTHER_OFFICE,
    officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT,
    entities: { dateLabel: "Thursday", requestedTime: "10:00" }
  });
  assert.match(rendered.text, /Tampa office/);
  assert.doesNotMatch(rendered.text, /Doral/);
});

test("I) reminder fallback does not use Ana Perez outside Team Vision", () => {
  const tv = resolveManualReminderContactName({
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });
  const legacy = resolveManualReminderContactName({
    organizationId: TEAM_LEGACY_ORG
  });
  const assigned = resolveManualReminderContactName({
    organizationId: TEAM_LEGACY_ORG,
    contactName: "Marielena RVP"
  });
  assert.equal(tv, "Ana Perez");
  assert.equal(legacy, "nuestro equipo");
  assert.equal(assigned, "Marielena RVP");
  const message = buildManualInterviewReminderFallback({
    prospectName: "Nancy",
    meetingMode: "zoom",
    language: "es",
    organizationId: TEAM_LEGACY_ORG
  });
  assert.doesNotMatch(message, /Ana Perez/);
  assert.match(message, /nuestro equipo/);
});

test("J) Facebook welcome never says Team Vision for Team Legacy", () => {
  const tv = buildWelcomeMessage({
    displayName: "Ana",
    language: "es",
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    organizationName: "Team Vision"
  });
  const legacy = buildWelcomeMessage({
    displayName: "Nancy",
    language: "es",
    organizationId: TEAM_LEGACY_ORG,
    organizationName: "Team Legacy"
  });
  const unnamed = buildWelcomeMessage({
    displayName: "Luis",
    language: "es",
    organizationId: OTHER_ORG
  });
  const spoofed = buildWelcomeMessage({
    displayName: "Luis",
    language: "es",
    organizationId: OTHER_ORG,
    organizationName: "Team Vision"
  });
  assert.match(tv, /Soy Atlas de Team Vision/);
  assert.match(legacy, /Soy Atlas de Team Legacy/);
  assert.doesNotMatch(legacy, /Team Vision/);
  assert.match(unnamed, /Soy Atlas\./);
  assert.doesNotMatch(unnamed, /Team Vision/);
  assert.doesNotMatch(spoofed, /Team Vision/);
});

test("K) QR shared path never defaults a non-Team-Vision tenant to Team Vision", () => {
  const shared = resolveQrInterstitialBranding();
  const legacy = resolveQrInterstitialBranding({
    organizationId: TEAM_LEGACY_ORG,
    organizationDisplayName: "Team Legacy"
  });
  const otherMissing = resolveQrInterstitialBranding({
    organizationId: OTHER_ORG
  });
  const spoofed = resolveQrInterstitialBranding({
    organizationId: OTHER_ORG,
    organizationDisplayName: "Team Vision"
  });
  const tv = resolveQrInterstitialBranding({
    organizationId: TEAM_VISION_ORGANIZATION_ID
  });
  assert.equal(shared.organizationDisplayName, "Atlas");
  assert.equal(legacy.organizationDisplayName, "Team Legacy");
  assert.equal(otherMissing.organizationDisplayName, "Atlas");
  assert.equal(spoofed.organizationDisplayName, "Atlas");
  assert.equal(tv.organizationDisplayName, "Team Vision");
  const html = renderPhoneBindInterstitial({
    token: "tok",
    scanId: "44444444-4444-4444-8444-444444444444",
    bindMac: "mac",
    branding: legacy
  });
  assert.match(html, /Team Legacy · Atlas/);
  assert.doesNotMatch(html, /Team Vision/);
});

test("L) Team Vision seed getOfficeLocation remains BR-018", () => {
  const office = getOfficeLocation();
  assert.equal(office.name, "Team Vision Office");
  assert.equal(office.fullAddress, TV_DORAL);
});

test("selector never uses getOfficeLocation for Team Legacy even when addresses match", () => {
  const selected = selectCustomerFacingOfficeAddress({
    organizationId: TEAM_LEGACY_ORG,
    officeAddress: TV_DORAL,
    officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
  });
  assert.equal(selected.address, TV_DORAL);
  assert.equal(selected.source, OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT);
  assert.notEqual(selected.source, OFFICE_ADDRESS_SOURCES.ORGANIZATION_PROFILE);
});
