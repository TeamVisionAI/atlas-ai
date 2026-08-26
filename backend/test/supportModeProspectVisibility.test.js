/**
 * Support Mode: Mission Control / Prospect Center must filter with effective org.
 */

require("dotenv").config();
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { SAAS_ROLES } = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { organizationGuard } = require("../middleware/organizationGuard");
const {
  filterProspectsForAuthContext,
  canAccessProspect
} = require("../security/authorizationService");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const SA_ID = "00000000-0000-4000-8000-000000000002";
const TL_CANARY = {
  id: "97b290ea-4103-4117-acf5-60f389728b08",
  phone: "+17865553001",
  organization_id: ORG_TL,
  owner_user_id: SA_ID,
  assignment_status: "unassigned",
  source: "IN_PERSON",
  entry_method: "QUICK_CAPTURE"
};

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

test("Support Mode SA: authContext rebinds to effective org for prospect filter", async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.authContext = {
      userId: SA_ID,
      organizationId: ORG_TV,
      role: ROLES.ADMINISTRATOR,
      saasRole: SAAS_ROLES.SUPER_ADMIN,
      permissions: permissionsForRole(ROLES.ADMINISTRATOR),
      status: "active"
    };
    req.supportContext = {
      organizationId: ORG_TL,
      enteredAt: new Date().toISOString()
    };
    req.effectiveOrganizationId = ORG_TL;
    next();
  });
  app.use(organizationGuard());
  app.get("/probe", (req, res) => {
    const visible = filterProspectsForAuthContext(req.authContext, [TL_CANARY]);
    res.json({
      authOrg: req.authContext.organizationId,
      homeOrg: req.authContext.homeOrganizationId,
      tenantOrg: req.tenantContext.organizationId,
      canAccess: canAccessProspect(req.authContext, TL_CANARY),
      visibleIds: visible.map((row) => row.id)
    });
  });

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/probe`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.authOrg, ORG_TL);
    assert.equal(body.homeOrg, ORG_TV);
    assert.equal(body.tenantOrg, ORG_TL);
    assert.equal(body.canAccess, true);
    assert.deepEqual(body.visibleIds, [TL_CANARY.id]);
  });
});

test("without Support Mode, Super Admin is control-plane only (no home-org workload)", async () => {
  const tvRow = { ...TL_CANARY, id: "tv-row", organization_id: ORG_TV };
  const app = express();
  app.use((req, _res, next) => {
    req.authContext = {
      userId: SA_ID,
      organizationId: ORG_TV,
      role: ROLES.ADMINISTRATOR,
      saasRole: SAAS_ROLES.SUPER_ADMIN,
      permissions: permissionsForRole(ROLES.ADMINISTRATOR),
      status: "active"
    };
    req.supportContext = null;
    req.effectiveOrganizationId = ORG_TV;
    next();
  });
  app.use(organizationGuard());
  app.get("/probe", (req, res) => {
    const visible = filterProspectsForAuthContext(req.authContext, [TL_CANARY, tvRow]);
    res.json({
      authOrg: req.authContext.organizationId,
      controlPlaneOnly: req.controlPlaneOnly === true,
      canAccessLegacy: canAccessProspect(req.authContext, TL_CANARY),
      canAccessVision: canAccessProspect(req.authContext, tvRow),
      visibleIds: visible.map((row) => row.id)
    });
  });

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/probe`);
    const body = await response.json();
    assert.equal(body.authOrg, null);
    assert.equal(body.controlPlaneOnly, true);
    assert.equal(body.canAccessLegacy, false);
    assert.equal(body.canAccessVision, false);
    assert.deepEqual(body.visibleIds, []);
  });
});
