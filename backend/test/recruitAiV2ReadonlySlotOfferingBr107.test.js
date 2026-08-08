/**
 * Recruit AI v2 — BR-107 read-only available-slot offering.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  selectCandidateSlots,
  filterSlotsByConstraints,
  resolveAvailabilityAgent,
  readCandidateSlotsSync,
  readCandidateSlots,
  AGENT_RESOLUTION,
  READ_STATUS,
  toDecisionAvailability
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  processRecruitAiV2Turn,
  processRecruitAiV2TurnSync
} = require("../core/recruitAiV2/orchestrator");
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack
} = require("../dev/recruitAiV2ScenarioPack");
const { loadConversationContext } = require("../core/recruitAiV2/contextLoader");
const {
  buildReconstructionInput
} = require("../core/recruitAiV2/shadowEvaluationService");
const {
  createPlaygroundSession,
  sendPlaygroundTurnAsync,
  _resetPlaygroundStoreForTests
} = require("../dev/recruitAiV2CustomPlayground");
const { createEphemeralSession, runV2SimulatorTurnAsync } = require("../dev/recruitAiV2ScenarioRunner");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00");
const DATE = "2026-08-10";

function slotsFromTimes(times, date = DATE) {
  return times.map((time) => ({ dateKey: date, timeKey: time, date, time }));
}

function baseContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "scheduling",
    organizationId: "sim-org-team-vision",
    agentId: "agent-fixture-1",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      preferredMeetingType: "in_person",
      availabilityConstraint: {
        type: "availability_constraint",
        earliestTime: "17:00",
        latestTime: null,
        dayPart: "evening",
        raw: "despues de las 5"
      },
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "proposed",
      proposedDate: DATE,
      proposedDateLabel: "lunes",
      previouslyOfferedSlots: [],
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

function turn(text, context, options = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
  const availability =
    options.availability !== undefined
      ? options.availability
      : require("../core/recruitAiV2/schedulingAvailabilityReader").resolveAvailabilityForTurnSync(
          {
            context,
            interpretation,
            options: {
              availabilityFixture: options.availabilityFixture || context._availabilityFixture,
              agentId: context.agentId,
              ownerUserId: context.prospectOwnerUserId,
              defaultRecruiterUserId: context.orgDefaultRecruiterUserId,
              getSlotsSync: options.getSlotsSync
            }
          }
        );
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered, availability };
}

test("selection diversity: many slots → first + last (not adjacent)", () => {
  const offered = selectCandidateSlots(
    slotsFromTimes(["17:30", "17:45", "18:00", "18:30", "19:00"])
  );
  assert.deepEqual(
    offered.map((s) => s.timeKey),
    ["17:30", "19:00"]
  );
});

test("selection: only adjacent pair is still offered", () => {
  const offered = selectCandidateSlots(slotsFromTimes(["17:30", "17:45"]));
  assert.deepEqual(
    offered.map((s) => s.timeKey),
    ["17:30", "17:45"]
  );
});

test("selection: 17:30/18:00 only → both offered", () => {
  const offered = selectCandidateSlots(slotsFromTimes(["17:30", "18:00"]));
  assert.deepEqual(
    offered.map((s) => s.timeKey),
    ["17:30", "18:00"]
  );
});

test("selection: single slot", () => {
  const offered = selectCandidateSlots(slotsFromTimes(["17:30"]));
  assert.equal(offered.length, 1);
  assert.equal(offered[0].timeKey, "17:30");
});

test("filter: never offer before earliestTime", () => {
  const filtered = filterSlotsByConstraints(
    slotsFromTimes(["16:30", "17:30", "19:00"]),
    { earliestTime: "17:00" }
  );
  assert.deepEqual(
    filtered.map((s) => s.timeKey),
    ["17:30", "19:00"]
  );
  const offered = selectCandidateSlots(filtered);
  assert.deepEqual(
    offered.map((s) => s.timeKey),
    ["17:30", "19:00"]
  );
});

test("selection: no fixed 60/90-minute threshold encoded", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/schedulingAvailabilityReader.js"),
    "utf8"
  );
  assert.doesNotMatch(src, /DEFAULT_SPACING_MINUTES\s*=\s*(60|90)/);
  assert.doesNotMatch(src, /spacingMinutes\s*=\s*(60|90)/);
});

test("agent resolution precedence + no random pick", () => {
  assert.equal(
    resolveAvailabilityAgent({ context: { agentId: "a1" } }).agentResolutionSource,
    AGENT_RESOLUTION.ASSIGNED_OWNER
  );
  assert.equal(
    resolveAvailabilityAgent({
      context: { prospectOwnerUserId: "owner-1" }
    }).agentResolutionSource,
    AGENT_RESOLUTION.EXISTING_BR080_OWNER
  );
  assert.equal(
    resolveAvailabilityAgent({
      context: { orgDefaultRecruiterUserId: "def-1" }
    }).agentResolutionSource,
    AGENT_RESOLUTION.ORG_DEFAULT
  );
  assert.equal(
    resolveAvailabilityAgent({ context: {} }).agentResolutionSource,
    AGENT_RESOLUTION.UNRESOLVED
  );
});

test("fixture offer: two slots render without anoto echo", () => {
  const ctx = baseContext({
    _availabilityFixture: {
      slots: slotsFromTimes(["17:30", "17:45", "18:00", "18:30", "19:00"])
    }
  });
  const r = turn("despues de las 5", ctx, {
    availabilityFixture: ctx._availabilityFixture
  });
  assert.equal(r.structuredDecision.decision.nextAction, "offer_available_slots");
  assert.match(r.rendered.text, /5:30 PM/);
  assert.match(r.rendered.text, /7:00 PM/);
  assert.doesNotMatch(r.rendered.text, /anoto que puedes|5:45 PM/i);
  assert.equal(r.nextContext.appointment.previouslyOfferedSlots.length, 2);
  assert.equal(r.nextContext.appointment.previouslyOfferedSlots[0].time, "17:30");
  assert.equal(r.nextContext.appointment.previouslyOfferedSlots[1].time, "19:00");
});

test("zero-evening-slot fixture: successful zero, not fabricated", () => {
  const ctx = baseContext({
    _availabilityFixture: { slots: slotsFromTimes(["09:00", "10:00", "16:30"]) }
  });
  const r = turn("despues de las 5", ctx, {
    availabilityFixture: ctx._availabilityFixture
  });
  assert.equal(r.availability.status, READ_STATUS.ZERO_SLOTS);
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "acknowledge_no_qualifying_availability"
  );
  assert.match(r.rendered.text, /No tengo disponibilidad después de las/i);
  assert.doesNotMatch(r.rendered.text, /5:30|7:00|Tengo disponible/i);
});

test("no concrete date → no fabrication; BR-105 ask-time path", () => {
  const ctx = baseContext({
    appointment: { proposedDate: null, status: "proposed" },
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      availabilityConstraint: null
    },
    _availabilityFixture: {
      slots: slotsFromTimes(["17:30", "19:00"])
    }
  });
  const r = turn("despues de las 5", ctx, {
    availabilityFixture: ctx._availabilityFixture
  });
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "acknowledge_availability_constraint"
  );
  assert.match(r.rendered.text, /hora|después/i);
  assert.doesNotMatch(r.rendered.text, /Tengo disponible/i);
  assert.ok(
    r.structuredDecision.reasonCodes.includes("AVAILABILITY_REQUIRES_CONCRETE_DATE")
  );
});

test("provider failure → BR-105 fallback, not zero-availability claim", () => {
  const ctx = baseContext({
    // Fresh constraint path (avoid repetition → known_availability template).
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      availabilityConstraint: null
    }
  });
  const r = turn("despues de las 5", ctx, {
    getSlotsSync: () => {
      throw new Error("boom");
    }
  });
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "acknowledge_availability_constraint"
  );
  assert.doesNotMatch(r.rendered.text, /No tengo disponibilidad/i);
  assert.match(r.rendered.text, /hora|después/i);
});

test("date proposal with prior constraint + fixture → offer", () => {
  const ctx = baseContext({
    appointment: {
      status: "proposed",
      proposedDate: null,
      previouslyOfferedSlots: []
    },
    _availabilityFixture: {
      slots: slotsFromTimes(["17:30", "18:00", "19:00"])
    },
    conversation: {
      lastQuestionAsked: "ask_date",
      lastAtlasOutboundText: "¿Qué día te funciona mejor?"
    }
  });
  const result = processRecruitAiV2TurnSync({
    message: { text: "el martes", id: "sim-wamid.br107.date" },
    context: ctx,
    options: {
      flexible: true,
      now: FIXED_NOW,
      env: { RECRUIT_AI_V2_EXECUTION_ENABLED: "false" },
      availabilityFixture: ctx._availabilityFixture,
      agentId: "agent-fixture-1"
    }
  });
  assert.equal(result.interpretation.intent, "scheduling_date_proposal");
  assert.equal(result.structuredDecision.decision.nextAction, "offer_available_slots");
  assert.match(result.rendered.text, /5:30 PM/);
  assert.match(result.rendered.text, /7:00 PM/);
});

test("explicit after-time not truncated at 18:00 by afternoon", () => {
  const read = readCandidateSlotsSync({
    organizationId: "org",
    agentId: "agent",
    date: DATE,
    constraints: { earliestTime: "17:00" },
    fixtureSlots: slotsFromTimes(["17:30", "18:00", "19:00", "19:30"])
  });
  assert.equal(read.status, READ_STATUS.AVAILABLE);
  // Diversity heuristic: earliest + latest among filtered real slots.
  assert.deepEqual(
    read.offeredSlots.map((s) => s.timeKey),
    ["17:30", "19:30"]
  );
  assert.ok(read.slots.some((s) => s.timeKey === "19:00"));
});

test("no-write / execution OFF / reader does not import legacy bookSlot", () => {
  assert.equal(isExecutionEnabled({}), false);
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: "offer_available_slots",
        shouldEscalate: false,
        mayCreateAppointment: false
      },
      reasonCodes: []
    },
    responsePlan: { templateKey: "offer_available_slots" },
    env: {}
  });
  assert.equal(auth.authorized, false);

  const readerSrc = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/schedulingAvailabilityReader.js"),
    "utf8"
  );
  assert.doesNotMatch(readerSrc, /capacityEngine|capacity\.json|bookSlot/);
  assert.doesNotMatch(readerSrc, /createAppointment|updateAppointment|deleteAppointment/);
  assert.doesNotMatch(readerSrc, /createCalendarEvent|queryFreeBusy/);
  assert.doesNotMatch(readerSrc, /newLeadAssignment|claimProspect|acknowledgeNewLead/);
});

test("async live getSlots uses timePreference any (injectable)", async () => {
  let seen = null;
  const result = await readCandidateSlots({
    organizationId: "org",
    agentId: "agent",
    date: DATE,
    constraints: { earliestTime: "17:00" },
    getSlots: async (params) => {
      seen = params;
      return {
        timezone: "America/New_York",
        slots: slotsFromTimes(["17:30", "19:00"]).map((s) => ({
          ...s,
          startTimeISO: `${DATE}T${s.timeKey}:00.000Z`,
          endTimeISO: `${DATE}T${s.timeKey}:30.000Z`,
          durationMinutes: 30
        }))
      };
    }
  });
  assert.equal(seen.timePreference, "any");
  assert.equal(result.status, READ_STATUS.AVAILABLE);
  assert.deepEqual(
    result.offeredSlots.map((s) => s.timeKey),
    ["17:30", "19:00"]
  );
});

test("toDecisionAvailability maps zero vs unavailable distinctly", () => {
  const zero = toDecisionAvailability({
    status: READ_STATUS.ZERO_SLOTS,
    offeredSlots: [],
    agentResolutionSource: AGENT_RESOLUTION.ASSIGNED_OWNER
  });
  assert.equal(zero.checked, true);
  assert.equal(zero.providerFailure, false);

  const unavailable = toDecisionAvailability({
    status: READ_STATUS.UNAVAILABLE,
    offeredSlots: [],
    failureReason: "provider_failure",
    agentResolutionSource: AGENT_RESOLUTION.UNRESOLVED
  });
  assert.equal(unavailable.providerFailure, true);
  assert.equal(unavailable.checked, false);
});

test("scenario readonly-slot-offering-after-constraint", async () => {
  const report = await runRecruitAiV2ScenarioById(
    "readonly-slot-offering-after-constraint"
  );
  assert.equal(report.pass, true, JSON.stringify(report.failures || report, null, 2));
});

test("simulator pack + isolation", async () => {
  const pack = await runAllRecruitAiV2ScenarioPack();
  assert.equal(
    pack.failed,
    0,
    JSON.stringify(
      (pack.reports || []).filter((r) => !r.pass).map((r) => r.id),
      null,
      2
    )
  );
});

test("docs exist", () => {
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/35_AVAILABLE_SLOT_OFFERING.md"
  );
  assert.equal(fs.existsSync(doc), true);
  const br = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(br, /BR-107/);
});

test("async orchestrator uses live getSlots path (injectable)", async () => {
  let called = false;
  const ctx = baseContext({
    _availabilityFixture: undefined,
    appointment: { status: "proposed", proposedDate: DATE, previouslyOfferedSlots: [] }
  });
  delete ctx._availabilityFixture;
  const result = await processRecruitAiV2Turn({
    message: { id: "live-read-1", text: "despues de las 5" },
    context: ctx,
    options: {
      flexible: true,
      now: FIXED_NOW,
      env: {
        RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
        RECRUIT_AI_V2_SHADOW_ENABLED: "false"
      },
      getSlots: async () => {
        called = true;
        return {
          timezone: "America/New_York",
          slots: slotsFromTimes(["17:30", "19:00"]).map((s) => ({
            ...s,
            startTimeISO: `${DATE}T${s.time}:00.000-04:00`,
            endTimeISO: `${DATE}T${s.time}:30.000-04:00`,
            durationMinutes: 30
          }))
        };
      }
    }
  });
  assert.equal(called, true);
  assert.equal(
    result.structuredDecision.decision.nextAction,
    "offer_available_slots"
  );
  assert.equal(result.authorization.authorized, false);
  assert.equal(result.execution.attempted, false);
});

test("sync orchestrator does not call live getSlots without fixture", () => {
  const ctx = baseContext();
  delete ctx._availabilityFixture;
  const result = processRecruitAiV2TurnSync({
    message: { id: "sync-no-fixture", text: "despues de las 5" },
    context: ctx,
    options: {
      flexible: true,
      now: FIXED_NOW,
      env: { RECRUIT_AI_V2_EXECUTION_ENABLED: "false" }
    }
  });
  // Without fixture/getSlotsSync → availability unread → BR-105 ask-time path, not fabricated offer.
  assert.notEqual(result.structuredDecision.decision.nextAction, "offer_available_slots");
  assert.doesNotMatch(
    String(result.rendered?.text || ""),
    /Tengo disponible a las/i
  );
});

test("shadow reconstruction carries read-only agent hints", () => {
  const input = buildReconstructionInput({
    id: "p1",
    organization_id: "org-1",
    owner_user_id: "owner-1",
    assigned_agent_id: "agent-1"
  });
  assert.equal(input.agentId, "agent-1");
  assert.equal(input.prospectOwnerUserId, "owner-1");
  const loaded = loadConversationContext(input);
  assert.equal(loaded.agentId, "agent-1");
  assert.equal(loaded.prospectOwnerUserId, "owner-1");
});

test("async simulator/playground turn can invoke injectable getSlots", async () => {
  let called = false;
  const session = createEphemeralSession({
    prospectId: "sim-v2-live-wire-1",
    organizationId: "sim-org-team-vision",
    agentId: "agent-fixture-1",
    preferredLanguage: "spanish",
    currentStage: "scheduling",
    testNow: FIXED_NOW.toISOString(),
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      availabilityConstraint: {
        earliestTime: "17:00",
        latestTime: null,
        dayPart: "evening"
      }
    },
    appointment: {
      status: "proposed",
      proposedDate: DATE,
      previouslyOfferedSlots: []
    },
    conversation: { lastQuestionAsked: "ask_time_preference" }
  });

  const report = await runV2SimulatorTurnAsync(
    session,
    { id: "t1", text: "despues de las 5" },
    {
      allowLiveAvailabilityRead: true
    }
  );
  // Without injected getSlots, live path attempts Sprint 22 and may fail offline → no fabricate.
  assert.equal(report.execution.appointment, false);
  assert.equal(report.execution.calendar, false);
  assert.equal(report.execution.whatsapp, false);
  assert.equal(report.execution.br080, false);

  const session2 = createEphemeralSession({
    prospectId: "sim-v2-live-wire-2",
    organizationId: "sim-org-team-vision",
    agentId: "agent-fixture-1",
    preferredLanguage: "spanish",
    currentStage: "scheduling",
    testNow: FIXED_NOW.toISOString(),
    knownFacts: {
      availabilityConstraint: { earliestTime: "17:00" }
    },
    appointment: { status: "proposed", proposedDate: DATE, previouslyOfferedSlots: [] },
    conversation: { lastQuestionAsked: "ask_time_preference" }
  });
  const withInject = await processRecruitAiV2Turn({
    message: { id: "inj", text: "despues de las 5" },
    context: session2.context,
    options: {
      flexible: true,
      now: FIXED_NOW,
      env: { RECRUIT_AI_V2_EXECUTION_ENABLED: "false" },
      getSlots: async () => {
        called = true;
        return {
          timezone: "America/New_York",
          slots: slotsFromTimes(["17:30", "19:00"])
        };
      }
    }
  });
  assert.equal(called, true);
  assert.match(withInject.rendered.text, /Tengo disponible a las/i);
  void report;
});

test("Ops playground async entry exports sendPlaygroundTurnAsync", async () => {
  _resetPlaygroundStoreForTests();
  const session = createPlaygroundSession({
    organizationId: "sim-org-team-vision",
    agentId: "agent-fixture-1",
    initialLanguage: "spanish",
    meetingContext: "appointment_proposed"
  });
  assert.equal(typeof sendPlaygroundTurnAsync, "function");
  const result = await sendPlaygroundTurnAsync(session.sessionId, {
    text: "Hola"
  });
  assert.equal(result.success, true);
  assert.equal(result.sideEffectsDenied, true);
  _resetPlaygroundStoreForTests();
});
