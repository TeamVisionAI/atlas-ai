/**
 * Pilot-blocker: Dashboard / Mission Control / Prospect Center tenant isolation.
 * Team Legacy must never receive Team Vision seed-tenant data.
 */

require("dotenv").config({ quiet: true });
process.env.NODE_ENV = "test";

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
  getEffectiveOrganizationId
} = require("../core/effectiveOrganizationContext");
const {
  getTenantOrganizationId,
  resolveTenantOrganizationId
} = require("../services/tenantContextService");
const {
  buildAuthContext,
  filterProspectsForAuthContext,
  canAccessProspect,
  sameOrganization
} = require("../security/authorizationService");
const { matchesSearch } = require("../core/prospectCenterReadModel");
const { MissionControlService } = require("../modules/mission-control/application/MissionControlService");
const { ExecutiveDashboardService } = require("../modules/executive-dashboard/application/ExecutiveDashboardService");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const SA_ID = "00000000-0000-4000-8000-000000000002";

const TV_PROSPECT = {
  id: "tv-prospect-1",
  phone: "+17865551001",
  name: "Vision Lead",
  organization_id: ORG_TV,
  owner_user_id: SA_ID,
  current_step: "QUALIFICATION"
};

const TL_PROSPECT = {
  id: "tl-prospect-1",
  phone: "+17865553001",
  name: "Legacy Lead",
  organization_id: ORG_TL,
  owner_user_id: SA_ID,
  current_step: "QUALIFICATION"
};

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

