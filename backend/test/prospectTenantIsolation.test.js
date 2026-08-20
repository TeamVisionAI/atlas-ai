/**
 * P0 Task 2 — Mandatory tenant scoping for prospect ID-based reads/writes.
 */

require("dotenv").config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const http = require("node:http");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { DEFAULT_ORGANIZATION_ID, LIFECYCLE_STATES } = require("../modules/prospects/domain/constants");
const { InMemoryProspectStore } = require("../modules/prospects/infrastructure/persistence/InMemoryProspectStore");
const { ProspectRepository } = require("../modules/prospects/infrastructure/persistence/SupabaseProspectRepository");
const { ProspectApplicationService } = require("../modules/prospects/application/ProspectApplicationService");
const { Prospect } = require("../modules/prospects/domain/Prospect");
const { toInsertRow } = require("../modules/prospects/infrastructure/persistence/ProspectMapper");
const { createProspectController } = require("../modules/prospects/api/prospect.controller");
const { organizationGuard } = require("../middleware/organizationGuard");
const prospectAccessService = require("../security/prospectAccessService");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { SAAS_ROLES } = require("../security/saasRoles");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";

class MemoryOnlyRepository extends ProspectRepository {
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

function seedProspect(store, { organizationId, displayName, email, phone }) {
  const prospectId = crypto.randomUUID();
  const aggregate = Prospect.create({
    prospectId,
    organizationId,
    displayName,
    email,
    primaryPhone: phone,
    leadSource: { sourceType: "manual" }
  });
  const row = toInsertRow(aggregate);
  store.rows.set(prospectId, { ...row });
  return { prospectId, row };
}

function patchProspectAccessLoader(store) {
  prospectAccessService.loadCoreProspectById = async (prospectId, organizationId) => {
    const row = store.findActiveById(prospectId, organizationId);
    return row ? { ...row } : null;
  };
}

function createProspectTestApp({ authContext: ctx, service, store }) {
  patchProspectAccessLoader(store);
  const controller = createProspectController(service);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.authContext = ctx;
    req.atlasUser = { id: ctx.userId };
    next();
  });

  const router = express.Router();
  router.use(organizationGuard({ allowSuperAdminCrossOrg: true }));
  router.post("/merge", controller.merge.bind(controller));
  router.get("/", controller.list.bind(controller));
  router.post("/", controller.create.bind(controller));
  router.get("/:id", controller.getById.bind(controller));
  router.patch("/:id", controller.update.bind(controller));
  router.post("/:id/archive", controller.archive.bind(controller));
  router.post("/:id/restore", controller.restore.bind(controller));
  router.post("/:id/assign", controller.assign.bind(controller));

  app.use("/api/prospects", router);
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

async function jsonRequest(port, { method, path, body, headers = {} }) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    payload = JSON.parse(text);
  }

  return { status: response.status, body: payload };
}

test("repository: findById scopes by organization_id", async () => {
  const store = new InMemoryProspectStore();
  const repository = new MemoryOnlyRepository(store);
  const { prospectId } = seedProspect(store, {
    organizationId: ORG_A,
    displayName: "Tenant A Lead",
    email: "a@example.com",
    phone: "7875550101"
  });

  const inOrg = await repository.findById(prospectId, ORG_A);
  const crossOrg = await repository.findById(prospectId, ORG_B);

  assert.ok(inOrg);
  assert.equal(inOrg.toJSON().organizationId, ORG_A);
  assert.equal(crossOrg, null);
});

test("repository: save cannot update a row in another org", async () => {
  const store = new InMemoryProspectStore();
  const repository = new MemoryOnlyRepository(store);
  const { prospectId } = seedProspect(store, {
    organizationId: ORG_B,
    displayName: "Tenant B Lead",
    email: "b@example.com",
    phone: "7875550102"
  });

  const loaded = await repository.findById(prospectId, ORG_B);
  loaded.applyUpdate({ displayName: "Tampered Name" });

  const saved = await repository.save(loaded, ORG_A);
  assert.equal(saved, null);

  const unchanged = await repository.findById(prospectId, ORG_B);
  assert.equal(unchanged.toJSON().identity.displayName, "Tenant B Lead");
});

test("service: create uses authenticated org and ignores body organizationId", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });

  const created = await service.createProspect(
    ORG_A,
    {
      displayName: "Created In A",
      email: "created-a@example.com",
      primaryPhone: "7875550201",
      organizationId: ORG_B,
      leadSource: { sourceType: "manual" }
    },
    "AGENT:test"
  );

  assert.equal(created.organizationId, ORG_A);
  assert.notEqual(created.organizationId, ORG_B);
});

test("service: create without body org uses service org, not DEFAULT_ORGANIZATION_ID", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });

  const created = await service.createProspect(
    ORG_B,
    {
      displayName: "Created In B",
      email: "created-b@example.com",
      primaryPhone: "7875550202",
      leadSource: { sourceType: "manual" }
    },
    "AGENT:test"
  );

  assert.equal(created.organizationId, ORG_B);
  assert.notEqual(created.organizationId, DEFAULT_ORGANIZATION_ID);
});

