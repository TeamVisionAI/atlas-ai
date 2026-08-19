/**
 * Pass 3C — tenant-scoped V2 legacy sync and agent action prospect writes.
 */

require("dotenv").config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const PHONE = "+17865551234";
const CORE_B = "c3333333-3333-4333-8333-333333333333";

const { ACTION_IDS } = require("../core/agentActionEngine");
const { processRecruitAiV2Turn } = require("../core/recruitAiV2/orchestrator");

function buildOrgScopedProspectStore(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));

  return {
    rows,
    findProspectInOrganization: async (phone, organizationId) =>
      rows.find(
        (row) => row.phone === phone && String(row.organization_id) === String(organizationId)
      ) || null,
    updateProspectInOrganization: async (phone, organizationId, updates) => {
      const index = rows.findIndex(
        (row) => row.phone === phone && String(row.organization_id) === String(organizationId)
      );
      if (index === -1) {
        return null;
      }
      rows[index] = { ...rows[index], ...updates };
      return { ...rows[index] };
    },
    findProspect: async () => {
      throw new Error("global findProspect must not be used on Pass 3C tenant path");
    },
    updateProspect: async () => {
      throw new Error("global updateProspect must not be used on Pass 3C tenant path");
    }
  };
}

function tenantProspect(organizationId, overrides = {}) {
  return {
    id: organizationId === ORG_A ? "prospect-a" : "prospect-b",
    phone: PHONE,
    organization_id: organizationId,
    name: organizationId === ORG_A ? "Org A Lead" : "Org B Lead",
    current_step: "QUALIFICATION",
    notes: null,
    city: null,
    state: null,
    work_authorized: null,
    language: "en",
    ...overrides
  };
}

function patchSupabaseServiceExports(overrides, modulePaths = []) {
  const servicePath = require.resolve("../services/supabaseService");
  const original = require(servicePath);

  for (const modulePath of modulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }

  require.cache[servicePath].exports = {
    ...original,
    ...overrides
  };

  return {
    restore() {
      require.cache[servicePath].exports = original;
      for (const modulePath of modulePaths) {
        delete require.cache[require.resolve(modulePath)];
      }
    }
  };
}

function buildQualificationContext(organizationId) {
  return {
    organizationId,
    prospectId: CORE_B,
    prospectPhone: PHONE,
    legacyProspectId: "prospect-b",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    },
    conversation: { lastOfferMade: null, lastAtlasOutboundText: null },
    appointment: { status: "none" },
    currentStage: "qualification",
    timezone: "America/New_York",
    _persistence: { contextVersion: 1 }
  };
}

test("V2 default legacy load uses authoritative organizationId only", async () => {
  const store = buildOrgScopedProspectStore([
    tenantProspect(ORG_A),
    tenantProspect(ORG_B)
  ]);
  const lookupCalls = [];

  const patch = patchSupabaseServiceExports(
    {
      ...store,
      findProspectInOrganization: async (phone, organizationId) => {
        lookupCalls.push({ phone, organizationId });
        return store.findProspectInOrganization(phone, organizationId);
      }
    },
    ["../core/recruitAiV2/orchestrator"]
  );

  try {
    await processRecruitAiV2Turn({
      message: { text: "Miami Florida", type: "text" },
      context: buildQualificationContext(ORG_B),
      options: {
        organizationId: ORG_B,
        prospectPhone: PHONE,
        legacyProspectId: "prospect-b"
      },
      persistenceService: {
        compareAndSaveContext: async ({ nextContext }) => ({
          ok: true,
          context: nextContext
        })
      }
    });

    assert.ok(lookupCalls.length > 0);
    assert.equal(
      lookupCalls.every((call) => String(call.organizationId) === ORG_B),
      true
    );
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).city, null);
  } finally {
    patch.restore();
  }
});

