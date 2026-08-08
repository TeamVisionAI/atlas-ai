/**
 * BR-117 — durable context date sanitizer + copy/email execution readiness.
 * Execution remains OFF. No production writes.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  maskPhoneLike,
  isExactIsoTemporal,
  sanitizeContextForPersistence
} = require("../core/recruitAiV2/contextSanitizer");
const {
  createContextPersistenceService,
  createMemoryContextRepository
} = require("../core/recruitAiV2");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { buildReconstructionInput } = require("../core/recruitAiV2/shadowEvaluationService");
const { resolveCanonicalProspectEmail } = require("../core/recruitAiV2/prospectEmail");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  executeAuthorizedSideEffects
} = require("../core/recruitAiV2/sideEffectExecutor");
const { isEligibleForLiveAuthoring } = require("../core/recruitAiV2/liveAuthoringConfig");
const { REASON_CODES } = require("../core/recruitAiV2/constants");

const ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PROSPECT = "83167302-cd24-4708-b11d-95815aa43568";

test("1–3. ISO date and datetime forms survive maskPhoneLike", () => {
  assert.equal(maskPhoneLike("2026-08-09"), "2026-08-09");
  assert.equal(maskPhoneLike("2026-12-31"), "2026-12-31");
  assert.equal(maskPhoneLike("2026-08-09T23:30:00Z"), "2026-08-09T23:30:00Z");
  assert.equal(
    maskPhoneLike("2026-08-09T23:30:00.000Z"),
    "2026-08-09T23:30:00.000Z"
  );
  assert.equal(
    maskPhoneLike("2026-08-09T19:30:00-04:00"),
    "2026-08-09T19:30:00-04:00"
  );
  assert.equal(
    maskPhoneLike("2026-08-09T19:30:00+00:00"),
    "2026-08-09T19:30:00+00:00"
  );
  assert.equal(isExactIsoTemporal("2026-08-09"), true);
  assert.equal(isExactIsoTemporal("+17867527481"), false);
  assert.equal(maskPhoneLike(ORG), ORG);
  assert.equal(maskPhoneLike(PROSPECT), PROSPECT);
});

test("4–5. nested offered slots + proposedDate round-trip persistence exactly", async () => {
  const context = createConversationContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    preferredLanguage: "spanish",
    timezone: "America/New_York",
    appointment: {
      status: "proposed",
      proposedDate: "2026-08-09",
      proposedTime: "19:30",
      proposedDateLabel: "domingo",
      previouslyOfferedSlots: [
        { date: "2026-08-08", time: "19:30", timezone: "America/New_York" },
        { date: "2026-08-09", time: "19:30", timezone: "America/New_York" }
      ]
    }
  });

  const sanitized = sanitizeContextForPersistence(context);
  assert.equal(sanitized.appointment.proposedDate, "2026-08-09");
  assert.equal(sanitized.appointment.proposedTime, "19:30");
  assert.equal(sanitized.timezone, "America/New_York");
  assert.deepEqual(
    sanitized.appointment.previouslyOfferedSlots.map((s) => `${s.date} ${s.time}`),
    ["2026-08-08 19:30", "2026-08-09 19:30"]
  );
  assert.doesNotMatch(
    JSON.stringify({
      proposedDate: sanitized.appointment.proposedDate,
      slots: sanitized.appointment.previouslyOfferedSlots
    }),
    /\+\*\*\*/
  );
  assert.equal(sanitized.organizationId, ORG);
  assert.equal(sanitized.prospectId, PROSPECT);

  const service = createContextPersistenceService({
    repository: createMemoryContextRepository()
  });
  await service.createContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    channel: "whatsapp",
    context: sanitized
  });
  const loaded = await service.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    channel: "whatsapp"
  });
  assert.equal(loaded.appointment.proposedDate, "2026-08-09");
  assert.equal(loaded.appointment.proposedTime, "19:30");
  assert.equal(loaded.timezone, "America/New_York");
  assert.equal(loaded.appointment.previouslyOfferedSlots[0].date, "2026-08-08");
  assert.equal(loaded.appointment.previouslyOfferedSlots[1].date, "2026-08-09");
});

