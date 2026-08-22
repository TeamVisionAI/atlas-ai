/**
 * BR-152 — Practical agent reference library + tenant feature gate.
 */

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { ROLES } = require("../security/roles");
const { buildAuthContext, hasPermission } = require("../security/authorizationService");
const { PERMISSIONS } = require("../security/permissions");
const { TENANT_FEATURES } = require("../core/tenantFeatureControls");
const {
  evaluateKnowledgeHubAccess,
  ACCESS_CODES
} = require("../core/knowledgeHub/knowledgeHubAccess");
const { getKnowledgeTree } = require("../core/knowledgeHubService");
const { KNOWLEDGE_HUB_CATEGORIES } = require("../core/knowledgeHubCategories");

const TV = "00000000-0000-4000-8000-000000000001";
const RL_ID = "rl-field";

test("BR-152 defines six agent-library categories", () => {
  assert.equal(KNOWLEDGE_HUB_CATEGORIES.length, 6);
});

test("BR-152 knowledge tree serves agent-library only", () => {
  const payload = getKnowledgeTree();
  assert.equal(payload.libraryType, "agent-reference");
  assert.equal(payload.docsRoot, "docs/agent-library");
  assert.equal(payload.categories.length, 6);
  assert.ok(payload.files.length >= 6);
  for (const file of payload.files) {
    assert.match(file.path, /^[a-z0-9-]+\/.+\.md$/);
    assert.ok(file.categoryId);
  }
});

test("BR-152 field user denied when tenant knowledgeHubEnabled is false", () => {
  const rl = buildAuthContext(
    { id: RL_ID, role: ROLES.DIVISION_LEADER, organization_id: TV, status: "active" },
    {}
  );
  const result = evaluateKnowledgeHubAccess({
    organizationId: TV,
    authContext: rl,
    tenantFeatures: { [TENANT_FEATURES.KNOWLEDGE_HUB]: false }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, ACCESS_CODES.NOT_ENABLED);
});

test("BR-152 field user allowed when tenant knowledgeHubEnabled is true", () => {
  const rl = buildAuthContext(
    { id: RL_ID, role: ROLES.DIVISION_LEADER, organization_id: TV, status: "active" },
    {}
  );
  const result = evaluateKnowledgeHubAccess({
    organizationId: TV,
    authContext: rl,
    tenantFeatures: { [TENANT_FEATURES.KNOWLEDGE_HUB]: true }
  });
  assert.equal(result.allowed, true);
});

test("BR-152 RVP bypasses tenant gate via knowledge:write", () => {
  const rvp = buildAuthContext(
    { id: "rvp-1", role: ROLES.RVP, organization_id: TV, status: "active" },
    {}
  );
  const result = evaluateKnowledgeHubAccess({
    organizationId: TV,
    authContext: rvp,
    tenantFeatures: { [TENANT_FEATURES.KNOWLEDGE_HUB]: false }
  });
  assert.equal(result.allowed, true);
  assert.equal(result.managementBypass, true);
  assert.equal(hasPermission(rvp, PERMISSIONS.KNOWLEDGE_WRITE), true);
});

test("BR-152 starter content exists (one article per category)", () => {
  const root = path.join(__dirname, "../../docs/agent-library");
  for (const category of KNOWLEDGE_HUB_CATEGORIES) {
    const dir = path.join(root, category.folder);
    assert.ok(fs.existsSync(dir), `${category.folder} exists`);
    const mdFiles = fs.readdirSync(dir).filter((name) => name.endsWith(".md"));
    assert.ok(mdFiles.length >= 1, `${category.folder} has starter article`);
  }
});

test("BR-152 knowledge route exposes access endpoint and tenant gate", () => {
  const routeSource = fs.readFileSync(path.join(__dirname, "../routes/knowledge.js"), "utf8");
  assert.match(routeSource, /router\.get\("\/access"/);
  assert.match(routeSource, /assertKnowledgeHubAccessAsync/);
});
