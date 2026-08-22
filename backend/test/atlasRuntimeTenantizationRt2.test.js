/**
 * RT2 — Tenant Feature Controls (control plane).
 * Global master && tenant persisted gates. Team Legacy stays OFF.
 *
 * Conversations Center deploy includes this control plane + Platform UI.
 * Recruit AI / QR runtime consumers may still use env allowlists until those
 * gates are separately cut over; this suite validates the shared feature resolver.
 */

require("dotenv").config();
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const {
  TENANT_FEATURES,
  resolveTenantFeatureEffective,
  isTenantFeatureEnabled,
  presentTenantFeatureControls,
  deriveSeedFeatureBackfillFromEnv
} = require("../core/tenantFeatureControls");
const { resolveEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireSuperAdmin } = require("../middleware/requireSuperAdmin");
const { ROLES } = require("../security/roles");
const { SAAS_ROLES } = require("../security/saasRoles");
const { permissionsForRole } = require("../security/permissions");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";

function envBase(overrides = {}) {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG_TV,
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: ORG_TV,
    QR_CAMPAIGN_MANAGER_ENABLED: "true",
    QR_CAMPAIGN_MANAGER_ORGANIZATION_IDS: ORG_TV,
    CONVERSATIONS_CENTER_ENABLED: "true",
    ...overrides
  };
}

test("RT2-1 global ON + tenant ON → effective ON", () => {
  const effective = resolveTenantFeatureEffective({
    organizationId: ORG_TL,
    featureKey: TENANT_FEATURES.RECRUIT_AI_AUTHORING,
    tenantFeatures: { recruitAiAuthoringEnabled: true },
    env: envBase()
  });
  assert.equal(effective.enabled, true);
});

test("RT2-2 global ON + tenant OFF → OFF", () => {
  const effective = resolveTenantFeatureEffective({
    organizationId: ORG_TL,
    featureKey: TENANT_FEATURES.RECRUIT_AI_AUTHORING,
    tenantFeatures: { recruitAiAuthoringEnabled: false },
    env: envBase()
  });
  assert.equal(effective.enabled, false);
  assert.equal(effective.reason, "TENANT_GATE_OFF");
});

test("RT2-3 global OFF + tenant ON → OFF", () => {
  const effective = resolveTenantFeatureEffective({
    organizationId: ORG_TL,
    featureKey: TENANT_FEATURES.RECRUIT_AI_AUTHORING,
    tenantFeatures: { recruitAiAuthoringEnabled: true },
    env: envBase({ RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "false" })
  });
  assert.equal(effective.enabled, false);
  assert.equal(effective.reason, "GLOBAL_GATE_OFF");
  const label = presentTenantFeatureControls({
    organizationId: ORG_TL,
    tenantFeatures: { recruitAiAuthoringEnabled: true },
    env: envBase({ RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "false" })
  }).find((row) => row.featureKey === TENANT_FEATURES.RECRUIT_AI_AUTHORING);
  assert.equal(label.statusLabel, "Configured ON · Global gate OFF");
});

test("RT2-4 missing non-seed tenant value → OFF", () => {
  const effective = resolveTenantFeatureEffective({
    organizationId: ORG_TL,
    featureKey: TENANT_FEATURES.RECRUIT_AI_EXECUTION,
    tenantFeatures: null,
    env: envBase({
      RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: `${ORG_TV},${ORG_TL}`
    })
  });
  assert.equal(effective.enabled, false);
  assert.equal(effective.tenant.source, "non_seed_default_off");
});

test("RT2-5 Team Vision migration preserves Conversations + env allowlist backfill", () => {
  const env = envBase();
  const backfill = deriveSeedFeatureBackfillFromEnv(ORG_TV, env);
  assert.equal(backfill.recruitAiAuthoringEnabled, true);
  assert.equal(backfill.recruitAiExecutionEnabled, true);
  assert.equal(backfill.qrCampaignManagerEnabled, true);
  assert.equal(backfill.conversationsCenterEnabled, true);

  const conversations = resolveTenantFeatureEffective({
    organizationId: ORG_TV,
    featureKey: TENANT_FEATURES.CONVERSATIONS_CENTER,
    tenantFeatures: null,
    env
  });
  assert.equal(conversations.enabled, true);
});

test("RT2-6 Team Legacy remains OFF for Conversations control plane", () => {
  const featuresOff = {
    recruitAiAuthoringEnabled: false,
    recruitAiExecutionEnabled: false,
    qrCampaignManagerEnabled: false,
    conversationsCenterEnabled: false
  };

  assert.equal(
    isTenantFeatureEnabled(ORG_TL, TENANT_FEATURES.CONVERSATIONS_CENTER, {
      tenantFeatures: featuresOff,
      env: envBase({
        CONVERSATIONS_CENTER_ORGANIZATION_IDS: `${ORG_TV},${ORG_TL}`
      })
    }).enabled,
    false
  );
  assert.equal(
    isTenantFeatureEnabled(ORG_TL, TENANT_FEATURES.RECRUIT_AI_AUTHORING, {
      tenantFeatures: featuresOff,
      env: envBase({
        RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: `${ORG_TV},${ORG_TL}`
      })
    }).enabled,
    false
  );
});

