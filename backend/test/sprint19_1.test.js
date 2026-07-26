/**
 * Sprint 19.1 — Tenant isolation completion tests.
 * Run: npm test
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  TenantOrganizationRequiredError,
  requireTenantOrganizationId
} = require("../core/tenantProspectLookup");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

const ORG_A = DEFAULT_ORGANIZATION_ID;
const ORG_B = "00000000-0000-4000-8000-000000000002";
const SHARED_PHONE = "+15559999991";
const REPO_ROOT = path.join(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function reloadWithProspectAccessMock(loader) {
  const servicePath = require.resolve("../security/prospectAccessService");
  const accessPath = require.resolve("../middleware/requireProspectAccess");
  const originalService = require(servicePath);

  require.cache[servicePath].exports = {
    ...originalService,
    loadLegacyProspectByPhone: loader
  };

  delete require.cache[accessPath];
  return require(accessPath);
}

function restoreProspectAccessModule() {
  const servicePath = require.resolve("../security/prospectAccessService");
  const accessPath = require.resolve("../middleware/requireProspectAccess");
  delete require.cache[servicePath];
  delete require.cache[accessPath];
  require(servicePath);
  require(accessPath);
}

function createTenantRequest(organizationId, phone) {
  return {
    params: { phone },
    get(header) {
      if (header === "user-agent") {
        return "sprint19_1-test";
      }

      return undefined;
    },
    authContext: {
      userId: "test-user",
      organizationId,
      role: "administrator",
      status: "active",
      permissions: ["prospect:read", "prospect:write", "prospect:communicate"]
    },
    tenantContext: {
      organizationId,
      userId: "test-user"
    }
  };
}

async function runProspectAccessMiddleware(accessModule, req) {
  const middleware = accessModule.requireLegacyProspectAccess();
  let statusCode = null;
  let body = null;
  let nextCalled = false;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    }
  };

  await middleware(req, res, () => {
    nextCalled = true;
  });

  return { statusCode, body, nextCalled };
}

describe("Tenant lookup contract", () => {
  it("requires organizationId on tenant-scoped paths", () => {
    assert.throws(() => requireTenantOrganizationId(null), TenantOrganizationRequiredError);
  });

  it("resolveProspect rejects missing organization on tenant-scoped path", async () => {
    const { resolveProspect } = require("../core/missionControlReadModel");
    await assert.rejects(
      () => resolveProspect(SHARED_PHONE, null, { tenantScoped: true }),
      (error) => error instanceof TenantOrganizationRequiredError
    );
  });

  it("resolveProspect does not fall back to latest prospect for explicit phone", async () => {
    const { resolveProspect } = require("../core/missionControlReadModel");
    const result = await resolveProspect(SHARED_PHONE, ORG_A, { tenantScoped: true });
    assert.equal(result, null);
  });

  it("getMissionControlWithActions rejects tenant-scoped call without organizationId", async () => {
    const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
    await assert.rejects(
      () => getMissionControlWithActions(SHARED_PHONE, { tenantScoped: true }),
      (error) => error instanceof TenantOrganizationRequiredError
    );
  });
});

describe("Quick Capture tenant deduplication", () => {
  it("returns null without organizationId", async () => {
    const { findProspectByNormalizedPhone } = require("../core/quickCaptureEngine");
    const result = await findProspectByNormalizedPhone("5559876543", null);
    assert.equal(result, null);
  });

  it("delegates duplicate lookup to organization-scoped repository method", () => {
    const quickCaptureSource = readRepoFile("backend/core/quickCaptureEngine.js");
    assert.match(quickCaptureSource, /findProspectByNormalizedPhoneInOrganization/);
    assert.match(
      quickCaptureSource,
      /findProspectByNormalizedPhone\(data\.normalizedPhone, organizationId\)/
    );
  });
});

describe("Cross-organization access denial", () => {
  it("Org A prospect access middleware blocks Org B phone", async () => {
    const accessModule = reloadWithProspectAccessMock(async (phone, organizationId) => {
      if (phone === SHARED_PHONE && organizationId === ORG_B) {
        return { phone, organization_id: ORG_B, name: "Org B Only" };
      }

      return null;
    });

    try {
      const access = await runProspectAccessMiddleware(
        accessModule,
        createTenantRequest(ORG_A, SHARED_PHONE)
      );

      assert.ok(access.statusCode === 404 || access.statusCode === 403);
      assert.equal(access.nextCalled, false);
      assert.equal(access.body?.prospect, undefined);
    } finally {
      restoreProspectAccessModule();
    }
  });

  it("Org B prospect access middleware allows its own phone", async () => {
    const accessModule = reloadWithProspectAccessMock(async (phone, organizationId) => {
      if (phone === SHARED_PHONE && organizationId === ORG_B) {
        return { phone, organization_id: ORG_B, name: "Org B Only" };
      }

      return null;
    });

    try {
      const access = await runProspectAccessMiddleware(
        accessModule,
        createTenantRequest(ORG_B, SHARED_PHONE)
      );

      assert.equal(access.nextCalled, true);
    } finally {
      restoreProspectAccessModule();
    }
  });

  it("Org A cannot resolve Org B phone through tenant-scoped Mission Control", async () => {
    const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
    const result = await getMissionControlWithActions(SHARED_PHONE, {
      organizationId: ORG_A,
      tenantScoped: true
    });

    assert.equal(result, null);
  });
});

describe("Backend authority and wiring", () => {
  it("Mission Control route uses organization-aware request handler", () => {
    const routeSource = readRepoFile("backend/routes/missionControl.js");
    assert.match(routeSource, /getMissionControlWithActionsForRequest/);
    assert.match(routeSource, /organizationGuard\(\)/);
    assert.doesNotMatch(routeSource, /getMissionControlWithActions\(req\.params\.phone\)/);
  });

  it("Prospect Workspace uses backend workflow gate only", () => {
    const pageSource = readRepoFile(
      "frontend/src/features/prospect-workspace/pages/ProspectWorkspacePage.jsx"
    );
    assert.match(pageSource, /Boolean\(workspace\?\.workflowGate\?\.active\)/);
    assert.doesNotMatch(pageSource, /shouldShowWorkflowGate/);
  });

  it("prospect workspace read model does not import application service", () => {
    const readModelSource = readRepoFile("backend/core/prospectWorkspaceReadModel.js");
    assert.doesNotMatch(readModelSource, /agentActionApplicationService/);
  });

  it("Quick Capture scopes duplicate lookup by organization", () => {
    const quickCaptureSource = readRepoFile("backend/core/quickCaptureEngine.js");
    assert.match(quickCaptureSource, /findProspectByNormalizedPhoneInOrganization/);
    assert.doesNotMatch(quickCaptureSource, /findProspect\(storagePhone\)/);
  });
});
