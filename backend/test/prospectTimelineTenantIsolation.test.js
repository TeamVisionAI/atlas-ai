/**
 * P0 — GET /api/prospects/:id/timeline tenant isolation.
 */

require("dotenv").config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");
const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const { TimelineService } = require("../modules/timeline/application/TimelineService");
const { TimelineRepository } = require("../modules/timeline/infrastructure/persistence/TimelineRepository");
const { InMemoryTimelineStore } = require("../modules/timeline/infrastructure/persistence/InMemoryTimelineStore");
const { createProspectTimelineHandler } = require("../modules/timeline/api/timeline.routes");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireProspectAccessById } = require("../middleware/requireProspectAccess");
const prospectAccessService = require("../security/prospectAccessService");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { SAAS_ROLES } = require("../security/saasRoles");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const PROSPECT_A = "a257b152-43ea-401f-8de3-783b997013ff";
const PROSPECT_B = "b1111111-1111-4111-8111-111111111111";

const serverJs = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const timelineRoutesJs = fs.readFileSync(
  path.join(__dirname, "../modules/timeline/api/timeline.routes.js"),
  "utf8"
);

class MemoryOnlyTimelineRepository extends TimelineRepository {
  constructor(store) {
    super();
    this.useMemory = true;
    this.memory = store;
  }
}

function authContext({ organizationId = ORG_A, role = ROLES.ADMINISTRATOR, userId = "admin-a" } = {}) {
  return {
    userId,
    email: `${userId}@example.com`,
    role,
    saasRole: role === ROLES.ADMINISTRATOR ? SAAS_ROLES.ADMIN : SAAS_ROLES.REPRESENTATIVE,
    organizationId,
    divisionId: null,
    permissions: permissionsForRole(role),
    status: "active"
  };
}

function seedTimeline(store, { prospectId, organizationId, summary }) {
  const id = crypto.randomUUID();
  store.rows.push({
    id,
    organization_id: organizationId,
    prospect_id: prospectId,
    business_event_id: crypto.randomUUID(),
    entry_type: "event",
    event_type: "prospect_updated",
    timestamp: new Date().toISOString(),
    actor: "SYSTEM",
    channel: "api",
    summary,
    payload: {},
    lifecycle_state_at_event: "new_lead",
    correlation_id: null,
    created_at: new Date().toISOString()
  });
  return id;
}

function patchProspectAccessLoader(prospectRows) {
  prospectAccessService.loadCoreProspectById = async (prospectId, organizationId) => {
    const row = prospectRows.find(
      (candidate) =>
        candidate.id === prospectId &&
        String(candidate.organization_id) === String(organizationId)
    );
    return row ? { ...row } : null;
  };

  prospectAccessService.loadLegacyProspectById = async (prospectId, organizationId) => {
    const row = prospectRows.find(
      (candidate) =>
        candidate.id === prospectId &&
        String(candidate.organization_id) === String(organizationId)
    );
    return row ? { ...row } : null;
  };
}

function createTimelineTestStack(service) {
  return [
    organizationGuard({ allowSuperAdminCrossOrg: true }),
    requireProspectAccessById(),
    createProspectTimelineHandler({ service })
  ];
}

function createTimelineTestApp({ authContext: ctx, service, prospectRows }) {
  patchProspectAccessLoader(prospectRows);

  const app = express();
  app.use((req, res, next) => {
    if (!ctx) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Authentication required."
      });
    }
    req.authContext = ctx;
    next();
  });
  app.get("/api/prospects/:id/timeline", ...createTimelineTestStack(service));
  return app;
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    return await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function jsonRequest(port, { path, headers = {} }) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body };
}

function buildFixture() {
  const store = new InMemoryTimelineStore();
  const service = new TimelineService({
    repository: new MemoryOnlyTimelineRepository(store)
  });
  const prospectRows = [
    { id: PROSPECT_A, organization_id: ORG_A, display_name: "Prospect A" },
    { id: PROSPECT_B, organization_id: ORG_B, display_name: "Prospect B" }
  ];

  seedTimeline(store, {
    prospectId: PROSPECT_A,
    organizationId: ORG_A,
    summary: "Tenant A timeline entry"
  });
  seedTimeline(store, {
    prospectId: PROSPECT_B,
    organizationId: ORG_B,
    summary: "Tenant B timeline entry"
  });

  return { service, prospectRows, store };
}