test("service: wrong-tenant and missing IDs both return not found", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });
  const { prospectId } = seedProspect(store, {
    organizationId: ORG_B,
    displayName: "Tenant B Only",
    email: "only-b@example.com",
    phone: "7875550203"
  });

  await assert.rejects(
    () => service.getProspect(prospectId, ORG_A),
    (error) => error.statusCode === 404 && error.publicCode === "PROSPECT_NOT_FOUND"
  );

  await assert.rejects(
    () => service.getProspect(crypto.randomUUID(), ORG_A),
    (error) => error.statusCode === 404 && error.publicCode === "PROSPECT_NOT_FOUND"
  );
});

test("service: merge cannot cross tenants and leaves Tenant B unchanged", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });

  const tenantA = seedProspect(store, {
    organizationId: ORG_A,
    displayName: "Survivor A",
    email: "survivor-a@example.com",
    phone: "7875550301"
  });
  const tenantB = seedProspect(store, {
    organizationId: ORG_B,
    displayName: "Victim B",
    email: "victim-b@example.com",
    phone: "7875550302"
  });

  await assert.rejects(
    () =>
      service.mergeProspects(
        ORG_A,
        { survivorId: tenantA.prospectId, mergedId: tenantB.prospectId },
        "AGENT:test"
      ),
    (error) => error.statusCode === 404
  );

  const stillThere = await service.getProspect(tenantB.prospectId, ORG_B);
  assert.equal(stillThere.identity.displayName, "Victim B");
  assert.equal(stillThere.identity.mergedIntoId, null);
});

test("service: same-tenant create/get/update/merge still work", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });

  const created = await service.createProspect(
    ORG_A,
    {
      displayName: "Maria Lopez",
      email: "maria@example.com",
      primaryPhone: "7875550401",
      leadSource: { sourceType: "manual" }
    },
    "AGENT:test"
  );

  const fetched = await service.getProspect(created.prospectId, ORG_A);
  assert.equal(fetched.contact.email, "maria@example.com");

  const updated = await service.updateProspect(
    created.prospectId,
    ORG_A,
    { lifecycleState: LIFECYCLE_STATES.CONTACT_ATTEMPTED },
    "AGENT:test"
  );
  assert.equal(updated.status.lifecycleState, LIFECYCLE_STATES.CONTACT_ATTEMPTED);

  const duplicate = await service.createProspect(
    ORG_A,
    {
      displayName: "Carlos Ruiz",
      email: "carlos@example.com",
      primaryPhone: "7875550402",
      leadSource: { sourceType: "manual" }
    },
    "AGENT:test"
  );

  const merged = await service.mergeProspects(
    ORG_A,
    { survivorId: created.prospectId, mergedId: duplicate.prospectId },
    "AGENT:test"
  );

  assert.equal(merged.survivor.prospectId, created.prospectId);
  assert.equal(merged.merged.identity.mergedIntoId, created.prospectId);
});

test("HTTP: Tenant A can get own prospect", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });
  const { prospectId } = seedProspect(store, {
    organizationId: ORG_A,
    displayName: "HTTP A",
    email: "http-a@example.com",
    phone: "7875550501"
  });

  const app = createProspectTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    store
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      method: "GET",
      path: `/api/prospects/${prospectId}`
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.prospect.prospectId, prospectId);
  });
});

test("HTTP: Tenant A cannot get Tenant B prospect by UUID", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });
  const { prospectId } = seedProspect(store, {
    organizationId: ORG_B,
    displayName: "HTTP B",
    email: "http-b@example.com",
    phone: "7875550502"
  });

  const app = createProspectTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    store
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      method: "GET",
      path: `/api/prospects/${prospectId}`
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "PROSPECT_NOT_FOUND");
  });
});

test("HTTP: wrong-tenant ID and nonexistent ID both return 404", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });
  const { prospectId } = seedProspect(store, {
    organizationId: ORG_B,
    displayName: "Hidden B",
    email: "hidden-b@example.com",
    phone: "7875550503"
  });

  const app = createProspectTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    store
  });

  await withServer(app, async (port) => {
    const crossTenant = await jsonRequest(port, {
      method: "GET",
      path: `/api/prospects/${prospectId}`
    });
    const missing = await jsonRequest(port, {
      method: "GET",
      path: `/api/prospects/${crypto.randomUUID()}`
    });

    assert.equal(crossTenant.status, 404);
    assert.equal(missing.status, 404);
    assert.equal(crossTenant.body.error, "PROSPECT_NOT_FOUND");
    assert.equal(missing.body.error, "PROSPECT_NOT_FOUND");
  });
});