test("6–8. real phones still masked; PII policy intact", () => {
  assert.equal(maskPhoneLike("+17867527481"), "+***7481");
  assert.equal(maskPhoneLike("+1 (786) 555-7338"), "+***7338");
  const text = sanitizeContextForPersistence({
    phone: "+17865537338",
    hiddenReasoning: "secret",
    conversation: {
      lastAtlasOutboundText: "Call me at +1 (786) 555-7338 please on 2026-08-09"
    },
    appointment: { proposedDate: "2026-08-09" }
  });
  assert.equal(text.hiddenReasoning, undefined);
  assert.match(String(text.phone), /\*\*\*/);
  assert.doesNotMatch(text.conversation.lastAtlasOutboundText, /7865557338|555-7338/);
  assert.match(text.conversation.lastAtlasOutboundText, /2026-08-09/);
  assert.equal(text.appointment.proposedDate, "2026-08-09");
});

test("9. unresolved date never renders el ese día", () => {
  const rendered = renderCustomerReply({
    templateKey: "acknowledge_known_availability_confirm_slot",
    language: "spanish",
    acknowledgeRequest: true,
    forbidInternalDiagnostics: true,
    entities: {
      earliestTime: "19:00",
      requestedTime: "19:30",
      dateLabel: null
    }
  });
  assert.doesNotMatch(rendered.text, /el ese d[ií]a/i);
  assert.match(rendered.text, /a las 7:30\s*PM/i);
  assert.doesNotMatch(rendered.text, /el a las/i);
});

test("10. first-time después de las 7 does not say tienes razón / me dijiste", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    timezone: "America/New_York",
    organizationId: ORG,
    agentId: PRIMARY_RVP,
    currentStage: "scheduling",
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      // Stale prior constraint must NOT alone trigger correction language.
      availabilityConstraint: {
        earliestTime: "19:00",
        earliestTimeInclusive: false,
        dayPart: "evening",
        raw: "despues de las 7"
      }
    },
    appointment: {
      status: "proposed",
      // Stale time-only without date must not confirm "ese día".
      proposedTime: "19:30",
      previouslyOfferedSlots: []
    },
    conversation: { lastQuestionAsked: "ask_time_preference" }
  });

  const interpretation = interpretInboundMessage({
    message: { text: "Despues de las 7" },
    context,
    options: { flexible: true, now: new Date("2026-08-08T15:00:00.000-04:00") }
  });
  assert.equal(interpretation.entities?.repetitionSignal, false);

  const decision = decideConversationTurn({
    context,
    interpretation,
    availability: null
  });
  const text = renderCustomerReply(decision.customerReplyPlan).text;
  assert.doesNotMatch(text, /tienes raz[oó]n|me dijiste/i);
  assert.doesNotMatch(text, /el ese d[ií]a/i);
  assert.ok(
    decision.reasonCodes.includes(REASON_CODES.AVAILABILITY_CONSTRAINT_CAPTURED)
  );
  assert.equal(
    decision.reasonCodes.includes(REASON_CODES.REPETITION_ACKNOWLEDGED),
    false
  );
});

test("11. genuine reassertion still available when appropriate", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    timezone: "America/New_York",
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      availabilityConstraint: {
        earliestTime: "19:00",
        earliestTimeInclusive: false,
        dayPart: "evening",
        raw: "despues de las 7"
      }
    },
    appointment: {
      status: "proposed",
      proposedDate: "2026-08-09",
      proposedDateLabel: "domingo",
      proposedTime: "19:30"
    },
    conversation: { lastQuestionAsked: "confirm_slot" }
  });

  const interpretation = interpretInboundMessage({
    message: { text: "ya te dije que despues de las 7" },
    context,
    options: { flexible: true, now: new Date("2026-08-08T15:00:00.000-04:00") }
  });
  assert.equal(interpretation.entities?.repetitionSignal, true);

  const decision = decideConversationTurn({
    context,
    interpretation,
    availability: null
  });
  const text = renderCustomerReply(decision.customerReplyPlan).text;
  assert.match(text, /tienes raz[oó]n|me dijiste/i);
  assert.doesNotMatch(text, /el ese d[ií]a/i);
  assert.match(text, /domingo/i);
  assert.ok(decision.reasonCodes.includes(REASON_CODES.REPETITION_ACKNOWLEDGED));
});

