/**
 * Conversations Center tenantization — GLOBAL_MASTER && TENANT_FEATURE && RBAC.
 * Team Legacy remains OFF. Team Vision seed compat preserves access.
 */

require("dotenv").config();
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const http = require("node:http");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const {
  TENANT_FEATURES,
  resolveTenantFeatureEffective,
  presentTenantFeatureControls,
  deriveSeedFeatureBackfillFromEnv
} = require("../core/tenantFeatureControls");
const {
  evaluateConversationsCenterAccess,
  assertConversationsCenterAccess,
  isProspectInConversationsTenantScope,
  CONVERSATIONS_CENTER_PERMISSION
} = require("../core/conversationsCenter/conversationsCenterAccess");
const {
  buildConversationsCenterReadModel
} = require("../core/conversationsCenter/conversationsCenterReadModel");
const { resolveEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireSuperAdmin } = require("../middleware/requireSuperAdmin");
const { ROLES } = require("../security/roles");
const { SAAS_ROLES } = require("../security/saasRoles");
const { permissionsForRole, PERMISSIONS } = require("../security/permissions");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const USER_ADMIN = "00000000-0000-4000-8000-000000000099";
const USER_SUPPORT = "00000000-0000-4000-8000-000000000098";

function envOn(overrides = {}) {
  return {
    CONVERSATIONS_CENTER_ENABLED: "true",
    ...overrides
  };
}

function adminContext(organizationId = ORG_TV) {
  return {
    userId: USER_ADMIN,
    role: ROLES.ADMINISTRATOR,
    saasRole: SAAS_ROLES.ADMIN,
    organizationId,
    permissions: permissionsForRole(ROLES.ADMINISTRATOR),
    status: "active"
  };
}

function supportContext(organizationId = ORG_TV) {
  return {
    userId: USER_SUPPORT,
    role: ROLES.SUPPORT,
    saasRole: SAAS_ROLES.SUPPORT,
    organizationId,
    permissions: permissionsForRole(ROLES.SUPPORT),
    status: "active"
  };
}

test("CC-1 global ON + tenant ON + RBAC → access", () => {
  const result = evaluateConversationsCenterAccess({
    organizationId: ORG_TL,
    authContext: adminContext(ORG_TL),
    tenantFeatures: { conversationsCenterEnabled: true },
    env: envOn()
  });
  assert.equal(result.allowed, true);
  assert.equal(CONVERSATIONS_CENTER_PERMISSION, PERMISSIONS.PROSPECT_COMMUNICATE);
});

