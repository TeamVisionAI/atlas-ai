/**
 * BR-160 — Global Super Admin has no operational tenant unless Support Mode is on.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { SAAS_ROLES } = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { organizationGuard } = require("../middleware/organizationGuard");
const {
  resolveEffectiveOrganizationId,
  isGlobalSuperAdminControlPlane
} = require("../core/effectiveOrganizationContext");
const {
  operationalControlPlaneEmpty,
  emptyDashboard,
  emptyProspectCenter,
  emptyFollowUps,
  emptyMissionControlSummary
} = require("../core/operationalControlPlane");
const { TEAM_VISION_ORGANIZATION_ID: ORG_TV } = require("../core/teamVisionSeedTenant");

const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const SA_ID = "00000000-0000-4000-8000-000000000002";

function superAdmin(organizationId = ORG_TV) {
  return {
    userId: SA_ID,
    organizationId,
    role: ROLES.ADMINISTRATOR,
    saasRole: SAAS_ROLES.SUPER_ADMIN,
    permissions: permissionsForRole(ROLES.ADMINISTRATOR),
    status: "active"
  };
}

function tenantRole(role, organizationId, saasRole) {
  return {
    userId: `${role}-${organizationId.slice(0, 8)}`,
    organizationId,
    role,
    saasRole,
    permissions: permissionsForRole(role),
    status: "active"
  };
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    return await run(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function getJson(port, pathName) {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`);
  const body = await response.json();
  return { status: response.status, body };
}

function createOperationalApp({ authContext, supportContext = null, onLoad }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = { ...authContext };
    req.supportContext = supportContext;
    req.effectiveOrganizationId = resolveEffectiveOrganizationId(
      req.authContext,
      req.supportContext
    );
    next();
  });
  app.use(organizationGuard());

  const load = () => {
    if (typeof onLoad === "function") {
      onLoad();
    }
    throw new Error("operational prospect loader must not run on the control plane");
  };

  app.get("/api/dashboard", operationalControlPlaneEmpty(emptyDashboard), (_req, res) => {
    load();
    res.json({ leaked: true });
  });
  app.get(
    "/api/mission-control/summary",
    operationalControlPlaneEmpty(emptyMissionControlSummary),
    (_req, res) => {
      load();
      res.json({ leaked: true });
    }
  );
  app.get(
    "/api/prospect-center",
    operationalControlPlaneEmpty(emptyProspectCenter),
    (_req, res) => {
      load();
      res.json({ leaked: true });
    }
  );
  app.get(
    "/api/prospect-center/report",
    operationalControlPlaneEmpty(() => ({
      controlPlane: true,
      organizationId: null,
      emptyReason: "SUPER_ADMIN_CONTROL_PLANE",
      items: []
    })),
    (_req, res) => {
      load();
      res.json({ leaked: true });
    }
  );
  app.get("/api/follow-ups", operationalControlPlaneEmpty(emptyFollowUps), (_req, res) => {
    load();
    res.json({ leaked: true });
  });

  app.get("/api/tenant-data", (req, res) => {
    if (req.controlPlaneOnly) {
      return res.json({ organizationId: null, items: [] });
    }
    res.json({
      organizationId: req.tenantContext.organizationId,
      items: [`row-${req.tenantContext.organizationId}`]
    });
  });

  return app;
}

test("A. global Super Admin / Support Mode OFF returns empty operational surfaces", async () => {
  let loaderCalled = false;
  const app = createOperationalApp({
    authContext: superAdmin(ORG_TV),
    onLoad: () => {
      loaderCalled = true;
    }
  });

  await withServer(app, async (port) => {
    const dashboard = await getJson(port, "/api/dashboard");
    const mission = await getJson(port, "/api/mission-control/summary");
    const center = await getJson(port, "/api/prospect-center");
    const report = await getJson(port, "/api/prospect-center/report");
    const followUps = await getJson(port, "/api/follow-ups");

    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.totalProspects, 0);
    assert.deepEqual(dashboard.body.prospects, []);
    assert.deepEqual(dashboard.body.prioritizedWorkflowQueue, []);
    assert.equal(mission.body.activeProspectIds.length, 0);
    assert.deepEqual(center.body.items, []);
    assert.deepEqual(report.body.items, []);
    assert.equal(report.body.emptyReason, "SUPER_ADMIN_CONTROL_PLANE");
    assert.equal(followUps.body.totalCount, 0);
    assert.equal(loaderCalled, false);
    assert.notEqual(resolveEffectiveOrganizationId(superAdmin(ORG_TV), null), ORG_TV);
    assert.equal(isGlobalSuperAdminControlPlane(superAdmin(ORG_TV), null), true);
  });
});

test("B. Support Mode Team Vision loads that tenant only", async () => {
  const app = createOperationalApp({
    authContext: superAdmin(ORG_TV),
    supportContext: { organizationId: ORG_TV }
  });

  await withServer(app, async (port) => {
    const data = await getJson(port, "/api/tenant-data");
    assert.equal(data.body.organizationId, ORG_TV);
    assert.deepEqual(data.body.items, [`row-${ORG_TV}`]);
  });
});

test("C. Support Mode Team Legacy is Legacy-only", async () => {
  const app = createOperationalApp({
    authContext: superAdmin(ORG_TV),
    supportContext: { organizationId: ORG_TL }
  });

  await withServer(app, async (port) => {
    const data = await getJson(port, "/api/tenant-data");
    assert.equal(data.body.organizationId, ORG_TL);
    assert.equal(data.body.items[0].includes(ORG_TV), false);
  });
});

test("D. Exit Support Mode clears operational tenant immediately", () => {
  const home = superAdmin(ORG_TV);
  assert.equal(
    resolveEffectiveOrganizationId(home, { organizationId: ORG_TL }),
    ORG_TL
  );
  assert.equal(resolveEffectiveOrganizationId(home, null), null);
  assert.equal(isGlobalSuperAdminControlPlane(home, null), true);
});

test("E. Tenant ADMIN still uses home org", async () => {
  const app = createOperationalApp({
    authContext: tenantRole(ROLES.ADMINISTRATOR, ORG_TL, SAAS_ROLES.ADMIN)
  });

  await withServer(app, async (port) => {
    const data = await getJson(port, "/api/tenant-data");
    assert.equal(data.body.organizationId, ORG_TL);
  });
});

test("F. DIVISION_LEADER hierarchy role still uses home org", async () => {
  const app = createOperationalApp({
    authContext: tenantRole(ROLES.DIVISION_LEADER, ORG_TV, SAAS_ROLES.DIVISION_LEADER)
  });

  await withServer(app, async (port) => {
    const data = await getJson(port, "/api/tenant-data");
    assert.equal(data.body.organizationId, ORG_TV);
    assert.equal(
      isGlobalSuperAdminControlPlane(
        tenantRole(ROLES.DIVISION_LEADER, ORG_TV, SAAS_ROLES.DIVISION_LEADER),
        null
      ),
      false
    );
  });
});

test("G. ?organizationId= cannot bypass control plane", async () => {
  const app = createOperationalApp({
    authContext: superAdmin(ORG_TV)
  });

  await withServer(app, async (port) => {
    const blockedTv = await getJson(port, `/api/dashboard?organizationId=${ORG_TV}`);
    const blockedTl = await getJson(port, `/api/dashboard?organizationId=${ORG_TL}`);
    assert.equal(blockedTv.status, 403);
    assert.equal(blockedTv.body.error, "FORBIDDEN");
    assert.equal(blockedTl.status, 403);
  });
});

test("H. shared rule never hardcodes Team Vision and keeps isolation helpers", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../core/effectiveOrganizationContext.js"),
    "utf8"
  );
  assert.equal(src.includes(TEAM_VISION_ORGANIZATION_ID), false);
  assert.match(src, /isGlobalSuperAdminControlPlane/);
  assert.match(src, /BR-160/);

  const guard = fs.readFileSync(
    path.join(__dirname, "../middleware/organizationGuard.js"),
    "utf8"
  );
  assert.match(guard, /controlPlaneOnly/);
  assert.doesNotMatch(guard, /getEffectiveOrganizationId\(req\) \|\| homeOrganizationId/);

  const dashboard = fs.readFileSync(path.join(__dirname, "../routes/dashboard.js"), "utf8");
  assert.match(dashboard, /operationalControlPlaneEmpty/);

  const missions = fs.readFileSync(path.join(__dirname, "../routes/missions.js"), "utf8");
  assert.match(missions, /operationalControlPlaneEmpty/);

  const prospects = fs.readFileSync(
    path.join(__dirname, "../modules/prospects/api/prospect.routes.js"),
    "utf8"
  );
  assert.match(prospects, /operationalControlPlaneEmpty/);
});
