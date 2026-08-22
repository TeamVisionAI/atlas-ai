/**
 * BR-151 — Knowledge Hub read access for field roles; write gated to RVP/Admin.
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
const { roleHasPermission, PERMISSIONS } = require("../security/permissions");
const { buildAuthContext, hasPermission } = require("../security/authorizationService");
const { requirePermission } = require("../middleware/requirePermission");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");

const TV = "00000000-0000-4000-8000-000000000001";
const RL_ID = "rl-misleisys";

test("BR-151 matrix: field roles have knowledge:read, not knowledge:write", () => {
  for (const role of [ROLES.DIVISION_LEADER, ROLES.AGENT, ROLES.RECRUITER]) {
    assert.equal(roleHasPermission(role, PERMISSIONS.KNOWLEDGE_READ), true, `${role} read`);
    assert.equal(roleHasPermission(role, PERMISSIONS.KNOWLEDGE_WRITE), false, `${role} write`);
    assert.equal(roleHasPermission(role, PERMISSIONS.ADMIN_USERS), false, `${role} admin`);
  }
});

test("BR-151 matrix: RVP/Admin have read+write", () => {
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.KNOWLEDGE_READ), true);
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.KNOWLEDGE_WRITE), true);
  assert.equal(roleHasPermission(ROLES.ADMINISTRATOR, PERMISSIONS.KNOWLEDGE_READ), true);
  assert.equal(roleHasPermission(ROLES.ADMINISTRATOR, PERMISSIONS.KNOWLEDGE_WRITE), true);
});

test("BR-151 RL context passes knowledge:read middleware", () => {
  const middleware = requirePermission(PERMISSIONS.KNOWLEDGE_READ);
  const rl = buildAuthContext(
    { id: RL_ID, role: ROLES.DIVISION_LEADER, organization_id: TV, status: "active" },
    { hierarchy: { mode: HIERARCHY_MODES.SELF, userIds: [RL_ID] } }
  );

  let nextCalled = false;
  middleware(
    { authContext: rl },
    {
      status() {
        return { json() {} };
      }
    },
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(hasPermission(rl, PERMISSIONS.KNOWLEDGE_READ), true);
});

test("BR-151 operations role denied knowledge:read by default", () => {
  assert.equal(roleHasPermission(ROLES.OPERATIONS, PERMISSIONS.KNOWLEDGE_READ), false);
});

test("BR-151 knowledge route requires knowledge:read permission", () => {
  const routeSource = fs.readFileSync(path.join(__dirname, "../routes/knowledge.js"), "utf8");
  assert.match(routeSource, /requirePermission\(PERMISSIONS\.KNOWLEDGE_READ\)/);
  assert.match(routeSource, /requireAtlasUser/);
});