test("CC-2 global ON + tenant OFF → not enabled", () => {
  const result = evaluateConversationsCenterAccess({
    organizationId: ORG_TL,
    authContext: adminContext(ORG_TL),
    tenantFeatures: { conversationsCenterEnabled: false },
    env: envOn()
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, "CONVERSATIONS_CENTER_NOT_ENABLED");
});

test("CC-3 global OFF + tenant ON → denied", () => {
  const result = evaluateConversationsCenterAccess({
    organizationId: ORG_TV,
    authContext: adminContext(ORG_TV),
    tenantFeatures: { conversationsCenterEnabled: true },
    env: envOn({ CONVERSATIONS_CENTER_ENABLED: "false" })
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "GLOBAL_GATE_OFF");
  const label = presentTenantFeatureControls({
    organizationId: ORG_TV,
    tenantFeatures: { conversationsCenterEnabled: true },
    env: envOn({ CONVERSATIONS_CENTER_ENABLED: "false" })
  }).find((row) => row.featureKey === TENANT_FEATURES.CONVERSATIONS_CENTER);
  assert.equal(label.statusLabel, "Configured ON · Global gate OFF");
});

test("CC-4 missing non-seed flag → OFF", () => {
  const effective = resolveTenantFeatureEffective({
    organizationId: ORG_TL,
    featureKey: TENANT_FEATURES.CONVERSATIONS_CENTER,
    tenantFeatures: null,
    env: envOn({
      CONVERSATIONS_CENTER_ORGANIZATION_IDS: `${ORG_TV},${ORG_TL}`
    })
  });
  assert.equal(effective.enabled, false);
  assert.equal(effective.tenant.source, "non_seed_default_off");
});

test("CC-5 Team Vision migration preserves access", () => {
  const backfill = deriveSeedFeatureBackfillFromEnv(ORG_TV, envOn());
  assert.equal(backfill.conversationsCenterEnabled, true);

  const unsetSeed = resolveTenantFeatureEffective({
    organizationId: ORG_TV,
    featureKey: TENANT_FEATURES.CONVERSATIONS_CENTER,
    tenantFeatures: null,
    env: envOn()
  });
  assert.equal(unsetSeed.enabled, true);
  assert.match(String(unsetSeed.tenant.source), /seed_conversations_compat|seed_env/);

  const access = evaluateConversationsCenterAccess({
    organizationId: ORG_TV,
    authContext: adminContext(ORG_TV),
    tenantFeatures: null,
    env: envOn()
  });
  assert.equal(access.allowed, true);
});

test("CC-6 Team Legacy remains OFF after tenantization", () => {
  const effective = resolveTenantFeatureEffective({
    organizationId: ORG_TL,
    featureKey: TENANT_FEATURES.CONVERSATIONS_CENTER,
    tenantFeatures: { conversationsCenterEnabled: false },
    env: envOn()
  });
  assert.equal(effective.enabled, false);

  const access = evaluateConversationsCenterAccess({
    organizationId: ORG_TL,
    authContext: adminContext(ORG_TL),
    tenantFeatures: { conversationsCenterEnabled: false },
    env: envOn()
  });
  assert.equal(access.allowed, false);
});

test("CC-7 TL ADMIN + feature OFF → no Conversations access", () => {
  assert.throws(
    () =>
      assertConversationsCenterAccess({
        organizationId: ORG_TL,
        authContext: adminContext(ORG_TL),
        tenantFeatures: { conversationsCenterEnabled: false },
        env: envOn()
      }),
    (error) => error.code === "CONVERSATIONS_CENTER_NOT_ENABLED"
  );
});

test("CC-8 TL ADMIN + feature ON → TL conversations only (scope)", async () => {
  const access = evaluateConversationsCenterAccess({
    organizationId: ORG_TL,
    authContext: adminContext(ORG_TL),
    tenantFeatures: { conversationsCenterEnabled: true },
    env: envOn()
  });
  assert.equal(access.allowed, true);

  const model = await buildConversationsCenterReadModel({
    organizationId: ORG_TL,
    prospects: [
      {
        id: "tl-1",
        phone: "+17865551001",
        name: "TL Lead",
        organization_id: ORG_TL,
        current_step: "QUALIFICATION",
        source: "car_magnet",
        entry_method: "QR",
        appointment_status: "none",
        updated_at: "2026-08-20T12:00:00.000Z",
        workflow_state: { atlasEligibilitySource: "QR" }
      },
      {
        id: "tv-1",
        phone: "+17865551002",
        name: "TV Lead",
        organization_id: ORG_TV,
        current_step: "QUALIFICATION",
        source: "car_magnet",
        entry_method: "QR",
        appointment_status: "none",
        updated_at: "2026-08-20T12:00:00.000Z",
        workflow_state: { atlasEligibilitySource: "QR" }
      }
    ],
    conversationLogsByPhone: new Map()
  });

  assert.equal(model.items.every((item) => item.phone === "+17865551001"), true);
  assert.equal(
    model.items.some((item) => item.phone === "+17865551002"),
    false
  );
});

test("CC-9 TV user cannot read TL conversation by org scope", () => {
  assert.equal(
    isProspectInConversationsTenantScope(
      { organization_id: ORG_TL, phone: "+17865551001" },
      ORG_TV
    ),
    false
  );
  assert.equal(
    isProspectInConversationsTenantScope(
      { organization_id: ORG_TV, phone: "+17865551002" },
      ORG_TV
    ),
    true
  );
});

test("CC-10 SA Support Mode TL → effective TL only", () => {
  const saHome = {
    userId: "super",
    role: ROLES.ADMINISTRATOR,
    saasRole: SAAS_ROLES.SUPER_ADMIN,
    organizationId: ORG_TV,
    permissions: permissionsForRole(ROLES.ADMINISTRATOR),
    status: "active"
  };
  const effectiveOrg = resolveEffectiveOrganizationId(saHome, {
    organizationId: ORG_TL
  });
  assert.equal(effectiveOrg, ORG_TL);

  const tlOff = evaluateConversationsCenterAccess({
    organizationId: effectiveOrg,
    authContext: saHome,
    tenantFeatures: { conversationsCenterEnabled: false },
    env: envOn()
  });
  assert.equal(tlOff.allowed, false);

  const tlOn = evaluateConversationsCenterAccess({
    organizationId: effectiveOrg,
    authContext: saHome,
    tenantFeatures: { conversationsCenterEnabled: true },
    env: envOn()
  });
  assert.equal(tlOn.allowed, true);
});

test("CC-11 foreign conversation direct ID blocked by tenant scope", async () => {
  const model = await buildConversationsCenterReadModel({
    organizationId: ORG_TV,
    prospects: [
      {
        id: "foreign",
        phone: "+17865551999",
        name: "Foreign",
        organization_id: ORG_TL,
        current_step: "QUALIFICATION",
        source: "car_magnet",
        entry_method: "QR",
        appointment_status: "none",
        updated_at: "2026-08-20T12:00:00.000Z",
        workflow_state: { atlasEligibilitySource: "QR" }
      }
    ],
    conversationLogsByPhone: new Map()
  });
  assert.equal(model.items.length, 0);
  assert.equal(
    isProspectInConversationsTenantScope(
      { organization_id: ORG_TL, id: "foreign" },
      ORG_TV
    ),
    false
  );
});

test("CC-12 frontend nav/page no longer depends on Niovel ID", () => {
  const mainLayout = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/layouts/MainLayout.jsx"),
    "utf8"
  );
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/ConversationsPage.jsx"),
    "utf8"
  );
  const accessHelper = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/engines/conversationsCenterAccess.js"),
    "utf8"
  );
  assert.doesNotMatch(mainLayout, /33ad243a-9d00-4a4d-810b-df2762c0f076/);
  assert.doesNotMatch(mainLayout, /NIOVEL_USER_ID/);
  assert.doesNotMatch(page, /conversationsPilotOnly/);
  assert.match(page, /conversationsNotEnabled|conversationsForbidden/);
  assert.match(accessHelper, /CONVERSATIONS_CENTER_NOT_ENABLED/);
  assert.match(mainLayout, /getConversationsCenterAccess/);
});

