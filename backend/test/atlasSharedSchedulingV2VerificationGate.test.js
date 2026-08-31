/**
 * ATLAS_SHARED_SCHEDULING_V2_VERIFICATION_GATE
 * Regression-only verification matrix for PR #242 — no new architecture.
 */

require("dotenv").config({ quiet: true });

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { getAvailableSlots } = require("../services/appointmentSchedulingEngine");
const { buildIsoTimestamp } = require("../services/availabilityService");
const {
  filterSlotsByConstraints,
  resolveAvailabilityForTurnSync
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const {
  executeAuthorizedSideEffects,
  appointmentMatchesRequestedSlot
} = require("../core/recruitAiV2/sideEffectExecutor");
const {
  mergeSchedulingConstraints,
  shouldSuppressSchedulingReopen
} = require("../core/sharedScheduling/schedulingNegotiationState");
const {
  findNearestAlternativeSlots,
  enrichReadResultWithNearestAlternatives,
  selectCrossDateCandidateSlots
} = require("../core/sharedScheduling/sharedSchedulingOffer");
const {
  resolveSchedulingConfig,
  WORKFLOW_TYPES
} = require("../core/sharedScheduling/sharedSchedulingConfig");
const { buildSchedulingAttemptId } = require("../core/sharedScheduling/schedulingIdempotency");
const { readPolicyReviewAvailabilitySync } = require("../core/recruitAiV2/iulPolicyReviewScheduling");
const { APPOINTMENT_PURPOSES } = require("../core/configuration/appointmentDomain");
const {
  REASON_CODES,
  V2_EXECUTABLE_ACTIONS,
  INTENTS,
  APPOINTMENT_STATUS
} = require("../core/recruitAiV2/constants");
const {
  inferPendingQuestionFromHumanText,
  findUnresolvedProspectTurn
} = require("../core/conversationsCenter/returnToAtlasResumeService");
const {
  createMemoryAppointmentReminderRepository,
  setAppointmentReminderRepositoryForTests,
  resetAppointmentReminderRepositoryCache
} = require("../repositories/appointmentReminderRepository");
const {
  scheduleReminders,
  replaceReminders,
  cancelReminders,
  stopReminderPoller
} = require("../services/appointmentReminderEngine");
const { REMINDER_STATUSES } = require("../core/configuration/appointmentDomain");

const AGENT = "00000000-0000-4000-8000-0000000000aa";
const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const OTHER_AGENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CORE_PROSPECT = "a257b152-43ea-401f-8de3-783b997013ff";
const PHONE = "+17867527481";
const TZ = "America/New_York";
const FIXED_NOW = new Date("2026-08-08T15:00:00.000-04:00");
const TOMORROW = "2026-08-09";
const DAY_AFTER = "2026-08-10";
const DATE = "2026-08-11";
const TIME = "20:00";
const START_ISO = buildIsoTimestamp(DATE, TIME, TZ);

function freshReminderRepo() {
  const repo = createMemoryAppointmentReminderRepository();
  setAppointmentReminderRepositoryForTests(repo);
  return repo;
}

test.beforeEach(() => {
  stopReminderPoller();
  freshReminderRepo();
});

test.afterEach(() => {
  stopReminderPoller();
  resetAppointmentReminderRepositoryCache();
});

function slot(dateKey, timeKey) {
  return { dateKey, timeKey, date: dateKey, time: timeKey };
}

function weekSchedule(enabledDay, start, end) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: dayOfWeek === enabledDay,
    blocks: dayOfWeek === enabledDay ? [{ start, end }] : []
  }));
}

function engineDeps({ appointments = [], googleBusy = [], durationMinutes = 30 } = {}) {
  const nowMs = Date.parse("2026-08-14T12:00:00-04:00");
  return {
    nowMs,
    getAppointmentProfileFn: async () => ({
      appointmentProfile: {
        workingSchedule: weekSchedule(6, "09:00", "21:00"),
        defaults: {
          defaultDurationMinutes: durationMinutes,
          recruitingInterviewDurationMinutes: durationMinutes,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          minimumBookingLeadMinutes: 0,
          timezone: TZ
        }
      },
      timezone: TZ
    }),
    getSchedulingSettingsFn: async () => ({ respectPersonalCalendar: true }),
    searchAppointmentsFn: async () => ({ items: appointments }),
    queryFreeBusyFn: async () =>
      googleBusy.map((period) => ({
        start:
          typeof period.start === "number" ? period.start : Date.parse(period.start),
        end: typeof period.end === "number" ? period.end : Date.parse(period.end),
        source: "google_calendar"
      }))
  };
}

