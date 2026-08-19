/**
 * Pass 2 — tenant-scoped legacy prospect phone READ/resolution paths.
 */

require("dotenv").config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COMMUNICATION_EVENTS
} = require("../modules/business-events/domain/EventTypes");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const PHONE = "+17865551234";
const CORE_B = "c2222222-2222-4222-8222-222222222222";

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

test("WhatsApp resolver scopes existing-prospect lookup to resolved organization", async () => {
  const resolver = require("../core/whatsappProspectResolver");
  const supabaseService = require("../services/supabaseService");
  const quickCapture = require("../core/quickCaptureEngine");
  const orgResolver = require("../core/whatsappInboundOrganizationResolver");

  const orgAProspect = {
    id: "foreign-a",
    phone: PHONE,
    organization_id: ORG_A,
    name: "Foreign A"
  };
  const orgBProspect = {
    id: "target-b",
    phone: PHONE,
    organization_id: ORG_B,
    name: "Target B",
    prospect_number: "TV-B"
  };

  const lookupCalls = [];
  const originalUpdate = supabaseService.updateProspectInOrganization;

  quickCapture.findProspectByNormalizedPhone = async (phone, organizationId) => {
    lookupCalls.push({ source: "quickCapture", phone, organizationId });
    return organizationId === ORG_B ? orgBProspect : null;
  };
  supabaseService.findProspectByNormalizedPhoneInOrganization = async (phone, organizationId) => {
    lookupCalls.push({ source: "normalizedInOrg", phone, organizationId });
    return organizationId === ORG_B ? orgBProspect : null;
  };
  supabaseService.findProspectInOrganization = async (phone, organizationId) => {
    lookupCalls.push({ source: "findInOrg", phone, organizationId });
    if (organizationId === ORG_B) {
      return orgBProspect;
    }
    if (organizationId === ORG_A) {
      return orgAProspect;
    }
    return null;
  };
  supabaseService.findProspect = async () => {
    throw new Error("global findProspect must not be used for inbound resolution");
  };
  supabaseService.updateProspectInOrganization = async (phone, organizationId, updates) => ({
    ...orgBProspect,
    ...updates,
    organization_id: organizationId
  });
  orgResolver.resolveWhatsAppInboundOrganizationId = async () => ({
    organizationId: ORG_B,
    source: "explicit"
  });
  resolver.setQrAttributionServiceForTests({
    matchEligiblePendingInboundScan: async () => ({
      ok: false,
      outcome: "MISS",
      reasonCode: "NO_PENDING_SCAN",
      scan: null,
      campaign: null
    }),
    buildAttributionTouch: () => null,
    consumeMatchedScan: async () => ({ ok: true })
  });

  try {
    const result = await resolver.locateOrCreateWhatsAppProspect({
      phone: "7865551234",
      name: "Target B",
      firstMessage: "hello org b",
      correlationBase: "corr-pass2-read",
      organizationId: ORG_B
    });

    assert.equal(result.created, false);
    assert.equal(result.organizationId, ORG_B);
    assert.equal(result.prospect.id, "target-b");
    assert.ok(lookupCalls.every((call) => call.organizationId === ORG_B));
    assert.equal(lookupCalls.some((call) => call.organizationId === ORG_A), false);
  } finally {
    supabaseService.updateProspectInOrganization = originalUpdate;
    resolver.setQrAttributionServiceForTests(null);
  }
});

test("WhatsApp inbound to ORG_B treats same phone in ORG_A as not found", async () => {
  const resolver = require("../core/whatsappProspectResolver");
  const supabaseService = require("../services/supabaseService");
  const quickCapture = require("../core/quickCaptureEngine");
  const orgResolver = require("../core/whatsappInboundOrganizationResolver");

  const lookupCalls = [];

  quickCapture.findProspectByNormalizedPhone = async (phone, organizationId) => {
    lookupCalls.push({ source: "quickCapture", phone, organizationId });
    return organizationId === ORG_A
      ? { id: "a-only", phone: PHONE, organization_id: ORG_A, name: "Org A Only" }
      : null;
  };
  supabaseService.findProspectByNormalizedPhoneInOrganization = async (phone, organizationId) => {
    lookupCalls.push({ source: "normalizedInOrg", phone, organizationId });
    return organizationId === ORG_A
      ? { id: "a-only", phone: PHONE, organization_id: ORG_A, name: "Org A Only" }
      : null;
  };
  supabaseService.findProspectInOrganization = async (phone, organizationId) => {
    lookupCalls.push({ source: "findInOrg", phone, organizationId });
    return organizationId === ORG_A
      ? { id: "a-only", phone: PHONE, organization_id: ORG_A, name: "Org A Only" }
      : null;
  };
  orgResolver.resolveWhatsAppInboundOrganizationId = async () => ({
    organizationId: ORG_B,
    source: "explicit"
  });
  resolver.setQrAttributionServiceForTests({
    matchEligiblePendingInboundScan: async () => ({
      ok: false,
      outcome: "MISS",
      reasonCode: "NO_PENDING_SCAN",
      scan: null,
      campaign: null
    }),
    buildAttributionTouch: () => null,
    consumeMatchedScan: async () => ({ ok: true })
  });

  try {
    await resolver.locateOrCreateWhatsAppProspect({
      phone: "7865551234",
      name: "New B",
      firstMessage: "first in org b",
      correlationBase: "corr-pass2-create",
      organizationId: ORG_B
    });
  } catch {
    // create path may fail in test env; lookup isolation is what we assert
  }

  assert.ok(lookupCalls.length > 0);
  assert.equal(
    lookupCalls.every((call) => call.organizationId === ORG_B),
    true
  );
  assert.equal(
    lookupCalls.some((call) => call.organizationId === ORG_A),
    false
  );
});