test("HTTP: Tenant A cannot update/archive/restore/assign Tenant B prospect", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });
  const { prospectId } = seedProspect(store, {
    organizationId: ORG_B,
    displayName: "Protected B",
    email: "protected-b@example.com",
    phone: "7875550504"
  });

  const app = createProspectTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    store
  });

  await withServer(app, async (port) => {
    const update = await jsonRequest(port, {
      method: "PATCH",
      path: `/api/prospects/${prospectId}`,
      body: { displayName: "Hacked" }
    });
    const archive = await jsonRequest(port, {
      method: "POST",
      path: `/api/prospects/${prospectId}/archive`
    });
    const restore = await jsonRequest(port, {
      method: "POST",
      path: `/api/prospects/${prospectId}/restore`
    });
    const assign = await jsonRequest(port, {
      method: "POST",
      path: `/api/prospects/${prospectId}/assign`,
      body: { assignedAgentId: "agent-x" }
    });

    for (const response of [update, archive, restore, assign]) {
      assert.equal(response.status, 404);
      assert.equal(response.body.error, "PROSPECT_NOT_FOUND");
    }
  });
});

test("HTTP: merge cannot cross tenants", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });
  const survivor = seedProspect(store, {
    organizationId: ORG_A,
    displayName: "Survivor",
    email: "survivor@example.com",
    phone: "7875550505"
  });
  const victim = seedProspect(store, {
    organizationId: ORG_B,
    displayName: "Victim",
    email: "victim@example.com",
    phone: "7875550506"
  });

  const app = createProspectTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    store
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      method: "POST",
      path: "/api/prospects/merge",
      body: {
        survivorId: survivor.prospectId,
        mergedId: victim.prospectId
      }
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error, "PROSPECT_NOT_FOUND");
  });

  const unchanged = await service.getProspect(victim.prospectId, ORG_B);
  assert.equal(unchanged.identity.mergedIntoId, null);
});

test("HTTP: create without body org uses authenticated org", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });

  const app = createProspectTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    store
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      method: "POST",
      path: "/api/prospects",
      body: {
        displayName: "Auth Org Create",
        email: "auth-org@example.com",
        primaryPhone: "7875550507",
        leadSource: { sourceType: "manual" }
      }
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.prospect.organizationId, ORG_A);
  });
});

test("HTTP: foreign body organizationId is blocked before create handler", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });

  const app = createProspectTestApp({
    authContext: authContext({ organizationId: ORG_A }),
    service,
    store
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      method: "POST",
      path: "/api/prospects",
      body: {
        displayName: "Body Org Override",
        email: "override@example.com",
        primaryPhone: "7875550510",
        organizationId: ORG_B,
        leadSource: { sourceType: "manual" }
      }
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, "FORBIDDEN");
  });
});

test("HTTP: non-super-admin org override via body is blocked by organizationGuard", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });

  const app = createProspectTestApp({
    authContext: authContext({ organizationId: ORG_A, role: ROLES.ADMINISTRATOR }),
    service,
    store
  });

  await withServer(app, async (port) => {
    const response = await jsonRequest(port, {
      method: "POST",
      path: "/api/prospects",
      body: {
        displayName: "Blocked Override",
        email: "blocked@example.com",
        primaryPhone: "7875550508",
        organization_id: ORG_B,
        leadSource: { sourceType: "manual" }
      }
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, "FORBIDDEN");
  });
});

test("HTTP: super-admin remains scoped to selected org only via Support Mode", async () => {
  const store = new InMemoryProspectStore();
  const service = new ProspectApplicationService({
    repository: new MemoryOnlyRepository(store)
  });
  const tenantB = seedProspect(store, {
    organizationId: ORG_B,
    displayName: "Super Admin Scope B",
    email: "super-b@example.com",
    phone: "7875550509"
  });

  patchProspectAccessLoader(store);
  const controller = createProspectController(service);

  const superApp = express();
  superApp.use(express.json());
  superApp.use((req, res, next) => {
    req.authContext = {
      ...authContext({ organizationId: ORG_A, role: ROLES.ADMINISTRATOR, userId: "super-admin" }),
      saasRole: SAAS_ROLES.SUPER_ADMIN
    };
    req.atlasUser = { id: "super-admin" };
    req.supportContext = { organizationId: ORG_B, enteredAt: new Date().toISOString() };
    req.effectiveOrganizationId = ORG_B;
    next();
  });

  const router = express.Router();
  router.use(organizationGuard());
  router.get("/:id", controller.getById.bind(controller));
  superApp.use("/api/prospects", router);

  await withServer(superApp, async (port) => {
    const scopedToB = await jsonRequest(port, {
      method: "GET",
      path: `/api/prospects/${tenantB.prospectId}`
    });
    const foreignOverride = await jsonRequest(port, {
      method: "GET",
      path: `/api/prospects/${tenantB.prospectId}?organizationId=${ORG_A}`
    });

    assert.equal(scopedToB.status, 200);
    assert.equal(foreignOverride.status, 403);
  });
});

test("audit: prospect routes mount organizationGuard and scoped events auth", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const routesSource = fs.readFileSync(
    path.join(__dirname, "../modules/prospects/api/prospect.routes.js"),
    "utf8"
  );

  assert.match(routesSource, /organizationGuard/);
  assert.match(routesSource, /requireProspectAccessById/);
});