test("V2 qualification sync updates ORG_B only and leaves ORG_A unchanged", async () => {
  const store = buildOrgScopedProspectStore([
    tenantProspect(ORG_A),
    tenantProspect(ORG_B)
  ]);
  const updateCalls = [];

  const patch = patchSupabaseServiceExports(
    {
      ...store,
      updateProspectInOrganization: async (phone, organizationId, updates) => {
        updateCalls.push({ phone, organizationId, updates });
        return store.updateProspectInOrganization(phone, organizationId, updates);
      }
    },
    ["../core/recruitAiV2/orchestrator"]
  );

  try {
    await processRecruitAiV2Turn({
      message: { text: "Miami Florida", type: "text" },
      context: buildQualificationContext(ORG_B),
      options: {
        organizationId: ORG_B,
        prospectPhone: PHONE,
        legacyProspectId: "prospect-b"
      },
      persistenceService: {
        compareAndSaveContext: async ({ nextContext }) => ({
          ok: true,
          context: nextContext
        })
      }
    });

    assert.ok(updateCalls.length > 0);
    assert.equal(
      updateCalls.every((call) => String(call.organizationId) === ORG_B),
      true
    );
    assert.equal(store.rows.find((row) => row.organization_id === ORG_B).city, "Miami");
    assert.equal(store.rows.find((row) => row.organization_id === ORG_B).state, "FL");
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).city, null);
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).state, null);
  } finally {
    patch.restore();
  }
});

test("V2 missing organizationId skips legacy read/write during qualification sync", async () => {
  let scopedReads = 0;
  let scopedWrites = 0;

  const patch = patchSupabaseServiceExports(
    {
      findProspectInOrganization: async () => {
        scopedReads += 1;
        return null;
      },
      updateProspectInOrganization: async () => {
        scopedWrites += 1;
        return null;
      },
      findProspect: async () => {
        throw new Error("global findProspect must not be used");
      },
      updateProspect: async () => {
        throw new Error("global updateProspect must not be used");
      }
    },
    ["../core/recruitAiV2/orchestrator"]
  );

  try {
    await processRecruitAiV2Turn({
      message: { text: "Miami Florida", type: "text" },
      context: {
        ...buildQualificationContext(null),
        organizationId: null
      },
      options: {
        organizationId: null,
        prospectPhone: PHONE
      },
      persistenceService: {
        compareAndSaveContext: async ({ nextContext }) => ({
          ok: true,
          context: nextContext
        })
      }
    });

    assert.equal(scopedReads, 0);
    assert.equal(scopedWrites, 0);
  } finally {
    patch.restore();
  }
});

test("agent RESCHEDULE prospect mutation is scoped to organizationId", async () => {
  const store = buildOrgScopedProspectStore([
    tenantProspect(ORG_A, { current_step: "CONFIRMED", notes: "QUAL_CAPTURE:{}" }),
    tenantProspect(ORG_B, { current_step: "CONFIRMED", notes: "QUAL_CAPTURE:{}" })
  ]);
  const updateCalls = [];
  const logService = require("../services/logService");
  const originalLog = logService.logConversation;
  logService.logConversation = async () => null;

  const patch = patchSupabaseServiceExports(
    {
      ...store,
      updateProspectInOrganization: async (phone, organizationId, updates) => {
        updateCalls.push({ phone, organizationId, updates });
        return store.updateProspectInOrganization(phone, organizationId, updates);
      }
    },
    ["../application/agentActionApplicationService"]
  );

  const { executeAgentAction } = require("../application/agentActionApplicationService");

  try {
    const result = await executeAgentAction(PHONE, ACTION_IDS.RESCHEDULE, {}, {
      organizationId: ORG_B,
      tenantScoped: true
    });

    assert.equal(result.success, true);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].organizationId, ORG_B);
    assert.equal(store.rows.find((row) => row.organization_id === ORG_B).current_step, "SCHEDULE");
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).current_step, "CONFIRMED");
  } finally {
    logService.logConversation = originalLog;
    patch.restore();
    delete require.cache[require.resolve("../application/agentActionApplicationService")];
  }
});