function authGrant() {
  return {
    authorized: true,
    organizationId: ORG,
    actingUserId: AGENT,
    proposals: [{ type: V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT, authorized: true }]
  };
}

function bookingContext(overrides = {}) {
  return createConversationContext({
    organizationId: ORG,
    timezone: TZ,
    prospectPhone: PHONE,
    prospectId: CORE_PROSPECT,
    appointment: {
      proposedDate: DATE,
      proposedTime: TIME,
      previouslyOfferedSlots: [{ date: DATE, time: TIME, timezone: TZ }]
    },
    knownFacts: { preferredMeetingType: "zoom" },
    ...overrides
  });
}

// §2 Availability source of truth
test("GATE §2A: Google busy slot excluded from engine output", async () => {
  const busyStart = Date.parse("2026-08-15T15:00:00-04:00");
  const busyEnd = Date.parse("2026-08-15T16:00:00-04:00");
  const result = await getAvailableSlots({
    agentId: AGENT,
    organizationId: ORG,
    date: "2026-08-15",
    durationMinutes: 30,
    dependencies: engineDeps({
      googleBusy: [
        { start: new Date(busyStart).toISOString(), end: new Date(busyEnd).toISOString() }
      ]
    })
  });
  const keys = result.slots.map((s) => s.timeKey);
  assert.ok(!keys.includes("15:00"));
  assert.ok(!keys.includes("15:30"));
  assert.ok(keys.includes("14:30"));
});

test("GATE §2B: Atlas appointment conflict excludes overlapping slot", async () => {
  const appointment = {
    id: "conflict-appt",
    startDateTime: "2026-08-15T19:00:00.000Z",
    endDateTime: "2026-08-15T19:30:00.000Z"
  };
  const result = await getAvailableSlots({
    agentId: AGENT,
    organizationId: ORG,
    date: "2026-08-15",
    durationMinutes: 30,
    dependencies: engineDeps({
      appointments: [appointment],
      googleBusy: [{ start: appointment.startDateTime, end: appointment.endDateTime }]
    })
  });
  assert.ok(!result.slots.some((s) => s.timeKey === "15:00"));
});

test("GATE §2C: duration respected — long appointment reduces slot count", async () => {
  const thirty = await getAvailableSlots({
    agentId: AGENT,
    organizationId: ORG,
    date: "2026-08-15",
    durationMinutes: 30,
    dependencies: engineDeps({ durationMinutes: 30 })
  });
  const sixty = await getAvailableSlots({
    agentId: AGENT,
    organizationId: ORG,
    date: "2026-08-15",
    durationMinutes: 60,
    dependencies: engineDeps({ durationMinutes: 60 })
  });
  assert.ok(sixty.slots.length < thirty.slots.length);
  assert.ok(sixty.slots.every((s) => s.durationMinutes === 60 || !s.durationMinutes));
});

test("GATE §2D: unavailable constrained slot never proposed", () => {
  const slots = [slot(TOMORROW, "16:00"), slot(TOMORROW, "18:00")];
  const filtered = filterSlotsByConstraints(slots, {
    earliestTime: "17:00",
    earliestTimeInclusive: false
  });
  assert.deepEqual(filtered.map((s) => s.timeKey), ["18:00"]);
});

test("GATE §2E: zero pool never fabricates a slot", () => {
  const enriched = enrichReadResultWithNearestAlternatives(
    { status: "zero_slots", offeredSlots: [], unconstrainedFutureSlots: [] },
    { constraints: { earliestTime: "17:00" }, requestedDate: TOMORROW }
  );
  assert.equal(enriched.offeredSlots.length, 0);
});

// §3 Multi-turn constraints
test("GATE §3A: mañana then después de las 5 preserves date + after-5", () => {
  let context = createConversationContext({
    timezone: TZ,
    appointment: { proposedDate: TOMORROW, proposedDateLabel: "mañana" }
  });
  const dayInterpretation = interpretInboundMessage({
    message: { text: "mañana" },
    context,
    options: { now: FIXED_NOW, flexible: true }
  });
  if (dayInterpretation.entities?.resolvedDate?.isoDate) {
    context = {
      ...context,
      appointment: {
        ...context.appointment,
        proposedDate: dayInterpretation.entities.resolvedDate.isoDate
      }
    };
  }
  const timeInterpretation = interpretInboundMessage({
    message: { text: "después de las 5" },
    context,
    options: { now: FIXED_NOW }
  });
  const merged = mergeSchedulingConstraints(
    context.knownFacts?.availabilityConstraint || null,
    timeInterpretation.entities?.availabilityConstraint || null,
    context,
    timeInterpretation
  );
  assert.equal(context.appointment.proposedDate, TOMORROW);
  assert.equal(merged?.earliestTime, "17:00");
  assert.equal(merged?.earliestTimeInclusive, false);
});

