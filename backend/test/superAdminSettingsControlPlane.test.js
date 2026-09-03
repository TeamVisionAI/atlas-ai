/**
 * BR-160 — Super Admin settings surfaces: org settings empty on control plane;
 * personal integrations use home org only (no org channel / no cross-tenant reads).
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const { TEAM_VISION_ORGANIZATION_ID: ORG_TV } = require("../core/teamVisionSeedTenant");
const { SAAS_ROLES } = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { organizationGuard } = require("../middleware/organizationGuard");
const {
  resolveEffectiveOrganizationId,
  resolveOperationalOrganizationId,
  resolvePersonalIntegrationOrganizationId
} = require("../core/effectiveOrganizationContext");
const {
  operationalControlPlaneEmpty,
  emptyOrganizationConfiguration
} = require("../core/operationalControlPlane");

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

function tenantAdmin(organizationId) {
  return {
    userId: "admin-" + organizationId.slice(0, 8),
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

function createConfigurationProbeApp({ authContext, supportContext = null, handlers = {} }) {
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

  app.get(
    "/api/configuration/organization",
    operationalControlPlaneEmpty(emptyOrganizationConfiguration),
    (req, res) => {
      if (typeof handlers.getOrganization === "function") {
        return handlers.getOrganization(req, res);
      }
      res.json({
        organization: { id: req.tenantContext.organizationId, name: "Tenant Org" }
      });
    }
  );

  app.get("/api/configuration/organization/integrations", (req, res) => {
    const operationalOrgId = resolveOperationalOrganizationId(req);
    const personalOrgId = resolvePersonalIntegrationOrganizationId(req);
    if (!personalOrgId) {
      return res.status(403).json({ error: "TENANT_CONTEXT_REQUIRED" });
    }
    res.json({
      integrations: {
        googleCalendar: { connected: false, ownership: "personal" },
        organizationChannel: operationalOrgId
          ? { googleCalendar: { connected: true } }
          : undefined
      },
      controlPlane: req.controlPlaneOnly === true && !operationalOrgId,
      personalOrgId,
      operationalOrgId
    });
  });

  return app;
}

test("A) control-plane Super Admin gets empty organization settings, not 500", async () => {
  let loaderCalled = false;
  const app = createConfigurationProbeApp({
    authContext: superAdmin(ORG_TV),
    handlers: {
      getOrganization: () => {
        loaderCalled = true;
      }
    }
  });

  await withServer(app, async (port) => {
    const result = await getJson(port, "/api/configuration/organization");
    assert.equal(result.status, 200);
    assert.equal(result.body.controlPlane, true);
    assert.equal(result.body.organization, null);
    assert.equal(loaderCalled, false);
  });
});

test("B) Support Mode Team Vision loads organization settings for that tenant", async () => {
  const app = createConfigurationProbeApp({
    authContext: superAdmin(ORG_TV),
    supportContext: { organizationId: ORG_TV }
  });

  await withServer(app, async (port) => {
    const result = await getJson(port, "/api/configuration/organization");
    assert.equal(result.status, 200);
    assert.equal(result.body.organization.id, ORG_TV);
    assert.notEqual(result.body.controlPlane, true);
  });
});

test("C) tenant ADMIN still loads home org settings", async () => {
  const app = createConfigurationProbeApp({
    authContext: tenantAdmin(ORG_TV)
  });

  await withServer(app, async (port) => {
    const result = await getJson(port, "/api/configuration/organization");
    assert.equal(result.status, 200);
    assert.equal(result.body.organization.id, ORG_TV);
  });
});

test("D) control-plane Super Admin integrations use home org for personal reads only", async () => {
  const app = createConfigurationProbeApp({
    authContext: superAdmin(ORG_TV)
  });

  await withServer(app, async (port) => {
    const result = await getJson(port, "/api/configuration/organization/integrations");
    assert.equal(result.status, 200);
    assert.equal(result.body.personalOrgId, ORG_TV);
    assert.equal(result.body.operationalOrgId, null);
    assert.equal(result.body.controlPlane, true);
    assert.equal(result.body.integrations.organizationChannel, undefined);
  });
});

test("E) Support Mode integrations include organization channel for effective tenant", async () => {
  const app = createConfigurationProbeApp({
    authContext: superAdmin(ORG_TV),
    supportContext: { organizationId: ORG_TV }
  });

  await withServer(app, async (port) => {
    const result = await getJson(port, "/api/configuration/organization/integrations");
    assert.equal(result.status, 200);
    assert.equal(result.body.personalOrgId, ORG_TV);
    assert.equal(result.body.operationalOrgId, ORG_TV);
    assert.equal(result.body.integrations.organizationChannel.googleCalendar.connected, true);
  });
});

test("F) resolvePersonalIntegrationOrganizationId never returns another tenant", () => {
  const req = {
    controlPlaneOnly: true,
    tenantContext: {
      organizationId: null,
      homeOrganizationId: ORG_TV
    },
    authContext: superAdmin(ORG_TV),
    supportContext: null
  };
  assert.equal(resolveOperationalOrganizationId(req), null);
  assert.equal(resolvePersonalIntegrationOrganizationId(req), ORG_TV);
});
