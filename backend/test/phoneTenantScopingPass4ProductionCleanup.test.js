/**
 * Pass 4 — production phone tenant cleanup (non-dev paths).
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
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";

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
      throw new Error("global findProspect must not be used on Pass 4 tenant path");
    },
    updateProspect: async () => {
      throw new Error("global updateProspect must not be used on Pass 4 tenant path");
    }
  };
}

function tenantProspect(organizationId, overrides = {}) {
  return {
    id: organizationId === ORG_A ? "prospect-a" : "prospect-b",
    phone: PHONE,
    organization_id: organizationId,
    owner_user_id: NIOVEL,
    name: organizationId === ORG_A ? "Org A Lead" : "Org B Lead",
    current_step: "CONFIRMED",
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

test("interview outcome initial load and reload stay in same organization", async () => {
  const store = buildOrgScopedProspectStore([
    tenantProspect(ORG_A, { current_step: "CONFIRMED" }),
    tenantProspect(ORG_B, { current_step: "CONFIRMED" })
  ]);
  const lookupCalls = [];

  const outcomeServicePath = require.resolve("../application/interviewOutcomeApplicationService");
  const supabaseService = require("../services/supabaseService");
  const humanAdvancementEngine = require("../core/humanAdvancementEngine");
  const logService = require("../services/logService");
  const productionProspectFilter = require("../core/productionProspectFilter");
  const resolverModule = require("../core/activeAppointmentResolver");

  const patch = patchSupabaseServiceExports(
    {
      ...store,
      findProspectInOrganization: async (phone, organizationId) => {
        lookupCalls.push({ phone, organizationId, phase: "lookup" });
        return store.findProspectInOrganization(phone, organizationId);
      }
    },
    [outcomeServicePath]
  );

  const originalAdvance = humanAdvancementEngine.advanceProspectWorkflow;
  const originalLog = logService.logConversation;
  const originalIsProductionProspect = productionProspectFilter.isProductionProspect;
  const originalFindActive = resolverModule.findActiveAppointmentForProspect;

  humanAdvancementEngine.advanceProspectWorkflow = async (_phone, payload) => {
    store.rows.find((row) => row.organization_id === ORG_B).current_step = "FOLLOW_UP";
    return {
      success: true,
      workflow: { canonicalMilestone: "FOLLOW_UP" },
      eventsEmitted: []
    };
  };
  logService.logConversation = async () => null;
  productionProspectFilter.isProductionProspect = () => true;
  resolverModule.findActiveAppointmentForProspect = async () => null;

  delete require.cache[outcomeServicePath];
  const { recordInterviewOutcome } = require(outcomeServicePath);

  try {
    const result = await recordInterviewOutcome({
      phone: PHONE,
      outcome: "Follow Up Needed",
      fields: { followUpDate: "2026-08-20" },
      organizationId: ORG_B,
      agentId: NIOVEL
    });

    assert.equal(result.success, true);
    assert.ok(lookupCalls.length >= 2);
    assert.equal(
      lookupCalls.every((call) => String(call.organizationId) === ORG_B),
      true
    );
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).current_step, "CONFIRMED");
  } finally {
    humanAdvancementEngine.advanceProspectWorkflow = originalAdvance;
    logService.logConversation = originalLog;
    productionProspectFilter.isProductionProspect = originalIsProductionProspect;
    resolverModule.findActiveAppointmentForProspect = originalFindActive;
    patch.restore();
    delete require.cache[outcomeServicePath];
  }
});

test("interview outcome fails closed without organizationId before prospect lookup", async () => {
  let lookupCalls = 0;
  const outcomeServicePath = require.resolve("../application/interviewOutcomeApplicationService");
  const patch = patchSupabaseServiceExports(
    {
      findProspectInOrganization: async () => {
        lookupCalls += 1;
        return null;
      }
    },
    [outcomeServicePath]
  );

  delete require.cache[outcomeServicePath];
  const { recordInterviewOutcome } = require(outcomeServicePath);

  try {
    const result = await recordInterviewOutcome({
      phone: PHONE,
      outcome: "Follow Up Needed",
      fields: { followUpDate: "2026-08-20" },
      organizationId: null
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "TENANT_ORGANIZATION_REQUIRED");
    assert.equal(lookupCalls, 0);
  } finally {
    patch.restore();
    delete require.cache[outcomeServicePath];
  }
});

test("recruiting orchestrator qualification lifecycle writes are org-scoped by prospectId + organizationId", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../core/recruitingWorkflowOrchestrator.js"),
    "utf8"
  );

  assert.match(
    source,
    /prospectService\.updateProspect\(\s*\n?\s*prospectId,\s*\n?\s*organizationId,/
  );
  assert.match(source, /resolveLegacyProspectInOrganization/);
  assert.match(source, /findProspectInOrganization/);
  assert.doesNotMatch(source, /DEFAULT_ORGANIZATION_ID/);
  assert.doesNotMatch(source, /findProspect[^I]/);
});

test("WhatsApp outbound tenant lookup resolves same-phone prospect in requested org only", async () => {
  const store = buildOrgScopedProspectStore([
    tenantProspect(ORG_A),
    tenantProspect(ORG_B, { name: "Org B Outbound" })
  ]);

  const patch = patchSupabaseServiceExports(store, ["../core/whatsappOutboundPipeline"]);
  const { resolveProspectForOutbound } = require("../core/whatsappOutboundPipeline");

  try {
    const scoped = await resolveProspectForOutbound(PHONE, ORG_B);
    const missingOrg = await resolveProspectForOutbound(PHONE, null);
    const foreign = await resolveProspectForOutbound(PHONE, ORG_A);

    assert.equal(scoped?.organization_id, ORG_B);
    assert.equal(scoped?.name, "Org B Outbound");
    assert.equal(missingOrg, null);
    assert.equal(foreign?.organization_id, ORG_A);
    assert.notEqual(foreign?.id, scoped?.id);
  } finally {
    patch.restore();
    delete require.cache[require.resolve("../core/whatsappOutboundPipeline")];
  }
});

test("Conversations Center scoped prospect read cannot load foreign same-phone row", async () => {
  const store = buildOrgScopedProspectStore([
    tenantProspect(ORG_A),
    tenantProspect(ORG_B, { owner_user_id: NIOVEL })
  ]);
  const { isProspectInNiovelPilotScope } = require("../core/conversationsCenter/conversationsCenterAccess");

  const patch = patchSupabaseServiceExports(store);

  async function loadScopedProspect(phone, organizationId) {
    if (!phone || !organizationId) {
      return null;
    }

    const prospect = await store.findProspectInOrganization(phone, organizationId);
    if (!prospect || !isProspectInNiovelPilotScope(prospect)) {
      return null;
    }
    return prospect;
  }

  try {
    const ownTenant = await loadScopedProspect(PHONE, ORG_A);
    const foreignTenant = await loadScopedProspect(PHONE, ORG_B);
    const missingOrg = await loadScopedProspect(PHONE, null);

    assert.equal(ownTenant?.organization_id, ORG_A);
    assert.equal(foreignTenant, null);
    assert.equal(missingOrg, null);
  } finally {
    patch.restore();
  }
});

test("Pass 4 production files avoid global prospect ops and DEFAULT_ORGANIZATION_ID", () => {
  const files = [
    "../application/interviewOutcomeApplicationService.js",
    "../core/whatsappOutboundPipeline.js",
    "../routes/conversationsCenter.js"
  ];

  for (const relativePath of files) {
    const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
    assert.doesNotMatch(source, /DEFAULT_ORGANIZATION_ID/);
    assert.doesNotMatch(
      source,
      /\bfindProspect\s*\(/,
      `${relativePath} must not call global findProspect`
    );
    assert.doesNotMatch(
      source,
      /\bupdateProspect\s*\(/,
      `${relativePath} must not call global updateProspect`
    );
    assert.match(source, /findProspectInOrganization/);
  }
});

test("memoryUpdater has no production callers and remains dead-code backlog", () => {
  const backendRoot = path.join(__dirname, "..");
  const skipDirs = new Set(["node_modules", "dev", "test"]);
  const hits = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(entry.name)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".js")) {
        continue;
      }
      if (fullPath.endsWith("memoryUpdater.js")) {
        continue;
      }
      const source = fs.readFileSync(fullPath, "utf8");
      if (/require\(.+memoryUpdater/.test(source) || /memoryUpdater/.test(source)) {
        hits.push(path.relative(backendRoot, fullPath));
      }
    }
  }

  walk(backendRoot);

  assert.deepEqual(hits, []);
  assert.match(
    fs.readFileSync(path.join(backendRoot, "services/memoryUpdater.js"), "utf8"),
    /updateProspect\(phone, updates\)/
  );
});