test("recruiting orchestrator requires organizationId for legacy lookup and core id resolution", async () => {
  const bridge = require("../core/recruitingProspectBridge");
  const originalFindCore = bridge.findCoreProspectIdByPhone;

  const scopedLookups = [];
  const patch = patchSupabaseServiceExports(
    {
      findProspectInOrganization: async (phone, organizationId) => {
        scopedLookups.push({ phone, organizationId });
        if (organizationId === ORG_B) {
          return { phone, organization_id: ORG_B, current_step: "GREETING" };
        }
        return null;
      },
      findProspect: async () => {
        throw new Error("global findProspect must not be used");
      }
    },
    ["../core/recruitingWorkflowOrchestrator"]
  );

  bridge.findCoreProspectIdByPhone = async (phone, organizationId) => {
    assert.equal(organizationId, ORG_B);
    return CORE_B;
  };

  const {
    registerRecruitingWorkflow
  } = require("../core/recruitingWorkflowRegistry");
  const eventBridge = require("../core/recruitingBusinessEventBridge");
  const originalRecord = eventBridge.recordBusinessEvent;
  eventBridge.recordBusinessEvent = async (input) => {
    assert.equal(input.organizationId, ORG_B);
    return null;
  };

  registerRecruitingWorkflow({
    prospectService: {
      updateProspect: async () => ({})
    },
    businessEventService: { record: async () => ({}) },
    prospectRepository: { findById: async () => null }
  });

  delete require.cache[require.resolve("../core/recruitingWorkflowOrchestrator")];
  const orchestrator = require("../core/recruitingWorkflowOrchestrator");

  try {
    await orchestrator.onMessageReceived({
      phone: PHONE,
      message: "hola",
      organizationId: ORG_B
    });
    assert.equal(scopedLookups.length >= 1, true);
    assert.equal(scopedLookups.every((call) => call.organizationId === ORG_B), true);

    const withoutOrg = await orchestrator.onConversationProgress({ phone: PHONE });
    assert.equal(withoutOrg, null);
  } finally {
    patch.restore();
    bridge.findCoreProspectIdByPhone = originalFindCore;
    eventBridge.recordBusinessEvent = originalRecord;
    orchestrator.clearAutonomousWorkflowStateForTests();
    delete require.cache[require.resolve("../core/recruitingWorkflowOrchestrator")];
  }
});

test("recruiting business-event bridge fails closed without organizationId", async () => {
  const { registerRecruitingWorkflow } = require("../core/recruitingWorkflowRegistry");
  const bridge = require("../core/recruitingProspectBridge");
  const originalFindCore = bridge.findCoreProspectIdByPhone;

  let lookupCalls = 0;
  bridge.findCoreProspectIdByPhone = async (_phone, organizationId) => {
    lookupCalls += 1;
    return organizationId === ORG_B ? null : CORE_B;
  };

  let recordCalls = 0;
  registerRecruitingWorkflow({
    prospectService: {},
    businessEventService: {
      record: async () => {
        recordCalls += 1;
        return {};
      }
    },
    prospectRepository: {}
  });

  delete require.cache[require.resolve("../core/recruitingBusinessEventBridge")];
  const { recordBusinessEvent } = require("../core/recruitingBusinessEventBridge");

  try {
    const missingOrg = await recordBusinessEvent({
      phone: PHONE,
      eventType: COMMUNICATION_EVENTS.MESSAGE_RECEIVED,
      summary: "test"
    });
    assert.equal(missingOrg, null);
    assert.equal(lookupCalls, 0);
    assert.equal(recordCalls, 0);

    lookupCalls = 0;
    const foreignOrg = await recordBusinessEvent({
      phone: PHONE,
      organizationId: ORG_B,
      eventType: COMMUNICATION_EVENTS.MESSAGE_RECEIVED,
      summary: "test"
    });
    assert.equal(foreignOrg, null);
    assert.equal(lookupCalls, 1);
    assert.equal(recordCalls, 0);

    recordCalls = 0;
    lookupCalls = 0;
    const explicit = await recordBusinessEvent({
      phone: PHONE,
      prospectId: CORE_B,
      organizationId: ORG_B,
      eventType: COMMUNICATION_EVENTS.MESSAGE_RECEIVED,
      summary: "test"
    });
    assert.ok(explicit);
    assert.equal(recordCalls, 1);
    assert.equal(lookupCalls, 0);
  } finally {
    bridge.findCoreProspectIdByPhone = originalFindCore;
    delete require.cache[require.resolve("../core/recruitingBusinessEventBridge")];
  }
});

test("cross-org mismatch detection remains read-only via listAnyOrg", async () => {
  const {
    resolveCanonicalProspectIdentity,
    clearProspectBridgeCacheForTests,
    REASON_CODES
  } = require("../core/recruitingProspectBridge");

  clearProspectBridgeCacheForTests();

  const identity = await resolveCanonicalProspectIdentity({
    phone: PHONE,
    organizationId: ORG_B,
    ensureCore: false,
    listInOrg: async () => [],
    listAnyOrg: async () => [
      {
        prospectId: "foreign-core",
        organizationId: ORG_A,
        organization_id: ORG_A
      }
    ]
  });

  assert.equal(identity.ok, false);
  assert.equal(identity.reasonCode, REASON_CODES.ORG_MISMATCH);
  assert.equal(identity.coreProspectId, null);
});
