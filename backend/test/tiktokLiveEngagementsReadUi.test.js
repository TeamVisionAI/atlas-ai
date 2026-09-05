/**
 * Read-only TikTok LIVE engagements UI (BR-230).
 * No webhook writes. Tenant isolation is mandatory.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const express = require("express");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000099";

const {
  createMemoryTiktokLiveEngagementStore,
  listTiktokLiveEngagements
} = require("../core/tikfinity/tikfinityLiveEventService");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");

function seedStore() {
  return createMemoryTiktokLiveEngagementStore([
    {
      id: "tv-old",
      organization_id: TEAM_VISION_ORG,
      username: "first_viewer",
      command: "IUL",
      campaign: "TVA_LIVE_IUL",
      funnel: "IUL_REVIEW",
      received_at: "2026-09-04T20:00:00.000Z"
    },
    {
      id: "tv-new",
      organization_id: TEAM_VISION_ORG,
      username: "latest_viewer",
      command: "TRABAJO",
      campaign: "TVA_LIVE_RECRUIT",
      funnel: "RECRUITING",
      received_at: "2026-09-04T21:00:00.000Z"
    },
    {
      id: "other-row",
      organization_id: OTHER_ORG,
      username: "other_tenant_user",
      command: "IUL",
      campaign: "OTHER_IUL",
      funnel: "IUL_REVIEW",
      received_at: "2026-09-04T22:00:00.000Z"
    }
  ]);
}

function createReadApp({ organizationId, store }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = {
      userId: "user-1",
      role: "RVP",
      organizationId,
      homeOrganizationId: organizationId
    };
    next();
  });
  app.use(organizationGuard());
  app.get("/api/tiktok-live-engagements", async (req, res) => {
    try {
      const tenantId = getTenantOrganizationId(req);
      const payload = await listTiktokLiveEngagements(
        { organizationId: tenantId, limit: req.query.limit },
        { engagementStore: store }
      );
      res.json(payload);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || "ENGAGEMENT_LIST_FAILED"
      });
    }
  });
  return app;
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

test("A) Team Vision sees only Team Vision TikTok engagements", async () => {
  const store = seedStore();
  const payload = await listTiktokLiveEngagements(
    { organizationId: TEAM_VISION_ORG },
    { engagementStore: store }
  );
  assert.equal(payload.organizationId, TEAM_VISION_ORG);
  assert.equal(payload.summary.total, 2);
  assert.deepEqual(
    payload.items.map((row) => row.username),
    ["latest_viewer", "first_viewer"]
  );
  assert.equal(
    payload.items.some((row) => row.username === "other_tenant_user"),
    false
  );
});

test("B) other tenant cannot see Team Vision rows", async () => {
  const store = seedStore();
  const payload = await listTiktokLiveEngagements(
    { organizationId: OTHER_ORG },
    { engagementStore: store }
  );
  assert.equal(payload.organizationId, OTHER_ORG);
  assert.equal(payload.summary.total, 1);
  assert.equal(payload.items[0].username, "other_tenant_user");
  assert.equal(
    payload.items.some((row) => row.username === "latest_viewer"),
    false
  );

  const app = createReadApp({ organizationId: OTHER_ORG, store });
  await withServer(app, async (port) => {
    const blocked = await fetch(
      `http://127.0.0.1:${port}/api/tiktok-live-engagements?organizationId=${TEAM_VISION_ORG}`
    );
    assert.equal(blocked.status, 403);
    const allowed = await fetch(`http://127.0.0.1:${port}/api/tiktok-live-engagements`);
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.summary.total, 1);
    assert.equal(body.items[0].username, "other_tenant_user");
  });
});

test("C) IUL counts correctly", async () => {
  const store = seedStore();
  const payload = await listTiktokLiveEngagements(
    { organizationId: TEAM_VISION_ORG },
    { engagementStore: store }
  );
  assert.equal(payload.summary.iul, 1);
});

test("D) TRABAJO counts correctly", async () => {
  const store = seedStore();
  const payload = await listTiktokLiveEngagements(
    { organizationId: TEAM_VISION_ORG },
    { engagementStore: store }
  );
  assert.equal(payload.summary.recruiting, 1);
});

test("E) recent list newest first", async () => {
  const store = seedStore();
  const payload = await listTiktokLiveEngagements(
    { organizationId: TEAM_VISION_ORG },
    { engagementStore: store }
  );
  assert.equal(payload.items[0].username, "latest_viewer");
  assert.equal(payload.items[0].command, "TRABAJO");
  assert.equal(payload.items[1].username, "first_viewer");
  assert.equal(payload.summary.lastReceivedAt, "2026-09-04T21:00:00.000Z");
});

test("F) empty state works", async () => {
  const store = createMemoryTiktokLiveEngagementStore();
  const payload = await listTiktokLiveEngagements(
    { organizationId: TEAM_VISION_ORG },
    { engagementStore: store }
  );
  assert.equal(payload.summary.total, 0);
  assert.equal(payload.summary.iul, 0);
  assert.equal(payload.summary.recruiting, 0);
  assert.equal(payload.summary.lastReceivedAt, null);
  assert.deepEqual(payload.items, []);
});

test("G) no write endpoints or actions introduced", () => {
  const routeSrc = fs.readFileSync(
    path.join(__dirname, "../routes/tiktokLiveEngagements.js"),
    "utf8"
  );
  const pageSrc = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/TiktokLiveEngagementsPage.jsx"),
    "utf8"
  );
  const serviceSrc = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/services/tiktokLiveEngagementsService.js"),
    "utf8"
  );
  assert.match(routeSrc, /requireAtlasUser/);
  assert.match(routeSrc, /organizationGuard/);
  assert.match(routeSrc, /getTenantOrganizationId/);
  assert.match(routeSrc, /router\.get\("\/"/);
  assert.doesNotMatch(routeSrc, /router\.(post|put|patch|delete)\(/);
  assert.doesNotMatch(routeSrc, /TIKFINITY_WEBHOOK_SECRET/);
  assert.doesNotMatch(routeSrc, /api\.useatlas-ai\.com\/api\/integrations\/tikfinity/);
  assert.doesNotMatch(pageSrc, /createProspect|sendWhatsApp|onDelete|handleDelete/i);
  assert.doesNotMatch(serviceSrc, /method:\s*["'](POST|PUT|PATCH|DELETE)/);
  const translations = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/i18n/translations.js"),
    "utf8"
  );
  assert.match(translations, /No TikTok LIVE engagements captured yet\./);
});

test("HTTP Team Vision list stays tenant-scoped and public fields only", async () => {
  const store = seedStore();
  const app = createReadApp({ organizationId: TEAM_VISION_ORG, store });
  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/tiktok-live-engagements`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.organizationId, TEAM_VISION_ORG);
    assert.equal(body.summary.total, 2);
    assert.equal(body.items[0].status, "Captured");
    assert.equal(body.items[0].raw_metadata, undefined);
    assert.equal(JSON.stringify(body).includes("TIKFINITY"), false);
  });
});

test("docs: BR-230 read-only surface documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-230/);
  assert.match(rules, /read-only/);
  assert.match(rules, /tiktok-live-engagements/);
});