test("audit: prospect timeline route uses auth + org guard + prospect access", () => {
  assert.match(serverJs, /app\.get\("\/api\/prospects\/:id\/timeline", \.\.\.timelineModule\.prospectTimelineStack\)/);
  assert.match(timelineRoutesJs, /organizationGuard/);
  assert.match(timelineRoutesJs, /requireProspectAccessById/);
});

test("HTTP: unauthenticated request fails", async () => {
  const { service, prospectRows } = buildFixture();
  const app = createTimelineTestApp({ authContext: null, service, prospectRows });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_A}/timeline`
    });
    assert.equal(response.status, 401);
  });
});

test("HTTP: Tenant A can read own prospect timeline", async () => {
  const { service, prospectRows } = buildFixture();
  const app = createTimelineTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    prospectRows
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_A}/timeline`
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.total, 1);
    assert.equal(response.body.items[0].summary, "Tenant A timeline entry");
  });
});

test("HTTP: Tenant A cannot read Tenant B timeline by UUID", async () => {
  const { service, prospectRows } = buildFixture();
  const app = createTimelineTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    prospectRows
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_B}/timeline`
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "NOT_FOUND");
  });
});

test("HTTP: foreign UUID and nonexistent UUID both return 404", async () => {
  const { service, prospectRows } = buildFixture();
  const app = createTimelineTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    prospectRows
  });

  await withServer(app, async (port) => {
    const crossTenant = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_B}/timeline`
    });
    const missing = await jsonRequest(port, {
      path: `/api/prospects/${crypto.randomUUID()}/timeline`
    });

    assert.equal(crossTenant.status, 404);
    assert.equal(missing.status, 404);
    assert.equal(crossTenant.body.error, "NOT_FOUND");
    assert.equal(missing.body.error, "NOT_FOUND");
  });
});

test("HTTP: org override via query blocked for non-super-admin", async () => {
  const { service, prospectRows } = buildFixture();
  const app = createTimelineTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    prospectRows
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_B}/timeline?organizationId=${ORG_B}`
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, "FORBIDDEN");
  });
});

test("HTTP: super-admin remains scoped to explicitly selected tenant", async () => {
  const { service, prospectRows } = buildFixture();
  patchProspectAccessLoader(prospectRows);

  const app = express();
  app.use((req, res, next) => {
    req.authContext = {
      ...authContext({ organizationId: ORG_A, userId: "super-admin" }),
      saasRole: SAAS_ROLES.SUPER_ADMIN
    };
    next();
  });
  app.get("/api/prospects/:id/timeline", ...createTimelineTestStack(service));

  await withServer(app, async (port) => {
    const scopedToB = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_B}/timeline?organizationId=${ORG_B}`
    });
    const wrongContext = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_B}/timeline`
    });

    assert.equal(scopedToB.status, 200);
    assert.equal(scopedToB.body.items[0].summary, "Tenant B timeline entry");
    assert.equal(wrongContext.status, 404);
  });
});

test("service: organizationId filter prevents cross-tenant timeline rows for same prospect id probe", async () => {
  const store = new InMemoryTimelineStore();
  const service = new TimelineService({
    repository: new MemoryOnlyTimelineRepository(store)
  });

  seedTimeline(store, {
    prospectId: PROSPECT_A,
    organizationId: ORG_A,
    summary: "Scoped A"
  });
  seedTimeline(store, {
    prospectId: PROSPECT_A,
    organizationId: ORG_B,
    summary: "Foreign org same id probe"
  });

  const scoped = await service.getByProspect(PROSPECT_A, { organizationId: ORG_A });
  assert.equal(scoped.total, 1);
  assert.equal(scoped.items[0].summary, "Scoped A");
});