test("agent SCHEDULE prospect mutation is scoped to organizationId", async () => {
  const store = buildOrgScopedProspectStore([
    tenantProspect(ORG_A, { current_step: "QUALIFICATION" }),
    tenantProspect(ORG_B, { current_step: "QUALIFICATION" })
  ]);
  const updateCalls = [];
  const logService = require("../services/logService");
  const originalLog = logService.logConversation;
  logService.logConversation = async () => null;

  const patch = patchSupabaseServiceExports(
    {
      ...store,
      updateProspectInOrganization: async (phone, organizationId, updates) => {
        updateCalls.push({ phone, organizationId, updates });
        return store.updateProspectInOrganization(phone, organizationId, updates);
      }
    },
    ["../application/agentActionApplicationService"]
  );

  const { executeAgentAction } = require("../application/agentActionApplicationService");

  try {
    const result = await executeAgentAction(PHONE, ACTION_IDS.SCHEDULE, {}, {
      organizationId: ORG_B,
      tenantScoped: true
    });

    assert.equal(result.success, true);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].organizationId, ORG_B);
    assert.equal(store.rows.find((row) => row.organization_id === ORG_B).current_step, "SCHEDULE");
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).current_step, "QUALIFICATION");
  } finally {
    logService.logConversation = originalLog;
    patch.restore();
    delete require.cache[require.resolve("../application/agentActionApplicationService")];
  }
});

test("agent executeAgentAction fails closed without organizationId", async () => {
  const store = buildOrgScopedProspectStore([tenantProspect(ORG_B)]);
  let updateCalls = 0;

  const patch = patchSupabaseServiceExports(
    {
      ...store,
      updateProspectInOrganization: async () => {
        updateCalls += 1;
        return null;
      }
    },
    ["../application/agentActionApplicationService"]
  );

  const { executeAgentAction } = require("../application/agentActionApplicationService");

  try {
    const result = await executeAgentAction(PHONE, ACTION_IDS.SCHEDULE, {}, {
      organizationId: null,
      tenantScoped: true
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "TENANT_ORGANIZATION_REQUIRED");
    assert.equal(updateCalls, 0);
  } finally {
    patch.restore();
    delete require.cache[require.resolve("../application/agentActionApplicationService")];
  }
});

test("getMissionControlWithActions passes organizationId to onConversationProgress", async () => {
  const orchestrator = require("../core/recruitingWorkflowOrchestrator");
  const missionControlReadModel = require("../core/missionControlReadModel");
  const logService = require("../services/logService");

  const captured = [];
  const originalProgress = orchestrator.onConversationProgress;
  const originalMc = missionControlReadModel.getMissionControlState;
  const originalLog = logService.logConversation;

  orchestrator.onConversationProgress = async (payload) => {
    captured.push(payload);
    return null;
  };
  logService.logConversation = async () => null;
  missionControlReadModel.getMissionControlState = async () => ({
    prospect: {
      phone: PHONE,
      id: "prospect-b",
      organization_id: ORG_B,
      name: "Org B Lead",
      current_step: "QUALIFICATION"
    },
    brain: {
      currentStep: "QUALIFICATION",
      missingFields: ["city"],
      interviewType: null
    }
  });

  const store = buildOrgScopedProspectStore([tenantProspect(ORG_B)]);
  const patch = patchSupabaseServiceExports(store, [
    "../application/agentActionApplicationService"
  ]);

  const { getMissionControlWithActions } = require("../application/agentActionApplicationService");

  try {
    await getMissionControlWithActions(PHONE, {
      organizationId: ORG_B,
      tenantScoped: true
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].phone, PHONE);
    assert.equal(captured[0].organizationId, ORG_B);
  } finally {
    orchestrator.onConversationProgress = originalProgress;
    missionControlReadModel.getMissionControlState = originalMc;
    logService.logConversation = originalLog;
    patch.restore();
    delete require.cache[require.resolve("../application/agentActionApplicationService")];
  }
});

test("Pass 3C production files avoid global prospect ops and DEFAULT_ORGANIZATION_ID", () => {
  const files = [
    "../core/recruitAiV2/orchestrator.js",
    "../application/agentActionApplicationService.js"
  ];

  for (const relativePath of files) {
    const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
    assert.doesNotMatch(source, /DEFAULT_ORGANIZATION_ID/);
    assert.doesNotMatch(
      source,
      /\bupdateProspect\s*\(/,
      `${relativePath} must not call global updateProspect`
    );
    assert.doesNotMatch(
      source,
      /\bfindProspect\s*\(/,
      `${relativePath} must not call global findProspect`
    );
    assert.match(source, /findProspectInOrganization|updateProspectInOrganization/);
  }
});
