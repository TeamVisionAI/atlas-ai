/**
 * BR-230 — TikFinity TikTok LIVE attribution bridge (Phase 1).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const express = require("express");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000099";
const SECRET = "test-tikfinity-secret";

const {
  createMemoryTiktokLiveEngagementStore,
  normalizeCommand,
  recordTikfinityLiveEvent
} = require("../core/tikfinity/tikfinityLiveEventService");
const createTikfinityLiveEventRouter = require("../routes/tikfinityLiveEvent");
const { redactSecrets } = require("../middleware/safeRequestLogger");

function buildHarness({ orgs = [TEAM_VISION_ORG], store } = {}) {
  const engagementStore = store || createMemoryTiktokLiveEngagementStore();
  const allowed = new Set(orgs);
  const findOrganization = async (organizationId) =>
    allowed.has(organizationId) ? { id: organizationId } : null;
  return {
    engagementStore,
    dependencies: {
      env: { TIKFINITY_WEBHOOK_SECRET: SECRET },
      findOrganization,
      engagementStore
    }
  };
}

function fakeReq(query = {}, body = {}, headers = {}) {
  return {
    query,
    body,
    get(name) {
      return headers[String(name).toLowerCase()] || headers[name] || null;
    }
  };
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    await run(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("A) valid IUL webhook => 200 and one engagement row", async () => {
  const { engagementStore, dependencies } = buildHarness();
  const result = await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: TEAM_VISION_ORG,
      campaign: "TVA_LIVE_IUL",
      funnel: "IUL_REVIEW",
      command: "IUL",
      value1: "liveviewer",
      value2: "quiero revisar mi poliza",
      value3: "Rose"
    }),
    dependencies
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, recorded: true });
  assert.equal(engagementStore.rows.length, 1);
  assert.equal(engagementStore.rows[0].organization_id, TEAM_VISION_ORG);
  assert.equal(engagementStore.rows[0].source, "TIKTOK_LIVE");
  assert.equal(engagementStore.rows[0].platform, "tiktok");
  assert.equal(engagementStore.rows[0].event_type, "command");
  assert.equal(engagementStore.rows[0].command, "IUL");
  assert.equal(engagementStore.rows[0].campaign, "TVA_LIVE_IUL");
  assert.equal(engagementStore.rows[0].funnel, "IUL_REVIEW");
});

test("B) valid TRABAJO webhook => 200", async () => {
  const { dependencies } = buildHarness();
  const result = await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: TEAM_VISION_ORG,
      campaign: "TVA_LIVE_RECRUIT",
      funnel: "RECRUITING",
      command: "TRABAJO",
      value1: "recruiter_fan"
    }),
    dependencies
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.recorded, true);
});

test("C) wrong secret => 401", async () => {
  const { engagementStore, dependencies } = buildHarness();
  const result = await recordTikfinityLiveEvent(
    fakeReq({
      secret: "wrong",
      organizationId: TEAM_VISION_ORG,
      command: "IUL",
      value1: "liveviewer"
    }),
    dependencies
  );
  assert.equal(result.status, 401);
  assert.equal(result.body.ok, false);
  assert.equal(engagementStore.rows.length, 0);
});

test("D) missing secret => 401", async () => {
  const { dependencies } = buildHarness();
  const result = await recordTikfinityLiveEvent(
    fakeReq({
      organizationId: TEAM_VISION_ORG,
      command: "IUL",
      value1: "liveviewer"
    }),
    dependencies
  );
  assert.equal(result.status, 401);
});

test("E) missing org => fail closed", async () => {
  const { engagementStore, dependencies } = buildHarness();
  const result = await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      command: "IUL",
      value1: "liveviewer"
    }),
    dependencies
  );
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "ORGANIZATION_REQUIRED");
  assert.equal(engagementStore.rows.length, 0);
});

test("F) invalid org => fail closed", async () => {
  const { engagementStore, dependencies } = buildHarness();
  const malformed = await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: "not-a-uuid",
      command: "IUL",
      value1: "liveviewer"
    }),
    dependencies
  );
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "ORGANIZATION_INVALID");

  const unknown = await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: OTHER_ORG,
      command: "IUL",
      value1: "liveviewer"
    }),
    dependencies
  );
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, "ORGANIZATION_NOT_FOUND");
  assert.equal(engagementStore.rows.length, 0);
});

test("G) unknown command => 400", async () => {
  const { engagementStore, dependencies } = buildHarness();
  const result = await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: TEAM_VISION_ORG,
      command: "FOLLOW",
      value1: "liveviewer"
    }),
    dependencies
  );
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "UNKNOWN_COMMAND");
  assert.equal(engagementStore.rows.length, 0);
});

test("H) /iul normalizes to IUL", () => {
  assert.equal(normalizeCommand("/iul"), "IUL");
  assert.equal(normalizeCommand("/IUL"), "IUL");
});

test("I) ?trabajo normalizes to TRABAJO", () => {
  assert.equal(normalizeCommand("?trabajo"), "TRABAJO");
});

test("J) value1 maps to username", async () => {
  const { engagementStore, dependencies } = buildHarness();
  await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: TEAM_VISION_ORG,
      command: "IUL",
      value1: "tiktok_user_99"
    }),
    dependencies
  );
  assert.equal(engagementStore.rows[0].username, "tiktok_user_99");
});

test("K) value2 maps to command_text", async () => {
  const { engagementStore, dependencies } = buildHarness();
  await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: TEAM_VISION_ORG,
      command: "IUL",
      value1: "liveviewer",
      value2: "quiero revisar mi poliza"
    }),
    dependencies
  );
  assert.equal(engagementStore.rows[0].command_text, "quiero revisar mi poliza");
});

test("L) value3 accepted but not used as command", async () => {
  const { engagementStore, dependencies } = buildHarness();
  const result = await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: TEAM_VISION_ORG,
      command: "IUL",
      value1: "liveviewer",
      value3: "Rose"
    }),
    dependencies
  );
  assert.equal(result.status, 200);
  assert.equal(engagementStore.rows[0].gift_name, "Rose");
  assert.equal(engagementStore.rows[0].command, "IUL");
  assert.equal(engagementStore.rows[0].raw_metadata.value3, "Rose");
});

test("M) duplicate command inside dedupe window => no duplicate row", async () => {
  const { engagementStore, dependencies } = buildHarness();
  const req = fakeReq({
    secret: SECRET,
    organizationId: TEAM_VISION_ORG,
    command: "IUL",
    value1: "liveviewer",
    value2: "quiero revisar"
  });
  const first = await recordTikfinityLiveEvent(req, {
    ...dependencies,
    nowMs: 1_000_000
  });
  const second = await recordTikfinityLiveEvent(req, {
    ...dependencies,
    nowMs: 1_010_000
  });
  assert.equal(first.body.recorded, true);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, { ok: true, recorded: false, duplicate: true });
  assert.equal(engagementStore.rows.length, 1);
});

test("N) no prospect created", async () => {
  const { engagementStore, dependencies } = buildHarness();
  await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: TEAM_VISION_ORG,
      command: "IUL",
      value1: "liveviewer"
    }),
    dependencies
  );
  assert.equal(engagementStore.rows[0].prospect_id, undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(engagementStore.rows[0], "prospect_id"));
});

test("O/P) no Recruit AI invoked and no WhatsApp outbound", () => {
  const serviceSrc = fs.readFileSync(
    path.join(__dirname, "../core/tikfinity/tikfinityLiveEventService.js"),
    "utf8"
  );
  const routeSrc = fs.readFileSync(
    path.join(__dirname, "../routes/tikfinityLiveEvent.js"),
    "utf8"
  );
  const forbidden = [
    "processRecruitAi",
    "recruitAiV2",
    "sendWhatsApp",
    "whatsappOutbound",
    "createProspect",
    "whatsappProspectResolver"
  ];
  for (const token of forbidden) {
    assert.doesNotMatch(serviceSrc, new RegExp(token));
    assert.doesNotMatch(routeSrc, new RegExp(token));
  }
});

test("Q) cross-tenant isolation stores only under requested valid org", async () => {
  const store = createMemoryTiktokLiveEngagementStore();
  const { dependencies } = buildHarness({
    orgs: [TEAM_VISION_ORG, OTHER_ORG],
    store
  });
  await recordTikfinityLiveEvent(
    fakeReq({
      secret: SECRET,
      organizationId: TEAM_VISION_ORG,
      command: "IUL",
      value1: "shared_username"
    }),
    dependencies
  );
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].organization_id, TEAM_VISION_ORG);
  assert.ok(store.rows.every((row) => row.organization_id === TEAM_VISION_ORG));
});

test("GET /api/integrations/tikfinity/live-event records IUL", async () => {
  const { engagementStore, dependencies } = buildHarness();
  const app = express();
  app.use("/api/integrations/tikfinity", createTikfinityLiveEventRouter(dependencies));

  await withServer(app, async (port) => {
    const url = new URL(`http://127.0.0.1:${port}/api/integrations/tikfinity/live-event`);
    url.searchParams.set("secret", SECRET);
    url.searchParams.set("organizationId", TEAM_VISION_ORG);
    url.searchParams.set("campaign", "TVA_LIVE_IUL");
    url.searchParams.set("funnel", "IUL_REVIEW");
    url.searchParams.set("command", "/iul");
    url.searchParams.set("value1", "liveviewer");
    url.searchParams.set("value2", "quiero revisar mi poliza");
    const response = await fetch(url);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true, recorded: true });
    assert.equal(engagementStore.rows[0].command, "IUL");
  });
});

test("request logger redacts webhook secret", () => {
  const raw =
    "/api/integrations/tikfinity/live-event?secret=super-secret&organizationId=abc&command=IUL";
  assert.match(redactSecrets(raw), /secret=\[redacted\]/);
  assert.doesNotMatch(redactSecrets(raw), /super-secret/);
});
