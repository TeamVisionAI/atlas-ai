/**
 * P0 Task 2 — Production caller compatibility for scoped prospect contracts.
 */

require("dotenv").config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ensureCoreProspectForLegacyLead,
  clearProspectBridgeCacheForTests
} = require("../core/recruitingProspectBridge");
const {
  registerRecruitingWorkflow,
  getRecruitingWorkflowDeps
} = require("../core/recruitingWorkflowRegistry");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const PHONE = "+17875550100";
const CORE_ID = "a257b152-43ea-401f-8de3-783b997013ff";

const orchestratorSource = fs.readFileSync(
  path.join(__dirname, "../core/recruitingWorkflowOrchestrator.js"),
  "utf8"
);
const bridgeSource = fs.readFileSync(
  path.join(__dirname, "../core/recruitingProspectBridge.js"),
  "utf8"
);

test("audit: orchestrator scopes findById and updateProspect by organizationId", () => {
  assert.match(orchestratorSource, /findById\(prospectId,\s*organizationId\)/);
  assert.match(
    orchestratorSource,
    /updateProspect\(\s*prospectId,\s*organizationId,\s*\{\s*lifecycleState/
  );
  assert.match(orchestratorSource, /if \(!prospectId \|\| !organizationId/);
  assert.doesNotMatch(orchestratorSource, /findById\(prospectId\)/);
});

test("audit: orchestrator lifecycle org sources are workflow context fields", () => {
  assert.match(orchestratorSource, /bridge\.organizationId/);
  assert.match(orchestratorSource, /legacyProspect\?\.organization_id \|\| legacyProspect\?\.organizationId/);
  assert.match(orchestratorSource, /prospect\?\.organization_id \|\| prospect\?\.organizationId/);
});

test("audit: bridge createProspect uses resolvedOrganizationId argument", () => {
  assert.match(bridgeSource, /createProspect\(\s*resolvedOrganizationId,/);
  assert.doesNotMatch(bridgeSource, /createProspect\(\s*\{/);
});

test("bridge: createProspect receives resolved org and no body organizationId", async () => {
  clearProspectBridgeCacheForTests();

  const calls = [];
  registerRecruitingWorkflow({
    prospectService: {
      createProspect: async (organizationId, input, actor) => {
        calls.push({ organizationId, input, actor });
        return {
          prospectId: CORE_ID,
          organizationId
        };
      }
    },
    businessEventService: { record: async () => ({}) },
    prospectRepository: {
      findAllByPhone: async () => []
    }
  });

  const result = await ensureCoreProspectForLegacyLead({
    phone: PHONE,
    displayName: "Bridge Lead",
    organizationId: ORG_A,
    listInOrg: async () => []
  });

  assert.equal(result.ok, true);
  assert.equal(result.organizationId, ORG_A);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].organizationId, ORG_A);
  assert.equal(calls[0].input.organizationId, undefined);
  assert.equal(calls[0].actor, "SYSTEM");
});

test("bridge: existing org match returns without createProspect", async () => {
  clearProspectBridgeCacheForTests();

  let createCalls = 0;
  registerRecruitingWorkflow({
    prospectService: {
      createProspect: async () => {
        createCalls += 1;
        throw new Error("createProspect should not be called");
      }
    },
    businessEventService: { record: async () => ({}) },
    prospectRepository: {
      findAllByPhone: async () => []
    }
  });

  const result = await ensureCoreProspectForLegacyLead({
    phone: PHONE,
    displayName: "Existing Lead",
    organizationId: ORG_A,
    listInOrg: async () => [{ prospectId: CORE_ID, organizationId: ORG_A }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.prospectId, CORE_ID);
  assert.equal(createCalls, 0);
});

function loadOrchestrator() {
  delete require.cache[require.resolve("../core/recruitingWorkflowOrchestrator")];
  return require("../core/recruitingWorkflowOrchestrator");
}

test("orchestrator: onMessageReceived skips lifecycle update without legacy org", async () => {
  const bridge = require("../core/recruitingProspectBridge");
  const originalFindCore = bridge.findCoreProspectIdByPhone;
  bridge.findCoreProspectIdByPhone = async () => CORE_ID;

  const supabaseService = require("../services/supabaseService");
  const originalFindProspect = supabaseService.findProspect;
  supabaseService.findProspect = async () => ({ phone: PHONE });

  const eventBridge = require("../core/recruitingBusinessEventBridge");
  const originalRecord = eventBridge.recordBusinessEvent;
  eventBridge.recordBusinessEvent = async () => null;

  const updateCalls = [];
  registerRecruitingWorkflow({
    prospectService: {
      updateProspect: async (...args) => {
        updateCalls.push(args);
        return {};
      }
    },
    businessEventService: { record: async () => ({}) },
    prospectRepository: {
      findById: async () => null
    }
  });

  const { onMessageReceived, clearAutonomousWorkflowStateForTests } = loadOrchestrator();

  try {
    await onMessageReceived({ phone: PHONE, message: "hola" });
    assert.equal(updateCalls.length, 0);
  } finally {
    supabaseService.findProspect = originalFindProspect;
    bridge.findCoreProspectIdByPhone = originalFindCore;
    eventBridge.recordBusinessEvent = originalRecord;
    clearAutonomousWorkflowStateForTests();
  }
});

test("orchestrator: onMessageReceived passes legacy org into scoped updateProspect", async () => {
  const bridge = require("../core/recruitingProspectBridge");
  const originalFindCore = bridge.findCoreProspectIdByPhone;
  bridge.findCoreProspectIdByPhone = async () => CORE_ID;

  const supabaseService = require("../services/supabaseService");
  const originalFindProspect = supabaseService.findProspect;
  supabaseService.findProspect = async () => ({
    phone: PHONE,
    organization_id: ORG_A
  });

  const eventBridge = require("../core/recruitingBusinessEventBridge");
  const originalRecord = eventBridge.recordBusinessEvent;
  eventBridge.recordBusinessEvent = async () => null;

  const updateCalls = [];
  registerRecruitingWorkflow({
    prospectService: {
      updateProspect: async (prospectId, organizationId, patch, actor) => {
        updateCalls.push({ prospectId, organizationId, patch, actor });
        return {};
      }
    },
    businessEventService: { record: async () => ({}) },
    prospectRepository: {
      findById: async () => null
    }
  });

  const { onMessageReceived, clearAutonomousWorkflowStateForTests } = loadOrchestrator();

  try {
    await onMessageReceived({ phone: PHONE, message: "hola" });
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].prospectId, CORE_ID);
    assert.equal(updateCalls[0].organizationId, ORG_A);
  } finally {
    supabaseService.findProspect = originalFindProspect;
    bridge.findCoreProspectIdByPhone = originalFindCore;
    eventBridge.recordBusinessEvent = originalRecord;
    clearAutonomousWorkflowStateForTests();
  }
});

test("registry: production deps remain registered shape after bridge test", () => {
  const deps = getRecruitingWorkflowDeps();
  assert.ok(deps);
  assert.ok(deps.prospectService);
});