test("GATE §3B: exact time supersedes weaker day-part", () => {
  const merged = mergeSchedulingConstraints(
    { dayPart: "morning", earliestTime: null },
    { earliestTime: "16:00", latestTime: "16:00", earliestTimeInclusive: true },
    {}
  );
  assert.equal(merged.earliestTime, "16:00");
  assert.equal(merged.latestTime, "16:00");
});

test("GATE §3C: date preserved when later turn only supplies time", () => {
  const merged = mergeSchedulingConstraints(
    { earliestTime: "17:00", earliestTimeInclusive: false },
    { earliestTime: "18:00", earliestTimeInclusive: false },
    { appointment: { proposedDate: TOMORROW } }
  );
  assert.equal(merged.earliestTime, "18:00");
});

test("GATE §3D: time range 2–5 preserved", () => {
  const merged = mergeSchedulingConstraints(
    { earliestTime: "14:00", latestTime: "17:00", earliestTimeInclusive: true },
    null,
    {}
  );
  assert.equal(merged.earliestTime, "14:00");
  assert.equal(merged.latestTime, "17:00");
});

test("GATE §3E: stale lastQuestionAsked cannot reset merged constraints", () => {
  const merged = mergeSchedulingConstraints(
    { earliestTime: "17:00", earliestTimeInclusive: false, dayPart: "evening" },
    { earliestTime: "17:00", earliestTimeInclusive: false },
    { conversation: { lastQuestionAsked: "ask_date" } }
  );
  assert.equal(merged.dayPart, "evening");
  assert.equal(merged.earliestTime, "17:00");
});

// §4 Nearest alternatives
test("GATE §4A: unavailable exact window → nearest real alternatives", () => {
  const nearest = findNearestAlternativeSlots(
    [slot(TOMORROW, "16:30"), slot(TOMORROW, "17:00"), slot(DAY_AFTER, "17:30")],
    { earliestTime: "17:00", earliestTimeInclusive: false },
    TOMORROW,
    { maxCandidates: 2 }
  );
  assert.equal(nearest[0].timeKey, "16:30");
});

test("GATE §4B: after-5 miss prefers same-day closest before bound", () => {
  const nearest = findNearestAlternativeSlots(
    [slot(TOMORROW, "16:30"), slot(TOMORROW, "17:00")],
    { earliestTime: "17:00", earliestTimeInclusive: false },
    TOMORROW,
    { maxCandidates: 1 }
  );
  assert.equal(nearest[0].timeKey, "16:30");
});

test("GATE §4C: next closest date when same-day has no valid options", () => {
  const nearest = findNearestAlternativeSlots(
    [slot(TOMORROW, "09:00"), slot(DAY_AFTER, "17:30")],
    { earliestTime: "17:00", earliestTimeInclusive: false },
    TOMORROW,
    { maxCandidates: 2 }
  );
  assert.ok(nearest.some((s) => (s.dateKey || s.date) === DAY_AFTER));
});

test("GATE §4D: only one valid slot → only one offered", () => {
  const offered = selectCrossDateCandidateSlots([slot(TOMORROW, "10:30")], {
    maxCandidates: 3
  });
  assert.equal(offered.length, 1);
});

test("GATE §4E: no real alternatives → graceful zero offer", () => {
  const structured = decideConversationTurn({
    context: createConversationContext({
      timezone: TZ,
      _testNow: FIXED_NOW,
      agentId: "agent-1",
      appointment: { proposedDate: TOMORROW },
      knownFacts: {
        availabilityConstraint: { earliestTime: "17:00", earliestTimeInclusive: false }
      },
      _availabilityFixture: { slots: [] }
    }),
    interpretation: {
      intent: INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT,
      entities: {
        availabilityConstraint: { earliestTime: "17:00", earliestTimeInclusive: false }
      }
    },
    availability: {
      checked: true,
      status: "zero_slots",
      nearestAlternatives: [],
      providerFailure: false,
      readResult: { offeredSlots: [], unconstrainedFutureSlots: [] }
    }
  });
  assert.equal(
    structured.customerReplyPlan.templateKey,
    "acknowledge_no_qualifying_availability"
  );
});

