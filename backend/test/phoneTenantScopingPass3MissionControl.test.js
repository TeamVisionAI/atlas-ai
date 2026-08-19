/**
 * Pass 3B — tenant-scoped Mission Control / human advancement prospect operations.
 */

require("dotenv").config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const PHONE = "+17865551234";

const { MILESTONES } = require("../core/workflowConstants");
const { postRequiredInformation } = require("../controllers/requiredInformationController");
const { postWorkflowAdvance } = require("../controllers/workflowAdvanceController");

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
      throw new Error("global findProspect must not be used on Mission Control path");
    },
    updateProspect: async () => {
      throw new Error("global updateProspect must not be used on Mission Control path");
    },
    createProspect: async () => {
      throw new Error("global createProspect must not be used on Mission Control path");
    }
  };
}

function greetingProspect(organizationId, overrides = {}) {
  return {
    id: organizationId === ORG_A ? "prospect-a" : "prospect-b",
    phone: PHONE,
    organization_id: organizationId,
    name: organizationId === ORG_A ? "Org A Lead" : "Org B Lead",
    first_name: organizationId === ORG_A ? "Org" : "Org",
    last_name: organizationId === ORG_A ? "A" : "B",
    current_step: "QUALIFICATION",
    notes: null,
    city: null,
    state: null,
    work_authorized: null,
    preferred_language: "english",
    language: "en",
    communication_language: "en",
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

function reloadModules(modulePaths) {
  for (const modulePath of modulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }
}

const MC_MODULES = [
  "../core/conversationOutcomeEngine",
  "../core/humanAdvancementEngine",
  "../controllers/conversationOutcomeController",
  "../controllers/requiredInformationController",
  "../controllers/workflowAdvanceController"
];

function stubMissionControlSideEffects() {
  const logService = require("../services/logService");
  const agentActionController = require("../controllers/agentActionController");
  const originalLog = logService.logConversation;
  const originalMc = agentActionController.getMissionControlWithActions;

  logService.logConversation = async () => ({ success: true, skipped: true });
  agentActionController.getMissionControlWithActions = async () => ({
    brain: { currentStep: "QUALIFICATION", missingFields: [] },
    workflow: { canonicalMilestone: "QUALIFICATION" }
  });

  return {
    restore() {
      logService.logConversation = originalLog;
      agentActionController.getMissionControlWithActions = originalMc;
    }
  };
}

function stubHumanAdvancementDependencies(prospect) {
  const milestoneValidation = require("../core/milestoneValidationEngine");
  const humanAdvancementEvents = require("../core/humanAdvancementEvents");
  const missionControlReadModel = require("../core/missionControlReadModel");
  const workflowReadModel = require("../core/workflowReadModel");
  const { buildProfileFromProspect } = require("../core/informationModel");

  const originalValidate = milestoneValidation.validateMilestoneAdvancement;
  const originalEmit = humanAdvancementEvents.emitHumanAdvancementEvents;
  const originalMc = missionControlReadModel.getMissionControlState;
  const originalHints = workflowReadModel.fetchMessageHints;
  const originalBuildWorkflow = workflowReadModel.buildWorkflowReadModel;

  milestoneValidation.validateMilestoneAdvancement = ({
    prospect: currentProspect,
    capturedFields
  }) => ({
    valid: true,
    mergedProfile: {
      ...buildProfileFromProspect(currentProspect),
      authorization:
        capturedFields.authorization !== undefined
          ? capturedFields.authorization
          : buildProfileFromProspect(currentProspect).authorization,
      interviewType:
        capturedFields.interviewType || buildProfileFromProspect(currentProspect).interviewType,
      city: capturedFields.city || buildProfileFromProspect(currentProspect).city,
      state: capturedFields.state || buildProfileFromProspect(currentProspect).state
    }
  });
  humanAdvancementEvents.emitHumanAdvancementEvents = async () => [];
  missionControlReadModel.getMissionControlState = async () => ({
    brain: { currentStep: prospect.current_step, missingFields: [] }
  });
  workflowReadModel.fetchMessageHints = async () => ({});
  workflowReadModel.buildWorkflowReadModel = async () => ({
    canonicalMilestone: "QUALIFICATION",
    workflowOwnership: "AGENT"
  });

  return {
    restore() {
      milestoneValidation.validateMilestoneAdvancement = originalValidate;
      humanAdvancementEvents.emitHumanAdvancementEvents = originalEmit;
      missionControlReadModel.getMissionControlState = originalMc;
      workflowReadModel.fetchMessageHints = originalHints;
      workflowReadModel.buildWorkflowReadModel = originalBuildWorkflow;
    }
  };
}

test("Mission Control required-information save in ORG_A touches ORG_A only", async () => {
  const store = buildOrgScopedProspectStore([
    greetingProspect(ORG_A),
    greetingProspect(ORG_B)
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
    MC_MODULES
  );
  const sideEffects = stubMissionControlSideEffects();
  const stubs = stubHumanAdvancementDependencies(greetingProspect(ORG_A));
  reloadModules(["../controllers/requiredInformationController"]);

  try {
    const { postRequiredInformation: postRequiredInformationReloaded } = require("../controllers/requiredInformationController");
    const result = await postRequiredInformationReloaded(
      PHONE,
      {
        fields: {
          city: "Miami",
          state: "FL",
          work_authorization_status: "work_permit",
          interview_type: "zoom"
        }
      },
      { organizationId: ORG_A }
    );

    assert.equal(result.success, true);
    assert.ok(updateCalls.length >= 1);
    assert.equal(updateCalls.every((call) => call.organizationId === ORG_A), true);
    assert.equal(store.rows.find((row) => row.organization_id === ORG_B).city, null);
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).city, "Miami");
  } finally {
    stubs.restore();
    sideEffects.restore();
    patch.restore();
    reloadModules(MC_MODULES);
  }
});

test("saveConversationOutcome mutates only the tenant-scoped prospect row", async () => {
  const store = buildOrgScopedProspectStore([
    greetingProspect(ORG_A, { city: "Tampa", state: "FL", work_authorized: true }),
    greetingProspect(ORG_B, { city: "Orlando", state: "FL", work_authorized: true })
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
    MC_MODULES
  );
  const sideEffects = stubMissionControlSideEffects();
  const stubs = stubHumanAdvancementDependencies(
    greetingProspect(ORG_A, { city: "Tampa", state: "FL", work_authorized: true })
  );

  try {
    const { saveConversationOutcome } = require("../core/conversationOutcomeEngine");
    const result = await saveConversationOutcome(
      PHONE,
      { outcome: "Interested" },
      { organizationId: ORG_A }
    );

    assert.equal(result.success, true);
    if (updateCalls.length) {
      assert.equal(updateCalls.every((call) => call.organizationId === ORG_A), true);
    }
    assert.equal(store.rows.find((row) => row.organization_id === ORG_B).city, "Orlando");
  } finally {
    stubs.restore();
    sideEffects.restore();
    patch.restore();
    reloadModules(MC_MODULES);
  }
});

test("saveRequiredInformation ignores foreign same-phone row", async () => {
  const store = buildOrgScopedProspectStore([
    greetingProspect(ORG_A),
    greetingProspect(ORG_B, { city: "Foreign City", state: "FL" })
  ]);

  const patch = patchSupabaseServiceExports(store, MC_MODULES);
  const sideEffects = stubMissionControlSideEffects();
  const stubs = stubHumanAdvancementDependencies(greetingProspect(ORG_A));

  try {
    const { saveRequiredInformation } = require("../core/conversationOutcomeEngine");
    await saveRequiredInformation(
      PHONE,
      {
        fields: {
          city: "Miami",
          state: "FL",
          work_authorization_status: "work_permit",
          interview_type: "zoom"
        }
      },
      { organizationId: ORG_A }
    );

    assert.equal(store.rows.find((row) => row.organization_id === ORG_B).city, "Foreign City");
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).city, "Miami");
  } finally {
    stubs.restore();
    sideEffects.restore();
    patch.restore();
    reloadModules(MC_MODULES);
  }
});

