/**
 * P0 — Business events tenant isolation for prospect-scoped reads.
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

const {
  SupabaseBusinessEventRepository,
  InMemoryBusinessEventStore
} = require("../modules/business-events/infrastructure/persistence/SupabaseBusinessEventRepository");
const { BusinessEventService } = require("../modules/business-events/application/BusinessEventService");
const { EventFactory } = require("../modules/business-events/application/EventFactory");
const { LEAD_EVENTS } = require("../modules/business-events/domain/EventTypes");
const { createProspectEventsHandler } = require("../modules/business-events/api/businessEvent.routes");
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

const controllerSource = fs.readFileSync(
  path.join(__dirname, "../modules/business-events/api/businessEvent.controller.js"),
  "utf8"
);
const prospectRoutesSource = fs.readFileSync(
  path.join(__dirname, "../modules/prospects/api/prospect.routes.js"),
  "utf8"
);

class MemoryOnlyBusinessEventRepository extends SupabaseBusinessEventRepository {
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

function seedEvent(store, { prospectId, organizationId, eventType = LEAD_EVENTS.PROSPECT_UPDATED }) {
  const event = EventFactory.create({
    eventType,
    prospectId,
    actor: "SYSTEM",
    channel: "api",
    metadata: { organizationId, summary: `Event for ${organizationId}` }
  });
  store.append(event);
  return event.toJSON().eventId;
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

function buildFixture() {
  const store = new InMemoryBusinessEventStore();
  const repository = new MemoryOnlyBusinessEventRepository(store);
  const service = new BusinessEventService({ repository });
  const prospectRows = [
    { id: PROSPECT_A, organization_id: ORG_A, display_name: "Prospect A" },
    { id: PROSPECT_B, organization_id: ORG_B, display_name: "Prospect B" }
  ];

  seedEvent(store, {
    prospectId: PROSPECT_A,
    organizationId: ORG_A,
    eventType: LEAD_EVENTS.PROSPECT_CREATED
  });
  seedEvent(store, {
    prospectId: PROSPECT_B,
    organizationId: ORG_B,
    eventType: LEAD_EVENTS.PROSPECT_CREATED
  });
  seedEvent(store, {
    prospectId: PROSPECT_A,
    organizationId: ORG_B,
    eventType: LEAD_EVENTS.PROSPECT_UPDATED
  });

  return { service, repository, store, prospectRows };
}

function createEventsTestStack(service) {
  return [
    organizationGuard({ allowSuperAdminCrossOrg: true }),
    requireProspectAccessById(),
    createProspectEventsHandler({ service })
  ];
}

function createEventsTestApp({ authContext: ctx, service, prospectRows }) {
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
  app.get("/api/prospects/:id/events", ...createEventsTestStack(service));
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

async function jsonRequest(port, { path }) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body };
}

test("audit: prospect events controller passes resolved organizationId", () => {
  assert.match(controllerSource, /resolveTenantOrganizationId\(req, req\.query\.organizationId\)/);
  assert.match(controllerSource, /service\.listByProspect\(req\.params\.id, organizationId/);
  assert.match(prospectRoutesSource, /requireProspectAccessById\(\)/);
});

test("service: Tenant A sees own prospect events", async () => {
  const { service } = buildFixture();
  const result = await service.listByProspect(PROSPECT_A, ORG_A);

  assert.equal(result.total, 1);
  assert.equal(result.items[0].metadata.organizationId, ORG_A);
});

test("service: Tenant A cannot read Tenant B prospect events", async () => {
  const { service } = buildFixture();
  const result = await service.listByProspect(PROSPECT_B, ORG_A);

  assert.equal(result.total, 0);
  assert.equal(result.items.length, 0);
});

test("service: same prospect UUID in another org does not leak rows", async () => {
  const { service } = buildFixture();
  const scopedToA = await service.listByProspect(PROSPECT_A, ORG_A);
  const scopedToB = await service.listByProspect(PROSPECT_A, ORG_B);

  assert.equal(scopedToA.total, 1);
  assert.equal(scopedToB.total, 1);
  assert.equal(scopedToA.items[0].metadata.organizationId, ORG_A);
  assert.equal(scopedToB.items[0].metadata.organizationId, ORG_B);
});

test("service: missing organizationId fails closed", async () => {
  const { service } = buildFixture();

  await assert.rejects(
    () => service.listByProspect(PROSPECT_A, null),
    (error) => error.publicCode === "TENANT_ORGANIZATION_REQUIRED"
  );
});

test("repository: direct prospect query without organizationId is rejected", async () => {
  const { repository } = buildFixture();

  await assert.rejects(
    () => repository.findByProspect(PROSPECT_A, null),
    (error) => error.publicCode === "TENANT_ORGANIZATION_REQUIRED"
  );

  await assert.rejects(
    () => repository.search({ prospectId: PROSPECT_A }),
    (error) => error.publicCode === "TENANT_ORGANIZATION_REQUIRED"
  );
});

test("service: getById requires organizationId and scopes lookup", async () => {
  const { service, store } = buildFixture();
  const eventId = seedEvent(store, {
    prospectId: PROSPECT_A,
    organizationId: ORG_A,
    eventType: LEAD_EVENTS.PROSPECT_ASSIGNED
  });

  const found = await service.getById(eventId, ORG_A);
  assert.equal(found.eventId, eventId);

  await assert.rejects(
    () => service.getById(eventId, ORG_B),
    (error) => error.publicCode === "EVENT_NOT_FOUND"
  );

  await assert.rejects(
    () => service.getById(eventId, null),
    (error) => error.publicCode === "TENANT_ORGANIZATION_REQUIRED"
  );
});

test("HTTP: Tenant A can read own prospect events through guarded route", async () => {
  const { service, prospectRows } = buildFixture();
  const app = createEventsTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    prospectRows
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_A}/events`
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.total, 1);
    assert.equal(response.body.items[0].metadata.organizationId, ORG_A);
  });
});

test("HTTP: Tenant A foreign prospect UUID returns not found at guard", async () => {
  const { service, prospectRows } = buildFixture();
  const app = createEventsTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    prospectRows
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_B}/events`
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "NOT_FOUND");
  });
});

test("HTTP: org override blocked for non-super-admin", async () => {
  const { service, prospectRows } = buildFixture();
  const app = createEventsTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    prospectRows
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      path: `/api/prospects/${PROSPECT_B}/events?organizationId=${ORG_B}`
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, "FORBIDDEN");
  });
});
