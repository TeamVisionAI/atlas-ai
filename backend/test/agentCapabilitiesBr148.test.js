/**
 * BR-148 — Primerica agent capabilities (defaults, gating, readiness, ownership helpers).
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_AGENT_CAPABILITIES,
  normalizeAgentCapabilities,
  mergeAgentCapabilitiesPatch,
  evaluateAgentWorkspaceReadiness,
  resolveLeadOwnershipMode,
  resolveAgentCapabilitiesFromUser
} = require("../core/agentCapabilitiesEngine");

test("new agent gets safe defaults", () => {
  const caps = normalizeAgentCapabilities(null);
  assert.deepEqual(caps, DEFAULT_AGENT_CAPABILITIES);
  assert.equal(caps.canReceiveOrganizationLeads, true);
  assert.equal(caps.roundRobinEligible, false);
  assert.equal(caps.personalWhatsAppEnabled, false);
  assert.equal(caps.personalLeadSourcesEnabled, false);
  assert.equal(caps.personalMetaAdsEnabled, false);
});

test("RVP can enable personal WhatsApp via merge patch", () => {
  const next = mergeAgentCapabilitiesPatch(DEFAULT_AGENT_CAPABILITIES, {
    personalWhatsAppEnabled: true
  });
  assert.equal(next.personalWhatsAppEnabled, true);
  assert.equal(next.canReceiveOrganizationLeads, true);
});

test("capability differences between two users of same rank", () => {
  const rlA = resolveAgentCapabilitiesFromUser({
    business_rank: "RL",
    agent_capabilities: { personalWhatsAppEnabled: true }
  });
  const rlB = resolveAgentCapabilitiesFromUser({
    business_rank: "RL",
    agent_capabilities: {}
  });
  assert.equal(rlA.personalWhatsAppEnabled, true);
  assert.equal(rlB.personalWhatsAppEnabled, false);
});

test("disabled WhatsApp does not block readiness when org leads enabled", () => {
  const readiness = evaluateAgentWorkspaceReadiness({
    capabilities: DEFAULT_AGENT_CAPABILITIES,
    profileComplete: true,
    googleConnected: true,
    zoomConfigured: true,
    availabilityConfigured: true,
    personalWhatsAppConnected: false
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.personalWhatsAppRequired, false);
  assert.equal(readiness.leadChannelLabel, "Organization Managed");
});

test("enabled WhatsApp without connection blocks readiness", () => {
  const readiness = evaluateAgentWorkspaceReadiness({
    capabilities: { ...DEFAULT_AGENT_CAPABILITIES, personalWhatsAppEnabled: true },
    profileComplete: true,
    googleConnected: true,
    zoomConfigured: true,
    availabilityConfigured: true,
    personalWhatsAppConnected: false
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.personalWhatsAppRequired, true);
});

test("personal WhatsApp routes to owning user (direct ownership)", () => {
  const ownership = resolveLeadOwnershipMode({
    whatsappOwnerUserId: "rl-user-1"
  });
  assert.equal(ownership.mode, "direct");
  assert.equal(ownership.ownerUserId, "rl-user-1");
  assert.equal(ownership.roundRobinEligible, false);
});

test("organization source remains assignment mode (Round Robin deferred)", () => {
  const ownership = resolveLeadOwnershipMode({ sourceOwnership: "organization" });
  assert.equal(ownership.mode, "organization");
  assert.equal(ownership.roundRobinEligible, true);
});

test("Admin Capabilities route and FE action exist; Meta Ads stay future-disabled", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../routes/adminUsers.js"), "utf8");
  assert.match(routes, /users\/:id\/capabilities/);
  assert.match(routes, /updateAgentCapabilities/);

  const helpers = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/identity/adminUsersGridHelpers.js"),
    "utf8"
  );
  assert.match(helpers, /edit-capabilities/);

  const adminUi = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/identity/AdminUsers.jsx"),
    "utf8"
  );
  assert.match(adminUi, /Allow Meta Ads — Future \/ Disabled/);
  assert.match(adminUi, /personalMetaAdsEnabled: false/);

  const meta = fs.readFileSync(path.join(__dirname, "../routes/metaOnboarding.js"), "utf8");
  assert.match(meta, /PERSONAL_WHATSAPP_DISABLED/);
});

test("RL cannot self-enable via integrations API (admin route only)", () => {
  const configRoutes = fs.readFileSync(
    path.join(__dirname, "../routes/configuration.js"),
    "utf8"
  );
  assert.doesNotMatch(configRoutes, /updateAgentCapabilities|agent_capabilities/);
});

test("migration 050 is additive and does not rewrite TV/TL WhatsApp ownership", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/050_agent_capabilities.sql"),
    "utf8"
  );
  assert.match(migration, /agent_capabilities/);
  assert.doesNotMatch(migration, /whatsapp_integrations/);
  assert.doesNotMatch(migration, /UPDATE\s+atlas_users\s+SET\s+agent_capabilities/i);
});

test("My Integrations hides WhatsApp when capability disabled", () => {
  const ui = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/components/settings/OrganizationIntegrations.jsx"),
    "utf8"
  );
  assert.match(ui, /whatsapp\.visible/);
  assert.match(ui, /configurationLeadChannelOrganizationManaged/);
});