test("advanceProspectWorkflow loads and updates only the requested organization", async () => {
  const store = buildOrgScopedProspectStore([
    greetingProspect(ORG_A, { city: "Tampa", state: "FL", work_authorized: true }),
    greetingProspect(ORG_B, { city: "Orlando", state: "FL", work_authorized: true })
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
    MC_MODULES
  );
  const sideEffects = stubMissionControlSideEffects();
  const stubs = stubHumanAdvancementDependencies(
    greetingProspect(ORG_A, { city: "Tampa", state: "FL", work_authorized: true })
  );

  try {
    const { advanceProspectWorkflow } = require("../core/humanAdvancementEngine");
    const result = await advanceProspectWorkflow(PHONE, {
      organizationId: ORG_A,
      targetMilestone: MILESTONES.QUALIFICATION,
      capturedFields: { city: "Miami", state: "FL" },
      interactionNotes: "Updated city",
      interactionType: "phone"
    });

    assert.equal(result.success, true);
    assert.equal(lookupCalls.every((call) => call.organizationId === ORG_A), true);
    assert.equal(store.rows.find((row) => row.organization_id === ORG_B).city, "Orlando");
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).city, "Miami");
  } finally {
    stubs.restore();
    sideEffects.restore();
    patch.restore();
    reloadModules(MC_MODULES);
  }
});

