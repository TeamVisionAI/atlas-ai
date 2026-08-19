/**
 * Pass 3A — tenant-scoped WhatsApp semantic conversation engine path.
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

const QUAL_NOTES = "QUAL_CAPTURE:{\"city\":false,\"state\":false,\"authorization\":false,\"interviewType\":false,\"dayPart\":false,\"name\":false,\"email\":false,\"dayPartClarifyAttempts\":0}";

function greetingProspect(organizationId, overrides = {}) {
  return {
    id: organizationId === ORG_A ? "prospect-a" : "prospect-b",
    phone: PHONE,
    organization_id: organizationId,
    name: organizationId === ORG_A ? "Org A Lead" : "Org B Lead",
    current_step: "GREETING",
    notes: QUAL_NOTES,
    language: "en",
    communication_language: "en",
    ...overrides
  };
}

function buildOrgScopedProspectStore(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));

  return {
    rows,
    findProspectInOrganization: async (phone, organizationId) => {
      return (
        rows.find(
          (row) => row.phone === phone && String(row.organization_id) === String(organizationId)
        ) || null
      );
    },
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
      throw new Error("global findProspect must not be used on WhatsApp CE path");
    },
    createProspect: async () => {
      throw new Error("global createProspect must not be used on WhatsApp CE path");
    },
    updateProspect: async () => {
      throw new Error("global updateProspect must not be used on WhatsApp CE path");
    }
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

const CE_MODULES = [
  "../core/semanticConversationEngine",
  "../core/conversationEngine",
  "../core/communicationHub"
];

test("same phone in ORG_A and ORG_B loads only ORG_B prospect in semantic CE", async () => {
  const store = buildOrgScopedProspectStore([
    greetingProspect(ORG_A),
    greetingProspect(ORG_B)
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
    CE_MODULES
  );

  try {
    const { handleSemanticMessage } = require("../core/semanticConversationEngine");
    const reply = await handleSemanticMessage({
      phone: PHONE,
      name: "Org B Lead",
      message: "hello",
      organizationId: ORG_B,
      skipConversationLogging: true
    });

    assert.ok(reply);
    assert.equal(lookupCalls.length >= 1, true);
    assert.equal(lookupCalls.every((call) => call.organizationId === ORG_B), true);
    assert.equal(lookupCalls.some((call) => call.organizationId === ORG_A), false);
  } finally {
    patch.restore();
    reloadModules(CE_MODULES);
  }
});

test("semantic CE writes mutate only ORG_B when organizationId is ORG_B", async () => {
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
    CE_MODULES
  );

  try {
    const { handleSemanticMessage } = require("../core/semanticConversationEngine");
    await handleSemanticMessage({
      phone: PHONE,
      name: "Org B Lead",
      message: "Miami Florida",
      organizationId: ORG_B,
      skipConversationLogging: true
    });

    assert.ok(updateCalls.length >= 1);
    assert.equal(updateCalls.every((call) => call.organizationId === ORG_B), true);
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).city, undefined);
    assert.equal(store.rows.find((row) => row.organization_id === ORG_B).city, "Miami");
  } finally {
    patch.restore();
    reloadModules(CE_MODULES);
  }
});

test("missing organizationId fails closed with no read write or create", async () => {
  let readCalls = 0;
  let writeCalls = 0;
  let createCalls = 0;

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
      createProspect: async () => {
        createCalls += 1;
        throw new Error("global createProspect must not be used");
      },
      updateProspect: async () => {
        writeCalls += 1;
        throw new Error("global updateProspect must not be used");
      }
    },
    CE_MODULES
  );

  try {
    const { handleSemanticMessage } = require("../core/semanticConversationEngine");
    const reply = await handleSemanticMessage({
      phone: PHONE,
      name: "Missing Org",
      message: "hello",
      organizationId: null,
      skipConversationLogging: true
    });

    assert.equal(reply, "");
    assert.equal(readCalls, 0);
    assert.equal(writeCalls, 0);
    assert.equal(createCalls, 0);
  } finally {
    patch.restore();
    reloadModules(CE_MODULES);
  }
});

test("semantic CE does not create a prospect when tenant-scoped lookup misses", async () => {
  let createCalls = 0;

  const patch = patchSupabaseServiceExports(
    {
      findProspectInOrganization: async () => null,
      createProspect: async () => {
        createCalls += 1;
        throw new Error("global createProspect must not be used");
      },
      updateProspect: async () => {
        throw new Error("global updateProspect must not be used");
      },
      findProspect: async () => {
        throw new Error("global findProspect must not be used");
      }
    },
    CE_MODULES
  );

  try {
    const { handleSemanticMessage } = require("../core/semanticConversationEngine");
    const reply = await handleSemanticMessage({
      phone: PHONE,
      name: "Resolver Pending",
      message: "hello",
      organizationId: ORG_B,
      skipConversationLogging: true
    });

    assert.equal(reply, "");
    assert.equal(createCalls, 0);
  } finally {
    patch.restore();
    reloadModules(CE_MODULES);
  }
});

test("onConversationProgress receives organizationId from semantic CE", async () => {
  const store = buildOrgScopedProspectStore([greetingProspect(ORG_B)]);
  const patch = patchSupabaseServiceExports(store, CE_MODULES);
  const orchestrator = require("../core/recruitingWorkflowOrchestrator");
  const originalProgress = orchestrator.onConversationProgress;
  const progressCalls = [];

  orchestrator.onConversationProgress = async (input) => {
    progressCalls.push(input);
    return null;
  };

  try {
    const { handleSemanticMessage } = require("../core/semanticConversationEngine");
    await handleSemanticMessage({
      phone: PHONE,
      name: "Org B Lead",
      message: "hello",
      organizationId: ORG_B,
      skipConversationLogging: true
    });

    assert.equal(progressCalls.length, 1);
    assert.equal(progressCalls[0].phone, PHONE);
    assert.equal(progressCalls[0].organizationId, ORG_B);
  } finally {
    orchestrator.onConversationProgress = originalProgress;
    patch.restore();
    reloadModules(CE_MODULES);
  }
});

test("email progression writes stay tenant-scoped", async () => {
  const store = buildOrgScopedProspectStore([
    greetingProspect(ORG_A),
    {
      ...greetingProspect(ORG_B),
      current_step: "EMAIL",
      city: "Miami",
      state: "FL",
      work_authorized: true,
      interview_type: "In Person",
      appointment_date: "2026-08-10T17:15:00.000Z",
      notes: `${QUAL_NOTES}|EMAIL_PENDING|scheduling:${JSON.stringify({
        phase: "confirmed",
        dateKey: "2026-08-10",
        timeKey: "17:15"
      })}`
    }
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
    CE_MODULES
  );

  try {
    const { handleSemanticMessage } = require("../core/semanticConversationEngine");
    await handleSemanticMessage({
      phone: PHONE,
      name: "Org B Lead",
      message: "john@example.com",
      organizationId: ORG_B,
      skipConversationLogging: true
    });

    assert.ok(updateCalls.length >= 1);
    assert.equal(updateCalls.every((call) => call.organizationId === ORG_B), true);
    assert.equal(store.rows.find((row) => row.organization_id === ORG_A).notes, QUAL_NOTES);
  } finally {
    patch.restore();
    reloadModules(CE_MODULES);
  }
});

test("conversationEngine threads organizationId through handleIncomingMessage and finalizeReply", async () => {
  const store = buildOrgScopedProspectStore([greetingProspect(ORG_B)]);
  const lookupCalls = [];

  const patch = patchSupabaseServiceExports(
    {
      ...store,
      findProspectInOrganization: async (phone, organizationId) => {
        lookupCalls.push({ phone, organizationId, source: "lookup" });
        return store.findProspectInOrganization(phone, organizationId);
      }
    },
    CE_MODULES
  );

  const appointmentListService = require("../services/appointmentListService");
  const originalHandoff = appointmentListService.resolveRecruiterHandoffForProspect;
  appointmentListService.resolveRecruiterHandoffForProspect = async () => null;

  try {
    const conversationEngine = require("../core/conversationEngine");
    const result = await conversationEngine.handleIncomingMessage(
      PHONE,
      "Org B Lead",
      "hello",
      {
        organizationId: ORG_B,
        skipConversationLogging: true
      }
    );

    assert.ok(result.reply);
    assert.equal(lookupCalls.length >= 2, true);
    assert.equal(lookupCalls.every((call) => call.organizationId === ORG_B), true);
  } finally {
    appointmentListService.resolveRecruiterHandoffForProspect = originalHandoff;
    patch.restore();
    reloadModules(CE_MODULES);
  }
});

test("communicationHub passes resolved prospect organizationId into conversationEngine", async () => {
  reloadModules(["../core/communicationHub"]);
  const hub = require("../core/communicationHub");
  const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
  const conversationEngine = require("../core/conversationEngine");

  const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
  const originalHandle = conversationEngine.handleIncomingMessage;

  const capturedOptions = [];
  liveAuthoringBridge.attemptLiveV2Authoring = async () => ({
    authored: false,
    fallThrough: true,
    replyText: null,
    reason: "TEST_FALLTHROUGH"
  });
  conversationEngine.handleIncomingMessage = async (_phone, _name, _message, options) => {
    capturedOptions.push(options);
    return { reply: "scoped reply", handoff: null };
  };

  const outbound = require("../core/whatsappOutboundPipeline");
  const originalSend = outbound.sendAndPersistWhatsAppMessage;
  outbound.sendAndPersistWhatsAppMessage = async () => ({ success: true, simulated: true });

  try {
    await hub.processNormalizedInboundMessage(
      {
        phone: PHONE,
        text: "hello",
        channel: "whatsapp",
        providerMessageId: "wamid.pass3a"
      },
      {
        prospect: {
          ...greetingProspect(ORG_B),
          entry_method: "QR",
          source: "car_magnet"
        },
        env: {
          RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "false",
          RECRUIT_AI_V2_EXECUTION_ENABLED: "false"
        }
      }
    );

    assert.equal(capturedOptions.length, 1);
    assert.equal(capturedOptions[0].organizationId, ORG_B);
  } finally {
    liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
    conversationEngine.handleIncomingMessage = originalHandle;
    outbound.sendAndPersistWhatsAppMessage = originalSend;
    reloadModules(["../core/communicationHub", "../core/conversationEngine"]);
  }
});
