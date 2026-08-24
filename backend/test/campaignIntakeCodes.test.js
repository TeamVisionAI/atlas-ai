/**
 * BR-147 — Campaign Intake Codes (safe CTWA fallback).
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("crypto");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const TV_PHONE_ID = "1213865645144311";
const OTHER_PHONE_ID = "9999999999999999";
const OTHER_ORG = "00000000-0000-4000-8000-000000000099";

const {
  evaluateAtlasInboundAutomationEligibility,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../core/atlasInboundAutomationEligibility");
const {
  extractCampaignIntakeToken,
  stripCampaignIntakeToken
} = require("../core/campaignIntakeCode/intakeCodeToken");
const { buildPrefilledMessage } = require("../core/campaignIntakeCode/intakeCodeGenerator");
const {
  createMemoryCampaignIntakeCodeRepository,
  INTAKE_CODE_STATUS
} = require("../core/campaignIntakeCode/campaignIntakeCodeRepository");
const {
  createCampaignIntakeAttributionService
} = require("../core/campaignIntakeCode/campaignIntakeAttributionService");
const { resolveCreateSourceFields } = require("../core/whatsappProspectResolver");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");
const { MILESTONES } = require("../core/workflowConstants");
const { REOPENED_INACTIVITY_MS } = require("../core/whatsappConstants");

const STATE_FILE = path.join(__dirname, "../data/workflowState.json");

function seedCode(overrides = {}) {
  return {
    id: randomUUID(),
    organization_id: TEAM_VISION_ORG,
    owner_user_id: "owner-1",
    whatsapp_phone_number_id: TV_PHONE_ID,
    code: "TVR-0822-A7K4",
    campaign_name: "TV-RECRUIT-MIAMI-SP-0826",
    purpose: "RECRUITING",
    language: "es",
    status: INTAKE_CODE_STATUS.ACTIVE,
    created_by_user_id: "admin-1",
    created_at: new Date().toISOString(),
    retired_at: null,
    metadata: {},
    ...overrides
  };
}

function buildService(codes = []) {
  const seed = {};
  for (const row of codes) {
    seed[row.code.toUpperCase()] = row;
  }
  const repository = createMemoryCampaignIntakeCodeRepository({ codes: seed });
  return createCampaignIntakeAttributionService({ repository });
}

function unknownProspect(overrides = {}) {
  return {
    id: "prospect-unknown",
    phone: "+17865557338",
    organization_id: TEAM_VISION_ORG,
    current_step: "NEW",
    source: WHATSAPP_SOURCE.UNKNOWN,
    entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

async function withTempWorkflowState(run) {
  const previous = fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, "utf8") : null;
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

test("1. valid recruiting token + correct Team Vision phone → eligible", async () => {
  const service = buildService([seedCode()]);
  const match = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "¡Hola! Quiero más información. TVR-0822-A7K4",
    prospect: null,
    created: true
  });
  assert.equal(match.recruitingEligible, true);
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: { campaignIntakeMatch: match }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "CAMPAIGN_INTAKE_CODE");
});

test("2. Meta referral missing + valid token → eligible", () => {
  const match = {
    matched: true,
    purpose: "RECRUITING",
    recruitingEligible: true,
    code: "TVR-0822-A7K4"
  };
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: { ctwaReferral: null, campaignIntakeMatch: match }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "CAMPAIGN_INTAKE_CODE");
});

test("3. valid token + wrong phone_number_id → NOT eligible", async () => {
  const service = buildService([seedCode()]);
  const match = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: OTHER_PHONE_ID,
    messageBody: "TVR-0822-A7K4"
  });
  assert.equal(match.matched, false);
});

test("4. valid token + wrong org → NOT eligible", async () => {
  const service = buildService([seedCode()]);
  const match = await service.lookupInboundMatch({
    organizationId: OTHER_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "TVR-0822-A7K4"
  });
  assert.equal(match.matched, false);
});

test("5. retired token → NOT eligible", async () => {
  const service = buildService([
    seedCode({ status: INTAKE_CODE_STATUS.RETIRED, code: "TVR-0822-RT01" })
  ]);
  const match = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "TVR-0822-RT01"
  });
  assert.equal(match.matched, false);
  assert.equal(match.reason, "CODE_RETIRED");
});

test("6. paused token → NOT eligible", async () => {
  const service = buildService([
    seedCode({ status: INTAKE_CODE_STATUS.PAUSED, code: "TVR-0822-PS01" })
  ]);
  const match = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "TVR-0822-PS01"
  });
  assert.equal(match.matched, false);
  assert.equal(match.reason, "CODE_PAUSED");
});

test("7. malformed/partial token → NOT eligible", async () => {
  const service = buildService([seedCode()]);
  assert.equal(extractCampaignIntakeToken("TVR-0822"), null);
  assert.equal(extractCampaignIntakeToken("quiero más información"), null);
  const partial = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "TVR-0822"
  });
  assert.equal(partial.matched, false);
});

test("8. generic message with no token/referral → NOT eligible", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: { text: "quiero más información" }
  });
  assert.equal(result.eligible, false);
});

test("9. token stripped before Recruit AI authoring", () => {
  const original = "¡Hola! Quiero más información. TVR-0822-A7K4";
  const stripped = stripCampaignIntakeToken(original);
  assert.equal(stripped, "¡Hola! Quiero más información.");
});

test("10. original message remains auditable via token extract", () => {
  const original = "Hello! Can I get more info on this? TVR-0822-A7K4";
  assert.equal(extractCampaignIntakeToken(original), "TVR-0822-A7K4");
  assert.match(original, /TVR-0822-A7K4/);
});

test("11. valid token starts bounded session", async () => {
  await withTempWorkflowState(async () => {
    const service = buildService([seedCode()]);
    const prospect = unknownProspect();
    const match = await service.resolveInboundCampaignIntakeMatch({
      organizationId: TEAM_VISION_ORG,
      whatsappPhoneNumberId: TV_PHONE_ID,
      messageBody: "TVR-0822-A7K4",
      prospect,
      created: true
    });
    await service.establishInboundAttribution({
      match,
      prospect,
      created: true,
      providerMessageId: "wamid.intake-1",
      phoneNumberId: TV_PHONE_ID,
      organizationId: TEAM_VISION_ORG
    });
    const continuation = evaluateAtlasInboundAutomationEligibility({
      prospect: { ...prospect, current_step: "QUALIFICATION" },
      inbound: {},
      workflowState: {
        atlasEligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_CODE,
        canonicalMilestone: MILESTONES.QUALIFICATION
      }
    });
    assert.equal(continuation.eligible, true);
  });
});

test("12. stale/closed session is not reopened by historical token", async () => {
  const service = buildService([seedCode()]);
  const prospect = unknownProspect({
    current_step: "CLOSED",
    updated_at: new Date(Date.now() - REOPENED_INACTIVITY_MS - 3600000).toISOString()
  });
  const match = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "TVR-0822-A7K4",
    prospect,
    created: false,
    workflowState: { inboxClosedAt: new Date().toISOString() }
  });
  assert.equal(match.recruitingEligible, false);
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect,
    inbound: { campaignIntakeMatch: match }
  });
  assert.equal(result.eligible, false);
});

test("13. UNKNOWN/personal inbound unchanged", () => {
  const fields = resolveCreateSourceFields(null);
  assert.equal(fields.entryMethod, WHATSAPP_ENTRY_METHOD.UNATTRIBUTED);
  assert.equal(fields.source, WHATSAPP_SOURCE.UNKNOWN);
});

test("14. direct Meta referral path unchanged", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: { ctwaReferral: { source_type: "ad", ctwa_clid: "clid-1" } }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "CTWA_REFERRAL");
});

test("15. QR path unchanged", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    qrAttributed: true
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "QR_ATTRIBUTION");
});

test("16. tenant/user isolation via repository lookup", async () => {
  const service = buildService([
    seedCode({ organization_id: OTHER_ORG, code: "TVR-0822-ISO1" })
  ]);
  const match = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "TVR-0822-ISO1"
  });
  assert.equal(match.matched, false);
});

test("17. IUL-purpose token does NOT enter Recruit AI recruiting flow", async () => {
  const service = buildService([
    seedCode({ purpose: "IUL", code: "TVI-0822-IUL1" })
  ]);
  const match = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "TVI-0822-IUL1",
    prospect: unknownProspect(),
    created: true
  });
  assert.equal(match.matched, true);
  assert.equal(match.recruitingEligible, false);
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: { campaignIntakeMatch: match }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "CAMPAIGN_INTAKE_IUL");
});

test("18. duplicate inbound/wamid attribution is idempotent", async () => {
  const service = buildService([seedCode()]);
  const prospect = unknownProspect();
  const match = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "TVR-0822-A7K4",
    prospect,
    created: true
  });
  const first = await service.establishInboundAttribution({
    match,
    prospect,
    created: true,
    providerMessageId: "wamid.duplicate-1",
    phoneNumberId: TV_PHONE_ID,
    organizationId: TEAM_VISION_ORG
  });
  const second = await service.establishInboundAttribution({
    match,
    prospect,
    created: true,
    providerMessageId: "wamid.duplicate-1",
    phoneNumberId: TV_PHONE_ID,
    organizationId: TEAM_VISION_ORG
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.attribution.id, first.attribution.id);
});

test("create source fields stamp CAMPAIGN_INTAKE without fabricating CTWA", () => {
  const fields = resolveCreateSourceFields(null, {
    campaignIntakeMatch: {
      matched: true,
      purpose: "RECRUITING",
      recruitingEligible: true,
      ownerUserId: "owner-1",
      campaignIntakeCodeId: "code-1",
      campaignName: "TV-RECRUIT-MIAMI-SP-0826"
    }
  });
  assert.equal(fields.source, WHATSAPP_SOURCE.CAMPAIGN_INTAKE);
  assert.equal(fields.entryMethod, WHATSAPP_ENTRY_METHOD.CAMPAIGN_INTAKE_CODE);
});

test("prefilled message format includes generated code", () => {
  const msg = buildPrefilledMessage("TVR-0822-A7K4", "es");
  assert.match(msg, /TVR-0822-A7K4/);
  assert.match(msg, /Quiero más información/i);
});

const CANARY_MULTILINE_BODY =
  "¡Hola! Quiero más información.\nTVR-0826-A7K4";

test("live canary multiline body extracts token on second line", () => {
  assert.equal(extractCampaignIntakeToken(CANARY_MULTILINE_BODY), "TVR-0826-A7K4");
  assert.equal(
    stripCampaignIntakeToken(CANARY_MULTILINE_BODY),
    "¡Hola! Quiero más información."
  );
});

test("token on same line still matches", () => {
  const body = "¡Hola! Quiero más información. TVR-0826-A7K4";
  assert.equal(extractCampaignIntakeToken(body), "TVR-0826-A7K4");
});

test("token with trailing punctuation is still extracted", () => {
  const body = "¡Hola! Quiero más información.\nTVR-0826-A7K4.";
  assert.equal(extractCampaignIntakeToken(body), "TVR-0826-A7K4");
});

test("wrong token is rejected at lookup", async () => {
  const service = buildService([seedCode({ code: "TVR-0826-A7K4" })]);
  const match = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: CANARY_MULTILINE_BODY.replace("TVR-0826-A7K4", "TVR-0826-WRNG")
  });
  assert.equal(match.matched, false);
});
