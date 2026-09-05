/**
 * BR-240 — SUPER_ADMIN canary reset for explicitly marked test prospects.
 */

"use strict";

process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createServer } = require("node:http");

const { SAAS_ROLES } = require("../security/saasRoles");
const { requireSuperAdmin } = require("../middleware/requireSuperAdmin");
const { OWNERSHIP } = require("../core/workflowConstants");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState,
  clearMemoryWorkflowStateStore
} = require("../core/workflowStateStore");
const {
  resetCanaryProspect,
  CANARY_RESET_ACTION,
  ERRORS
} = require("../core/canaryResetService");
const {
  evaluateAtlasInboundAutomationEligibility,
  persistVerifiedAtlasEligibilitySource,
  evaluateIulReviewSessionActive,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../core/atlasInboundAutomationEligibility");
const { isIulWorkflowProspect } = require("../core/iulWorkflowConstants");
const { WHATSAPP_ENTRY_METHOD } = require("../core/whatsappConstants");
const { INTAKE_CODE_STATUS } = require("../core/campaignIntakeCode/constants");
const {
  createContextPersistenceService
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const { isDurableHumanSeal } = require("../core/recruitAiV2/lastMeterOutboundGuard");

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000099";
const PROSPECT_ID = "prospect-tv-000030";
const PHONE = "+17867527481";
const ACTOR = "super-admin-user-1";
const MARKED_TEST_AT = "2026-09-01T12:00:00.000Z";
const RESET_AT = "2026-09-05T22:00:00.000Z";

function identityProspect(overrides = {}) {
  return {
    id: PROSPECT_ID,
    organization_id: ORG,
    phone: PHONE,
    normalized_phone: "17867527481",
    prospect_number: "TV-000030",
    name: "Anthony Perez",
    current_step: "SCHEDULE",
    status: "NEW",
    entry_method: WHATSAPP_ENTRY_METHOD.CAMPAIGN_INTAKE_CODE,
    ...overrides
  };
}

function humanOwnedIulWorkflow(overrides = {}) {
  return {
    inboxMarkedTestAt: MARKED_TEST_AT,
    workflowOwnership: OWNERSHIP.AGENT,
    manualAgentOwnership: true,
    humanTakenOverAt: "2026-09-04T18:00:00.000Z",
    handoffReason: "whatsapp_business_app",
    handoffAt: "2026-09-04T18:00:00.000Z",
    keepWithHuman: true,
    needsHumanAttention: true,
    atlasAutomationEnabled: null,
    atlasEligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_IUL,
    conversationGoal: "policy_review",
    campaignKind: "iul_review_ad",
    iulWorkflowStage: "NEW_IUL_LEAD",
    iulConversationStatus: "AWAITING_RESPONSE",
    campaignIntakePurpose: "IUL_REVIEW",
    lastProspectInboundProviderMessageId: "wamid.stale-canary",
    lastProspectInboundAt: "2026-09-04T17:59:00.000Z",
    ...overrides
  };
}

function superAdminAuth(overrides = {}) {
  return {
    userId: ACTOR,
    email: "admin@atlas.test",
    saasRole: SAAS_ROLES.SUPER_ADMIN,
    ...overrides
  };
}

function freshIulInbound() {
  return {
    campaignIntakeMatch: {
      matched: true,
      purpose: "IUL_REVIEW",
      status: INTAKE_CODE_STATUS.ACTIVE,
      iulReviewEligible: true,
      recruitingEligible: false
    }
  };
}

function createHarness({
  prospect = identityProspect(),
  markedTest = true,
  workflowOverrides = {}
} = {}) {
  const conversationLogs = [
    { id: "log-1", direction: "inbound", body: "prior canary hello" }
  ];
  const appointments = [
    { id: "appt-1", status: "cancelled", startsAt: "2026-09-03T15:00:00.000Z" }
  ];
  const audits = [{ action: "HUMAN_TAKEOVER", targetId: PROSPECT_ID }];
  const stages = [];
  const sideEffects = {
    createAppointment: 0,
    createCalendarEvent: 0,
    sendWhatsApp: 0
  };

  const repository = createMemoryContextRepository();
  const persistence = createContextPersistenceService({
    repository,
    resolveIdentity: async ({ prospectId }) => ({
      ok: true,
      coreProspectId: prospectId || PROSPECT_ID,
      legacyProspectId: null
    })
  });

  async function seedWorkflow() {
    await savePersistedWorkflowState(
      prospect.phone,
      humanOwnedIulWorkflow({
        inboxMarkedTestAt: markedTest ? MARKED_TEST_AT : null,
        ...workflowOverrides
      }),
      { organizationId: prospect.organization_id, prospectId: prospect.id }
    );
  }

  const deps = {
    loadProspect: async (prospectId, organizationId) => {
      if (prospectId === prospect.id && organizationId === prospect.organization_id) {
        return prospect;
      }
      return null;
    },
    archiveContext: (args) => persistence.archiveContext(args),
    writeAuditLog: async (entry) => {
      audits.push(entry);
      return entry;
    },
    logWhatsAppStage: (stage, details) => {
      stages.push({ stage, details });
    },
    nowIso: RESET_AT,
    createAppointment: async () => {
      sideEffects.createAppointment += 1;
    },
    createCalendarEvent: async () => {
      sideEffects.createCalendarEvent += 1;
    },
    sendWhatsApp: async () => {
      sideEffects.sendWhatsApp += 1;
    }
  };

  return {
    prospect,
    conversationLogs,
    appointments,
    audits,
    stages,
    sideEffects,
    repository,
    persistence,
    deps,
    seedWorkflow,
    async seedActiveContext() {
      return persistence.createContext({
        organizationId: prospect.organization_id,
        prospectId: prospect.id,
        channel: "whatsapp",
        ensureCore: false,
        context: {
          conversationGoal: "policy_review",
          campaignKind: "iul_review_ad",
          knownFacts: {
            carrier: "Banner",
            iulReviewDayPart: "morning",
            reviewProposedDate: "2026-09-08",
            reviewProposedTime: "10:00"
          },
          appointment: {
            previouslyOfferedSlots: [
              { date: "2026-09-08", time: "10:00" },
              { date: "2026-09-08", time: "14:00" }
            ],
            proposedDate: "2026-09-08",
            proposedTime: "10:00"
          },
          conversation: { lastQuestionAsked: "iul_offer_slots" }
        }
      });
    }
  };
}

async function withServer(app, run) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test.beforeEach(() => {
  clearMemoryWorkflowStateStore();
});

test("A. SUPER_ADMIN can reset an explicitly marked test prospect", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();
  const result = await resetCanaryProspect(
    {
      authContext: superAdminAuth(),
      organizationId: ORG,
      prospectId: PROSPECT_ID,
      resetReason: "Reusable IUL canary for +17867527481"
    },
    harness.deps
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, CANARY_RESET_ACTION);
  assert.equal(result.workflowState.canaryAwaitingFreshIntake, true);
  assert.equal(result.workflowState.inboxMarkedTestAt, MARKED_TEST_AT);
});

test("B. ordinary ADMIN / RVP / REP cannot reset", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();

  for (const role of [SAAS_ROLES.ADMIN, SAAS_ROLES.RVP, SAAS_ROLES.REPRESENTATIVE]) {
    await assert.rejects(
      () =>
        resetCanaryProspect(
          {
            authContext: { userId: "u-1", saasRole: role },
            organizationId: ORG,
            prospectId: PROSPECT_ID,
            resetReason: "should fail"
          },
          harness.deps
        ),
      (error) =>
        error.publicCode === ERRORS.FORBIDDEN && error.statusCode === 403
    );
  }

  const app = express();
  app.use((req, res, next) => {
    req.authContext = { saasRole: SAAS_ROLES.ADMIN };
    next();
  });
  app.use(requireSuperAdmin);
  app.post("/api/platform/canary-reset", (req, res) => res.json({ ok: true }));

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/platform/canary-reset`, {
      method: "POST"
    });
    assert.equal(response.status, 403);
  });
});

test("C. non-test production prospect cannot be reset", async () => {
  const harness = createHarness({ markedTest: false });
  await harness.seedWorkflow();

  await assert.rejects(
    () =>
      resetCanaryProspect(
        {
          authContext: superAdminAuth(),
          organizationId: ORG,
          prospectId: PROSPECT_ID,
          resetReason: "production lead"
        },
        harness.deps
      ),
    (error) =>
      error.publicCode === ERRORS.NOT_TEST_PROSPECT && error.statusCode === 409
  );
});

test("D/E. reset preserves identity, phone, org, number, messages, and prior audit", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();
  const beforeLogs = harness.conversationLogs.slice();
  const beforeAudits = harness.audits.slice();

  const result = await resetCanaryProspect(
    {
      authContext: superAdminAuth(),
      organizationId: ORG,
      prospectId: PROSPECT_ID,
      resetReason: "reuse dedicated test phone"
    },
    harness.deps
  );

  assert.deepEqual(result.prospect, {
    id: PROSPECT_ID,
    organizationId: ORG,
    phone: PHONE,
    normalizedPhone: "17867527481",
    prospectNumber: "TV-000030",
    name: "Anthony Perez"
  });
  assert.equal(harness.prospect.phone, PHONE);
  assert.equal(harness.prospect.prospect_number, "TV-000030");
  assert.deepEqual(harness.conversationLogs, beforeLogs);
  assert.equal(beforeAudits[0].action, "HUMAN_TAKEOVER");
  assert.equal(harness.audits[0].action, "HUMAN_TAKEOVER");
  assert.equal(harness.audits.at(-1).action, CANARY_RESET_ACTION);
  assert.equal(harness.audits.at(-1).metadata.reset_reason, "reuse dedicated test phone");
});

test("F. prior HUMAN / AGENT ownership is cleared only by CANARY RESET", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();

  const unrelated = await savePersistedWorkflowState(
    PHONE,
    { stalledAt: "2026-09-05T12:00:00.000Z" },
    { organizationId: ORG, prospectId: PROSPECT_ID }
  );
  assert.equal(unrelated.manualAgentOwnership, true);
  assert.equal(Boolean(unrelated.humanTakenOverAt), true);
  assert.equal(isDurableHumanSeal(unrelated), true);

  const result = await resetCanaryProspect(
    {
      authContext: superAdminAuth(),
      organizationId: ORG,
      prospectId: PROSPECT_ID,
      resetReason: "clear human seal for next canary"
    },
    harness.deps
  );

  assert.equal(result.workflowState.manualAgentOwnership, false);
  assert.equal(result.workflowState.humanTakenOverAt, null);
  assert.equal(result.workflowState.handoffReason, null);
  assert.equal(result.workflowState.workflowOwnership, OWNERSHIP.ATLAS);
  assert.equal(result.workflowState.returnedToAtlasAt, null);
  assert.equal(isDurableHumanSeal(result.workflowState), false);
  assert.equal(result.previousOwnershipSummary.manualAgentOwnership, true);
  assert.equal(result.previousOwnershipSummary.handoffReason, "whatsapp_business_app");
});

test("G/H. prior campaign eligibility does not authorize Atlas; reset stays silent", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();
  await resetCanaryProspect(
    {
      authContext: superAdminAuth(),
      organizationId: ORG,
      prospectId: PROSPECT_ID,
      resetReason: "force fresh intake"
    },
    harness.deps
  );

  const workflow = await loadPersistedWorkflowState(PHONE, {
    organizationId: ORG,
    prospectId: PROSPECT_ID
  });
  assert.equal(workflow.atlasEligibilitySource, null);
  assert.equal(workflow.canaryAwaitingFreshIntake, true);
  assert.equal(isIulWorkflowProspect(workflow, {}), false);

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: identityProspect(),
    inbound: { text: "hola" },
    workflowState: workflow
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "CANARY_RESET_AWAITING_FRESH_INTAKE");
  assert.equal(harness.sideEffects.sendWhatsApp, 0);
});

test("I. fresh valid IUL campaign intake after reset starts a new IUL flow", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();
  await harness.seedActiveContext();
  await resetCanaryProspect(
    {
      authContext: superAdminAuth(),
      organizationId: ORG,
      prospectId: PROSPECT_ID,
      resetReason: "ready for new IUL intake"
    },
    harness.deps
  );

  const workflow = await loadPersistedWorkflowState(PHONE, {
    organizationId: ORG,
    prospectId: PROSPECT_ID
  });
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: identityProspect(),
    inbound: freshIulInbound(),
    workflowState: workflow
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "CAMPAIGN_INTAKE_IUL");

  const persisted = await persistVerifiedAtlasEligibilitySource(
    PHONE,
    VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_IUL,
    { organizationId: ORG, prospectId: PROSPECT_ID, workflowState: workflow }
  );
  assert.equal(persisted.canaryAwaitingFreshIntake, false);
  assert.equal(
    persisted.atlasEligibilitySource,
    VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_IUL
  );

  const session = evaluateIulReviewSessionActive({
    prospect: identityProspect(),
    workflowState: persisted
  });
  assert.equal(session.active, false);

  const active = await harness.repository.findActiveByScope({
    organizationId: ORG,
    prospectId: PROSPECT_ID,
    channel: "whatsapp"
  });
  assert.equal(active, null);
});

test("J/K. stale offered slots and IUL discovery facts are gone", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();
  const created = await harness.seedActiveContext();
  assert.equal(created.appointment.previouslyOfferedSlots.length, 2);
  assert.equal(created.knownFacts.carrier, "Banner");

  await resetCanaryProspect(
    {
      authContext: superAdminAuth(),
      organizationId: ORG,
      prospectId: PROSPECT_ID,
      resetReason: "clear stale IUL facts"
    },
    harness.deps
  );

  const workflow = await loadPersistedWorkflowState(PHONE, {
    organizationId: ORG,
    prospectId: PROSPECT_ID
  });
  assert.equal(workflow.conversationGoal, null);
  assert.equal(workflow.campaignKind, null);
  assert.equal(workflow.iulWorkflowStage, null);
  assert.equal(workflow.lastProspectInboundProviderMessageId, null);

  const active = await harness.persistence.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT_ID,
    channel: "whatsapp",
    ensureCore: false
  });
  assert.equal(active, null);

  const versions = await harness.persistence.listRecentContextVersions({
    organizationId: ORG,
    prospectId: PROSPECT_ID,
    limit: 5
  });
  assert.equal(versions.length, 1);
  assert.ok(versions[0]._persistence.archivedAt);
  assert.equal(versions[0].knownFacts.carrier, "Banner");
});

test("L. reset creates no appointment, calendar event, or WhatsApp message", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();
  const beforeAppointments = harness.appointments.slice();

  const result = await resetCanaryProspect(
    {
      authContext: superAdminAuth(),
      organizationId: ORG,
      prospectId: PROSPECT_ID,
      resetReason: "no outbound"
    },
    harness.deps
  );

  assert.equal(result.outboundSent, false);
  assert.equal(result.appointmentCreated, false);
  assert.equal(result.calendarEventCreated, false);
  assert.equal(harness.sideEffects.createAppointment, 0);
  assert.equal(harness.sideEffects.createCalendarEvent, 0);
  assert.equal(harness.sideEffects.sendWhatsApp, 0);
  assert.deepEqual(harness.appointments, beforeAppointments);
});

test("M. reset is idempotent and audits both attempts", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();
  await harness.seedActiveContext();

  const first = await resetCanaryProspect(
    {
      authContext: superAdminAuth(),
      organizationId: ORG,
      prospectId: PROSPECT_ID,
      resetReason: "first reset"
    },
    harness.deps
  );
  const second = await resetCanaryProspect(
    {
      authContext: superAdminAuth(),
      organizationId: ORG,
      prospectId: PROSPECT_ID,
      resetReason: "second reset"
    },
    harness.deps
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.prospect.phone, PHONE);
  assert.equal(second.workflowState.canaryAwaitingFreshIntake, true);
  assert.equal(second.workflowState.inboxMarkedTestAt, MARKED_TEST_AT);
  assert.equal(second.workflowState.manualAgentOwnership, false);
  const canaryAudits = harness.audits.filter((row) => row.action === CANARY_RESET_ACTION);
  assert.equal(canaryAudits.length, 2);
  assert.equal(canaryAudits[0].metadata.reset_reason, "first reset");
  assert.equal(canaryAudits[1].metadata.reset_reason, "second reset");
});

test("missing target or reason fails closed", async () => {
  const harness = createHarness();
  await harness.seedWorkflow();

  await assert.rejects(
    () =>
      resetCanaryProspect(
        {
          authContext: superAdminAuth(),
          organizationId: ORG,
          resetReason: "no prospect"
        },
        harness.deps
      ),
    (error) => error.publicCode === ERRORS.TARGET_REQUIRED
  );
  await assert.rejects(
    () =>
      resetCanaryProspect(
        {
          authContext: superAdminAuth(),
          organizationId: ORG,
          prospectId: PROSPECT_ID,
          resetReason: "  "
        },
        harness.deps
      ),
    (error) => error.publicCode === ERRORS.REASON_REQUIRED
  );
  await assert.rejects(
    () =>
      resetCanaryProspect(
        {
          authContext: superAdminAuth(),
          organizationId: OTHER_ORG,
          prospectId: PROSPECT_ID,
          resetReason: "wrong org"
        },
        harness.deps
      ),
    (error) => error.publicCode === ERRORS.PROSPECT_NOT_FOUND
  );
});
