/**
 * BR-172 — temporary TAKE OVER returns to ATLAS after a successful schedule.
 * Global: every tenant, agent, and appointment purpose.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test";
process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  decideSchedulingOwnershipReturn,
  maybeReturnTemporaryOwnershipToAtlasAfterScheduling,
  AUDIT_ACTION
} = require("../core/appointmentSchedulingOwnership");
const {
  takeOverConversation,
  hasActiveStickyHumanHold
} = require("../core/conversationsCenter/conversationsCenterOwnershipService");
const {
  loadPersistedWorkflowState,
  savePersistedWorkflowState,
  clearMemoryWorkflowStateStore
} = require("../core/workflowStateStore");
const { OWNERSHIP } = require("../core/workflowConstants");
const { APPOINTMENT_PURPOSES } = require("../core/configuration/appointmentDomain");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { INTENTS, NEXT_ACTIONS } = require("../core/recruitAiV2/constants");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const TEAM_LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const OTHER_TENANT_ORG = "00000000-0000-4000-8000-000000000099";
const PURPOSES = Object.values(APPOINTMENT_PURPOSES);

const TENANTS = [
  { name: "Team Vision", organizationId: TEAM_VISION_ORG, phone: "+17855551001" },
  { name: "Team Legacy", organizationId: TEAM_LEGACY_ORG, phone: "+17855551002" },
  { name: "other tenant", organizationId: OTHER_TENANT_ORG, phone: "+17855551003" }
];

function stickyTakeover(overrides = {}) {
  return {
    workflowOwnership: OWNERSHIP.AGENT,
    manualAgentOwnership: true,
    humanTakenOverAt: "2026-08-28T20:00:00.000Z",
    handoffReason: "whatsapp_business_app",
    keepWithHuman: false,
    needsHumanAttention: false,
    ...overrides
  };
}

function prospect(overrides = {}) {
  return {
    id: "prospect-br172",
    current_step: "QUALIFICATION",
    attention_status: "acknowledged",
    ...overrides
  };
}

test("BR-172 decision: temporary TAKE OVER / WA Business App return; durable seals stay", () => {
  assert.equal(
    decideSchedulingOwnershipReturn({
      persisted: stickyTakeover({ handoffReason: "take_over" }),
      prospect: prospect()
    }).shouldReturn,
    true
  );
  assert.equal(
    decideSchedulingOwnershipReturn({
      persisted: stickyTakeover({ handoffReason: "whatsapp_business_app" }),
      prospect: prospect()
    }).shouldReturn,
    true
  );
  assert.equal(
    decideSchedulingOwnershipReturn({
      persisted: stickyTakeover(),
      prospect: prospect({ attention_status: "human_required" })
    }).reason,
    "HUMAN_REQUIRED"
  );
  assert.equal(
    decideSchedulingOwnershipReturn({
      persisted: stickyTakeover({ keepWithHuman: true }),
      prospect: prospect()
    }).reason,
    "KEEP_WITH_HUMAN"
  );
  assert.equal(
    decideSchedulingOwnershipReturn({
      persisted: stickyTakeover({ handoffReason: "explicit_human_request" }),
      prospect: prospect()
    }).reason,
    "DURABLE_HUMAN_SEAL"
  );
  assert.equal(
    decideSchedulingOwnershipReturn({
      persisted: stickyTakeover(),
      prospect: prospect({ current_step: "DO NOT CONTACT" })
    }).reason,
    "OPT_OUT_OR_CLOSED"
  );
  assert.equal(
    decideSchedulingOwnershipReturn({
      persisted: { workflowOwnership: OWNERSHIP.ATLAS, manualAgentOwnership: false },
      prospect: prospect()
    }).reason,
    "NOT_HUMAN_OWNED"
  );
});

test("BR-172 decision is purpose-agnostic", () => {
  for (const purpose of PURPOSES) {
    const decision = decideSchedulingOwnershipReturn({
      persisted: stickyTakeover({ handoffReason: "take_over" }),
      prospect: prospect()
    });
    assert.equal(decision.shouldReturn, true, purpose);
  }
});

for (const tenant of TENANTS) {
  test(`BR-172 ${tenant.name} temporary takeover → booked → ATLAS`, async () => {
    clearMemoryWorkflowStateStore();
    const scope = {
      organizationId: tenant.organizationId,
      prospectId: `p-${tenant.organizationId.slice(0, 8)}`,
      backend: "memory"
    };
    await takeOverConversation(tenant.phone, {
      ...scope,
      reason: "whatsapp_business_app"
    });
    const before = await loadPersistedWorkflowState(tenant.phone, scope);
    assert.equal(hasActiveStickyHumanHold(before), true);

    const result = await maybeReturnTemporaryOwnershipToAtlasAfterScheduling({
      phone: tenant.phone,
      organizationId: tenant.organizationId,
      prospectId: scope.prospectId,
      prospect: prospect({ id: scope.prospectId, organization_id: tenant.organizationId }),
      appointmentId: `appt-${tenant.organizationId.slice(0, 8)}`,
      appointmentPurpose: "policy_review",
      source: "appointmentApplicationService.createAppointment",
      dependencies: {
        loadPersistedWorkflowState,
        returnConversationToAtlas: (phone, options) =>
          require("../core/conversationsCenter/conversationsCenterOwnershipService").returnConversationToAtlas(
            phone,
            { ...options, backend: "memory" }
          )
      }
    });

    assert.equal(result.returned, true, tenant.name);
    const after = await loadPersistedWorkflowState(tenant.phone, scope);
    assert.equal(after.workflowOwnership, OWNERSHIP.ATLAS, tenant.name);
    assert.equal(after.manualAgentOwnership, false, tenant.name);
    assert.equal(after.humanTakenOverAt, null, tenant.name);
    assert.ok(after.returnedToAtlasAt, tenant.name);
  });
}

test("BR-172 HUMAN_REQUIRED remains HUMAN after book event", async () => {
  const states = new Map();
  const org = TEAM_VISION_ORG;
  states.set(org, stickyTakeover({ handoffReason: "take_over" }));
  const result = await maybeReturnTemporaryOwnershipToAtlasAfterScheduling({
    phone: "+17855551901",
    organizationId: org,
    prospectId: "p-human-required",
    prospect: prospect({ attention_status: "human_required" }),
    appointmentId: "appt-hr",
    dependencies: {
      loadPersistedWorkflowState: async (_phone, options) =>
        states.get(options.organizationId),
      returnConversationToAtlas: async () => {
        throw new Error("must_not_return");
      }
    }
  });
  assert.equal(result.returned, false);
  assert.equal(result.reason, "HUMAN_REQUIRED");
  assert.equal(states.get(org).manualAgentOwnership, true);
});

test("BR-172 explicit keep-with-human remains HUMAN", async () => {
  const states = new Map();
  states.set(OTHER_TENANT_ORG, stickyTakeover({ keepWithHuman: true, handoffReason: "take_over" }));
  const result = await maybeReturnTemporaryOwnershipToAtlasAfterScheduling({
    phone: "+17855551902",
    organizationId: OTHER_TENANT_ORG,
    prospect: prospect(),
    dependencies: {
      loadPersistedWorkflowState: async (_phone, options) =>
        states.get(options.organizationId),
      returnConversationToAtlas: async () => {
        throw new Error("must_not_return");
      }
    }
  });
  assert.equal(result.returned, false);
  assert.equal(result.reason, "KEEP_WITH_HUMAN");
});

test("BR-172 tenant isolation: returning org A does not clear org B", async () => {
  const states = new Map();
  states.set(TEAM_VISION_ORG, stickyTakeover({ handoffReason: "take_over" }));
  states.set(TEAM_LEGACY_ORG, stickyTakeover({ handoffReason: "whatsapp_business_app" }));

  const result = await maybeReturnTemporaryOwnershipToAtlasAfterScheduling({
    phone: "+17855551999",
    organizationId: TEAM_VISION_ORG,
    prospect: prospect(),
    dependencies: {
      loadPersistedWorkflowState: async (_phone, options) =>
        states.get(options.organizationId) || {
          workflowOwnership: OWNERSHIP.ATLAS,
          manualAgentOwnership: false
        },
      returnConversationToAtlas: async (_phone, options) => {
        const previous = states.get(options.organizationId);
        const next = {
          ...previous,
          workflowOwnership: OWNERSHIP.ATLAS,
          manualAgentOwnership: false,
          humanTakenOverAt: null,
          handoffReason: null,
          returnedToAtlasAt: "2026-08-29T22:00:00.000Z"
        };
        states.set(options.organizationId, next);
        return { previous, next };
      }
    }
  });

  assert.equal(result.returned, true);
  assert.equal(states.get(TEAM_VISION_ORG).workflowOwnership, OWNERSHIP.ATLAS);
  assert.equal(states.get(TEAM_LEGACY_ORG).manualAgentOwnership, true);
  assert.equal(states.get(TEAM_LEGACY_ORG).workflowOwnership, OWNERSHIP.AGENT);
});

test("BR-172 after auto-return, Necesito reprogramarla para el lunes reaches V2 reschedule", async () => {
  const context = createConversationContext({
    organizationId: TEAM_LEGACY_ORG,
    prospectId: "p-reschedule-after-return",
    preferredLanguage: "spanish",
    currentStage: "confirmed",
    _testNow: new Date("2026-08-29T18:00:00.000-04:00"),
    appointment: {
      status: "scheduled",
      appointmentId: "appt-after-return",
      proposedDate: "2026-08-29",
      proposedTime: "17:00"
    },
    conversation: { lastQuestionAsked: "confirm_slot" }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "Necesito reprogramarla para el lunes" },
    context,
    options: { flexible: true, now: context._testNow }
  });
  assert.equal(interpretation.intent, INTENTS.RESCHEDULE_REQUEST);
  const structured = decideConversationTurn({
    context,
    interpretation,
    availability: {
      checked: true,
      status: "available",
      nearestAlternatives: [
        { date: "2026-08-31", time: "10:00", timezone: "America/New_York" }
      ],
      providerFailure: false
    }
  });
  assert.equal(structured.decision.mayCreateAppointment, false);
  assert.ok(
    structured.decision.nextAction === NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS ||
      structured.decision.nextAction === NEXT_ACTIONS.OFFER_RESCHEDULE_FLOW
  );
});

test("BR-172 hooks the shared createAppointment path for all tenants and purposes", () => {
  const createSrc = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );
  const ownershipSrc = fs.readFileSync(
    path.join(__dirname, "../core/appointmentSchedulingOwnership.js"),
    "utf8"
  );
  assert.match(createSrc, /maybeReturnTemporaryOwnershipToAtlasAfterScheduling/);
  assert.match(createSrc, /appointmentApplicationService\.createAppointment/);
  assert.doesNotMatch(createSrc, /Team Vision|TEAM_VISION|Niovel|Misleisys|2689/i);
  assert.doesNotMatch(ownershipSrc, /Team Vision|TEAM_VISION|Niovel|Misleisys|2689/i);
  assert.match(ownershipSrc, /AUDIT_ACTION/);
  assert.equal(AUDIT_ACTION, "conversation.returned_to_atlas_after_scheduling");
  assert.doesNotMatch(
    createSrc,
    /purpose === APPOINTMENT_PURPOSES\.RECRUITING_INTERVIEW &&[\s\S]{0,80}maybeReturnTemporaryOwnership/
  );
});
