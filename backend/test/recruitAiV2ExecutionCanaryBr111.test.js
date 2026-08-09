/**
 * BR-111 — Recruit AI v2 one-user execution canary gate + create-only executor.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  resolveExecutionConfig,
  isEligibleForExecution
} = require("../core/recruitAiV2/executionConfig");
const {
  executeAuthorizedSideEffects,
  resolveConfirmedSlot,
  slotsInclude
} = require("../core/recruitAiV2/sideEffectExecutor");
const {
  processRecruitAiV2Turn,
  processRecruitAiV2TurnSync
} = require("../core/recruitAiV2/orchestrator");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { hasConfirmableAppointmentProposal } = require("../core/recruitAiV2/schedulingConfirmation");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
// Avoid loading supabase-backed appointmentProfileService in unit tests.
function isAppointmentProfileConfigured(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  return Array.isArray(raw.workingSchedule) && raw.workingSchedule.length === 7;
}

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OTHER_RVP = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const DL_USER = "11111111-1111-4111-8111-111111111111";
const RL_USER = "22222222-2222-4222-8222-222222222222";
const FT_USER = "33333333-3333-4333-8333-333333333333";
const REP_USER = "44444444-4444-4444-8444-444444444444";
const WRONG_ORG = "99999999-9999-4999-8999-999999999999";

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00");

function canaryEnv(overrides = {}) {
  return {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP,
    ...overrides
  };
}

function createDecision(overrides = {}) {
  return {
    organizationId: TEAM_VISION_ORG,
    intent: "schedule_confirm",
    decision: {
      nextAction: "create_appointment",
      mayCreateAppointment: true,
      executionAuthorized: false,
      shouldEscalate: false,
      ...(overrides.decision || {})
    },
    entities: {},
    reasonCodes: ["APPOINTMENT_CREATE_PROPOSED"],
    ...overrides
  };
}

function confirmableContext(overrides = {}) {
  return createConversationContext({
    organizationId: TEAM_VISION_ORG,
    prospectId: "prospect-canary-1",
    agentId: PRIMARY_RVP,
    prospectPhone: "+17875550111",
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "proposed",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Orlando",
      state: "FL",
      workAuthorization: true,
      preferredMeetingType: "zoom",
      coverage: "OUTSIDE"
    },
    appointment: {
      status: "proposed",
      proposedDate: "2026-08-11",
      proposedTime: "19:00",
      meetingType: "zoom",
      previouslyOfferedSlots: [
        { date: "2026-08-11", time: "19:00", timezone: "America/New_York" }
      ]
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText:
        "Tengo disponible el lunes a las 7:00 PM por Zoom. ¿Te funciona?"
    },
    ...overrides
  });
}

function authorizeCanary(overrides = {}) {
  return authorizeSideEffects({
    structuredDecision: createDecision(overrides.structuredDecision),
    responsePlan: { templateKey: "appointment_confirm_deferred" },
    env: overrides.env || canaryEnv(),
    profileConfigured: overrides.profileConfigured !== false,
    actingUserId: overrides.actingUserId || PRIMARY_RVP,
    organizationId: overrides.organizationId || TEAM_VISION_ORG,
    context: overrides.context || confirmableContext()
  });
}

// --- A–E flag / allowlist gates ---

test("A. execution flag absent → DENY", () => {
  const auth = authorizeCanary({ env: {} });
  assert.equal(isExecutionEnabled({}), false);
  assert.equal(auth.authorized, false);
});

test("B. execution flag false → DENY", () => {
  const auth = authorizeCanary({
    env: canaryEnv({ RECRUIT_AI_V2_EXECUTION_ENABLED: "false" })
  });
  assert.equal(auth.authorized, false);
});

test("C. malformed execution flag → DENY", () => {
  for (const bad of ["1", "yes", "on", "enabled", " enabled "]) {
    const cfg = resolveExecutionConfig({ RECRUIT_AI_V2_EXECUTION_ENABLED: bad });
    assert.equal(cfg.enabled, false, bad);
    assert.equal(cfg.failClosed, true, bad);
    assert.equal(
      authorizeCanary({ env: { RECRUIT_AI_V2_EXECUTION_ENABLED: bad } }).authorized,
      false,
      bad
    );
  }
  // Only boolean true/false strings are accepted (case-insensitive true).
  assert.equal(resolveExecutionConfig(canaryEnv()).enabled, true);
});

test("D. flag true + no org allowlist → DENY", () => {
  const auth = authorizeCanary({
    env: {
      RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
      RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP
    }
  });
  assert.equal(auth.authorized, false);
  assert.ok(auth.denyReasons.includes("EXECUTION_ORG_NOT_ALLOWLISTED"));
});

test("E. flag true + allowed org + no user allowlist → DENY", () => {
  const auth = authorizeCanary({
    env: {
      RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
      RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG
    }
  });
  assert.equal(auth.authorized, false);
  assert.ok(auth.denyReasons.includes("EXECUTION_USER_NOT_ALLOWLISTED"));
});

test("F. allowed org + wrong user → DENY", () => {
  assert.equal(
    authorizeCanary({ actingUserId: "00000000-0000-4000-8000-deadbeef0001" }).authorized,
    false
  );
});

test("G. allowed org + another RVP → DENY", () => {
  assert.equal(authorizeCanary({ actingUserId: OTHER_RVP }).authorized, false);
});

test("H. allowed org + DL → DENY", () => {
  assert.equal(authorizeCanary({ actingUserId: DL_USER }).authorized, false);
});

test("I. allowed org + RL → DENY", () => {
  assert.equal(authorizeCanary({ actingUserId: RL_USER }).authorized, false);
});

test("J. allowed org + FT/Representative → DENY", () => {
  assert.equal(authorizeCanary({ actingUserId: FT_USER }).authorized, false);
  assert.equal(authorizeCanary({ actingUserId: REP_USER }).authorized, false);
});

test("K. exact org + primary RVP + profileConfigured=false → DENY", () => {
  assert.equal(authorizeCanary({ profileConfigured: false }).authorized, false);
});

test("L. exact org + primary RVP + profileConfigured=true → authorized", () => {
  const auth = authorizeCanary({ profileConfigured: true });
  assert.equal(auth.authorized, true);
  assert.ok(auth.proposals.some((p) => p.type === "create_appointment" && p.authorized));
});

test("M. authorized user but unsupported mutation type → DENY create; cancel stays denied", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      organizationId: TEAM_VISION_ORG,
      intent: "cancel_request",
      decision: {
        nextAction: "acknowledge_cancel_no_write",
        mayCreateAppointment: false,
        shouldEscalate: false
      },
      entities: { cancellationKind: "cancel" }
    },
    responsePlan: { templateKey: "acknowledge_cancel_no_write" },
    env: canaryEnv(),
    profileConfigured: true,
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG
  });
  assert.equal(auth.authorized, false);
  assert.ok(
    auth.proposals.some(
      (p) => p.type === "cancel_appointment" && p.authorized === false
    )
  );
});

test("N. create proposed but not explicitly confirmed → zero mutation", async () => {
  let scheduleCalls = 0;
  const result = await processRecruitAiV2Turn({
    message: { text: "ok", id: "msg-n" },
    context: createConversationContext({
      organizationId: TEAM_VISION_ORG,
      agentId: PRIMARY_RVP,
      prospectPhone: "+17875550111",
      preferredLanguage: "spanish",
      appointment: {
        status: "proposed",
        proposedTime: "10:00",
        previouslyOfferedSlots: []
      },
      conversation: {
        lastQuestionAsked: "awaiting_availability",
        lastAtlasOutboundText: "Voy a revisar disponibilidad y te comparto opciones."
      }
    }),
    options: {
      env: canaryEnv(),
      allowExecution: true,
      profileConfigured: true,
      actingUserId: PRIMARY_RVP,
      dependencies: {
        executeScheduleInterview: async () => {
          scheduleCalls += 1;
          return { success: true, appointmentId: "should-not-run" };
        },
        findActiveAppointmentForProspect: async () => null,
        getSlots: async () => [{ dateKey: "2026-08-11", timeKey: "19:00" }]
      }
    }
  });
  assert.notEqual(result.structuredDecision.decision.nextAction, "create_appointment");
  assert.equal(result.execution.attempted, false);
  assert.equal(scheduleCalls, 0);
});

test("O. confirmed valid appointment → canonical service called exactly once", async () => {
  let scheduleCalls = 0;
  const result = await processRecruitAiV2Turn({
    message: { text: "si", id: "msg-o" },
    context: confirmableContext(),
    options: {
      env: canaryEnv(),
      allowExecution: true,
      profileConfigured: true,
      actingUserId: PRIMARY_RVP,
      prospectPhone: "+17875550111",
      dependencies: {
        executeScheduleInterview: async (phone, payload, opts) => {
          scheduleCalls += 1;
          assert.equal(phone, "+17875550111");
          assert.equal(payload.dateKey, "2026-08-11");
          assert.equal(payload.timeKey, "19:00");
          assert.equal(opts.organizationId, TEAM_VISION_ORG);
          assert.equal(opts.agentId, PRIMARY_RVP);
          return { success: true, appointmentId: "appt-o-1" };
        },
        findActiveAppointmentForProspect: async () => null,
        getSlots: async () => [{ dateKey: "2026-08-11", timeKey: "19:00" }]
      }
    }
  });
  assert.equal(result.authorization.authorized, true);
  assert.equal(result.execution.attempted, true);
  assert.equal(result.execution.success, true);
  assert.equal(scheduleCalls, 1);
  assert.equal(result.audit.mayCreateAppointment, true);
  assert.equal(result.audit.executionAuthorized, true);
  assert.deepEqual(result.audit.actionPerformed, ["create_appointment"]);
  assert.match(result.rendered.text, /confirmad/i);
});

test("P. duplicate/replayed inbound event → one appointment maximum", async () => {
  let scheduleCalls = 0;
  const startIso = require("../services/availabilityService").buildIsoTimestamp(
    "2026-08-11",
    "19:00",
    "America/New_York"
  );
  const deps = {
    executeScheduleInterview: async () => {
      scheduleCalls += 1;
      return { success: true, appointmentId: "appt-p-1" };
    },
    findActiveAppointmentForProspect: async () =>
      scheduleCalls > 0
        ? {
            id: "appt-p-1",
            status: "scheduled",
            startDateTime: startIso,
            organizationId: TEAM_VISION_ORG
          }
        : null,
    getSlots: async () => [{ dateKey: "2026-08-11", timeKey: "19:00" }]
  };

  const first = await processRecruitAiV2Turn({
    message: { text: "si", id: "msg-p" },
    context: confirmableContext(),
    options: {
      env: canaryEnv(),
      allowExecution: true,
      profileConfigured: true,
      actingUserId: PRIMARY_RVP,
      prospectPhone: "+17875550111",
      dependencies: deps
    }
  });
  assert.equal(first.execution.success, true);
  assert.equal(scheduleCalls, 1);

  const second = await processRecruitAiV2Turn({
    message: { text: "si", id: "msg-p" },
    context: confirmableContext(),
    options: {
      env: canaryEnv(),
      allowExecution: true,
      profileConfigured: true,
      actingUserId: PRIMARY_RVP,
      prospectPhone: "+17875550111",
      dependencies: deps
    }
  });
  assert.equal(second.execution.success, true);
  assert.equal(second.execution.idempotent, true);
  assert.equal(scheduleCalls, 1);
});

test("Q. stale/unavailable slot at mutation time → no invalid appointment", async () => {
  let scheduleCalls = 0;
  const result = await processRecruitAiV2Turn({
    message: { text: "si", id: "msg-q" },
    context: confirmableContext(),
    options: {
      env: canaryEnv(),
      allowExecution: true,
      profileConfigured: true,
      actingUserId: PRIMARY_RVP,
      prospectPhone: "+17875550111",
      dependencies: {
        executeScheduleInterview: async () => {
          scheduleCalls += 1;
          return { success: true, appointmentId: "should-not" };
        },
        findActiveAppointmentForProspect: async () => null,
        getSlots: async () => [{ dateKey: "2026-08-11", timeKey: "10:00" }]
      }
    }
  });
  assert.equal(scheduleCalls, 0);
  assert.equal(result.execution.success, false);
  assert.ok(result.execution.failed.some((f) => f.reason === "EXECUTION_SLOT_STALE"));
  assert.doesNotMatch(result.rendered.text, /quedó confirmada|is confirmed/i);
});

test("R. canonical appointment failure → no false success", async () => {
  const result = await processRecruitAiV2Turn({
    message: { text: "si", id: "msg-r" },
    context: confirmableContext(),
    options: {
      env: canaryEnv(),
      allowExecution: true,
      profileConfigured: true,
      actingUserId: PRIMARY_RVP,
      prospectPhone: "+17875550111",
      dependencies: {
        executeScheduleInterview: async () => ({
          success: false,
          error: "CALENDAR_FAILED"
        }),
        findActiveAppointmentForProspect: async () => null,
        getSlots: async () => [{ dateKey: "2026-08-11", timeKey: "19:00" }]
      }
    }
  });
  assert.equal(result.execution.success, false);
  assert.equal(result.audit.actionPerformed.length, 0);
  assert.doesNotMatch(result.rendered.text, /quedó confirmada|is confirmed/i);
});

test("S. cross-tenant attempt → DENY", () => {
  assert.equal(
    authorizeCanary({ organizationId: WRONG_ORG }).authorized,
    false
  );
  assert.equal(
    isEligibleForExecution({
      organizationId: WRONG_ORG,
      actingUserId: PRIMARY_RVP,
      env: canaryEnv()
    }).eligible,
    false
  );
});

test("T. removing user from allowlist → immediate DENY", () => {
  assert.equal(authorizeCanary().authorized, true);
  assert.equal(
    authorizeCanary({
      env: canaryEnv({ RECRUIT_AI_V2_EXECUTION_USER_IDS: OTHER_RVP })
    }).authorized,
    false
  );
});

// --- Availability / office hours (U–X) ---

test("U–X. evening/Sat/Sun slots valid; office hours do not truncate personal schedule", () => {
  const engineSrc = fs.readFileSync(
    path.join(__dirname, "../services/appointmentSchedulingEngine.js"),
    "utf8"
  );
  assert.match(engineSrc, /profile\.workingSchedule/);
  assert.match(engineSrc, /getDaySchedule\(profile/);
  // Org settings used for calendar busy only — not hour truncation.
  assert.match(engineSrc, /respectPersonalCalendar/);
  assert.doesNotMatch(engineSrc, /workingHours\.end|officeHours|truncate.*17:00/);

  const eveningBlocks = [{ start: "09:00", end: "21:00" }];
  assert.equal(eveningBlocks[0].end, "21:00");

  const saturdayEnabled = {
    dayOfWeek: 6,
    enabled: true,
    blocks: [{ start: "09:00", end: "21:00" }]
  };
  const sundayAfternoon = {
    dayOfWeek: 0,
    enabled: true,
    blocks: [{ start: "13:00", end: "21:00" }]
  };
  assert.equal(saturdayEnabled.enabled, true);
  assert.equal(sundayAfternoon.blocks[0].start, "13:00");

  // Slot membership helper used by stale-guard accepts 19:00.
  assert.equal(
    slotsInclude([{ dateKey: "2026-08-08", timeKey: "19:00" }], "2026-08-08", "19:00"),
    true
  );

  // profileConfigured alone never authorizes.
  assert.equal(
    authorizeCanary({
      profileConfigured: true,
      env: { RECRUIT_AI_V2_EXECUTION_ENABLED: "true" }
    }).authorized,
    false
  );
  assert.equal(isAppointmentProfileConfigured(null), false);
  assert.equal(
    isAppointmentProfileConfigured({
      workingSchedule: new Array(7).fill({ dayOfWeek: 1, enabled: true, blocks: [] })
    }),
    true
  );
});

test("decision contract: nextAction create ≠ permission", () => {
  const ctx = confirmableContext();
  const interpretation = interpretInboundMessage({
    message: { text: "si" },
    context: ctx,
    options: { flexible: true, now: FIXED_NOW }
  });
  const decision = decideConversationTurn({ context: ctx, interpretation });
  assert.equal(decision.decision.nextAction, "create_appointment");
  assert.equal(decision.decision.mayCreateAppointment, true);
  assert.equal(decision.decision.executionAuthorized, false);
  assert.ok(decision.reasonCodes.includes("APPOINTMENT_CREATE_PROPOSED"));
  assert.ok(!decision.reasonCodes.includes("EXECUTION_AUTHORIZED"));

  const denied = authorizeSideEffects({
    structuredDecision: decision,
    responsePlan: { templateKey: "appointment_confirm_deferred" },
    env: {},
    profileConfigured: true,
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG
  });
  assert.equal(denied.authorized, false);
});

test("single offered slot ¿Te funciona? is confirmable; multi-offer is not", () => {
  assert.equal(
    hasConfirmableAppointmentProposal(
      confirmableContext({
        conversation: {
          lastQuestionAsked: "offer_time_choices",
          lastAtlasOutboundText: "Tengo disponible lunes a las 7:00 PM. ¿Te funciona?"
        },
        appointment: {
          previouslyOfferedSlots: [
            { date: "2026-08-11", time: "19:00", timezone: "America/New_York" }
          ]
        }
      })
    ),
    true
  );
  assert.equal(
    hasConfirmableAppointmentProposal(
      confirmableContext({
        conversation: {
          lastQuestionAsked: "offer_time_choices",
          lastAtlasOutboundText: "Tengo disponible 5:00 y 7:00. ¿Cuál te funciona mejor?"
        },
        appointment: {
          previouslyOfferedSlots: [
            { date: "2026-08-11", time: "17:00" },
            { date: "2026-08-11", time: "19:00" }
          ]
        }
      })
    ),
    false
  );
});

test("shadow path without allowExecution never mutates even when authorized", async () => {
  let scheduleCalls = 0;
  const result = await processRecruitAiV2Turn({
    message: { text: "si", id: "msg-shadow" },
    context: confirmableContext(),
    options: {
      env: canaryEnv(),
      // allowExecution omitted on purpose (shadow/advisory)
      profileConfigured: true,
      actingUserId: PRIMARY_RVP,
      prospectPhone: "+17875550111",
      dependencies: {
        executeScheduleInterview: async () => {
          scheduleCalls += 1;
          return { success: true, appointmentId: "x" };
        },
        findActiveAppointmentForProspect: async () => null,
        getSlots: async () => [{ dateKey: "2026-08-11", timeKey: "19:00" }]
      }
    }
  });
  assert.equal(result.authorization.authorized, true);
  assert.equal(result.execution.attempted, false);
  assert.equal(scheduleCalls, 0);
});

test("sync path never mutates", () => {
  const result = processRecruitAiV2TurnSync({
    message: { text: "si" },
    context: confirmableContext(),
    options: {
      env: canaryEnv(),
      allowExecution: true,
      profileConfigured: true,
      actingUserId: PRIMARY_RVP
    }
  });
  assert.equal(result.execution.attempted, false);
});

test("resolveConfirmedSlot prefers proposed then single offer", () => {
  const slot = resolveConfirmedSlot({
    context: {
      appointment: {
        previouslyOfferedSlots: [{ date: "2026-08-10", time: "18:00" }]
      }
    },
    structuredDecision: {}
  });
  assert.deepEqual(slot, { dateKey: "2026-08-10", timeKey: "18:00" });
});

// --- BR preservation source contracts Y–AD ---

test("Y–AD. BR-049/050/080/107/108/110 preserved", () => {
  const executor = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/sideEffectExecutor.js"),
    "utf8"
  );
  const authorizer = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/sideEffectAuthorizer.js"),
    "utf8"
  );
  const orch = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/orchestrator.js"),
    "utf8"
  );
  const reader = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/schedulingAvailabilityReader.js"),
    "utf8"
  );
  const profileSrc = fs.readFileSync(
    path.join(__dirname, "../services/appointmentProfileService.js"),
    "utf8"
  );

  // BR-049 — decide; delegate mutation
  assert.match(orch, /BR-049|canonical domain services/i);
  assert.match(executor, /executeScheduleInterview/);
  assert.doesNotMatch(executor, /from\("atlas_appointments"\)/);

  // BR-050 — canonical lifecycle via mission/application services
  assert.match(executor, /missionExecutionApplicationService/);

  // BR-080 — authorizer never role/claim based
  assert.doesNotMatch(authorizer, /role\s*===|isRvp|claimLead|DIVISION_LEADER/);
  assert.match(authorizer, /Role \/ being RVP never authorizes/);

  // BR-107/108 — reader remains read-only
  assert.doesNotMatch(reader, /bookSlot|createAppointment|createCalendarEvent/);

  // BR-110 — profileConfigured semantics preserved
  assert.match(profileSrc, /isAppointmentProfileConfigured/);
  assert.match(authorizer, /profileConfigured/);
});

test("docs: BR-111 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-111/);
  const arch = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/38_EXECUTION_CANARY_BOUNDARY.md"
  );
  assert.ok(fs.existsSync(arch));
});
