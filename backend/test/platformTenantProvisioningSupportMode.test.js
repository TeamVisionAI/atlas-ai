/**
 * Platform tenant provisioning + Support Mode (Phase A backend).
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const SUPER_ADMIN = "aaaaaaaa-bbbb-cccc-dddd-111111111111";
const TENANT_ADMIN = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SESSION_A = "jwt:session-a-jti";
const SESSION_B = "jwt:session-b-jti";
const ORG_C = "00000000-0000-4000-8000-0000000000cc";

const { SAAS_ROLES } = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const platformTenantService = require("../services/platformTenantService");
const supportModeService = require("../services/supportModeService");
const identityAdminService = require("../services/identityAdminService");
const { resolveEffectiveOrganizationId, getEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");
const { resolveAuthSessionId } = require("../security/authSessionIdentity");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireSuperAdmin } = require("../middleware/requireSuperAdmin");
const { tenantOperationalGuard } = require("../middleware/tenantOperationalGuard");
const { resolveTenantOrganizationId } = require("../services/tenantContextService");

process.env.NODE_ENV = "test";
process.env.ATLAS_SUPPORT_SESSIONS_BACKEND = "memory";

function authContext(overrides = {}) {
  return {
    userId: overrides.userId || TENANT_ADMIN,
    email: overrides.email || "admin@tenant.test",
    role: overrides.role || ROLES.ADMINISTRATOR,
    saasRole: overrides.saasRole || SAAS_ROLES.ADMIN,
    organizationId: overrides.organizationId || ORG_A,
    permissions: overrides.permissions || ["admin:users"],
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

test("tenant status mapping persists ACTIVE / TRIAL / SUSPENDED semantics", () => {
  const active = platformTenantService.mapTenantStatusToOrganizationFields(
    platformTenantService.TENANT_STATUS.ACTIVE
  );
  const trial = platformTenantService.mapTenantStatusToOrganizationFields(
    platformTenantService.TENANT_STATUS.TRIAL
  );
  const suspended = platformTenantService.mapTenantStatusToOrganizationFields(
    platformTenantService.TENANT_STATUS.SUSPENDED
  );

  assert.equal(active.is_active, true);
  assert.equal(active.status, "active");
  assert.equal(trial.is_active, true);
  assert.equal(trial.status, "trial");
  assert.equal(suspended.is_active, false);
  assert.equal(suspended.status, "suspended");
  assert.equal(
    platformTenantService.deriveLifecycleStatus({ status: "trial", is_active: true }),
    platformTenantService.TENANT_STATUS.TRIAL
  );
});

test("resolveAuthSessionId uses JWT jti or opaque session token", () => {
  assert.equal(resolveAuthSessionId({ jwtPayload: { jti: "abc123" } }), "jwt:abc123");
  assert.equal(
    resolveAuthSessionId({ sessionToken: "opaque-session-token" }),
    "opaque:opaque-session-token"
  );
  assert.equal(resolveAuthSessionId({ jwtPayload: {}, sessionToken: "a.b.c" }), null);
});

test("resolveEffectiveOrganizationId uses Support Mode only for super admin", () => {
  const home = authContext({ organizationId: ORG_A, saasRole: SAAS_ROLES.SUPER_ADMIN });
  assert.equal(
    resolveEffectiveOrganizationId(home, { organizationId: ORG_B }),
    ORG_B
  );
  assert.equal(
    resolveEffectiveOrganizationId(authContext({ organizationId: ORG_A }), {
      organizationId: ORG_B
    }),
    ORG_A
  );
});

test("createUser rejects foreign organizationId for tenant admin", async () => {
  const original = identityAdminService.createUser;
  const identityWriteService = require("../services/identityWriteService");
  const originalCreate = identityWriteService.createUser;
  identityWriteService.createUser = async () => {
    throw new Error("should not create");
  };

  await assert.rejects(
    () =>
      identityAdminService.createUser(
        {
          email: "cross@tenant.test",
          role: ROLES.RECRUITER,
          organizationId: ORG_B
        },
        authContext({ organizationId: ORG_A, saasRole: SAAS_ROLES.ADMIN })
      ),
    (error) => error.statusCode === 403
  );

  identityWriteService.createUser = originalCreate;
  void original;
});

test("createUser allows explicit target org for super-admin provisioning option", async () => {
  const identityWriteService = require("../services/identityWriteService");
  const originalCreate = identityWriteService.createUser;
  let capturedOrg = null;

  identityWriteService.createUser = async (payload) => {
    capturedOrg = payload.organization_id;
    return {
      id: "new-admin",
      email: payload.email,
      organization_id: payload.organization_id,
      role: payload.role,
      status: payload.status
    };
  };

  const atlasUserService = require("../services/atlasUserService");
  const originalFindEmail = atlasUserService.findUserByEmail;
  atlasUserService.findUserByEmail = async () => null;

  await identityAdminService.createUser(
    {
      email: "tenant-admin@neworg.test",
      firstName: "Tenant",
      lastName: "Admin",
      role: ROLES.ADMINISTRATOR,
      organizationId: ORG_B,
      status: "active"
    },
    authContext({ saasRole: SAAS_ROLES.SUPER_ADMIN }),
    {},
    { allowTargetOrganizationId: true }
  );

  assert.equal(capturedOrg, ORG_B);

  identityWriteService.createUser = originalCreate;
  atlasUserService.findUserByEmail = originalFindEmail;
});

test("support mode requires organizationId and scopes enter/exit", async () => {
  supportModeService.__resetTestMemoryStoreForTests();

  const originalGetTenant = platformTenantService.getTenant;
  platformTenantService.getTenant = async (organizationId) => ({
    id: organizationId,
    name: "Tenant B",
    lifecycleStatus: platformTenantService.TENANT_STATUS.ACTIVE
  });

  const auditRows = [];
  const auditLogService = require("../security/auditLogService");
  const originalAudit = auditLogService.writeAuditLog;
  auditLogService.writeAuditLog = async (entry) => {
    auditRows.push(entry);
    return entry;
  };

  delete require.cache[require.resolve("../services/supportModeService")];
  const supportMode = require("../services/supportModeService");

  const entered = await supportMode.enterSupportMode(SUPER_ADMIN, ORG_B, SESSION_A, {
    userEmail: "super@test"
  });
  assert.equal(entered.organizationId, ORG_B);

  const active = await supportMode.getActiveSupportSession(SUPER_ADMIN, SESSION_A);
  assert.equal(active.organizationId, ORG_B);

  const exited = await supportMode.exitSupportMode(SUPER_ADMIN, SESSION_A, {
    userEmail: "super@test"
  });
  assert.equal(exited.exited, true);
  assert.equal(await supportMode.getActiveSupportSession(SUPER_ADMIN, SESSION_A), null);
  assert.ok(auditRows.some((row) => row.action === "support_mode.entered"));
  assert.ok(auditRows.some((row) => row.action === "support_mode.exited"));

  auditLogService.writeAuditLog = originalAudit;
  platformTenantService.getTenant = originalGetTenant;
  delete require.cache[require.resolve("../services/supportModeService")];
});

test("support mode blocks suspended tenant enter", async () => {
  supportModeService.__resetTestMemoryStoreForTests();
  const originalGetTenant = platformTenantService.getTenant;
  platformTenantService.getTenant = async () => ({
    id: ORG_B,
    name: "Suspended Tenant",
    lifecycleStatus: platformTenantService.TENANT_STATUS.SUSPENDED
  });

  await assert.rejects(
    () => supportModeService.enterSupportMode(SUPER_ADMIN, ORG_B, SESSION_A, {}),
    (error) => error.publicCode === "TENANT_SUSPENDED"
  );

  platformTenantService.getTenant = originalGetTenant;
});

test("organizationGuard rejects foreign organizationId override", async () => {
  const app = express();
  app.use((req, res, next) => {
    req.authContext = authContext({ organizationId: ORG_A, saasRole: SAAS_ROLES.SUPER_ADMIN });
    req.supportContext = { organizationId: ORG_B, enteredAt: new Date().toISOString() };
    req.effectiveOrganizationId = ORG_B;
    next();
  });
  app.use(organizationGuard());
  app.get("/probe", (req, res) => {
    res.json({ organizationId: req.tenantContext.organizationId });
  });

  await withServer(app, async (port) => {
    const allowed = await fetch(`http://127.0.0.1:${port}/probe`);
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.organizationId, ORG_B);

    const blocked = await fetch(`http://127.0.0.1:${port}/probe?organizationId=${ORG_A}`);
    assert.equal(blocked.status, 403);
  });
});

test("resolveTenantOrganizationId returns effective org and rejects foreign request", () => {
  const req = {
    authContext: authContext({ organizationId: ORG_A, saasRole: SAAS_ROLES.SUPER_ADMIN }),
    supportContext: { organizationId: ORG_B },
    effectiveOrganizationId: ORG_B
  };

  assert.equal(resolveTenantOrganizationId(req), ORG_B);
  assert.throws(
    () => resolveTenantOrganizationId(req, ORG_A),
    (error) => error.statusCode === 403
  );
});

test("requireSuperAdmin blocks tenant admin", async () => {
  const app = express();
  app.use((req, res, next) => {
    req.authContext = authContext({ saasRole: SAAS_ROLES.ADMIN });
    next();
  });
  app.use(requireSuperAdmin);
  app.get("/", (req, res) => res.json({ ok: true }));

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 403);
  });
});

test("tenantOperationalGuard blocks suspended tenant for normal users", async () => {
  const originalGetTenant = platformTenantService.getTenant;
  platformTenantService.getTenant = async () => ({
    lifecycleStatus: platformTenantService.TENANT_STATUS.SUSPENDED
  });

  const app = express();
  app.use((req, res, next) => {
    req.authContext = authContext({ saasRole: SAAS_ROLES.ADMIN });
    req.effectiveOrganizationId = ORG_A;
    req.originalUrl = "/api/dashboard";
    next();
  });
  app.use(tenantOperationalGuard);
  app.get("/api/dashboard", (req, res) => res.json({ ok: true }));

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "TENANT_SUSPENDED");
  });

  platformTenantService.getTenant = originalGetTenant;
});

test("getEffectiveOrganizationId returns home org after support exit", () => {
  const req = {
    authContext: authContext({ organizationId: ORG_A, saasRole: SAAS_ROLES.SUPER_ADMIN }),
    supportContext: null,
    effectiveOrganizationId: ORG_A
  };

  assert.equal(getEffectiveOrganizationId(req), ORG_A);
});

test("support mode is isolated across authenticated sessions of the same super admin", async () => {
  supportModeService.__resetTestMemoryStoreForTests();
  const originalGetTenant = platformTenantService.getTenant;
  platformTenantService.getTenant = async (organizationId) => ({
    id: organizationId,
    name: organizationId === ORG_C ? "Tenant C" : "Tenant B",
    lifecycleStatus: platformTenantService.TENANT_STATUS.ACTIVE
  });

  await supportModeService.enterSupportMode(SUPER_ADMIN, ORG_B, SESSION_A, {});
  assert.equal(
    (await supportModeService.getActiveSupportSession(SUPER_ADMIN, SESSION_A)).organizationId,
    ORG_B
  );
  assert.equal(await supportModeService.getActiveSupportSession(SUPER_ADMIN, SESSION_B), null);

  await supportModeService.enterSupportMode(SUPER_ADMIN, ORG_C, SESSION_B, {});
  assert.equal(
    (await supportModeService.getActiveSupportSession(SUPER_ADMIN, SESSION_A)).organizationId,
    ORG_B
  );
  assert.equal(
    (await supportModeService.getActiveSupportSession(SUPER_ADMIN, SESSION_B)).organizationId,
    ORG_C
  );

  await supportModeService.exitSupportMode(SUPER_ADMIN, SESSION_A, {});
  assert.equal(await supportModeService.getActiveSupportSession(SUPER_ADMIN, SESSION_A), null);
  assert.equal(
    (await supportModeService.getActiveSupportSession(SUPER_ADMIN, SESSION_B)).organizationId,
    ORG_C
  );

  platformTenantService.getTenant = originalGetTenant;
});

test("support mode enter without auth session identifier fails closed", async () => {
  await assert.rejects(
    () => supportModeService.enterSupportMode(SUPER_ADMIN, ORG_B, null, {}),
    (error) => error.publicCode === "SUPPORT_MODE_SESSION_REQUIRED"
  );
});

test("production missing support table fails closed and does not use memory", async () => {
  const previousEnv = process.env.NODE_ENV;
  const previousBackend = process.env.ATLAS_SUPPORT_SESSIONS_BACKEND;
  process.env.NODE_ENV = "production";
  process.env.ATLAS_SUPPORT_SESSIONS_BACKEND = "memory";

  delete require.cache[require.resolve("../services/supportModeService")];
  const productionSupport = require("../services/supportModeService");
  assert.equal(productionSupport.useTestMemoryStore(), false);

  const supabaseService = require("../services/supabaseService");
  const originalFrom = supabaseService.supabase.from;
  supabaseService.supabase.from = () => {
    const missing = {
      data: null,
      error: { code: "42P01", message: "relation atlas_support_sessions does not exist" }
    };
    const chain = {
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      is() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      update() {
        return chain;
      },
      insert() {
        return Promise.resolve(missing);
      },
      maybeSingle() {
        return Promise.resolve(missing);
      },
      then(resolve, reject) {
        return Promise.resolve(missing).then(resolve, reject);
      }
    };
    return chain;
  };

  const originalGetTenant = platformTenantService.getTenant;
  platformTenantService.getTenant = async () => ({
    id: ORG_B,
    name: "Tenant B",
    lifecycleStatus: platformTenantService.TENANT_STATUS.ACTIVE
  });

  await assert.rejects(
    () => productionSupport.enterSupportMode(SUPER_ADMIN, ORG_B, SESSION_A, {}),
    (error) => error.publicCode === "SUPPORT_MODE_UNAVAILABLE" && error.statusCode === 503
  );

  const loaded = await productionSupport.loadSupportContextForRequest(SUPER_ADMIN, SESSION_A);
  assert.equal(loaded, null);

  supabaseService.supabase.from = originalFrom;
  platformTenantService.getTenant = originalGetTenant;
  process.env.NODE_ENV = previousEnv;
  if (previousBackend == null) {
    delete process.env.ATLAS_SUPPORT_SESSIONS_BACKEND;
  } else {
    process.env.ATLAS_SUPPORT_SESSIONS_BACKEND = previousBackend;
  }
  delete require.cache[require.resolve("../services/supportModeService")];
});