test("RT2-7 tenant ADMIN cannot update platform feature flags", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = {
      userId: "tl-admin",
      email: "admin@teamlegacy.test",
      role: ROLES.ADMINISTRATOR,
      saasRole: SAAS_ROLES.ADMIN,
      organizationId: ORG_TL,
      permissions: permissionsForRole(ROLES.ADMINISTRATOR),
      status: "active"
    };
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

test("RT2-8 SUPER_ADMIN can update target org features (route contract)", async () => {
  const store = {
    [ORG_TL]: {
      recruitAiAuthoringEnabled: false,
      recruitAiExecutionEnabled: false,
      qrCampaignManagerEnabled: false,
      conversationsCenterEnabled: false
    }
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
    store[req.params.id] = {
      ...store[req.params.id],
      ...req.body
    };
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
    assert.equal(body.features.recruitAiExecutionEnabled, false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("RT2-9 cross-org override → 403", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = {
      userId: "tl-admin",
      role: ROLES.ADMINISTRATOR,
      saasRole: SAAS_ROLES.ADMIN,
      organizationId: ORG_TL,
      permissions: permissionsForRole(ROLES.ADMINISTRATOR),
      status: "active"
    };
    req.supportContext = null;
    req.effectiveOrganizationId = resolveEffectiveOrganizationId(
      req.authContext,
      req.supportContext
    );
    next();
  });
  app.use(organizationGuard());
  app.patch("/probe", (req, res) => res.json({ org: req.tenantContext.organizationId }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/probe`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: ORG_TV, conversationsCenterEnabled: true })
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("RT2-10 Conversations feature independent of Recruit AI Authoring", () => {
  const env = envBase();
  const features = {
    recruitAiAuthoringEnabled: true,
    recruitAiExecutionEnabled: false,
    qrCampaignManagerEnabled: false,
    conversationsCenterEnabled: false
  };
  assert.equal(
    isTenantFeatureEnabled(ORG_TL, TENANT_FEATURES.RECRUIT_AI_AUTHORING, {
      tenantFeatures: features,
      env
    }).enabled,
    true
  );
  assert.equal(
    isTenantFeatureEnabled(ORG_TL, TENANT_FEATURES.CONVERSATIONS_CENTER, {
      tenantFeatures: features,
      env
    }).enabled,
    false
  );
});

test("RT2-11 Conversations OFF remains fail closed", () => {
  assert.equal(
    isTenantFeatureEnabled(ORG_TL, TENANT_FEATURES.CONVERSATIONS_CENTER, {
      tenantFeatures: { conversationsCenterEnabled: false },
      env: envBase({ CONVERSATIONS_CENTER_ENABLED: "true" })
    }).enabled,
    false
  );
});

test("RT2-12 QR tenant gate isolated in control plane", () => {
  const env = envBase({ QR_CAMPAIGN_MANAGER_ORGANIZATION_IDS: ORG_TV });
  assert.equal(
    isTenantFeatureEnabled(ORG_TL, TENANT_FEATURES.QR_CAMPAIGN_MANAGER, {
      tenantFeatures: { qrCampaignManagerEnabled: true },
      env
    }).enabled,
    true
  );
  assert.equal(
    isTenantFeatureEnabled(ORG_TL, TENANT_FEATURES.QR_CAMPAIGN_MANAGER, {
      tenantFeatures: { qrCampaignManagerEnabled: false },
      env
    }).enabled,
    false
  );
  assert.equal(
    isTenantFeatureEnabled(ORG_TV, TENANT_FEATURES.QR_CAMPAIGN_MANAGER, {
      tenantFeatures: null,
      env
    }).enabled,
    true
  );
});

test("RT2-13 suspended tenant cannot gain Conversations from feature flag alone", () => {
  const result = isTenantFeatureEnabled(
    ORG_TL,
    TENANT_FEATURES.CONVERSATIONS_CENTER,
    {
      tenantFeatures: { conversationsCenterEnabled: true },
      lifecycleStatus: "SUSPENDED",
      env: envBase()
    }
  );
  assert.equal(result.enabled, false);
  assert.equal(result.reason, "TENANT_SUSPENDED");
});

test("RT2 Support Mode does not grant tenant Admin platform feature writes", () => {
  const tenantAdmin = {
    userId: "tl-admin",
    role: ROLES.ADMINISTRATOR,
    saasRole: SAAS_ROLES.ADMIN,
    organizationId: ORG_TL
  };
  assert.equal(
    resolveEffectiveOrganizationId(tenantAdmin, { organizationId: ORG_TV }),
    ORG_TL
  );
});

test("RT2 Conversations present in Platform feature controls", () => {
  const controls = presentTenantFeatureControls({
    organizationId: ORG_TV,
    tenantFeatures: { conversationsCenterEnabled: true },
    env: envBase()
  });
  const row = controls.find(
    (item) => item.featureKey === TENANT_FEATURES.CONVERSATIONS_CENTER
  );
  assert.ok(row);
  assert.equal(row.label, "Conversations Center");
  assert.equal(row.effective, true);
});
