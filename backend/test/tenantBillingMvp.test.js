/**
 * BR-145 — Tenant billing MVP (trial lifecycle, manual payments, access).
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const { TENANT_STATUS, TEAM_VISION_ORGANIZATION_ID } = require("../core/tenantLifecycle");
const { addOneCalendarMonth } = require("../core/billingDateUtils");
const tenantBillingService = require("../services/tenantBillingService");
const platformTenantService = require("../services/platformTenantService");
const { tenantOperationalGuard } = require("../middleware/tenantOperationalGuard");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireSuperAdmin } = require("../middleware/requireSuperAdmin");
const platformBillingRoutes = require("../routes/platformBilling");
const organizationBillingRoutes = require("../routes/organizationBilling");
const { ROLES } = require("../security/roles");
const { SAAS_ROLES } = require("../security/saasRoles");
const { permissionsForRole } = require("../security/permissions");

const ORG_A = TEAM_VISION_ORGANIZATION_ID;
const ORG_B = "00000000-0000-4000-8000-000000000099";
const SUPER_ID = "aaaaaaaa-bbbb-cccc-dddd-111111111111";

function createMemoryBillingStore(initial = {}) {
  const organizations = new Map();
  const subscriptions = new Map();
  const auditRows = [];

  for (const [id, row] of Object.entries(initial.organizations || {})) {
    organizations.set(id, structuredClone(row));
  }

  for (const [id, row] of Object.entries(initial.subscriptions || {})) {
    subscriptions.set(id, structuredClone(row));
  }

  return {
    auditRows,
    organizations,
    subscriptions,
    persistence: {
      async loadOrganization(organizationId) {
        return organizations.get(organizationId) || null;
      },
      async loadSubscription(organizationId) {
        return subscriptions.get(organizationId) || null;
      },
      async saveOrganization(organizationId, patch) {
        const current = organizations.get(organizationId) || { id: organizationId };
        const next = { ...structuredClone(current), ...patch, id: organizationId };
        organizations.set(organizationId, next);
        return next;
      },
      async saveSubscription(organizationId, patch) {
        const current = subscriptions.get(organizationId) || {
          organization_id: organizationId,
          plan: "professional",
          status: "active",
          metadata: {},
          currency: "USD"
        };
        const next = {
          ...structuredClone(current),
          ...patch,
          organization_id: organizationId
        };
        subscriptions.set(organizationId, next);
        return next;
      }
    }
  };
}

function seedTrialOrg(store, organizationId, { createdAt, trialEndsAt, status = "trial" } = {}) {
  const created = createdAt || new Date().toISOString();
  store.organizations.set(organizationId, {
    id: organizationId,
    name: "Trial Org",
    slug: "trial-org",
    status,
    subscription_status: status,
    subscription_plan: "professional",
    is_active: true,
    created_at: created,
    updated_at: created
  });
  store.subscriptions.set(organizationId, {
    organization_id: organizationId,
    plan: "professional",
    status,
    metadata: {},
    currency: "USD",
    trial_starts_at: created,
    trial_ends_at: trialEndsAt,
    payment_method: null
  });
}

function authContext(overrides = {}) {
  const role = overrides.role || ROLES.ADMINISTRATOR;
  return {
    userId: overrides.userId || "user-admin",
    email: overrides.email || "admin@tenant.test",
    role,
    saasRole: overrides.saasRole || SAAS_ROLES.ADMIN,
    organizationId: overrides.organizationId || ORG_A,
    permissions: overrides.permissions || permissionsForRole(role),
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

test.afterEach(() => {
  tenantBillingService.setBillingPersistenceForTests(null);
});

test("PAST_DUE maps to operational org fields", () => {
  const mapped = platformTenantService.mapTenantStatusToOrganizationFields(TENANT_STATUS.PAST_DUE);
  assert.equal(mapped.status, "past_due");
  assert.equal(mapped.subscription_status, "past_due");
  assert.equal(mapped.is_active, true);
  assert.equal(platformTenantService.isTenantOperational(TENANT_STATUS.PAST_DUE), true);
  assert.equal(platformTenantService.isTenantOperational(TENANT_STATUS.SUSPENDED), false);
});

test("initializeBillingForNewTenant sets 7-day trial window", async () => {
  const store = createMemoryBillingStore({
    organizations: {
      [ORG_B]: {
        id: ORG_B,
        name: "New",
        slug: "new",
        status: "trial",
        subscription_status: "trial",
        subscription_plan: "professional",
        is_active: true,
        created_at: "2026-08-01T12:00:00.000Z"
      }
    }
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  await tenantBillingService.initializeBillingForNewTenant(
    ORG_B,
    TENANT_STATUS.TRIAL,
    "2026-08-01T12:00:00.000Z"
  );

  const sub = store.subscriptions.get(ORG_B);
  assert.equal(sub.trial_starts_at, "2026-08-01T12:00:00.000Z");
  assert.equal(sub.trial_ends_at, "2026-08-08T12:00:00.000Z");
});

test("trial extension respects 10-day cap", async () => {
  const store = createMemoryBillingStore();
  seedTrialOrg(store, ORG_B, {
    createdAt: "2026-08-19T00:00:00.000Z",
    trialEndsAt: "2026-08-26T00:00:00.000Z"
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const extended = await tenantBillingService.extendTrial(ORG_B, 2, { userId: SUPER_ID });
  assert.equal(extended.trialEndsAt, "2026-08-28T00:00:00.000Z");

  await assert.rejects(
    () => tenantBillingService.extendTrial(ORG_B, 2, { userId: SUPER_ID }),
    (error) => error.publicCode === "TRIAL_EXTENSION_CAP_EXCEEDED"
  );
});

test("expired TRIAL transitions to PAST_DUE once", async () => {
  const store = createMemoryBillingStore();
  seedTrialOrg(store, ORG_B, {
    createdAt: "2026-01-01T00:00:00.000Z",
    trialEndsAt: "2026-01-08T00:00:00.000Z"
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const first = await tenantBillingService.expireTrialIfNeeded(ORG_B, { userId: SUPER_ID });
  assert.equal(first.expired, true);
  assert.equal(first.billing.lifecycleStatus, TENANT_STATUS.PAST_DUE);
  assert.equal(store.organizations.get(ORG_B).status, "past_due");
  assert.ok(store.subscriptions.get(ORG_B).metadata.trialExpiredAt);

  const second = await tenantBillingService.expireTrialIfNeeded(ORG_B, { userId: SUPER_ID });
  assert.equal(second.billing.lifecycleStatus, TENANT_STATUS.PAST_DUE);
  assert.equal(second.expired, true);
});

test("mark paid activates TRIAL and PAST_DUE but not SUSPENDED", async () => {
  const store = createMemoryBillingStore();
  seedTrialOrg(store, ORG_B, {
    createdAt: "2026-08-19T00:00:00.000Z",
    trialEndsAt: "2026-08-26T00:00:00.000Z"
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const paid = await tenantBillingService.markPaid(
    ORG_B,
    { amountCents: 9900, reference: "ZELLE-1", paidAt: "2026-08-05T15:00:00.000Z" },
    { userId: SUPER_ID }
  );

  assert.equal(paid.lifecycleStatus, TENANT_STATUS.ACTIVE);
  assert.equal(paid.lastPaidAt, "2026-08-05T15:00:00.000Z");
  assert.equal(paid.nextDueAt, addOneCalendarMonth("2026-08-05T15:00:00.000Z"));
  assert.equal(paid.payments.length, 1);
  assert.equal(paid.payments[0].amountCents, 9900);

  await tenantBillingService.setLifecycleStatus(ORG_B, TENANT_STATUS.PAST_DUE, { userId: SUPER_ID });
  const paidPastDue = await tenantBillingService.markPaid(
    ORG_B,
    { amountCents: 9900, reference: "ZELLE-2" },
    { userId: SUPER_ID }
  );
  assert.equal(paidPastDue.lifecycleStatus, TENANT_STATUS.ACTIVE);

  await tenantBillingService.setLifecycleStatus(ORG_B, TENANT_STATUS.SUSPENDED, { userId: SUPER_ID });
  const paidSuspended = await tenantBillingService.markPaid(
    ORG_B,
    { amountCents: 5000, reference: "MANUAL-1", paymentMethod: "MANUAL" },
    { userId: SUPER_ID }
  );
  assert.equal(paidSuspended.lifecycleStatus, TENANT_STATUS.SUSPENDED);
  assert.equal(paidSuspended.payments.length, 3);
});

test("billing PATCH rejects non-whitelisted fields", async () => {
  const store = createMemoryBillingStore({
    organizations: {
      [ORG_A]: {
        id: ORG_A,
        name: "Team Vision",
        slug: "team-vision",
        status: "active",
        subscription_status: "active",
        subscription_plan: "professional",
        is_active: true,
        created_at: "2025-01-01T00:00:00.000Z"
      }
    },
    subscriptions: {
      [ORG_A]: {
        organization_id: ORG_A,
        plan: "professional",
        status: "active",
        metadata: { payments: [{ paidAt: "2025-01-01T00:00:00.000Z" }] },
        currency: "USD",
        trial_starts_at: null,
        trial_ends_at: null
      }
    }
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const updated = await tenantBillingService.updateBilling(
    ORG_A,
    {
      plan: "professional",
      monthlyPriceCents: 19900,
      currency: "USD",
      paymentMethod: "STRIPE",
      paymentLink: "https://pay.example/link"
    },
    { userId: SUPER_ID }
  );

  assert.equal(updated.monthlyPriceCents, 19900);
  assert.equal(updated.paymentMethod, "STRIPE");
  assert.equal(updated.lifecycleStatus, TENANT_STATUS.ACTIVE);
  assert.equal(updated.payments.length, 1);
});

test("Team Vision remains ACTIVE with null trial dates", async () => {
  const store = createMemoryBillingStore({
    organizations: {
      [ORG_A]: {
        id: ORG_A,
        name: "Team Vision",
        slug: "team-vision",
        status: "active",
        subscription_status: "active",
        subscription_plan: "professional",
        is_active: true,
        created_at: "2025-01-01T00:00:00.000Z"
      }
    },
    subscriptions: {
      [ORG_A]: {
        organization_id: ORG_A,
        plan: "professional",
        status: "active",
        metadata: {},
        currency: "USD",
        trial_starts_at: null,
        trial_ends_at: null
      }
    }
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const billing = await tenantBillingService.getBilling(ORG_A);
  assert.equal(billing.lifecycleStatus, TENANT_STATUS.ACTIVE);
  assert.equal(billing.trialStartsAt, null);
  assert.equal(billing.trialEndsAt, null);

  const expired = await tenantBillingService.expireTrialIfNeeded(ORG_A, { userId: SUPER_ID });
  assert.equal(expired.expired, false);
  assert.equal(expired.billing.lifecycleStatus, TENANT_STATUS.ACTIVE);
});

test("tenant safe billing hides internal fields and org isolation holds", async () => {
  const store = createMemoryBillingStore({
    organizations: {
      [ORG_A]: {
        id: ORG_A,
        name: "Team Vision",
        status: "active",
        subscription_status: "active",
        subscription_plan: "professional",
        is_active: true
      },
      [ORG_B]: {
        id: ORG_B,
        name: "Other",
        status: "active",
        subscription_status: "active",
        subscription_plan: "starter",
        is_active: true
      }
    },
    subscriptions: {
      [ORG_A]: {
        organization_id: ORG_A,
        plan: "professional",
        status: "active",
        currency: "USD",
        monthly_price_cents: 10000,
        payment_method: "STRIPE",
        metadata: {
          paymentLink: "https://pay/a",
          billingNotes: "secret",
          payments: [{ amountCents: 100 }]
        }
      },
      [ORG_B]: {
        organization_id: ORG_B,
        plan: "starter",
        status: "active",
        currency: "USD",
        monthly_price_cents: 5000,
        payment_method: "ZELLE",
        metadata: {
          zelleInstructions: "Send to 555",
          billingNotes: "other secret"
        }
      }
    }
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const safeA = await tenantBillingService.getTenantSafeBilling(ORG_A);
  assert.equal(safeA.plan, "professional");
  assert.equal(safeA.paymentLink, "https://pay/a");
  assert.equal(safeA.billingNotes, undefined);
  assert.equal(safeA.payments, undefined);

  const safeB = await tenantBillingService.getTenantSafeBilling(ORG_B);
  assert.equal(safeB.plan, "starter");
  assert.equal(safeB.zelleInstructions, "Send to 555");
  assert.notEqual(safeB.plan, safeA.plan);
});

test("tenant admin GET billing succeeds; RVP denied", async () => {
  const store = createMemoryBillingStore({
    organizations: {
      [ORG_A]: {
        id: ORG_A,
        name: "Team Vision",
        status: "active",
        subscription_status: "active",
        subscription_plan: "professional",
        is_active: true
      }
    },
    subscriptions: {
      [ORG_A]: {
        organization_id: ORG_A,
        plan: "professional",
        status: "active",
        metadata: {},
        currency: "USD"
      }
    }
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.authContext = authContext(req.headers["x-role"] === "rvp"
      ? { role: ROLES.RVP, saasRole: SAAS_ROLES.RVP }
      : { role: ROLES.ADMINISTRATOR, saasRole: SAAS_ROLES.ADMIN });
    req.supportContext = req.headers["x-support-org"]
      ? { organizationId: req.headers["x-support-org"] }
      : null;
    req.effectiveOrganizationId = req.headers["x-support-org"] || ORG_A;
    next();
  });
  app.use(organizationGuard());
  app.use("/api/organization", organizationBillingRoutes);

  await withServer(app, async (port) => {
    const adminRes = await fetch(`http://127.0.0.1:${port}/api/organization/billing`);
    assert.equal(adminRes.status, 200);
    const adminBody = await adminRes.json();
    assert.equal(adminBody.billing.plan, "professional");

    const rvpRes = await fetch(`http://127.0.0.1:${port}/api/organization/billing`, {
      headers: { "x-role": "rvp" }
    });
    assert.equal(rvpRes.status, 403);
  });
});

test("platform billing routes require super admin", async () => {
  const store = createMemoryBillingStore();
  seedTrialOrg(store, ORG_B, {
    createdAt: "2026-08-01T00:00:00.000Z",
    trialEndsAt: "2026-08-08T00:00:00.000Z"
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.authContext = authContext({
      saasRole: req.headers["x-super"] === "1" ? SAAS_ROLES.SUPER_ADMIN : SAAS_ROLES.ADMIN
    });
    next();
  });
  app.use(requireSuperAdmin);
  app.use("/api/platform/tenants/:id", platformBillingRoutes);

  await withServer(app, async (port) => {
    const denied = await fetch(`http://127.0.0.1:${port}/api/platform/tenants/${ORG_B}/billing`);
    assert.equal(denied.status, 403);

    const allowed = await fetch(`http://127.0.0.1:${port}/api/platform/tenants/${ORG_B}/billing`, {
      headers: { "x-super": "1" }
    });
    assert.equal(allowed.status, 200);
  });
});

test("tenantOperationalGuard expires trial then allows PAST_DUE access", async () => {
  const store = createMemoryBillingStore();
  seedTrialOrg(store, ORG_B, {
    createdAt: "2026-01-01T00:00:00.000Z",
    trialEndsAt: "2026-01-08T00:00:00.000Z"
  });
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const originalGetTenant = platformTenantService.getTenant;
  platformTenantService.getTenant = async (organizationId) => {
    const org = store.organizations.get(organizationId);
    const sub = store.subscriptions.get(organizationId);
    return platformTenantService.presentTenant(org, sub);
  };

  const app = express();
  app.use((req, res, next) => {
    req.authContext = authContext({ organizationId: ORG_B, saasRole: SAAS_ROLES.ADMIN });
    req.effectiveOrganizationId = ORG_B;
    req.originalUrl = "/api/dashboard";
    next();
  });
  app.use(tenantOperationalGuard);
  app.get("/api/dashboard", (req, res) => res.json({ ok: true }));

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
    assert.equal(response.status, 200);
    assert.equal(store.organizations.get(ORG_B).status, "past_due");
  });

  platformTenantService.getTenant = originalGetTenant;
});

test("tenantOperationalGuard blocks suspended tenant", async () => {
  const store = createMemoryBillingStore();
  seedTrialOrg(store, ORG_B, {
    createdAt: "2026-08-01T00:00:00.000Z",
    trialEndsAt: "2026-08-08T00:00:00.000Z"
  });
  store.organizations.get(ORG_B).status = "suspended";
  store.organizations.get(ORG_B).subscription_status = "suspended";
  store.organizations.get(ORG_B).is_active = false;
  tenantBillingService.setBillingPersistenceForTests(store.persistence);

  const originalGetTenant = platformTenantService.getTenant;
  platformTenantService.getTenant = async (organizationId) =>
    platformTenantService.presentTenant(
      store.organizations.get(organizationId),
      store.subscriptions.get(organizationId)
    );

  const app = express();
  app.use((req, res, next) => {
    req.authContext = authContext({ organizationId: ORG_B, saasRole: SAAS_ROLES.ADMIN });
    req.effectiveOrganizationId = ORG_B;
    req.originalUrl = "/api/dashboard";
    next();
  });
  app.use(tenantOperationalGuard);
  app.get("/api/dashboard", (req, res) => res.json({ ok: true }));

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
    assert.equal(response.status, 403);
  });

  platformTenantService.getTenant = originalGetTenant;
});

test("next due uses calendar month increment", () => {
  assert.equal(
    addOneCalendarMonth("2026-01-31T12:00:00.000Z"),
    "2026-02-28T12:00:00.000Z"
  );
  assert.equal(
    addOneCalendarMonth("2026-03-15T08:30:00.000Z"),
    "2026-04-15T08:30:00.000Z"
  );
});
