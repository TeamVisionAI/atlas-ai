#!/usr/bin/env node
/**
 * LC1 — Security validation script.
 */

require("dotenv").config();

const {
  buildAuthContext,
  canAccessProspect,
  hasPermission,
  getProspectListScope
} = require("../security/authorizationService");
const { ROLES } = require("../security/roles");
const { PERMISSIONS } = require("../security/permissions");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const DIVISION_A = "00000000-0000-4000-8000-000000000010";

function user(role, overrides = {}) {
  return buildAuthContext({
    id: overrides.id || "user-1",
    email: overrides.email || `${role}@example.com`,
    role,
    status: "active",
    organization_id: overrides.organizationId || ORG_A,
    division_id: overrides.divisionId || null
  });
}

function assert(name, condition) {
  if (!condition) {
    throw new Error(`FAILED: ${name}`);
  }

  console.log(`PASS: ${name}`);
}

function runAuthorizationMatrixTests() {
  const admin = user(ROLES.ADMINISTRATOR);
  const rvp = user(ROLES.RVP);
  const divisionLeader = user(ROLES.DIVISION_LEADER, { divisionId: DIVISION_A });
  const agent = user(ROLES.AGENT, { id: "agent-1" });
  const otherAgent = user(ROLES.AGENT, { id: "agent-2" });
  const operations = user(ROLES.OPERATIONS);
  const support = user(ROLES.SUPPORT);

  const orgProspect = {
    organization_id: ORG_A,
    owner_user_id: "agent-1",
    assigned_agent_id: "agent-1",
    assigned_division_id: DIVISION_A
  };

  const otherDivisionProspect = {
    organization_id: ORG_A,
    owner_user_id: "agent-2",
    assigned_division_id: "other-division"
  };

  const crossOrgProspect = {
    organization_id: ORG_B,
    owner_user_id: "agent-1"
  };

  assert("administrator can read prospects", hasPermission(admin, PERMISSIONS.PROSPECT_READ));
  assert("operations cannot write prospects", !hasPermission(operations, PERMISSIONS.PROSPECT_WRITE));
  assert("operations can access operations center permission", hasPermission(operations, PERMISSIONS.OPERATIONS_ACCESS));
  assert("agent cannot assign leads", !hasPermission(agent, PERMISSIONS.PROSPECT_ASSIGN));
  assert("rvp can access executive dashboard", hasPermission(rvp, PERMISSIONS.DASHBOARD_EXECUTIVE));

  assert("cross-organization access denied", !canAccessProspect(agent, crossOrgProspect));
  assert("agent can access owned prospect", canAccessProspect(agent, orgProspect));
  assert("other agent cannot access prospect", !canAccessProspect(otherAgent, orgProspect));
  assert("division leader can access division prospect", canAccessProspect(divisionLeader, orgProspect));
  assert(
    "division leader cannot access other division",
    !canAccessProspect(divisionLeader, otherDivisionProspect)
  );
  assert("operations cannot access prospects", !canAccessProspect(operations, orgProspect));
  assert("rvp has organization-wide visibility", canAccessProspect(rvp, otherDivisionProspect));
  assert("support can read with limited permission", hasPermission(support, PERMISSIONS.PROSPECT_READ));

  const deniedScope = getProspectListScope(operations);
  assert("operations list scope denied", Boolean(deniedScope.denied));

  const agentScope = getProspectListScope(agent);
  assert("agent list scope scoped to owner", agentScope.ownerUserId === "agent-1");
}

async function runHttpChecks() {
  const baseUrl = process.env.ATLAS_TEST_BASE_URL;

  if (!baseUrl) {
    console.log("SKIP: HTTP checks (set ATLAS_TEST_BASE_URL to enable)");
    return;
  }

  const anonymous = await fetch(`${baseUrl}/api/auth/me`);

  assert("anonymous /api/auth/me returns 401", anonymous.status === 401);

  const protectedRoute = await fetch(`${baseUrl}/api/prospect-center/queue`);

  assert("anonymous protected route returns 401", protectedRoute.status === 401);
}

async function main() {
  console.log("LC1 Security Validation\n");

  runAuthorizationMatrixTests();
  await runHttpChecks();

  console.log("\nLC1 authorization validation complete.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  runAuthorizationMatrixTests,
  runHttpChecks
};