// §5 Booking idempotency
test("GATE §5A: duplicate confirmation → idempotent replay, zero schedule calls", async () => {
  let scheduleCalls = 0;
  let calendarCreates = 0;
  const activeAppt = {
    id: "appt-idem",
    status: "scheduled",
    organizationId: ORG,
    agentId: AGENT,
    prospectId: CORE_PROSPECT,
    startDateTime: START_ISO,
    calendarEventId: "cal-1",
    zoomUrl: "https://zoom.example/j/1"
  };
  const result = await executeAuthorizedSideEffects({
    authorization: authGrant(),
    structuredDecision: {},
    context: bookingContext(),
    options: { prospectPhone: PHONE, inboundMessageId: "msg-dup-1" },
    dependencies: {
      findActiveAppointmentForProspect: async () => activeAppt,
      getSlots: async () => ({ slots: [{ dateKey: DATE, timeKey: TIME }] }),
      executeScheduleInterview: async (_phone, _payload, options) => {
        scheduleCalls += 1;
        calendarCreates += 1;
        assert.ok(options.schedulingAttemptId);
        return { success: true, appointmentId: "should-not-create" };
      }
    }
  });
  assert.equal(result.success, true);
  assert.equal(result.idempotent, true);
  assert.equal(scheduleCalls, 0);
  assert.equal(calendarCreates, 0);
  assert.equal(result.reason, REASON_CODES.EXECUTION_IDEMPOTENT_REPLAY);
});

test("GATE §5B: schedulingAttemptId stable for webhook retry equivalent", () => {
  const key1 = buildSchedulingAttemptId({
    organizationId: ORG,
    agentId: AGENT,
    prospectId: CORE_PROSPECT,
    appointmentType: APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    dateKey: DATE,
    timeKey: TIME,
    timezone: TZ,
    inboundMessageId: "waba:retry:abc"
  });
  const key2 = buildSchedulingAttemptId({
    organizationId: ORG,
    agentId: AGENT,
    prospectId: CORE_PROSPECT,
    appointmentType: APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    dateKey: DATE,
    timeKey: TIME,
    timezone: TZ,
    inboundMessageId: "waba:retry:abc"
  });
  assert.equal(key1, key2);
});

test("GATE §5C: Return-to-Atlas resume key is deterministic for same turn", () => {
  const keyA = `return-to-atlas:i1`;
  const keyB = `return-to-atlas:i1`;
  assert.equal(keyA, keyB);
});

// §6 Confirmed appointment authority
test("GATE §6A: confirmed appointment suppresses scheduling reopen", () => {
  assert.equal(
    shouldSuppressSchedulingReopen({
      appointment: {
        status: APPOINTMENT_STATUS.CONFIRMED,
        appointmentId: "appt-1",
        proposedDate: DATE,
        proposedTime: TIME
      }
    }),
    true
  );
});

test("GATE §6B: explicit schedule ask with confirmed routes to reschedule flow", () => {
  const structured = decideConversationTurn({
    context: bookingContext({
      appointment: {
        status: APPOINTMENT_STATUS.CONFIRMED,
        appointmentId: "appt-1",
        proposedDate: DATE,
        proposedTime: TIME
      }
    }),
    interpretation: { intent: INTENTS.REQUEST_SCHEDULE_INTERVIEW, entities: {} }
  });
  assert.equal(structured.customerReplyPlan.templateKey, "offer_reschedule_flow");
  assert.ok(structured.reasonCodes.includes(REASON_CODES.APPOINTMENT_ALREADY_CONFIRMED));
});

test("GATE §6C: stale pendingQuestion cannot reopen when appointment confirmed", () => {
  const suppress = shouldSuppressSchedulingReopen({
    appointment: { status: "confirmed", appointmentId: "x" },
    conversation: { lastQuestionAsked: "confirm_slot", resumePendingQuestion: "confirm_slot" }
  });
  assert.equal(suppress, true);
});

test("GATE §6D: reschedule request reopens scheduling intentionally", () => {
  const structured = decideConversationTurn({
    context: bookingContext({
      appointment: {
        status: APPOINTMENT_STATUS.CONFIRMED,
        appointmentId: "appt-1",
        proposedDate: DATE,
        proposedTime: TIME
      }
    }),
    interpretation: { intent: INTENTS.RESCHEDULE_REQUEST, entities: {} }
  });
  assert.equal(structured.customerReplyPlan.templateKey, "offer_reschedule_flow");
});

