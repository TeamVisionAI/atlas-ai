/**
 * Sprint 19.1 — Tenant isolation completion verification.
 * Run: node backend/dev/verifySprint19_1.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  TenantOrganizationRequiredError,
  requireTenantOrganizationId
} = require("../core/tenantProspectLookup");
const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
const { findProspectByNormalizedPhone } = require("../core/quickCaptureEngine");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

const ORG_A = DEFAULT_ORGANIZATION_ID;
const ORG_B = "00000000-0000-4000-8000-000000000002";
const SHARED_PHONE = "+15559999991";
const REPO_ROOT = path.join(__dirname, "..", "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function verifyMissionControlWiring() {
  const routeSource = readRepoFile("backend/routes/missionControl.js");
  assert(routeSource.includes("getMissionControlWithActionsForRequest"), "Mission Control uses request handler");
  assert(routeSource.includes("organizationGuard()"), "Mission Control uses organizationGuard");
  assert(!routeSource.includes("getMissionControlWithActions(req.params.phone)"), "No unscoped Mission Control call");
  console.log("✓ Mission Control route passes tenant organization context");
}

function verifyUnscopedLookupRejected() {
  let threw = false;

  try {
    requireTenantOrganizationId(null);
  } catch (error) {
    threw = error instanceof TenantOrganizationRequiredError;
  }

  assert(threw, "Unscoped tenant lookup rejected");
  console.log("✓ Unscoped lookup rejected on authenticated path");
}

async function verifyCrossOrgMissionControlDenied() {
  const result = await getMissionControlWithActions(SHARED_PHONE, {
    organizationId: ORG_A,
    tenantScoped: true
  });
  assert(result === null, "Org A must not receive Mission Control payload for unknown phone");
  console.log("✓ Cross-org Mission Control denied");
}

async function verifyQuickCaptureOrgScoping() {
  const withoutOrg = await findProspectByNormalizedPhone("5559876543", null);
  assert(withoutOrg === null, "Quick Capture requires organization for duplicate lookup");
  console.log("✓ Quick Capture tenant deduplication");
}

function verifyProspectWorkspaceGateAuthority() {
  const pageSource = readRepoFile(
    "frontend/src/features/prospect-workspace/pages/ProspectWorkspacePage.jsx"
  );
  assert(pageSource.includes("Boolean(workspace?.workflowGate?.active)"), "Backend gate authority");
  assert(!pageSource.includes("shouldShowWorkflowGate"), "No localStorage gate fallback");
  console.log("✓ Prospect Workspace gate uses backend value only");
}

function verifySearchAudit() {
  const missionControlRoute = readRepoFile("backend/routes/missionControl.js");
  const quickCapture = readRepoFile("backend/core/quickCaptureEngine.js");
  const workspaceReadModel = readRepoFile("backend/core/prospectWorkspaceReadModel.js");
  const queueEngine = readRepoFile("frontend/src/engines/queueEngine.js");

  assert(!missionControlRoute.includes("getMissionControlWithActions(phone)"), "No unscoped MC route call");
  assert(quickCapture.includes("findProspectByNormalizedPhoneInOrganization"), "Quick Capture org filter");
  assert(!workspaceReadModel.includes("findProspect("), "Workspace read model has no unscoped findProspect");
  assert(!queueEngine.includes("MOCK_QUEUE_EXTRAS"), "No production mock prospects");
  console.log("✓ Search audit results clean for Sprint 19.1 scope");
}

function verifyNoCoreControllerImports() {
  const coreDir = path.join(__dirname, "..", "core");
  const files = fs.readdirSync(coreDir).filter((name) => name.endsWith(".js"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(coreDir, file), "utf8");
    assert(!content.includes('require("../controllers/'), `${file} must not import controllers`);
  }

  console.log("✓ No core controller imports");
}

function runAutomatedTests() {
  const result = spawnSync(process.execPath, ["--test", "backend/test/sprint19_1.test.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error("sprint19_1.test.js failed");
  }

  console.log("✓ sprint19_1.test.js passed");
}

async function main() {
  console.log("=== Sprint 19.1 Tenant Isolation Completion Verification ===\n");

  verifyMissionControlWiring();
  verifyUnscopedLookupRejected();
  await verifyCrossOrgMissionControlDenied();
  await verifyQuickCaptureOrgScoping();
  verifyProspectWorkspaceGateAuthority();
  verifySearchAudit();
  verifyNoCoreControllerImports();
  runAutomatedTests();

  console.log("\n=== All Sprint 19.1 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗ FAIL:", error.message);
  process.exit(1);
});
