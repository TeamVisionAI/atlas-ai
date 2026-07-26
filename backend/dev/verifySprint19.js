/**
 * Sprint 19 — Platform Consolidation verification.
 * Run: node backend/dev/verifySprint19.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  generateMissionsFromContext,
  generateMissionsForOrganization
} = require("../core/missionEngine");
const { MISSION_TYPES } = require("../core/configuration/missionTypes");
const { MISSION_PRIORITIES } = require("../core/configuration/missionPriorities");
const { isWorkflowGateActive } = require("../core/agentActionEngine");
const {
  validateEnvironmentSecrets,
  forbidProductionInMemoryFallback
} = require("../core/productionReadinessValidator");
const { loadProductionProspects } = require("../core/executiveDashboardReadModel");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const agentActionApplicationService = require("../application/agentActionApplicationService");

const ORG_A = DEFAULT_ORGANIZATION_ID;
const ORG_B = "00000000-0000-4000-8000-000000000002";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
}

function verifyNoCoreControllerImports() {
  const coreDir = path.join(__dirname, "..", "core");
  const files = fs.readdirSync(coreDir).filter((name) => name.endsWith(".js"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(coreDir, file), "utf8");
    assert(
      !content.includes('require("../controllers/'),
      `${file} must not import controllers`
    );
  }

  console.log("✓ Core engines do not import HTTP controllers");
}

function verifyNoMockQueueExtras() {
  const queueEngine = readRepoFile("frontend/src/engines/queueEngine.js");
  assert(!queueEngine.includes("MOCK_QUEUE_EXTRAS"), "MOCK_QUEUE_EXTRAS removed from queueEngine");
  console.log("✓ Frontend queueEngine has no mock prospect injection");
}

function verifyMissionRules() {
  const interestedContext = {
    prospect: { phone: "+15550000001", name: "Test", current_step: "SCHEDULE" },
    brain: { currentStep: "SCHEDULE", missingFields: ["schedule"] },
    agentState: { outcome: "Interested" },
    conversationOutcome: {
      recordedOutcome: { key: "Interested", label: "Interested" },
      workflowRequirements: [{ key: "schedule" }]
    },
    workflow: { canonicalMilestone: "INTERVIEW_SCHEDULED" },
    availableActions: [{ id: "schedule", label: "Schedule" }]
  };

  const scheduleMissions = generateMissionsFromContext(interestedContext);
  assert(scheduleMissions[0]?.missionType === MISSION_TYPES.SCHEDULE_INTERVIEW, "Rule 1 mission type");
  assert(scheduleMissions[0]?.priority === MISSION_PRIORITIES.HIGH, "Rule 1 priority");

  const gateContext = {
    prospect: {
      phone: "+15550000002",
      name: "Gate Test",
      current_step: "CONFIRMED",
      appointment_date: "2020-01-01T10:00:00.000Z"
    },
    brain: { currentStep: "CONFIRMED", missingFields: [] },
    agentState: { outcome: "Information Collected" },
    conversationOutcome: { recordedOutcome: { key: "Information Collected" } },
    workflow: { canonicalMilestone: "INTERVIEW_RESULT_PENDING" },
    availableActions: []
  };

  assert(
    isWorkflowGateActive(gateContext.prospect, gateContext.agentState),
    "Conversation outcome must not suppress interview workflow gate"
  );

  const outcomeMissions = generateMissionsFromContext(gateContext);
  assert(
    outcomeMissions[0]?.missionType === MISSION_TYPES.ENTER_INTERVIEW_OUTCOME,
    "Rule 2 mission with conversation outcome + past interview"
  );
  assert(outcomeMissions[0]?.priority === MISSION_PRIORITIES.CRITICAL, "Rule 2 priority");

  console.log("✓ Mission Engine rules and workflow gate correctness");
}

async function verifyTenantIsolation() {
  const orgAProspects = await loadProductionProspects(ORG_A);
  assert(Array.isArray(orgAProspects), "Org A prospects load");

  try {
    await loadProductionProspects(ORG_B);
    console.log("✓ Org B query executed (may return zero rows)");
  } catch (error) {
    throw new Error(`Org-scoped prospect load failed: ${error.message}`);
  }

  const missionsA = await generateMissionsForOrganization(ORG_A);
  const orgAPhones = new Set(orgAProspects.map((row) => row.phone));

  for (const mission of missionsA) {
    assert(orgAPhones.has(mission.prospectId), "Mission prospect belongs to org A");
  }

  console.log(`✓ Mission queue tenant-scoped (${missionsA.length} missions for org A)`);
}

function verifyAgentActionApplicationService() {
  assert(typeof agentActionApplicationService.executeAgentAction === "function", "executeAgentAction exported");
  assert(typeof agentActionApplicationService.getMissionControlWithActions === "function", "getMissionControlWithActions exported");
  assert(typeof agentActionApplicationService.syncAgentWorkflow === "function", "syncAgentWorkflow exported");
  console.log("✓ Agent Action application service exported");
}

function verifyProductionValidation() {
  const previousEnv = process.env.NODE_ENV;
  const previousGoogleSecret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  const previousGoogleClient = process.env.GOOGLE_CLIENT_ID;

  try {
    process.env.NODE_ENV = "production";
    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    delete process.env.GOOGLE_OAUTH_STATE_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.ATLAS_JWT_SECRET;

    const missing = validateEnvironmentSecrets();
    assert(
      missing.some((entry) => entry.includes("GOOGLE_OAUTH_STATE_SECRET")),
      "Production rejects missing Google OAuth state secret when OAuth enabled"
    );
    assert(
      missing.some((entry) => entry.includes("JWT_SECRET")),
      "Production rejects missing JWT secret"
    );

    process.env.NODE_ENV = "production";
    let threw = false;

    try {
      forbidProductionInMemoryFallback("TestModule");
    } catch {
      threw = true;
    }

    assert(threw, "Production forbids in-memory repository fallback");
    console.log("✓ Production validation rejects missing secrets and in-memory fallback");
  } finally {
    process.env.NODE_ENV = previousEnv;

    if (previousGoogleSecret) {
      process.env.GOOGLE_OAUTH_STATE_SECRET = previousGoogleSecret;
    } else {
      delete process.env.GOOGLE_OAUTH_STATE_SECRET;
    }

    if (previousGoogleClient) {
      process.env.GOOGLE_CLIENT_ID = previousGoogleClient;
    } else {
      delete process.env.GOOGLE_CLIENT_ID;
    }
  }
}

function verifyBackendAuthorityDocs() {
  const dashboard = readRepoFile("frontend/src/pages/Dashboard.jsx");
  assert(
    dashboard.includes("buildQueueFromBackendWorkflowQueue"),
    "Dashboard uses backend workflow queue builder"
  );
  assert(
    dashboard.includes("workspace?.workflowGate?.active"),
    "Dashboard uses backend workflow gate"
  );
  console.log("✓ Dashboard consumes backend-authoritative queue and gate");
}

async function main() {
  console.log("=== Sprint 19 Platform Consolidation Verification ===\n");

  verifyNoCoreControllerImports();
  verifyNoMockQueueExtras();
  verifyMissionRules();
  verifyAgentActionApplicationService();
  verifyProductionValidation();
  verifyBackendAuthorityDocs();
  await verifyTenantIsolation();

  console.log("\n=== All Sprint 19 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗ FAIL:", error.message);
  process.exit(1);
});