test("CC-13 tenant ADMIN cannot toggle Conversations feature", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = adminContext(ORG_TL);
    next();
  });
  app.patch("/features", requireSuperAdmin, (_req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/features`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationsCenterEnabled: true })
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("CC-14 SUPER_ADMIN can toggle target tenant Conversations feature", async () => {
  const store = {
    [ORG_TL]: { conversationsCenterEnabled: false }
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = {
      userId: "super",
      email: "super@atlas.test",
      role: ROLES.ADMINISTRATOR,
      saasRole: SAAS_ROLES.SUPER_ADMIN,
      organizationId: ORG_TV,
      permissions: permissionsForRole(ROLES.ADMINISTRATOR),
      status: "active"
    };
    next();
  });
  app.use(requireSuperAdmin);
  app.patch("/tenants/:id/features", (req, res) => {
    store[req.params.id] = { ...store[req.params.id], ...req.body };
    res.json({ features: store[req.params.id] });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/tenants/${ORG_TL}/features`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationsCenterEnabled: true })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.features.conversationsCenterEnabled, true);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("CC-15 feature presentation includes Conversations Center", () => {
  const controls = presentTenantFeatureControls({
    organizationId: ORG_TL,
    tenantFeatures: {
      conversationsCenterEnabled: false,
      recruitAiAuthoringEnabled: false,
      recruitAiExecutionEnabled: false,
      qrCampaignManagerEnabled: false
    },
    env: envOn()
  });
  const row = controls.find(
    (item) => item.featureKey === TENANT_FEATURES.CONVERSATIONS_CENTER
  );
  assert.ok(row);
  assert.equal(row.label, "Conversations Center");
  assert.equal(row.configured, false);
  assert.equal(row.effective, false);
});

test("CC-16 insufficient RBAC with feature ON → forbidden", () => {
  const result = evaluateConversationsCenterAccess({
    organizationId: ORG_TV,
    authContext: supportContext(ORG_TV),
    tenantFeatures: { conversationsCenterEnabled: true },
    env: envOn()
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, "CONVERSATIONS_CENTER_FORBIDDEN");
});

test("CC-17 organizationGuard still blocks cross-org override", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = adminContext(ORG_TL);
    req.supportContext = null;
    req.effectiveOrganizationId = resolveEffectiveOrganizationId(
      req.authContext,
      req.supportContext
    );
    next();
  });
  app.use(organizationGuard());
  app.get("/probe", (req, res) => res.json({ org: req.tenantContext.organizationId }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/probe?organizationId=${ORG_TV}`
    );
    assert.equal(res.status, 403);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
