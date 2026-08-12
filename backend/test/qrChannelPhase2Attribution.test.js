/**
 * QR Channel Phase 2 — inbound attribution + conversationGoal hydration (BR-129 / BR-130).
 * Memory repository + pure helpers. No live WhatsApp / no appointment mutation.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  createMemoryQrChannelRepository
} = require("../core/qrChannel/memoryQrChannelRepository");
const {
  createQrCampaignService
} = require("../core/qrChannel/qrCampaignService");
const {
  createQrInboundAttributionService,
  mergeQrAttributionIntoLeadSource,
  MATCH_OUTCOME,
  ATTRIBUTION_RESULT
} = require("../core/qrChannel/qrInboundAttribution");
const {
  CAR_MAGNET_V1,
  CAMPAIGN_STATUS,
  SCAN_STATUS,
  SCAN_TTL_MS,
  TEAM_VISION_ORG_ID,
  PRIMARY_RVP_USER_ID
} = require("../core/qrChannel/constants");
const {
  WHATSAPP_ENTRY_METHOD,
  WHATSAPP_SOURCE
} = require("../core/whatsappConstants");
const { LeadSource } = require("../modules/prospects/domain/value-objects/LeadSource");
const {
  resolveCreateSourceFields
} = require("../core/whatsappProspectResolver");

const ORG_B = "00000000-0000-4000-8000-000000000099";
const PHONE = "17865550199";
const CONFIGURED_ENV = Object.freeze({
  QR_CHANNEL_WHATSAPP_E164: "17867528080",
  QR_CHANNEL_BIND_SECRET: "test-secret-phase2"
});

async function seedAndBind(repo, { phone = PHONE, orgId = TEAM_VISION_ORG_ID } = {}) {
  const service = createQrCampaignService({ repository: repo, env: CONFIGURED_ENV });
  const seeded = await service.seedCampaign({
    orgId: orgId === TEAM_VISION_ORG_ID ? CAR_MAGNET_V1.orgId : orgId,
    ownerUserId: PRIMARY_RVP_USER_ID,
    campaignKey:
      orgId === TEAM_VISION_ORG_ID ? CAR_MAGNET_V1.campaignKey : `car_${orgId.slice(0, 8)}`,
    name: "Car Recruiting Test",
    source: CAR_MAGNET_V1.source,
    campaignType: CAR_MAGNET_V1.campaignType,
    defaultConversationGoal: "interview",
    whatsappE164: "17867528080"
  });
  assert.equal(seeded.ok, true);
  const started = await service.startPublicEntry(seeded.publicToken);
  assert.equal(started.ok, true);
  const bound = await service.bindPhoneAndRedirect({
    scanId: started.scan.id,
    bindMac: started.bindMac,
    rawPhone: `+${phone}`,
    expectedOrgId: seeded.campaign.org_id
  });
  assert.equal(bound.ok, true);
  assert.equal(bound.scan.status, SCAN_STATUS.PENDING_INBOUND);
  return { service, seeded, started, bound, campaign: seeded.campaign, scan: bound.scan };
}

function attributionFor(repo, nowFn) {
  return createQrInboundAttributionService({ repository: repo, nowFn });
}

test("A. fresh bind + inbound match → consume + first/last touch + interview goal", async () => {
  const repo = createMemoryQrChannelRepository();
  const { campaign, scan } = await seedAndBind(repo);
  const svc = attributionFor(repo);

  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: TEAM_VISION_ORG_ID,
    phoneNormalized: PHONE
  });
  assert.equal(match.outcome, MATCH_OUTCOME.HIT);
  assert.equal(match.scan.id, scan.id);
  assert.equal(match.campaign.owner_user_id, PRIMARY_RVP_USER_ID);

  const touch = svc.buildAttributionTouch(match.campaign, match.scan);
  const lead = mergeQrAttributionIntoLeadSource({}, touch);
  assert.equal(lead.source, "car_magnet");
  assert.equal(lead.entryMethod, "QR");
  assert.equal(lead.campaignKey, "car_recruiting_01");
  assert.equal(lead.conversationGoal, "interview");
  assert.equal(lead.firstTouchCampaignId, campaign.id);
  assert.equal(lead.lastTouchCampaignId, campaign.id);

  const createFields = resolveCreateSourceFields(touch);
  assert.equal(createFields.source, "car_magnet");
  assert.equal(createFields.entryMethod, WHATSAPP_ENTRY_METHOD.QR);
  assert.equal(createFields.campaignAgentId, PRIMARY_RVP_USER_ID);

  const consumed = await svc.consumeMatchedScan({
    scanId: scan.id,
    legacyProspectId: "legacy-1",
    coreProspectId: "core-1",
    inboundCorrelationId: "whatsapp:inbound:wamid.A",
    attributionResult: ATTRIBUTION_RESULT.ATTACHED_NEW,
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  assert.equal(consumed.ok, true);
  assert.equal(consumed.scan.status, SCAN_STATUS.CONSUMED);
  assert.ok(consumed.scan.consumed_at);
  assert.equal(consumed.scan.legacy_prospect_id, "legacy-1");
  assert.equal(consumed.scan.core_prospect_id, "core-1");
});

test("B. no pending scan → miss (Facebook path unchanged fields)", async () => {
  const repo = createMemoryQrChannelRepository();
  const svc = attributionFor(repo);
  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: TEAM_VISION_ORG_ID,
    phoneNormalized: PHONE
  });
  assert.equal(match.outcome, MATCH_OUTCOME.MISS);
  const fields = resolveCreateSourceFields(null);
  assert.equal(fields.source, WHATSAPP_SOURCE.FACEBOOK);
  assert.equal(fields.entryMethod, WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP);
  assert.equal(fields.campaignAgentId, null);
});

test("C. wrong phone → no attribution", async () => {
  const repo = createMemoryQrChannelRepository();
  await seedAndBind(repo, { phone: PHONE });
  const svc = attributionFor(repo);
  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: TEAM_VISION_ORG_ID,
    phoneNormalized: "17865550999"
  });
  assert.equal(match.outcome, MATCH_OUTCOME.MISS);
});

test("D. expired scan → no attribution", async () => {
  const repo = createMemoryQrChannelRepository();
  const { scan } = await seedAndBind(repo);
  await repo.updateScan(scan.id, {
    expires_at: new Date(Date.now() - 1000).toISOString()
  });
  const svc = attributionFor(repo);
  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: TEAM_VISION_ORG_ID,
    phoneNormalized: PHONE
  });
  assert.equal(match.outcome, MATCH_OUTCOME.MISS);
});

test("E. superseded scan → cannot consume", async () => {
  const repo = createMemoryQrChannelRepository();
  const first = await seedAndBind(repo, { phone: PHONE });
  await repo.updateScan(first.scan.id, { status: SCAN_STATUS.SUPERSEDED });
  const svc = attributionFor(repo);
  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: TEAM_VISION_ORG_ID,
    phoneNormalized: PHONE
  });
  assert.equal(match.outcome, MATCH_OUTCOME.MISS);
  const consume = await svc.consumeMatchedScan({
    scanId: first.scan.id,
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  assert.equal(consume.ok, false);
});

test("F/O. duplicate consume → idempotent", async () => {
  const repo = createMemoryQrChannelRepository();
  const { scan } = await seedAndBind(repo);
  const svc = attributionFor(repo);
  const first = await svc.consumeMatchedScan({
    scanId: scan.id,
    legacyProspectId: "p1",
    attributionResult: ATTRIBUTION_RESULT.ATTACHED_NEW,
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  assert.equal(first.ok, true);
  assert.equal(first.idempotent, false);
  const second = await svc.consumeMatchedScan({
    scanId: scan.id,
    legacyProspectId: "p1",
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, true);
  assert.equal(second.attributionResult, ATTRIBUTION_RESULT.IDEMPOTENT_REPLAY);
});

test("G/P. existing firstTouch immutable; lastTouch updates; goal conditional", () => {
  const existing = {
    sourceType: "social",
    sourceDetail: "Facebook",
    firstTouchCampaignId: "camp-old",
    firstTouchSource: "facebook_ad",
    firstTouchAt: "2026-01-01T00:00:00.000Z",
    conversationGoal: "policy_review"
  };
  const touch = {
    campaignId: "camp-qr",
    campaignKey: "car_recruiting_01",
    source: "car_magnet",
    conversationGoal: "interview",
    correlationId: "corr-1",
    touchedAt: "2026-08-12T12:00:00.000Z"
  };
  const merged = mergeQrAttributionIntoLeadSource(existing, touch);
  assert.equal(merged.firstTouchCampaignId, "camp-old");
  assert.equal(merged.firstTouchSource, "facebook_ad");
  assert.equal(merged.lastTouchCampaignId, "camp-qr");
  assert.equal(merged.lastTouchSource, "car_magnet");
  assert.equal(merged.conversationGoal, "policy_review");

  const unresolved = mergeQrAttributionIntoLeadSource(
    { conversationGoal: "unresolved" },
    touch
  );
  assert.equal(unresolved.conversationGoal, "interview");
  assert.equal(unresolved.firstTouchCampaignId, "camp-qr");
});

test("H. cross-org same phone → no attribution", async () => {
  const repo = createMemoryQrChannelRepository();
  await seedAndBind(repo, { phone: PHONE, orgId: TEAM_VISION_ORG_ID });
  const svc = attributionFor(repo);
  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: ORG_B,
    phoneNormalized: PHONE
  });
  assert.equal(match.outcome, MATCH_OUTCOME.MISS);
});

test("I. inactive campaign after trusted bind → still match (historical)", async () => {
  const repo = createMemoryQrChannelRepository();
  const { campaign, scan } = await seedAndBind(repo);
  await repo.updateCampaign(campaign.id, { status: CAMPAIGN_STATUS.INACTIVE });
  const svc = attributionFor(repo);
  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: TEAM_VISION_ORG_ID,
    phoneNormalized: PHONE
  });
  assert.equal(match.outcome, MATCH_OUTCOME.HIT);
  assert.equal(match.historicalInactiveCampaign, true);
  assert.equal(match.scan.id, scan.id);
});

test("J/K/L. ownership silence + Meta Reviewer + execution gates unchanged by Phase 2 module", () => {
  const attrSrc = fs.readFileSync(
    path.join(__dirname, "../core/qrChannel/qrInboundAttribution.js"),
    "utf8"
  );
  const resolverSrc = fs.readFileSync(
    path.join(__dirname, "../core/whatsappProspectResolver.js"),
    "utf8"
  );
  assert.doesNotMatch(attrSrc, /EXECUTION_ENABLED|LIVE_EXECUTION_PATH|sideEffectExecutor/);
  assert.doesNotMatch(attrSrc, /manualAgentOwnership|humanTakenOverAt|TAKE_OVER/);
  assert.match(resolverSrc, /never reassign a valid owner/);
  assert.match(resolverSrc, /Sticky HUMAN/);

  const hub = fs.readFileSync(
    path.join(__dirname, "../core/communicationHub.js"),
    "utf8"
  );
  assert.match(hub, /manualAgentOwnership/);
  assert.match(hub, /humanTakenOverAt/);

  const liveAuth = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveAuthoringConfig.js"),
    "utf8"
  );
  assert.doesNotMatch(attrSrc, /LIVE_AUTHORING_USER_IDS\s*=/);
  assert.match(liveAuth, /LIVE_AUTHORING/);
});

test("M. multiple eligible pending → ambiguous fail closed", async () => {
  const repo = createMemoryQrChannelRepository();
  const { campaign } = await seedAndBind(repo, { phone: PHONE });
  // Insert a second pending_inbound for same org+phone (bypass supersede)
  await repo.insertScan({
    campaign_id: campaign.id,
    org_id: TEAM_VISION_ORG_ID,
    handoff_mode: "phone_bind",
    status: SCAN_STATUS.PENDING_INBOUND,
    bound_phone_normalized: PHONE,
    expires_at: new Date(Date.now() + SCAN_TTL_MS).toISOString(),
    consumed_at: null
  });
  const svc = attributionFor(repo);
  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: TEAM_VISION_ORG_ID,
    phoneNormalized: PHONE
  });
  assert.equal(match.outcome, MATCH_OUTCOME.AMBIGUOUS);
  assert.equal(match.reasonCode, "AMBIGUOUS_PENDING_SCANS");
  const open = await repo.listPendingInboundScansForOrgPhone(TEAM_VISION_ORG_ID, PHONE);
  assert.equal(open.length, 0);
  const dump = repo._dump();
  const ambiguous = dump.scans.filter((s) => s.status === SCAN_STATUS.AMBIGUOUS_CONFLICT);
  assert.ok(ambiguous.length >= 2);
});

test("N. pending_phone is not eligible", async () => {
  const repo = createMemoryQrChannelRepository();
  const service = createQrCampaignService({ repository: repo, env: CONFIGURED_ENV });
  const seeded = await service.seedCampaign({
    orgId: CAR_MAGNET_V1.orgId,
    ownerUserId: PRIMARY_RVP_USER_ID,
    campaignKey: CAR_MAGNET_V1.campaignKey,
    name: CAR_MAGNET_V1.name,
    source: CAR_MAGNET_V1.source,
    campaignType: CAR_MAGNET_V1.campaignType,
    defaultConversationGoal: "interview",
    whatsappE164: "17867528080"
  });
  const started = await service.startPublicEntry(seeded.publicToken);
  assert.equal(started.scan.status, SCAN_STATUS.PENDING_PHONE);
  // Force same phone onto pending_phone without bind
  await repo.updateScan(started.scan.id, { bound_phone_normalized: PHONE });
  const svc = attributionFor(repo);
  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: TEAM_VISION_ORG_ID,
    phoneNormalized: PHONE
  });
  assert.equal(match.outcome, MATCH_OUTCOME.MISS);
});

test("Q. campaign org mismatch excluded from eligibility", async () => {
  const repo = createMemoryQrChannelRepository();
  const { scan, campaign } = await seedAndBind(repo);
  // Corrupt campaign org (simulate)
  await repo.updateCampaign(campaign.id, { org_id: ORG_B });
  const svc = attributionFor(repo);
  const match = await svc.matchEligiblePendingInboundScan({
    organizationId: TEAM_VISION_ORG_ID,
    phoneNormalized: PHONE
  });
  assert.equal(match.outcome, MATCH_OUTCOME.MISS);
  void scan;
});

test("LeadSource preserves QR attribution extensions", () => {
  const ls = LeadSource.create({
    sourceType: "social",
    sourceDetail: "car_magnet",
    entryMethod: "QR",
    source: "car_magnet",
    campaignKey: "car_recruiting_01",
    conversationGoal: "interview",
    firstTouchCampaignId: "c1",
    lastTouchCampaignId: "c1"
  });
  const json = ls.toJSON();
  assert.equal(json.entryMethod, "QR");
  assert.equal(json.conversationGoal, "interview");
  assert.equal(json.firstTouchCampaignId, "c1");
  assert.equal(json.sourceDetail, "car_magnet");
});

test("resolver wiring: match before assignment; consume after identity; QR source fields", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../core/whatsappProspectResolver.js"),
    "utf8"
  );
  const locateStart = src.indexOf("async function locateOrCreateWhatsAppProspect");
  const locateBody = src.slice(locateStart);
  const matchIdx = locateBody.indexOf("matchEligiblePendingInboundScan");
  const insertCallIdx = locateBody.indexOf("prospect = await insertWhatsAppProspectRow");
  const stampIdx = locateBody.indexOf("stampCoreLeadSourceAttribution");
  const consumeIdx = locateBody.indexOf("consumeMatchedScan");
  assert.ok(matchIdx > 0);
  assert.ok(matchIdx < insertCallIdx, "QR match must precede create/assignment");
  assert.ok(stampIdx > insertCallIdx, "stamp after prospect identity");
  assert.ok(consumeIdx > stampIdx, "consume after stamp/identity");
  assert.match(src, /campaignAgentId/);
  assert.match(src, /WHATSAPP_ENTRY_METHOD\.QR/);
  assert.match(src, /WHATSAPP_SOURCE\.CAR_MAGNET/);
  assert.match(src, /never reassign a valid owner/);
});

test("migration 036 is additive consume linkage only", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/migrations/036_qr_scans_consume_linkage.sql"),
    "utf8"
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS legacy_prospect_id/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS core_prospect_id/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS inbound_correlation_id/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS attribution_result/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|TRUNCATE/);
  assert.doesNotMatch(sql, /qr_attribution_touches/);
});

test("pipeline passes providerMessageId into prospect resolver", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../core/whatsappInboundPipeline.js"),
    "utf8"
  );
  assert.match(src, /providerMessageId:\s*inbound\.providerMessageId/);
});

test("TTL constant still 15 minutes", () => {
  assert.equal(SCAN_TTL_MS, 15 * 60 * 1000);
});