function tenantAdmin(organizationId) {
  return {
    userId: `admin-${organizationId.slice(0, 8)}`,
    organizationId,
    role: ROLES.ADMINISTRATOR,
    saasRole: SAAS_ROLES.ADMIN,
    permissions: permissionsForRole(ROLES.ADMINISTRATOR),
    status: "active"
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

function createSurfaceApp({ authContext, supportContext = null, store }) {
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

  function scopedProspects(req) {
    const organizationId = getTenantOrganizationId(req);
    const rows = store.filter(
      (row) => String(row.organization_id) === String(organizationId)
    );
    return {
      organizationId,
      prospects: filterProspectsForAuthContext(req.authContext, rows)
    };
  }

  app.get("/api/dashboard", (req, res) => {
    try {
      const { organizationId, prospects } = scopedProspects(req);
      res.json({
        organizationId,
        totalProspects: prospects.length,
        hotProspects: prospects.length,
        newProspects: prospects.length,
        followUps: prospects.filter((row) => row.current_step !== "CONFIRMED").length,
        appointments: 0,
        prospects
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || error.message
      });
    }
  });

  app.get("/api/dashboard/executive", (req, res) => {
    try {
      const { organizationId, prospects } = scopedProspects(req);
      res.json({
        organizationId,
        prospectCount: prospects.length,
        todayFocus: {
          highPriorityProspects: { count: prospects.length, items: prospects }
        },
        prospects
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || error.message
      });
    }
  });

  app.get("/api/mission-control/summary", (req, res) => {
    try {
      const { organizationId, prospects } = scopedProspects(req);
      res.json({
        organizationId,
        activeProspectCount: prospects.length,
        activeProspectIds: prospects.map((row) => row.id)
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || error.message
      });
    }
  });

  app.get("/api/prospect-center", (req, res) => {
    try {
      const { organizationId, prospects } = scopedProspects(req);
      const search = String(req.query.q || "").trim();
      const items = search
        ? prospects.filter((row) =>
            matchesSearch(
              { name: row.name, phone: row.phone, prospectNumber: row.id },
              search
            )
          )
        : prospects;
      const offset = Number(req.query.offset || 0);
      const limit = Number(req.query.limit || items.length || 10);
      res.json({
        organizationId,
        totalCount: prospects.length,
        filteredCount: items.length,
        items: items.slice(offset, offset + limit)
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || error.message
      });
    }
  });

  return app;
}

async function getJson(port, pathName) {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`);
  const body = await response.json();
  return { status: response.status, body };
}

test("1-4. Team Legacy and Team Vision surfaces stay isolated", async () => {
  const store = [TV_PROSPECT, TL_PROSPECT];

  const legacyApp = createSurfaceApp({
    authContext: tenantAdmin(ORG_TL),
    store
  });
  await withServer(legacyApp, async (port) => {
    const dashboard = await getJson(port, "/api/dashboard");
    const executive = await getJson(port, "/api/dashboard/executive");
    const mission = await getJson(port, "/api/mission-control/summary");
    const center = await getJson(port, "/api/prospect-center");

    for (const payload of [dashboard.body, executive.body, mission.body, center.body]) {
      assert.equal(payload.organizationId, ORG_TL);
    }

    assert.deepEqual(dashboard.body.prospects.map((row) => row.id), [TL_PROSPECT.id]);
    assert.deepEqual(executive.body.prospects.map((row) => row.id), [TL_PROSPECT.id]);
    assert.deepEqual(mission.body.activeProspectIds, [TL_PROSPECT.id]);
    assert.deepEqual(center.body.items.map((row) => row.id), [TL_PROSPECT.id]);
  });

  const visionApp = createSurfaceApp({
    authContext: tenantAdmin(ORG_TV),
    store
  });
  await withServer(visionApp, async (port) => {
    const dashboard = await getJson(port, "/api/dashboard");
    const center = await getJson(port, "/api/prospect-center");
    assert.deepEqual(dashboard.body.prospects.map((row) => row.id), [TV_PROSPECT.id]);
    assert.deepEqual(center.body.items.map((row) => row.id), [TV_PROSPECT.id]);
  });
});

test("5. Hot / new / follow-up / appointment counts are tenant-scoped", async () => {
  const store = [TV_PROSPECT, TL_PROSPECT, { ...TV_PROSPECT, id: "tv-2", phone: "+17865551002" }];
  const app = createSurfaceApp({ authContext: tenantAdmin(ORG_TL), store });

  await withServer(app, async (port) => {
    const dashboard = await getJson(port, "/api/dashboard");
    assert.equal(dashboard.body.totalProspects, 1);
    assert.equal(dashboard.body.hotProspects, 1);
    assert.equal(dashboard.body.newProspects, 1);
    assert.equal(dashboard.body.followUps, 1);
    assert.equal(dashboard.body.appointments, 0);
  });
});

test("6. Search / filter / pagination cannot surface another tenant", async () => {
  const store = [TV_PROSPECT, TL_PROSPECT];
  const app = createSurfaceApp({ authContext: tenantAdmin(ORG_TL), store });

  await withServer(app, async (port) => {
    const byName = await getJson(port, "/api/prospect-center?q=Vision");
    const byPhone = await getJson(port, `/api/prospect-center?q=${encodeURIComponent(TV_PROSPECT.phone)}`);
    const paged = await getJson(port, "/api/prospect-center?limit=50&offset=0");

    assert.equal(byName.body.filteredCount, 0);
    assert.deepEqual(byName.body.items, []);
    assert.equal(byPhone.body.filteredCount, 0);
    assert.deepEqual(paged.body.items.map((row) => row.id), [TL_PROSPECT.id]);
  });
});

test("7-8. Support Mode Vision → Legacy then exit restores Vision", async () => {
  const store = [TV_PROSPECT, TL_PROSPECT];
  const home = superAdmin(ORG_TV);

  const supportApp = createSurfaceApp({
    authContext: home,
    supportContext: { organizationId: ORG_TL, enteredAt: new Date().toISOString() },
    store
  });
  await withServer(supportApp, async (port) => {
    const dashboard = await getJson(port, "/api/dashboard");
    const mission = await getJson(port, "/api/mission-control/summary");
    const center = await getJson(port, "/api/prospect-center");
    assert.deepEqual(dashboard.body.prospects.map((row) => row.id), [TL_PROSPECT.id]);
    assert.deepEqual(mission.body.activeProspectIds, [TL_PROSPECT.id]);
    assert.deepEqual(center.body.items.map((row) => row.id), [TL_PROSPECT.id]);
    assert.equal(dashboard.body.organizationId, ORG_TL);
  });

  const homeApp = createSurfaceApp({
    authContext: home,
    supportContext: null,
    store
  });
  await withServer(homeApp, async (port) => {
    const dashboard = await getJson(port, "/api/dashboard");
    const mission = await getJson(port, "/api/mission-control/summary");
    const center = await getJson(port, "/api/prospect-center");
    assert.deepEqual(dashboard.body.prospects.map((row) => row.id), [TV_PROSPECT.id]);
    assert.deepEqual(mission.body.activeProspectIds, [TV_PROSPECT.id]);
    assert.deepEqual(center.body.items.map((row) => row.id), [TV_PROSPECT.id]);
    assert.equal(dashboard.body.organizationId, ORG_TV);
  });
});

test("9. Direct API attempts to access another tenant are rejected", async () => {
  const app = createSurfaceApp({
    authContext: tenantAdmin(ORG_TL),
    store: [TV_PROSPECT, TL_PROSPECT]
  });

  await withServer(app, async (port) => {
    const blocked = await getJson(port, `/api/dashboard?organizationId=${ORG_TV}`);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, "FORBIDDEN");

    assert.equal(canAccessProspect(tenantAdmin(ORG_TL), TV_PROSPECT), false);
    assert.equal(canAccessProspect(tenantAdmin(ORG_TV), TL_PROSPECT), false);
  });
});

test("10. Empty Team Legacy surfaces stay empty except genuine Legacy rows", async () => {
  const app = createSurfaceApp({
    authContext: tenantAdmin(ORG_TL),
    store: [TV_PROSPECT]
  });

  await withServer(app, async (port) => {
    const dashboard = await getJson(port, "/api/dashboard");
    const mission = await getJson(port, "/api/mission-control/summary");
    const center = await getJson(port, "/api/prospect-center");
    assert.deepEqual(dashboard.body.prospects, []);
    assert.equal(dashboard.body.totalProspects, 0);
    assert.deepEqual(mission.body.activeProspectIds, []);
    assert.deepEqual(center.body.items, []);
  });
});

test("seed fallback is fail-closed: missing org never becomes Team Vision", () => {
  assert.equal(resolveEffectiveOrganizationId(null, null), null);
  assert.equal(resolveEffectiveOrganizationId({ saasRole: SAAS_ROLES.SUPER_ADMIN }, null), null);
  assert.throws(() => getTenantOrganizationId({}), (error) => error.publicCode === "TENANT_CONTEXT_REQUIRED");
  assert.throws(
    () => resolveTenantOrganizationId({}),
    (error) => error.statusCode === 401
  );

  const context = buildAuthContext({
    id: "no-org-user",
    role: ROLES.RECRUITER,
    status: "active"
  });
  assert.equal(context.organizationId, null);
  assert.equal(sameOrganization(context, ORG_TV), false);
  assert.equal(canAccessProspect({ ...context, organizationId: null }, TV_PROSPECT), false);
  assert.equal(canAccessProspect(superAdmin(ORG_TV), { ...TV_PROSPECT, organization_id: null }), false);
});

test("Support Mode effective org is Legacy, never Super Admin home", () => {
  const home = superAdmin(ORG_TV);
  const req = {
    authContext: home,
    supportContext: { organizationId: ORG_TL },
    effectiveOrganizationId: resolveEffectiveOrganizationId(home, { organizationId: ORG_TL })
  };

  assert.equal(getEffectiveOrganizationId(req), ORG_TL);
  assert.equal(getTenantOrganizationId(req), ORG_TL);
  assert.notEqual(getTenantOrganizationId(req), ORG_TV);
  assert.throws(
    () => resolveTenantOrganizationId(req, ORG_TV),
    (error) => error.statusCode === 403
  );
});

test("Sprint 15 MC / ED services refuse seed-tenant default", async () => {
  const mc = new MissionControlService({
    repository: {
      loadReadModel: async () => {
        throw new Error("should not load without organizationId");
      }
    }
  });
  const ed = new ExecutiveDashboardService({
    repository: {
      loadReadModel: async () => {
        throw new Error("should not load without organizationId");
      }
    }
  });

  await assert.rejects(() => mc.getSummary({}), (error) => error.publicCode === "TENANT_CONTEXT_REQUIRED");
  await assert.rejects(() => ed.getKpis({}), (error) => error.publicCode === "TENANT_CONTEXT_REQUIRED");
});

test("production routes keep organizationGuard + effective-org helpers", () => {
  const files = [
    "../routes/dashboard.js",
    "../routes/prospectCenter.js",
    "../routes/missionControl.js",
    "../modules/mission-control/api/missionControl.routes.js",
    "../modules/executive-dashboard/api/executiveDashboard.routes.js"
  ];

  for (const relativePath of files) {
    const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
    assert.match(source, /organizationGuard/, relativePath);
  }

  const dashboard = fs.readFileSync(path.join(__dirname, "../routes/dashboard.js"), "utf8");
  const prospectCenter = fs.readFileSync(path.join(__dirname, "../routes/prospectCenter.js"), "utf8");
  const liveMc = fs.readFileSync(path.join(__dirname, "../routes/missionControl.js"), "utf8");
  assert.match(dashboard, /getTenantOrganizationId\(req\)/);
  assert.match(prospectCenter, /getTenantOrganizationId\(req\)/);
  assert.match(liveMc, /scopeLiveSnapshot/);
  assert.match(liveMc, /getTenantOrganizationId\(req\)/);
});
