/**
 * QR Campaign Manager Phase A — security, encryption, QR assets, legacy safety.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  createMemoryQrChannelRepository
} = require("../core/qrChannel/memoryQrChannelRepository");
const {
  createQrCampaignManagerService,
  REASON
} = require("../core/qrChannel/qrCampaignManagerService");
const {
  createQrCampaignService
} = require("../core/qrChannel/qrCampaignService");
const {
  encryptPublicToken,
  decryptPublicToken,
  isTokenEncryptionConfigured
} = require("../core/qrChannel/tokenEncryption");
const {
  hashPublicToken,
  generatePublicToken
} = require("../core/qrChannel/tokenCrypto");
const { CAMPAIGN_STATUS } = require("../core/qrChannel/constants");
const { isExecutionEnabled } = require("../core/recruitAiV2");
const {
  isLiveExecutionPathEnabled
} = require("../core/recruitAiV2/liveExecutionPathConfig");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const USER_REP = "11111111-1111-4111-8111-111111111111";
const USER_REP_2 = "22222222-2222-4222-8222-222222222222";
const USER_RVP = "33333333-3333-4333-8333-333333333333";
const USER_ADMIN = "44444444-4444-4444-8444-444444444444";
const USER_META = "55555555-5555-4555-8555-555555555555";
const USER_OTHER_ORG = "66666666-6666-4666-8666-666666666666";

const ENC_KEY = crypto.randomBytes(32).toString("base64");

function envBase(extra = {}) {
  return {
    QR_CAMPAIGN_MANAGER_ENABLED: "true",
    QR_CAMPAIGN_MANAGER_ORGANIZATION_IDS: ORG_A,
    QR_CHANNEL_TOKEN_ENCRYPTION_KEY: ENC_KEY,
    ATLAS_PUBLIC_URL: "https://atlas.example.test",
    ...extra
  };
}

function auth({ userId, role, organizationId = ORG_A, userExtra = {} }) {
  const user = {
    id: userId,
    role,
    organization_id: organizationId,
    status: "active",
    email: `${userId.slice(0, 8)}@example.test`,
    display_name: role,
    ...userExtra
  };
  const permissionsByRole = {
    administrator: [
      "prospect:read",
      "prospect:write",
      "prospect:assign",
      "org:read",
      "org:write",
      "admin:users"
    ],
    rvp: [
      "prospect:read",
      "prospect:write",
      "prospect:assign",
      "org:read",
      "org:write"
    ],
    division_leader: [
      "prospect:read",
      "prospect:write",
      "prospect:assign",
      "org:read"
    ],
    agent: ["prospect:read", "prospect:write", "prospect:communicate"],
    recruiter: ["prospect:read", "prospect:write", "prospect:communicate"]
  };
  return {
    userId,
    role,
    organizationId,
    permissions: permissionsByRole[role] || permissionsByRole.agent,
    status: "active",
    user
  };
}

function usersDb() {
  const map = new Map([
    [
      USER_REP,
      {
        id: USER_REP,
        role: "agent",
        organization_id: ORG_A,
        status: "active",
        email: "rep@example.test"
      }
    ],
    [
      USER_REP_2,
      {
        id: USER_REP_2,
        role: "recruiter",
        organization_id: ORG_A,
        status: "active",
        email: "rep2@example.test"
      }
    ],
    [
      USER_RVP,
      {
        id: USER_RVP,
        role: "rvp",
        organization_id: ORG_A,
        status: "active",
        email: "rvp@example.test"
      }
    ],
    [
      USER_ADMIN,
      {
        id: USER_ADMIN,
        role: "administrator",
        organization_id: ORG_A,
        status: "active",
        email: "admin@example.test"
      }
    ],
    [
      USER_META,
      {
        id: USER_META,
        role: "administrator",
        organization_id: ORG_A,
        status: "active",
        email: "meta.reviewer@example.test",
        profile_settings: { meta_review_user: true },
        meta_review_user: true
      }
    ],
    [
      USER_OTHER_ORG,
      {
        id: USER_OTHER_ORG,
        role: "agent",
        organization_id: ORG_B,
        status: "active",
        email: "other@example.test"
      }
    ]
  ]);
  return {
    async findUserById(id) {
      return map.get(id) || null;
    }
  };
}

function listAssignableStub() {
  return async () => [
    { id: USER_REP, displayName: "Rep One", role: "agent" },
    { id: USER_REP_2, displayName: "Rep Two", role: "recruiter" },
    { id: USER_RVP, displayName: "RVP", role: "rvp" }
  ];
}

function createManager(repo, env = envBase()) {
  return createQrCampaignManagerService({
    repository: repo,
    env,
    atlasUserService: usersDb(),
    listAssignable: listAssignableStub()
  });
}

test("execution gates remain OFF", () => {
  assert.equal(isExecutionEnabled({ env: process.env }), false);
  assert.equal(isLiveExecutionPathEnabled({ env: process.env }), false);
});

test("encryption round-trip; raw token never equals stored ciphertext", () => {
  const env = envBase();
  assert.equal(isTokenEncryptionConfigured(env), true);
  const token = generatePublicToken();
  const encrypted = encryptPublicToken(token, env);
  assert.notEqual(encrypted, token);
  assert.match(encrypted, /^v1\./);
  assert.equal(decryptPublicToken(encrypted, env), token);
  assert.equal(isTokenEncryptionConfigured({}), false);
});

test("1. Representative creates for self → success", async () => {
  const repo = createMemoryQrChannelRepository();
  const manager = createManager(repo);
  const result = await manager.createCampaign(auth({ userId: USER_REP, role: "agent" }), {
    name: "My Card",
    campaignType: "business_card"
  });
  assert.equal(result.ok, true);
  assert.equal(result.campaign.ownerUserId, USER_REP);
  assert.equal(result.campaign.hasEncryptedToken, true);
  assert.match(result.publicUrl, /^https:\/\/atlas\.example\.test\/go\//);
  const stored = await repo.findCampaignById(result.campaign.id);
  assert.ok(stored.encrypted_public_token);
  assert.notEqual(stored.encrypted_public_token, result.publicUrl);
  assert.doesNotMatch(JSON.stringify(stored), new RegExp(result.publicUrl.split("/go/")[1]));
});

test("2. Representative attempts create for another user → denied", async () => {
  const manager = createManager(createMemoryQrChannelRepository());
  const result = await manager.createCampaign(auth({ userId: USER_REP, role: "agent" }), {
    name: "Steal",
    campaignType: "car_magnet",
    ownerUserId: USER_REP_2
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASON.FORBIDDEN);
});

test("3. Management creates for eligible same-org member → success", async () => {
  const manager = createManager(createMemoryQrChannelRepository());
  const result = await manager.createCampaign(auth({ userId: USER_RVP, role: "rvp" }), {
    name: "Maria Magnet",
    campaignType: "car_magnet",
    ownerUserId: USER_REP_2
  });
  assert.equal(result.ok, true);
  assert.equal(result.campaign.ownerUserId, USER_REP_2);
  assert.equal(result.campaign.createdByUserId, USER_RVP);
});

test("4. Admin creates same-org → success", async () => {
  const manager = createManager(createMemoryQrChannelRepository());
  const result = await manager.createCampaign(
    auth({ userId: USER_ADMIN, role: "administrator" }),
    { name: "Admin Camp", campaignType: "event", ownerUserId: USER_REP }
  );
  assert.equal(result.ok, true);
  assert.equal(result.campaign.ownerUserId, USER_REP);
});

test("5. cross-org owner id → denied", async () => {
  const manager = createManager(createMemoryQrChannelRepository());
  const result = await manager.createCampaign(
    auth({ userId: USER_ADMIN, role: "administrator" }),
    {
      name: "Cross",
      campaignType: "custom",
      ownerUserId: USER_OTHER_ORG
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASON.OWNER_CROSS_ORG);
});

test("6–7. cross-org campaign GET / QR inaccessible", async () => {
  const repo = createMemoryQrChannelRepository();
  const manager = createManager(repo);
  const created = await manager.createCampaign(
    auth({ userId: USER_ADMIN, role: "administrator" }),
    { name: "Org A", campaignType: "custom" }
  );
  const other = auth({
    userId: USER_OTHER_ORG,
    role: "agent",
    organizationId: ORG_B
  });
  // Feature gate blocks other org entirely when not allowlisted
  const get = await manager.getCampaign(other, created.campaign.id);
  assert.equal(get.ok, false);
  assert.ok(
    get.reason === REASON.NOT_FOUND ||
      String(get.reason).includes("QR_CAMPAIGN_MANAGER")
  );
  const png = await manager.getQrPng(other, created.campaign.id);
  assert.equal(png.ok, false);
});

test("9. ineligible owner → denied", async () => {
  const manager = createManager(createMemoryQrChannelRepository());
  // Force findUserById to return operations role
  const customUsers = {
    async findUserById() {
      return {
        id: "77777777-7777-4777-8777-777777777777",
        role: "operations",
        organization_id: ORG_A,
        status: "active",
        email: "ops@example.test"
      };
    }
  };
  const mgr = createQrCampaignManagerService({
    repository: createMemoryQrChannelRepository(),
    env: envBase(),
    atlasUserService: customUsers,
    listAssignable: listAssignableStub()
  });
  const result = await mgr.createCampaign(
    auth({ userId: USER_ADMIN, role: "administrator" }),
    {
      name: "Ops Owner",
      campaignType: "custom",
      ownerUserId: "77777777-7777-4777-8777-777777777777"
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASON.OWNER_INELIGIBLE);
});

test("10–13. decrypt server-side; list never exposes tokens; public URL regenerates", async () => {
  const repo = createMemoryQrChannelRepository();
  const manager = createManager(repo);
  const actor = auth({ userId: USER_REP, role: "agent" });
  const created = await manager.createCampaign(actor, {
    name: "Decrypt Me",
    campaignType: "social_digital"
  });
  const listed = await manager.listCampaigns(actor);
  assert.equal(listed.ok, true);
  const json = JSON.stringify(listed.campaigns);
  assert.doesNotMatch(json, /encrypted_public_token/);
  assert.doesNotMatch(json, /\/go\/[A-Za-z0-9_-]{20,}/);
  assert.equal(listed.campaigns[0].hasEncryptedToken, true);

  const url = await manager.getPublicUrl(actor, created.campaign.id);
  assert.equal(url.ok, true);
  assert.equal(url.publicUrl, created.publicUrl);

  const stored = await repo.findCampaignById(created.campaign.id);
  const plain = decryptPublicToken(stored.encrypted_public_token, envBase());
  assert.equal(hashPublicToken(plain), stored.public_token_hash);
});

test("14–15. PNG/SVG encode Atlas /go/<token>", async () => {
  const manager = createManager(createMemoryQrChannelRepository());
  const actor = auth({ userId: USER_REP, role: "agent" });
  const created = await manager.createCampaign(actor, {
    name: "Asset",
    campaignType: "office_poster"
  });
  const png = await manager.getQrPng(actor, created.campaign.id);
  assert.equal(png.ok, true);
  assert.equal(png.publicUrl, created.publicUrl);
  assert.equal(png.body[0], 0x89);
  assert.equal(png.body[1], 0x50); // P
  assert.equal(png.body[2], 0x4e); // N
  assert.equal(png.body[3], 0x47); // G

  const svg = await manager.getQrSvg(actor, created.campaign.id);
  assert.equal(svg.ok, true);
  assert.equal(svg.publicUrl, created.publicUrl);
  assert.match(String(svg.body), /<svg/i);
});

test("16–17. deactivate → public inactive; reactivate works", async () => {
  const repo = createMemoryQrChannelRepository();
  const manager = createManager(repo);
  const publicSvc = createQrCampaignService({ repository: repo });
  const actor = auth({ userId: USER_REP, role: "agent" });
  const created = await manager.createCampaign(actor, {
    name: "Toggle",
    campaignType: "event"
  });
  const token = created.publicUrl.split("/go/")[1];

  let resolved = await publicSvc.resolvePublicToken(token);
  assert.equal(resolved.ok, true);

  await manager.setCampaignStatus(actor, created.campaign.id, CAMPAIGN_STATUS.INACTIVE);
  resolved = await publicSvc.resolvePublicToken(token);
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reasonCode, "CAMPAIGN_INACTIVE");

  await manager.setCampaignStatus(actor, created.campaign.id, CAMPAIGN_STATUS.ACTIVE);
  resolved = await publicSvc.resolvePublicToken(token);
  assert.equal(resolved.ok, true);
});

test("18. car_recruiting_01 legacy hash-only campaign resolves; redownload blocked", async () => {
  const repo = createMemoryQrChannelRepository();
  const publicSvc = createQrCampaignService({ repository: repo });
  const seeded = await publicSvc.seedCampaign({
    orgId: ORG_A,
    ownerUserId: USER_RVP,
    campaignKey: "car_recruiting_01",
    name: "Car Recruiting 01",
    source: "car_magnet",
    campaignType: "car_magnet",
    defaultConversationGoal: "interview"
  });
  assert.equal(seeded.created, true);
  assert.equal(seeded.campaign.encrypted_public_token, undefined);
  const resolved = await publicSvc.resolvePublicToken(seeded.publicToken);
  assert.equal(resolved.ok, true);

  const manager = createManager(repo);
  const url = await manager.getPublicUrl(
    auth({ userId: USER_RVP, role: "rvp" }),
    seeded.campaign.id
  );
  assert.equal(url.ok, false);
  assert.equal(url.reason, REASON.LEGACY_REDOWNLOAD_UNAVAILABLE);
});

test("19–20. ownership mapping fields preserved for new Maria campaign", async () => {
  const manager = createManager(createMemoryQrChannelRepository());
  const created = await manager.createCampaign(
    auth({ userId: USER_RVP, role: "rvp" }),
    {
      name: "Maria Flyer",
      campaignType: "recruiting_flyer",
      ownerUserId: USER_REP_2
    }
  );
  assert.equal(created.campaign.ownerUserId, USER_REP_2);
  // Phase 2 assignment uses campaign.owner_user_id — verified by existing Phase 2 tests.
  // Manager must not rewrite ownership semantics; owner field is the contract.
});

test("21. cross-tenant enumeration blocked (feature gate / 404)", async () => {
  const repo = createMemoryQrChannelRepository();
  const managerA = createManager(repo);
  const created = await managerA.createCampaign(
    auth({ userId: USER_ADMIN, role: "administrator" }),
    { name: "Secret", campaignType: "custom" }
  );
  const managerB = createQrCampaignManagerService({
    repository: repo,
    env: envBase({
      QR_CAMPAIGN_MANAGER_ORGANIZATION_IDS: ORG_B
    }),
    atlasUserService: usersDb(),
    listAssignable: listAssignableStub()
  });
  const list = await managerB.listCampaigns(
    auth({ userId: USER_OTHER_ORG, role: "agent", organizationId: ORG_B })
  );
  // Org B enabled in this env override, but campaigns are org-scoped — empty list
  if (list.ok) {
    assert.equal(list.campaigns.length, 0);
  }
  const get = await managerB.getCampaign(
    auth({ userId: USER_OTHER_ORG, role: "agent", organizationId: ORG_B }),
    created.campaign.id
  );
  assert.equal(get.ok, false);
  assert.equal(get.reason, REASON.NOT_FOUND);
});

test("22. missing encryption key → create fails closed", async () => {
  const manager = createQrCampaignManagerService({
    repository: createMemoryQrChannelRepository(),
    env: envBase({ QR_CHANNEL_TOKEN_ENCRYPTION_KEY: "" }),
    atlasUserService: usersDb(),
    listAssignable: listAssignableStub()
  });
  const result = await manager.createCampaign(
    auth({ userId: USER_REP, role: "agent" }),
    { name: "No Key", campaignType: "custom" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASON.ENCRYPTION_KEY_UNAVAILABLE);
});

test("23. existing public QR still resolves without encryption key", async () => {
  const repo = createMemoryQrChannelRepository();
  const publicSvc = createQrCampaignService({
    repository: repo,
    env: { QR_CHANNEL_TOKEN_ENCRYPTION_KEY: "" }
  });
  const seeded = await publicSvc.seedCampaign({
    orgId: ORG_A,
    ownerUserId: USER_RVP,
    campaignKey: "no_enc_needed",
    name: "Hash Only",
    source: "custom",
    campaignType: "custom",
    defaultConversationGoal: "interview"
  });
  const resolved = await publicSvc.resolvePublicToken(seeded.publicToken);
  assert.equal(resolved.ok, true);
});

test("24. no token plaintext in list/detail payloads", async () => {
  const manager = createManager(createMemoryQrChannelRepository());
  const actor = auth({ userId: USER_REP, role: "agent" });
  const created = await manager.createCampaign(actor, {
    name: "No Leak",
    campaignType: "custom"
  });
  const token = created.publicUrl.split("/go/")[1];
  const detail = await manager.getCampaign(actor, created.campaign.id);
  const blob = JSON.stringify(detail);
  assert.doesNotMatch(blob, new RegExp(token));
  assert.doesNotMatch(blob, /encrypted_public_token/);
});

test("org allowlist gate blocks non-allowlisted org", async () => {
  const manager = createManager(createMemoryQrChannelRepository());
  const result = await manager.createCampaign(
    auth({
      userId: USER_OTHER_ORG,
      role: "agent",
      organizationId: ORG_B
    }),
    { name: "Blocked", campaignType: "custom" }
  );
  assert.equal(result.ok, false);
  assert.match(String(result.reason), /ORG_NOT_ALLOWLISTED|DISABLED/);
});

test("representative lists only own campaigns", async () => {
  const repo = createMemoryQrChannelRepository();
  const manager = createManager(repo);
  await manager.createCampaign(auth({ userId: USER_REP, role: "agent" }), {
    name: "Mine",
    campaignType: "custom"
  });
  await manager.createCampaign(auth({ userId: USER_RVP, role: "rvp" }), {
    name: "Theirs",
    campaignType: "custom",
    ownerUserId: USER_REP_2
  });
  const list = await manager.listCampaigns(auth({ userId: USER_REP, role: "agent" }));
  assert.equal(list.ok, true);
  assert.equal(list.campaigns.length, 1);
  assert.equal(list.campaigns[0].name, "Mine");
});
