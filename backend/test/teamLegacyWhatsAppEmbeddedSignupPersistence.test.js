/**
 * Support Mode + Embedded Signup org resolution.
 * Exchange/status must bind effective tenant, never home org alone.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const {
  resolveOrganizationId
} = require("../services/whatsappIntegrationService");
const {
  resolveEffectiveOrganizationId
} = require("../core/effectiveOrganizationContext");
const { SAAS_ROLES } = require("../security/saasRoles");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const TEAM_LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";

test("Support Mode exchange resolves to effective Team Legacy org, not home Team Vision", async () => {
  const authContext = {
    userId: "super-admin-1",
    organizationId: TEAM_VISION_ORG,
    saasRole: SAAS_ROLES.SUPER_ADMIN,
    role: "admin"
  };
  const supportContext = {
    organizationId: TEAM_LEGACY_ORG,
    enteredAt: new Date().toISOString()
  };
  const req = {
    authContext,
    supportContext,
    effectiveOrganizationId: resolveEffectiveOrganizationId(authContext, supportContext),
    tenantContext: {
      organizationId: TEAM_LEGACY_ORG,
      homeOrganizationId: TEAM_VISION_ORG
    }
  };

  const resolved = await resolveOrganizationId(authContext, req);
  assert.equal(resolved, TEAM_LEGACY_ORG);
  assert.notEqual(resolved, TEAM_VISION_ORG);
});

test("organizationGuard-rebinding uses effective org via homeOrganizationId stamp", async () => {
  const authContext = {
    userId: "super-admin-1",
    organizationId: TEAM_LEGACY_ORG,
    homeOrganizationId: TEAM_VISION_ORG,
    saasRole: SAAS_ROLES.SUPER_ADMIN
  };

  const resolved = await resolveOrganizationId(authContext, null);
  assert.equal(resolved, TEAM_LEGACY_ORG);
});

test("meta onboarding routes pass req into resolveOrganizationId", () => {
  const routeSrc = fs.readFileSync(
    path.join(__dirname, "../routes/metaOnboarding.js"),
    "utf8"
  );
  assert.match(routeSrc, /organizationGuard\(\)/);
  assert.match(
    routeSrc,
    /resolveOrganizationId\(\s*req\.authContext\s*,\s*req\s*\)/
  );
  assert.match(routeSrc, /embedded_signup_exchange_requested/);
  assert.match(routeSrc, /embedded-signup\/telemetry/);
});

test("WhatsAppConnect verifies durable status after exchange and surfaces partial timeout", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/WhatsAppConnect.jsx"),
    "utf8"
  );
  assert.match(src, /verifyEmbeddedSignupConnected/);
  assert.match(src, /PARTIAL_HANDOFF/);
  assert.match(src, /persistHandoffAttempt/);
  assert.match(src, /restoreHandoffAttempt/);
  assert.match(src, /COMPLETION_EXTENSION_MS/);
});

test("Atlas app origin is allowlisted for Embedded Signup frontend origins", () => {
  const {
    collectAllowedFrontendOrigins
  } = require("../core/metaEmbeddedSignupService");
  // collectAllowedFrontendOrigins may not be exported — fall back to source check
  let origins;
  try {
    origins = collectAllowedFrontendOrigins({});
  } catch {
    origins = null;
  }
  if (origins) {
    assert.ok(origins.has("https://app.useatlas-ai.com"));
    assert.ok(origins.has("https://useatlas-ai.com"));
  } else {
    const src = fs.readFileSync(
      path.join(__dirname, "../core/metaEmbeddedSignupService.js"),
      "utf8"
    );
    assert.match(src, /https:\/\/app\.useatlas-ai\.com/);
    assert.match(src, /https:\/\/useatlas-ai\.com/);
  }
});