test("12 + 14. canonical captured email hydrates knownFacts; no duplicate ask", () => {
  assert.equal(
    resolveCanonicalProspectEmail({
      notes: "QUAL_CAPTURE:{\"email\":true}|EMAIL:otcnpms@gmail.com"
    }),
    "otcnpms@gmail.com"
  );
  assert.equal(
    resolveCanonicalProspectEmail({ email: "Tony@Example.com" }),
    "tony@example.com"
  );

  const rebuilt = buildReconstructionInput({
    id: PROSPECT,
    organization_id: ORG,
    name: "Tony",
    city: "Miami",
    state: "FL",
    notes: "EMAIL:otcnpms@gmail.com"
  });
  assert.equal(rebuilt.knownFacts.email, "otcnpms@gmail.com");

  // Column wins when present.
  const rebuiltCol = buildReconstructionInput({
    id: PROSPECT,
    organization_id: ORG,
    email: "primary@teamvision.ai",
    notes: "EMAIL:notes@example.com"
  });
  assert.equal(rebuiltCol.knownFacts.email, "primary@teamvision.ai");
});

test("13. missing email does not block create_appointment (optional invitation field)", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    timezone: "America/New_York",
    organizationId: ORG,
    agentId: PRIMARY_RVP,
    currentStage: "proposed",
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      email: null,
      name: "Tony",
      preferredMeetingType: "in_person"
    },
    appointment: {
      status: "proposed",
      proposedDate: "2026-08-09",
      proposedTime: "19:30",
      previouslyOfferedSlots: [
        { date: "2026-08-09", time: "19:30", timezone: "America/New_York" }
      ]
    },
    conversation: { lastQuestionAsked: "confirm_slot" }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "Si" },
    context,
    options: { flexible: true, now: new Date("2026-08-08T15:00:00.000-04:00") }
  });
  const decision = decideConversationTurn({
    context,
    interpretation,
    availability: null
  });
  assert.equal(decision.decision.nextAction, "create_appointment");
  assert.equal(decision.decision.mayCreateAppointment, true);
  assert.equal(decision.customerReplyPlan.templateKey, "appointment_confirm_deferred");
  assert.doesNotMatch(
    String(decision.customerReplyPlan.templateKey || ""),
    /ask_email|collect_email/
  );
});

test("15–16. execution stays denied; zero mutations when gates OFF", async () => {
  const context = createConversationContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    agentId: PRIMARY_RVP,
    preferredLanguage: "spanish",
    appointment: {
      status: "proposed",
      proposedDate: "2026-08-09",
      proposedTime: "19:30"
    }
  });
  const structuredDecision = {
    decision: {
      nextAction: "create_appointment",
      mayCreateAppointment: true,
      executionAuthorized: false,
      sideEffectsEnabled: false
    },
    reasonCodes: [REASON_CODES.APPOINTMENT_CREATE_PROPOSED],
    customerReplyPlan: { templateKey: "appointment_confirm_deferred" }
  };
  const auth = authorizeSideEffects({
    structuredDecision,
    context,
    responsePlan: structuredDecision.customerReplyPlan,
    env: {
      RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
    },
    options: { allowExecution: false }
  });
  assert.equal(auth.authorized, false);
  const executed = await executeAuthorizedSideEffects({
    authorization: auth,
    structuredDecision,
    context
  });
  assert.equal(executed.attempted, false);
  assert.equal((executed.performed || []).length, 0);
});

test("17–18. BR-114/115/116/050 preserved in this change (source + eligibility)", () => {
  const eligibility = isEligibleForLiveAuthoring({
    organizationId: ORG,
    actingUserId: PRIMARY_RVP,
    env: {
      RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
      RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG,
      RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: PRIMARY_RVP
    }
  });
  assert.equal(eligibility.eligible, true);

  const sanitizer = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/contextSanitizer.js"),
    "utf8"
  );
  assert.match(sanitizer, /ISO_TEMPORAL_TOKEN|isExactIsoTemporal|BR-117|UUID_TOKEN/);
  assert.match(sanitizer, /PHONE_LIKE/);

  const decisionSrc = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"),
    "utf8"
  );
  assert.match(decisionSrc, /OFFERED_SLOT_NATURAL_TIME_SELECTED|tryApplyAvailabilityOffer/);
  assert.match(decisionSrc, /genuineRepetition/);

  const tzCandidates = [
    path.join(__dirname, "../core/timezone.js"),
    path.join(__dirname, "../services/schedulingService.js"),
    path.join(__dirname, "../core/appointmentSchedulingEngine.js")
  ];
  assert.ok(
    tzCandidates.some((p) => {
      if (!fs.existsSync(p)) return false;
      const src = fs.readFileSync(p, "utf8");
      return /zonedTimeToUtcMs|buildIsoTimestamp|America\/New_York/.test(src);
    })
  );
});