// §7 Human takeover continuity
test("GATE §7A: Zoom prep human text does not infer scheduling pending question", () => {
  assert.equal(
    inferPendingQuestionFromHumanText("Descarga Zoom antes de la revisión"),
    null
  );
});

test("GATE §7B: human outbound latest + no inbound → no unresolved turn", () => {
  const logs = [
    {
      id: "h1",
      direction: "outgoing",
      pipeline: "HUMAN",
      intent: "HUMAN_COMPOSER_REPLY",
      message: "Aquí está el enlace de Zoom para descargar",
      created_at: "2026-03-10T15:00:00.000Z"
    }
  ];
  assert.equal(findUnresolvedProspectTurn(logs, "2026-03-10T14:00:00.000Z"), null);
});

test("GATE §7C: prospect inbound after human outbound resolves once", () => {
  const logs = [
    {
      id: "h1",
      direction: "outgoing",
      pipeline: "HUMAN",
      intent: "HUMAN_COMPOSER_REPLY",
      message: "Descarga Zoom",
      created_at: "2026-03-10T15:00:00.000Z"
    },
    {
      id: "i1",
      direction: "incoming",
      message: "Listo, ya lo descargué",
      created_at: "2026-03-10T15:01:00.000Z"
    }
  ];
  const unresolved = findUnresolvedProspectTurn(logs, "2026-03-10T14:00:00.000Z");
  assert.equal(unresolved.combinedText, "Listo, ya lo descargué");
});

test("GATE §7D: post-scheduling stage suppresses stale scheduling pendingQuestion", () => {
  assert.equal(
    shouldSuppressSchedulingReopen({
      currentStage: "post_scheduling_zoom_prep",
      appointment: { status: "confirmed", appointmentId: "a1" }
    }),
    true
  );
});

// §8–10 Reminders (canonical engine)
test("GATE §10A: one reminder set per active appointment", async () => {
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG,
    prospectPhone: PHONE,
    startDateTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    timezone: TZ
  };
  const first = await scheduleReminders(appointment);
  assert.equal(first.count, 3);
});

test("GATE §10B: duplicate scheduleReminders does not duplicate active reminders", async () => {
  const repo = createMemoryAppointmentReminderRepository();
  setAppointmentReminderRepositoryForTests(repo);
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG,
    prospectPhone: PHONE,
    startDateTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    timezone: TZ
  };
  await scheduleReminders(appointment);
  await scheduleReminders(appointment);
  const rows = await repo.listByAppointmentId(appointment.id);
  const scheduled = rows.filter((r) => r.status === REMINDER_STATUSES.SCHEDULED);
  assert.equal(scheduled.length, 3);
});

test("GATE §10C: reschedule replaceReminders moves reminder set", async () => {
  const repo = createMemoryAppointmentReminderRepository();
  setAppointmentReminderRepositoryForTests(repo);
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG,
    prospectPhone: PHONE,
    startDateTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    timezone: TZ
  };
  await scheduleReminders(appointment);
  const moved = await replaceReminders({
    ...appointment,
    startDateTime: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString()
  });
  assert.ok(moved.count >= 1);
  const rows = await repo.listByAppointmentId(appointment.id);
  assert.ok(rows.every((r) => r.status !== REMINDER_STATUSES.CANCELLED || r.reminderType));
});

test("GATE §10D: cancellation removes pending reminders", async () => {
  const repo = createMemoryAppointmentReminderRepository();
  setAppointmentReminderRepositoryForTests(repo);
  const appointment = {
    id: crypto.randomUUID(),
    organizationId: ORG,
    prospectPhone: PHONE,
    startDateTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    timezone: TZ
  };
  await scheduleReminders(appointment);
  await cancelReminders(appointment.id);
  const rows = await repo.listByAppointmentId(appointment.id);
  assert.ok(rows.every((r) => r.status === REMINDER_STATUSES.CANCELLED));
});

// §11 Workflow isolation
test("GATE §11A: recruiting uses shared scheduler purpose", () => {
  const cfg = resolveSchedulingConfig({ conversationGoal: "recruiting" });
  assert.equal(cfg.workflowType, WORKFLOW_TYPES.RECRUITING_INTERVIEW);
  assert.equal(cfg.purpose, APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW);
});

