/**
 * QR Channel Phase 1 — Car Magnet entry / phone-bind / wa.me redirect.
 * Memory repository only — no live WhatsApp / no Supabase required.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("http");

const {
  createMemoryQrChannelRepository
} = require("../core/qrChannel/memoryQrChannelRepository");
const {
  createQrCampaignService
} = require("../core/qrChannel/qrCampaignService");
const {
  CAR_MAGNET_V1,
  CAMPAIGN_STATUS,
  SCAN_STATUS,
  REASON_CODES,
  NATURAL_WHATSAPP_PREFILL,
  TEAM_VISION_ORG_ID,
  PRIMARY_RVP_USER_ID,
  SCAN_TTL_MS,
  WHATSAPP_E164_HARD_ALLOWLIST
} = require("../core/qrChannel/constants");
const {
  buildWhatsAppRedirectUrl,
  resolveAllowlistedWhatsAppE164,
  digitsOnly
} = require("../core/qrChannel/whatsappRedirect");
const {
  hashPublicToken,
  generatePublicToken,
  isPlausiblePublicToken
} = require("../core/qrChannel/tokenCrypto");
const qrGoRouter = require("../routes/qrGo");

const ORG_B = "00000000-0000-4000-8000-000000000099";
const OTHER_OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const CONFIGURED_ENV = Object.freeze({
  QR_CHANNEL_WHATSAPP_E164: "17867528080",
  QR_CHANNEL_BIND_SECRET: "test-secret"
});

async function seedCarMagnet(repo, overrides = {}) {
  const service = createQrCampaignService({
    repository: repo,
    env: CONFIGURED_ENV
  });
  const result = await service.seedCampaign({
    orgId: CAR_MAGNET_V1.orgId,
    ownerUserId: CAR_MAGNET_V1.ownerUserId,
    campaignKey: CAR_MAGNET_V1.campaignKey,
    name: CAR_MAGNET_V1.name,
    source: CAR_MAGNET_V1.source,
    campaignType: CAR_MAGNET_V1.campaignType,
    defaultConversationGoal: CAR_MAGNET_V1.defaultConversationGoal,
    ...overrides
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.ok(result.publicToken);
  return result;
}

function serviceFor(repo, env = CONFIGURED_ENV) {
  return createQrCampaignService({ repository: repo, env });
}

test("token crypto: hash is stable 64-hex; plaintext not reversible", () => {
  const token = generatePublicToken();
  assert.equal(isPlausiblePublicToken(token), true);
  const h1 = hashPublicToken(token);
  const h2 = hashPublicToken(token);
  assert.equal(h1.length, 64);
  assert.equal(h1, h2);
  assert.notEqual(h1, token);
});

test("wa.me builder: exact natural prefill and allowlisted digits", () => {
  const built = buildWhatsAppRedirectUrl({
    env: { QR_CHANNEL_WHATSAPP_E164: "17867528080" }
  });
  assert.equal(built.ok, true);
  assert.equal(built.prefill, NATURAL_WHATSAPP_PREFILL);
  assert.equal(built.e164, "17867528080");
  assert.match(built.url, /^https:\/\/wa\.me\/17867528080\?text=/);
  assert.equal(
    decodeURIComponent(built.url.split("text=")[1]),
    NATURAL_WHATSAPP_PREFILL
  );
  assert.doesNotMatch(built.url, /campaign|token|correlation|org|TV-/i);
});

test("wa.me builder: rejects non-approved prefill mutation", () => {
  const built = buildWhatsAppRedirectUrl({
    env: { QR_CHANNEL_WHATSAPP_E164: "17867528080" },
    prefill: "Hola TV-secret"
  });
  assert.equal(built.ok, false);
});

test("destination: configured + allowlisted succeeds", () => {
  const resolved = resolveAllowlistedWhatsAppE164({
    env: { QR_CHANNEL_WHATSAPP_E164: "17867528080" }
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.e164, "17867528080");
  assert.ok(WHATSAPP_E164_HARD_ALLOWLIST.includes("17867528080"));
});

test("destination: missing config fails closed (no hardcoded fallback)", () => {
  const resolved = resolveAllowlistedWhatsAppE164({ env: {} });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reasonCode, REASON_CODES.DESTINATION_CONFIG_MISSING);
  assert.equal(resolved.e164, null);
  const built = buildWhatsAppRedirectUrl({ env: {} });
  assert.equal(built.ok, false);
  assert.equal(built.reasonCode, REASON_CODES.DESTINATION_CONFIG_MISSING);
});

test("destination: malformed config fails closed", () => {
  const resolved = resolveAllowlistedWhatsAppE164({
    env: { QR_CHANNEL_WHATSAPP_E164: "12" }
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reasonCode, REASON_CODES.DESTINATION_CONFIG_MALFORMED);
});

test("destination: configured but non-allowlisted fails closed", () => {
  const resolved = resolveAllowlistedWhatsAppE164({
    env: { QR_CHANNEL_WHATSAPP_E164: "15551234567" }
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reasonCode, REASON_CODES.DESTINATION_NOT_ALLOWLISTED);
});

test("destination: hard allowlist entry alone is not used as destination", () => {
  // Even though 17867528080 is allowlisted, missing env/campaign config must fail.
  assert.ok(WHATSAPP_E164_HARD_ALLOWLIST.includes("17867528080"));
  const resolved = resolveAllowlistedWhatsAppE164({ env: { QR_CHANNEL_WHATSAPP_ALLOWLIST: "17867528080" } });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reasonCode, REASON_CODES.DESTINATION_CONFIG_MISSING);
});

test("entry: missing destination blocks GET path before scan create", async () => {
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo);
  const service = serviceFor(repo, { QR_CHANNEL_BIND_SECRET: "test-secret" });
  const entry = await service.startPublicEntry(seeded.publicToken);
  assert.equal(entry.ok, false);
  assert.equal(entry.reasonCode, REASON_CODES.DESTINATION_CONFIG_MISSING);
  assert.equal(repo._dump().scans.length, 0);
});

test("bind: destination failure leaves scan pending_phone (no supersede)", async () => {
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo, { whatsappE164: "17867528080" });
  const serviceOk = serviceFor(repo, CONFIGURED_ENV);
  const entry = await serviceOk.startPublicEntry(seeded.publicToken);
  assert.equal(entry.ok, true);

  await repo.updateCampaign(seeded.campaign.id, { whatsapp_e164: null });

  const serviceBad = serviceFor(repo, {
    QR_CHANNEL_BIND_SECRET: "test-secret"
  });
  const bind = await serviceBad.bindPhoneAndRedirect({
    scanId: entry.scan.id,
    bindMac: entry.bindMac,
    rawPhone: "3055550199",
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  assert.equal(bind.ok, false);
  assert.equal(bind.reasonCode, REASON_CODES.DESTINATION_CONFIG_MISSING);
  const after = await repo.findScanById(entry.scan.id);
  assert.equal(after.status, SCAN_STATUS.PENDING_PHONE);
  assert.equal(after.bound_phone_normalized, null);
});

test("campaign: valid token resolves and creates pending_phone scan", async () => {
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo);
  const service = serviceFor(repo);
  const entry = await service.startPublicEntry(seeded.publicToken);
  assert.equal(entry.ok, true);
  assert.equal(entry.scan.status, SCAN_STATUS.PENDING_PHONE);
  assert.equal(entry.scan.org_id, TEAM_VISION_ORG_ID);
  assert.equal(entry.campaign.owner_user_id, PRIMARY_RVP_USER_ID);
  assert.ok(entry.bindMac);
  assert.ok(new Date(entry.scan.expires_at).getTime() > Date.now());
  assert.ok(
    new Date(entry.scan.expires_at).getTime() - Date.now() <= SCAN_TTL_MS + 1000
  );
});

test("campaign: unknown token fails closed (same class as invalid)", async () => {
  const repo = createMemoryQrChannelRepository();
  await seedCarMagnet(repo);
  const service = serviceFor(repo);
  const entry = await service.startPublicEntry(generatePublicToken());
  assert.equal(entry.ok, false);
  assert.equal(entry.reasonCode, REASON_CODES.TOKEN_INVALID);
});

test("campaign: inactive campaign fails safely", async () => {
  const repo = createMemoryQrChannelRepository();
  const service = serviceFor(repo);
  const created = await service.seedCampaign({
    orgId: CAR_MAGNET_V1.orgId,
    ownerUserId: CAR_MAGNET_V1.ownerUserId,
    campaignKey: "car_recruiting_inactive",
    name: "Inactive",
    source: "car_magnet",
    campaignType: "car_magnet",
    defaultConversationGoal: "interview",
    status: CAMPAIGN_STATUS.INACTIVE
  });
  assert.equal(created.ok, true);
  assert.equal(created.campaign.status, CAMPAIGN_STATUS.INACTIVE);
  const entry = await service.startPublicEntry(created.publicToken);
  assert.equal(entry.ok, false);
  assert.equal(entry.reasonCode, REASON_CODES.CAMPAIGN_INACTIVE);
});

test("campaign: owner missing fails closed", async () => {
  const repo = createMemoryQrChannelRepository();
  const token = generatePublicToken();
  await repo.insertCampaign({
    org_id: TEAM_VISION_ORG_ID,
    owner_user_id: "",
    name: "Broken",
    campaign_key: "broken_owner",
    source: "car_magnet",
    campaign_type: "car_magnet",
    default_conversation_goal: "interview",
    public_token_hash: hashPublicToken(token),
    status: CAMPAIGN_STATUS.ACTIVE,
    destination_channel: "whatsapp"
  });
  const service = serviceFor(repo);
  const entry = await service.startPublicEntry(token);
  assert.equal(entry.ok, false);
  assert.equal(entry.reasonCode, REASON_CODES.OWNER_MISSING);
});

test("campaign: cross-org token cannot be rebound to another org", async () => {
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo);
  const service = serviceFor(repo);
  const entry = await service.startPublicEntry(seeded.publicToken);
  const bind = await service.bindPhoneAndRedirect({
    scanId: entry.scan.id,
    bindMac: entry.bindMac,
    rawPhone: "+13055550199",
    expectedOrgId: ORG_B
  });
  assert.equal(bind.ok, false);
  assert.equal(bind.reasonCode, REASON_CODES.ORG_MISMATCH);
});

test("scan: bind valid phone → pending_inbound + wa.me redirect", async () => {
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo);
  const service = serviceFor(repo);
  const entry = await service.startPublicEntry(seeded.publicToken);
  const bind = await service.bindPhoneAndRedirect({
    scanId: entry.scan.id,
    bindMac: entry.bindMac,
    rawPhone: "(305) 555-0199",
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  assert.equal(bind.ok, true);
  assert.equal(bind.scan.status, SCAN_STATUS.PENDING_INBOUND);
  assert.equal(bind.scan.bound_phone_normalized, "13055550199");
  assert.equal(bind.prefill, NATURAL_WHATSAPP_PREFILL);
  assert.match(bind.redirectUrl, /^https:\/\/wa\.me\/17867528080\?text=/);
  assert.doesNotMatch(bind.redirectUrl, /13055550199|campaign|correlation|token/i);
});

test("scan: reject invalid phone", async () => {
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo);
  const service = serviceFor(repo);
  const entry = await service.startPublicEntry(seeded.publicToken);
  const bind = await service.bindPhoneAndRedirect({
    scanId: entry.scan.id,
    bindMac: entry.bindMac,
    rawPhone: "123",
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  assert.equal(bind.ok, false);
  assert.equal(bind.reasonCode, REASON_CODES.PHONE_INVALID);
});

test("scan: supersede previous pending for same org+phone", async () => {
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo);
  const service = serviceFor(repo);
  const first = await service.startPublicEntry(seeded.publicToken);
  await service.bindPhoneAndRedirect({
    scanId: first.scan.id,
    bindMac: first.bindMac,
    rawPhone: "3055550100",
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  const second = await service.startPublicEntry(seeded.publicToken);
  await service.bindPhoneAndRedirect({
    scanId: second.scan.id,
    bindMac: second.bindMac,
    rawPhone: "3055550100",
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  const open = await repo.listOpenScansForOrgPhone(TEAM_VISION_ORG_ID, "13055550100");
  assert.equal(open.length, 1);
  assert.equal(open[0].id, second.scan.id);
  const firstAfter = await repo.findScanById(first.scan.id);
  assert.equal(firstAfter.status, SCAN_STATUS.SUPERSEDED);
});

test("scan: does not supersede another org pending phone", async () => {
  const repo = createMemoryQrChannelRepository();
  const service = serviceFor(repo);
  const a = await service.seedCampaign({
    orgId: TEAM_VISION_ORG_ID,
    ownerUserId: PRIMARY_RVP_USER_ID,
    campaignKey: "car_recruiting_01",
    name: "A",
    source: "car_magnet",
    campaignType: "car_magnet",
    defaultConversationGoal: "interview"
  });
  const b = await service.seedCampaign({
    orgId: ORG_B,
    ownerUserId: OTHER_OWNER,
    campaignKey: "car_recruiting_01",
    name: "B",
    source: "car_magnet",
    campaignType: "car_magnet",
    defaultConversationGoal: "interview"
  });
  const entryA = await service.startPublicEntry(a.publicToken);
  await service.bindPhoneAndRedirect({
    scanId: entryA.scan.id,
    bindMac: entryA.bindMac,
    rawPhone: "3055550111",
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  const entryB = await service.startPublicEntry(b.publicToken);
  await service.bindPhoneAndRedirect({
    scanId: entryB.scan.id,
    bindMac: entryB.bindMac,
    rawPhone: "3055550111",
    expectedOrgId: ORG_B
  });
  const openA = await repo.listOpenScansForOrgPhone(TEAM_VISION_ORG_ID, "13055550111");
  const openB = await repo.listOpenScansForOrgPhone(ORG_B, "13055550111");
  assert.equal(openA.length, 1);
  assert.equal(openB.length, 1);
  assert.equal(openA[0].status, SCAN_STATUS.PENDING_INBOUND);
  assert.equal(openB[0].status, SCAN_STATUS.PENDING_INBOUND);
});

test("scan: expired cannot bind", async () => {
  let frozen = Date.now();
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo);
  const service = createQrCampaignService({
    repository: repo,
    env: CONFIGURED_ENV,
    nowFn: () => new Date(frozen)
  });
  const entry = await service.startPublicEntry(seeded.publicToken);
  frozen += SCAN_TTL_MS + 5_000;
  const bind = await service.bindPhoneAndRedirect({
    scanId: entry.scan.id,
    bindMac: entry.bindMac,
    rawPhone: "3055550122",
    expectedOrgId: TEAM_VISION_ORG_ID
  });
  assert.equal(bind.ok, false);
  assert.equal(bind.reasonCode, REASON_CODES.SCAN_EXPIRED);
  const after = await repo.findScanById(entry.scan.id);
  assert.equal(after.status, SCAN_STATUS.EXPIRED);
});

test("security: forged query params ignored — resolve uses token only", async () => {
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo);
  const service = serviceFor(repo);
  const entry = await service.startPublicEntry(seeded.publicToken);
  assert.equal(entry.campaign.source, "car_magnet");
  assert.equal(entry.campaign.campaign_key, "car_recruiting_01");
  // No API accepts query campaign override — covered by route test below.
});

test("HTTP: GET /go/:token renders interstitial; POST bind redirects to wa.me", async () => {
  const repo = createMemoryQrChannelRepository();
  const seeded = await seedCarMagnet(repo);
  const service = createQrCampaignService({
    repository: repo,
    env: {
      QR_CHANNEL_BIND_SECRET: "http-test-secret",
      QR_CHANNEL_WHATSAPP_E164: "17867528080"
    }
  });
  qrGoRouter.setTestService(service);

  const app = express();
  app.use("/go", qrGoRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const getRes = await fetch(`http://127.0.0.1:${port}/go/${seeded.publicToken}?campaign=evil&source=forge&goal=policy_review`);
    assert.equal(getRes.status, 200);
    const html = await getRes.text();
    assert.match(html, /Continuar por WhatsApp/);
    assert.match(html, /name="scanId"/);
    assert.match(html, /name="bindMac"/);
    assert.doesNotMatch(html, /evil|forge|policy_review|TV-/i);

    const scanId = html.match(/name="scanId" value="([^"]+)"/)[1];
    const bindMac = html.match(/name="bindMac" value="([^"]+)"/)[1];
    const body = new URLSearchParams({
      scanId,
      bindMac,
      phone: "3055550199"
    });
    const postRes = await fetch(`http://127.0.0.1:${port}/go/${seeded.publicToken}/bind`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      redirect: "manual"
    });
    assert.equal(postRes.status, 302);
    const location = postRes.headers.get("location");
    assert.match(location, /^https:\/\/wa\.me\/17867528080\?text=/);
    assert.equal(
      decodeURIComponent(location.split("text=")[1]),
      NATURAL_WHATSAPP_PREFILL
    );
    assert.doesNotMatch(location, /campaignId|correlation|token|13055550199/i);
  } finally {
    qrGoRouter.setTestService(null);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("HTTP: unknown token returns safe 404 page", async () => {
  const repo = createMemoryQrChannelRepository();
  const service = serviceFor(repo);
  qrGoRouter.setTestService(service);
  const app = express();
  app.use("/go", qrGoRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const token = generatePublicToken();
    const res = await fetch(`http://127.0.0.1:${port}/go/${token}`);
    assert.equal(res.status, 404);
    const html = await res.text();
    assert.match(html, /Enlace no disponible/);
  } finally {
    qrGoRouter.setTestService(null);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("digitsOnly helper strips non-digits", () => {
  assert.equal(digitsOnly("+1 (786) 752-8080"), "17867528080");
});
