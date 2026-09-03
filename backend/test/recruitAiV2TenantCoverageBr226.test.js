/**
 * BR-226 — tenant-scoped Recruit AI V2 coverage.
 * Classification only. Office identity stays on BR-225.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { LOCAL_CITIES } = require("../core/localAreaConfig");
const { CONFIG_SOURCES } = require("../core/recruitingConfig/constants");
const {
  COVERAGE_CITY_SOURCES,
  normalizeCoverageCity,
  resolveCoverageCities,
  loadTenantCoverageCities
} = require("../core/recruitingCoverage");
const { evaluateCoverage } = require("../core/businessRulesEngine");
const {
  resolveMeetingModalityForLocation
} = require("../core/recruitAiV2/decisionEngine");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildResponsePlan } = require("../core/recruitAiV2/responsePlan");
const {
  OFFICE_ADDRESS_SOURCES,
  selectCustomerFacingOfficeAddress
} = require("../core/officeAddressResolver");
const { getOfficeLocation } = require("../core/businessRulesEngine");

const TEAM_LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const ORLANDO_ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAMPA_ORG = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TEXAS_ORG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BARE_ORG = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const TV_DORAL = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const DORAL_OFFICE = {
  officeAddress: TV_DORAL,
  officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
};

function coverageOf(city, extras = {}) {
  return evaluateCoverage({ city, state: extras.state || "FL", ...extras });
}

function modalityAfterAuth({
  organizationId,
  city,
  state = "FL",
  localCities,
  coverageCitiesSource = COVERAGE_CITY_SOURCES.RECRUITING_CONFIG,
  officeAddress = null,
  officeAddressSource = null,
  language = "spanish"
} = {}) {
  const context = createConversationContext({
    preferredLanguage: language,
    organizationId,
    organizationName: null,
    localCities,
    coverageCitiesSource,
    officeAddress,
    officeAddressSource,
    knownFacts: {
      city,
      state,
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "sí, tengo permiso" },
    context,
    options: { flexible: true, now: new Date("2026-09-03T16:40:00.000-04:00") }
  });
  const decision = decideConversationTurn({ context, interpretation });
  const rendered = renderCustomerReply(buildResponsePlan(decision));
  return { decision, rendered, context };
}

test("A) Team Vision Miami remains LOCAL via seed fallback", () => {
  const miami = coverageOf("Miami", { organizationId: TEAM_VISION_ORGANIZATION_ID });
  const doral = coverageOf("Doral", { organizationId: TEAM_VISION_ORGANIZATION_ID });
  const orlando = coverageOf("Orlando", { organizationId: TEAM_VISION_ORGANIZATION_ID });
  assert.equal(
    coverageOf("Miami", { organizationId: "sim-org-team-vision" }).coverage,
    "LOCAL"
  );
  assert.equal(miami.coverage, "LOCAL");
  assert.equal(doral.coverage, "LOCAL");
  assert.equal(orlando.coverage, "OUTSIDE");
  assert.equal(miami.coverageCitiesSource, COVERAGE_CITY_SOURCES.TEAM_VISION_SEED);
  assert.deepEqual(resolveCoverageCities({ organizationId: TEAM_VISION_ORGANIZATION_ID }).cities, [
    ...LOCAL_CITIES
  ]);

  const turn = modalityAfterAuth({
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    city: "Miami",
    localCities: [...LOCAL_CITIES],
    coverageCitiesSource: COVERAGE_CITY_SOURCES.TEAM_VISION_SEED,
    ...DORAL_OFFICE
  });
  assert.equal(turn.decision.contextPatch?.knownFacts?.coverage, "LOCAL");
  assert.match(turn.rendered.text, /2500 NW 79th|oficina|mañana|tarde/i);
});

test("B) Team Legacy uses its own stamped localCities, never silent TV geography", () => {
  const stamped = ["orlando", "lake nona", "kissimmee"];
  assert.equal(
    coverageOf("Lake Nona", {
      organizationId: TEAM_LEGACY_ORG,
      localCities: stamped
    }).coverage,
    "LOCAL"
  );
  assert.equal(
    coverageOf("Miami", {
      organizationId: TEAM_LEGACY_ORG,
      localCities: stamped
    }).coverage,
    "OUTSIDE"
  );
  assert.equal(
    coverageOf("Miami", { organizationId: TEAM_LEGACY_ORG }).coverage,
    "OUTSIDE"
  );
  assert.equal(
    coverageOf("Doral", { organizationId: TEAM_LEGACY_ORG }).coverageCitiesSource,
    COVERAGE_CITY_SOURCES.UNAVAILABLE
  );
});

test("C) Orlando tenant: Lake Nona LOCAL, Miami REMOTE", () => {
  const localCities = ["Orlando", "Lake Nona", "Kissimmee"];
  assert.equal(
    coverageOf("Lake Nona", { organizationId: ORLANDO_ORG, localCities }).coverage,
    "LOCAL"
  );
  assert.equal(
    coverageOf("Miami", { organizationId: ORLANDO_ORG, localCities }).coverage,
    "OUTSIDE"
  );
  const local = modalityAfterAuth({
    organizationId: ORLANDO_ORG,
    city: "Lake Nona",
    localCities,
    officeAddress: "1 Lake Nona Blvd, Orlando, FL 32827",
    officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
  });
  assert.equal(local.decision.contextPatch?.knownFacts?.coverage, "LOCAL");
  assert.equal(local.decision.contextPatch?.knownFacts?.preferredMeetingType, "in_person");
  const remote = modalityAfterAuth({
    organizationId: ORLANDO_ORG,
    city: "Miami",
    localCities
  });
  assert.equal(remote.decision.contextPatch?.knownFacts?.coverage, "OUTSIDE");
  assert.equal(remote.decision.contextPatch?.knownFacts?.preferredMeetingType, "zoom");
});

test("D) Tampa tenant: Tampa LOCAL, Doral REMOTE", () => {
  const localCities = ["Tampa", "Brandon"];
  assert.equal(
    coverageOf("Tampa", { organizationId: TAMPA_ORG, localCities }).coverage,
    "LOCAL"
  );
  assert.equal(
    coverageOf("Doral", { organizationId: TAMPA_ORG, localCities }).coverage,
    "OUTSIDE"
  );
});

test("E) Texas tenant: Houston LOCAL, Miami REMOTE", () => {
  const localCities = ["Houston", "Katy"];
  assert.equal(
    coverageOf("Houston", { organizationId: TEXAS_ORG, localCities, state: "TX" }).coverage,
    "LOCAL"
  );
  assert.equal(
    coverageOf("Miami", { organizationId: TEXAS_ORG, localCities }).coverage,
    "OUTSIDE"
  );
});

test("F) non-Team-Vision tenant with no coverage config does not inherit Team Vision geography", async () => {
  const unresolved = resolveCoverageCities({ organizationId: BARE_ORG });
  assert.deepEqual(unresolved.cities, []);
  assert.equal(unresolved.source, COVERAGE_CITY_SOURCES.UNAVAILABLE);
  assert.equal(coverageOf("Miami", { organizationId: BARE_ORG }).coverage, "OUTSIDE");
  assert.equal(coverageOf("Doral", { organizationId: BARE_ORG }).coverage, "OUTSIDE");
  assert.equal(coverageOf("Hialeah", { organizationId: BARE_ORG }).coverage, "OUTSIDE");

  const loaded = await loadTenantCoverageCities(BARE_ORG, {
    getRecruitingConfig: async () => ({
      persisted: false,
      source: CONFIG_SOURCES.DEFAULT_TEMPLATE,
      config: { coverage: { localCities: [...LOCAL_CITIES] } }
    })
  });
  assert.deepEqual(loaded.localCities, []);
  assert.equal(loaded.coverageCitiesSource, COVERAGE_CITY_SOURCES.UNAVAILABLE);
});

test("G) office identity still comes from BR-225 resolver", () => {
  const selected = selectCustomerFacingOfficeAddress({
    organizationId: TEAM_LEGACY_ORG,
    officeAddress: TV_DORAL,
    officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
  });
  assert.equal(selected.address, TV_DORAL);
  assert.equal(selected.source, OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT);
  assert.notEqual(selected.source, OFFICE_ADDRESS_SOURCES.ORGANIZATION_PROFILE);
  const tvOffice = getOfficeLocation();
  assert.equal(tvOffice.fullAddress, TV_DORAL);
  const coverage = coverageOf("Orlando", {
    organizationId: TEAM_LEGACY_ORG,
    localCities: ["orlando"]
  });
  assert.equal(coverage.coverage, "LOCAL");
  assert.equal(coverage.officeLocation, null);
});

test("H) Zoom path remains valid for REMOTE", () => {
  const modality = resolveMeetingModalityForLocation({
    city: "Miami",
    state: "FL",
    organizationId: TEXAS_ORG,
    localCities: ["houston", "katy"]
  });
  assert.equal(modality.coverage, "OUTSIDE");
  assert.equal(modality.meetingType, "zoom");
  const turn = modalityAfterAuth({
    organizationId: TEXAS_ORG,
    city: "Miami",
    localCities: ["houston", "katy"]
  });
  assert.match(turn.rendered.text, /Zoom/i);
  assert.doesNotMatch(turn.rendered.text, /2500 NW 79th|Doral office/i);
});

test("I) in-person path remains valid for LOCAL", () => {
  const modality = resolveMeetingModalityForLocation({
    city: "Tampa",
    state: "FL",
    organizationId: TAMPA_ORG,
    localCities: ["tampa"]
  });
  assert.equal(modality.coverage, "LOCAL");
  assert.equal(modality.meetingType, "in_person");
  const turn = modalityAfterAuth({
    organizationId: TAMPA_ORG,
    city: "Tampa",
    localCities: ["tampa"],
    officeAddress: "400 N Tampa St, Tampa, FL 33602",
    officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
  });
  assert.equal(turn.rendered.templateKey, "continue_qualification_after_authorization");
  assert.match(turn.rendered.text, /400 N Tampa St/);
});

test("normalization is exact after accents/case — Miami !== Miami Beach", () => {
  assert.equal(normalizeCoverageCity("  MIAMI  "), "miami");
  assert.equal(normalizeCoverageCity("Dóral"), "doral");
  const cities = ["miami", "doral", "hialeah"];
  assert.equal(coverageOf("Miami Beach", { organizationId: BARE_ORG, localCities: cities }).coverage, "OUTSIDE");
  assert.equal(coverageOf("Miami", { organizationId: BARE_ORG, localCities: cities }).coverage, "LOCAL");
  assert.equal(coverageOf("Fort Lauderdale", { organizationId: TEAM_VISION_ORGANIZATION_ID }).coverage, "LOCAL");
});

test("office address and coverage stay independent", () => {
  const orlandoRemote = coverageOf("Orlando", {
    organizationId: TEAM_LEGACY_ORG,
    localCities: ["miami", "doral", "hialeah"]
  });
  assert.equal(orlandoRemote.coverage, "OUTSIDE");
  const office = selectCustomerFacingOfficeAddress({
    organizationId: TEAM_LEGACY_ORG,
    officeAddress: TV_DORAL,
    officeAddressSource: OFFICE_ADDRESS_SOURCES.MEETING_MANAGEMENT
  });
  assert.equal(office.address, TV_DORAL);
  assert.equal(orlandoRemote.officeLocation, null);

  const loadedPersisted = resolveCoverageCities({
    organizationId: TEAM_LEGACY_ORG,
    localCities: [],
    coverageCitiesSource: COVERAGE_CITY_SOURCES.RECRUITING_CONFIG
  });
  assert.deepEqual(loadedPersisted.cities, []);
  assert.equal(
    coverageOf("Miami", {
      organizationId: TEAM_LEGACY_ORG,
      localCities: [],
      coverageCitiesSource: COVERAGE_CITY_SOURCES.RECRUITING_CONFIG
    }).coverage,
    "OUTSIDE"
  );
});

test("loadTenantCoverageCities uses persisted list and ignores DEFAULT_TEMPLATE", async () => {
  const persisted = await loadTenantCoverageCities(ORLANDO_ORG, {
    getRecruitingConfig: async () => ({
      persisted: true,
      source: CONFIG_SOURCES.PERSISTED,
      config: { coverage: { localCities: ["Lake Nona", "Orlando"] } }
    })
  });
  assert.deepEqual(persisted.localCities, ["lake nona", "orlando"]);
  assert.equal(persisted.coverageCitiesSource, COVERAGE_CITY_SOURCES.RECRUITING_CONFIG);

  const tvSeed = await loadTenantCoverageCities(TEAM_VISION_ORGANIZATION_ID, {
    getRecruitingConfig: async () => ({
      persisted: false,
      source: CONFIG_SOURCES.DEFAULT_TEMPLATE,
      config: { coverage: { localCities: [] } }
    })
  });
  assert.deepEqual(tvSeed.localCities, [...LOCAL_CITIES]);
  assert.equal(tvSeed.coverageCitiesSource, COVERAGE_CITY_SOURCES.TEAM_VISION_SEED);
});