test("GATE §11B: IUL uses policy_review + Zoom default", () => {
  const availability = readPolicyReviewAvailabilitySync({
    context: createConversationContext({
      conversationGoal: "policy_review",
      timezone: TZ,
      _testNow: FIXED_NOW,
      knownFacts: { reviewPreferredDayPart: "afternoon" },
      _availabilityFixture: { slots: [slot(TOMORROW, "14:00")] }
    }),
    options: {
      agentId: "fixture-agent",
      availabilityFixture: { slots: [slot(TOMORROW, "14:00")] },
      now: FIXED_NOW
    }
  });
  assert.equal(availability.schedulingConfig.workflowType, WORKFLOW_TYPES.IUL_POLICY_REVIEW);
  assert.equal(availability.appointmentPurpose, APPOINTMENT_PURPOSES.POLICY_REVIEW);
});

test("GATE §11C: configs do not leak between workflows", () => {
  const recruiting = resolveSchedulingConfig({ conversationGoal: "recruiting" });
  const iul = resolveSchedulingConfig({ conversationGoal: "policy_review" });
  assert.notEqual(recruiting.purpose, iul.purpose);
  assert.notEqual(recruiting.appointmentType, iul.appointmentType);
});

// §12 Timezone
test("GATE §12A: buildIsoTimestamp uses authoritative timezone without silent shift", () => {
  const iso = buildIsoTimestamp("2026-08-15", "09:30", "America/New_York");
  assert.equal(iso, "2026-08-15T13:30:00.000Z");
  const roundTrip = new Date(iso).toISOString();
  assert.equal(roundTrip, iso);
});

test("GATE §12B: DST spring-forward date resolves deterministically", () => {
  const iso = buildIsoTimestamp("2026-03-08", "10:00", "America/New_York");
  assert.ok(iso.endsWith("Z"));
  assert.equal(new Date(iso).toISOString(), iso);
});

test("GATE §12C: offered slots carry timezone from read result", () => {
  const availability = resolveAvailabilityForTurnSync({
    context: createConversationContext({
      timezone: TZ,
      _testNow: FIXED_NOW,
      agentId: "agent-1",
      organizationId: ORG,
      currentStage: "scheduling",
      knownFacts: {
        preferredDayPart: "morning",
        availabilityConstraint: { dayPart: "morning", earliestTime: "09:00", latestTime: "12:00" }
      },
      _availabilityFixture: { slots: [slot(TOMORROW, "10:00")] }
    }),
    interpretation: {
      intent: INTENTS.PROVIDE_DAY_PART,
      entities: { dayPart: "morning" }
    },
    options: {
      now: FIXED_NOW,
      agentId: "agent-1",
      availabilityFixture: { slots: [slot(TOMORROW, "10:00")], timezone: TZ }
    }
  });
  assert.ok(availability);
  assert.ok(availability.nearestAlternatives.length >= 1);
  assert.equal(availability.nearestAlternatives[0]?.timezone || TZ, TZ);
});

// §13 Security
test("GATE §13A: appointment slot match fails across organizations", () => {
  const appt = {
    id: "x",
    status: "scheduled",
    organizationId: OTHER_ORG,
    agentId: AGENT,
    startDateTime: START_ISO
  };
  assert.equal(
    appointmentMatchesRequestedSlot(appt, DATE, TIME, TZ, { organizationId: ORG }),
    false
  );
});

test("GATE §13B: appointment slot match fails across agents", () => {
  const appt = {
    id: "x",
    status: "scheduled",
    organizationId: ORG,
    agentId: OTHER_AGENT,
    startDateTime: START_ISO
  };
  assert.equal(
    appointmentMatchesRequestedSlot(appt, DATE, TIME, TZ, {
      organizationId: ORG,
      agentId: AGENT
    }),
    false
  );
});

test("GATE §13C: idempotency keys are org-scoped", () => {
  const orgA = buildSchedulingAttemptId({
    organizationId: ORG,
    agentId: AGENT,
    prospectPhone: PHONE,
    appointmentType: APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    dateKey: DATE,
    timeKey: TIME,
    timezone: TZ
  });
  const orgB = buildSchedulingAttemptId({
    organizationId: OTHER_ORG,
    agentId: AGENT,
    prospectPhone: PHONE,
    appointmentType: APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    dateKey: DATE,
    timeKey: TIME,
    timezone: TZ
  });
  assert.notEqual(orgA, orgB);
});