test("controllers pass organizationId from options and ignore body organizationId", async () => {
  const store = buildOrgScopedProspectStore([
    greetingProspect(ORG_A, { city: "Tampa", state: "FL", work_authorized: true })
  ]);
  const capturedPayloads = [];

  const patch = patchSupabaseServiceExports(store, MC_MODULES);
  const sideEffects = stubMissionControlSideEffects();
  const stubs = stubHumanAdvancementDependencies(
    greetingProspect(ORG_A, { city: "Tampa", state: "FL", work_authorized: true })
  );
  reloadModules(["../controllers/workflowAdvanceController"]);

  const humanAdvancementEngine = require("../core/humanAdvancementEngine");
  const originalAdvance = humanAdvancementEngine.advanceProspectWorkflow;
  humanAdvancementEngine.advanceProspectWorkflow = async (phone, payload) => {
    capturedPayloads.push(payload);
    return originalAdvance.call(humanAdvancementEngine, phone, payload);
  };

  try {
    const { postWorkflowAdvance: postWorkflowAdvanceReloaded } = require("../controllers/workflowAdvanceController");
    await postWorkflowAdvanceReloaded(
      PHONE,
      {
        organizationId: ORG_B,
        targetMilestone: MILESTONES.QUALIFICATION,
        capturedFields: { city: "Miami", state: "FL" }
      },
      { organizationId: ORG_A }
    );

    assert.equal(capturedPayloads.length, 1);
    assert.equal(capturedPayloads[0].organizationId, ORG_A);
  } finally {
    humanAdvancementEngine.advanceProspectWorkflow = originalAdvance;
    stubs.restore();
    sideEffects.restore();
    patch.restore();
    reloadModules(MC_MODULES);
  }
});

test("missing organizationId fails closed with no read write or advance", async () => {
  let readCalls = 0;
  let writeCalls = 0;
  let advanceCalls = 0;

  const patch = patchSupabaseServiceExports(
    {
      findProspectInOrganization: async () => {
        readCalls += 1;
        return null;
      },
      updateProspectInOrganization: async () => {
        writeCalls += 1;
        return null;
      },
      findProspect: async () => {
        readCalls += 1;
        throw new Error("global findProspect must not be used");
      },
      updateProspect: async () => {
        writeCalls += 1;
        throw new Error("global updateProspect must not be used");
      }
    },
    MC_MODULES
  );

  const humanAdvancementEngine = require("../core/humanAdvancementEngine");
  const originalAdvance = humanAdvancementEngine.advanceProspectWorkflow;
  humanAdvancementEngine.advanceProspectWorkflow = async () => {
    advanceCalls += 1;
    return { success: true };
  };

  try {
    const { saveConversationOutcome, saveRequiredInformation } = require("../core/conversationOutcomeEngine");

    const outcome = await saveConversationOutcome(PHONE, { outcome: "Interested" }, {});
    const required = await saveRequiredInformation(
      PHONE,
      { fields: { city: "Miami", state: "FL" } },
      {}
    );
    const advance = await postWorkflowAdvance(
      PHONE,
      { targetMilestone: MILESTONES.QUALIFICATION },
      {}
    );

    assert.equal(outcome.success, false);
    assert.equal(outcome.error, "TENANT_ORGANIZATION_REQUIRED");
    assert.equal(required.success, false);
    assert.equal(required.error, "TENANT_ORGANIZATION_REQUIRED");
    assert.equal(advance.success, false);
    assert.equal(advance.error, "TENANT_ORGANIZATION_REQUIRED");
    assert.equal(readCalls, 0);
    assert.equal(writeCalls, 0);
    assert.equal(advanceCalls, 0);
  } finally {
    humanAdvancementEngine.advanceProspectWorkflow = originalAdvance;
    patch.restore();
    reloadModules(MC_MODULES);
  }
});

test("wrong-tenant prospect lookup returns not found", async () => {
  const store = buildOrgScopedProspectStore([greetingProspect(ORG_A)]);

  const patch = patchSupabaseServiceExports(store, MC_MODULES);

  try {
    const { saveConversationOutcome } = require("../core/conversationOutcomeEngine");
    const result = await saveConversationOutcome(
      PHONE,
      { outcome: "Interested" },
      { organizationId: ORG_B }
    );

    assert.equal(result.success, false);
    assert.equal(result.error, "PROSPECT_NOT_FOUND");
  } finally {
    patch.restore();
    reloadModules(MC_MODULES);
  }
});
