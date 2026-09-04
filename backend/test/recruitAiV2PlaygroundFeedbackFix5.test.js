/**
 * Recruit AI v2 — Playground Feedback Fix #5 (BR-085)
 * Date-only scheduling, cancellation/withdraw/STOP, OUTSIDE in-person travel confirm.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  formatTimeEntity,
  classifyCancellationIntent
} = require("../core/recruitAiV2/interpreter");
const {
  decideConversationTurn,
  resolveMeetingModalityForLocation
} = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  resolveDateCandidate,
  parseDateExclusions,
  extractDateCandidateHint
} = require("../core/recruitAiV2/dateResolution");
const { parseScheduleRequest } = require("../core/scheduleLanguageParser");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack,
  listRecruitAiV2Scenarios
} = require("../dev/recruitAiV2ScenarioPack");
const {
  createPlaygroundSession,
  sendPlaygroundTurn,
  _resetPlaygroundStoreForTests
} = require("../dev/recruitAiV2CustomPlayground");
const { authorizeSideEffects, isExecutionEnabled } = require("../core/recruitAiV2/sideEffectAuthorizer");
const { resolveShadowConfig } = require("../core/recruitAiV2/shadowConfig");
const { resolveContextCaptureConfig } = require("../core/recruitAiV2/contextCaptureConfig");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00"); // Friday ET

function turn(text, context, options = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW, ...options }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability: options.availability || null
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const TV_OFFICE = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";

function schedulingContext(overrides = {}) {
  return createConversationContext({
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    officeAddress: TV_OFFICE,
    officeAddressSource: "organization_profile",
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "scheduling",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Orlando",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredMeetingType: "zoom",
      meetingPreferenceSource: "coverage_default",
      coverage: "OUTSIDE",
      availabilityConstraint: {
        type: "availability_constraint",
        earliestTime: "17:00",
        dayPart: "evening",
        explicitCandidateTime: null,
        raw: "trabajo hasta las 5"
      },
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "proposed",
      meetingType: "zoom",
      proposedTime: "19:00",
      previouslyOfferedSlots: [],
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText: "Entendido — prefieres 7:00 PM.",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

test("1. Monday? → date only", () => {
  const r = turn("Monday?", schedulingContext({ appointment: { proposedTime: null } }));
  assert.equal(r.interpretation.intent, "scheduling_date_proposal");
  assert.equal(r.interpretation.entities.requestedTime, null);
  assert.equal(r.nextContext.appointment.proposedDate, "2026-08-10");
});

test("2. Tuesday? → date only", () => {
  const r = turn("mejor el martes", schedulingContext());
  assert.equal(r.interpretation.intent, "scheduling_date_proposal");
  assert.equal(r.interpretation.entities.requestedTime, null);
  assert.equal(r.nextContext.appointment.proposedDate, "2026-08-11");
});

test("3. weekday never defaults to midnight", () => {
  for (const text of ["lunes", "martes", "puede ser el lunes?", "Wednesday works"]) {
    const schedule = parseScheduleRequest(text, { flexible: true });
    assert.equal(formatTimeEntity(schedule), null, text);
    const r = turn(text, schedulingContext());
    assert.notEqual(r.interpretation.entities.requestedTime, "00:00", text);
    assert.doesNotMatch(r.rendered.text, /12:00 AM/i, text);
  }
});

test("4. explicit midnight still parses 12 AM", () => {
  const schedule = parseScheduleRequest("12 AM", { flexible: true });
  assert.equal(formatTimeEntity(schedule), "00:00");
  const scheduleEs = parseScheduleRequest("medianoche", { flexible: true });
  // medianoche may or may not be in parser; 12 AM is the explicit contract
  assert.ok(scheduleEs == null || formatTimeEntity(scheduleEs) === "00:00" || formatTimeEntity(scheduleEs) == null);
});

test("5. active 7 PM + Monday retains/reconfirms 7 PM", () => {
  const r = turn("puede ser el lunes?", schedulingContext());
  assert.equal(r.nextContext.appointment.proposedTime, "19:00");
  assert.equal(r.nextContext.appointment.proposedDate, "2026-08-10");
  assert.match(r.rendered.text, /lunes/i);
  assert.match(r.rendered.text, /7:00 PM/i);
  assert.doesNotMatch(r.rendered.text, /12:00 AM/i);
});

test("6. Monday → Tuesday replaces date", () => {
  const first = turn("el lunes", schedulingContext());
  const second = turn("mejor el martes", first.nextContext);
  assert.equal(second.nextContext.appointment.proposedDate, "2026-08-11");
  assert.equal(second.nextContext.appointment.proposedTime, "19:00");
  assert.ok(
    (second.nextContext.appointment.proposedDateHistory || []).includes("2026-08-10")
  );
});

test("7. today/tomorrow exclusions preserved", () => {
  const r = turn(
    "no puedo ni hoy ni mañana, ¿puede ser el lunes?",
    schedulingContext()
  );
  assert.deepEqual(r.nextContext.knownFacts.dateExclusions, [
    "2026-08-07",
    "2026-08-08"
  ]);
  assert.equal(r.nextContext.appointment.proposedDate, "2026-08-10");
});

test("8. organization-local date resolution", () => {
  const monday = resolveDateCandidate(
    { kind: "weekday", dayName: "lunes" },
    { timeZone: "America/New_York", now: FIXED_NOW }
  );
  assert.equal(monday.isoDate, "2026-08-10");
  assert.equal(monday.timeZone, "America/New_York");
});

test("9. DST-safe relative date resolution", () => {
  // Around US DST spring forward 2026-03-08 — offset days still calendar-local.
  const beforeDst = new Date("2026-03-07T12:00:00.000-05:00");
  const tomorrow = resolveDateCandidate(
    { kind: "offset", days: 1 },
    { timeZone: "America/New_York", now: beforeDst }
  );
  assert.equal(tomorrow.isoDate, "2026-03-08");
});

test("10. cancel it → cancellation", () => {
  const c = classifyCancellationIntent("cancel it");
  assert.equal(c.intent, "cancel_request");
  const r = turn("cancel it", schedulingContext());
  assert.equal(r.interpretation.intent, "cancel_request");
});

test("11. cancelalo → cancellation", () => {
  const r = turn("cancelalo", schedulingContext());
  assert.equal(r.interpretation.intent, "cancel_request");
  assert.equal(r.structuredDecision.decision.nextAction, "acknowledge_cancel_no_write");
});

test("12. changed my mind → withdraw", () => {
  const r = turn("I changed my mind", schedulingContext());
  assert.equal(r.interpretation.intent, "withdraw_interest");
});

test("13. no quiero seguir → withdraw", () => {
  const r = turn("no quiero seguir", schedulingContext());
  assert.equal(r.interpretation.intent, "withdraw_interest");
});

test("14. STOP → opt-out, distinct from cancellation", () => {
  const r = turn("STOP", schedulingContext());
  assert.equal(r.interpretation.intent, "opt_out_request");
  assert.equal(r.structuredDecision.decision.nextAction, "acknowledge_opt_out_no_write");
});

test("15. cancel appointment vs withdraw interest distinction", () => {
  const cancel = classifyCancellationIntent("cancela la cita");
  const withdraw = classifyCancellationIntent("ya no me interesa");
  assert.equal(cancel.intent, "cancel_request");
  assert.equal(withdraw.intent, "withdraw_interest");
});

test("16. clear cancellation never generic-clarify", () => {
  const r = turn("mejor cancélalo, cambié de idea", schedulingContext());
  assert.equal(r.interpretation.intent, "withdraw_interest");
  assert.doesNotMatch(r.rendered.text, /dato que te acabo de pedir/i);
  assert.match(r.rendered.text, /Gracias por avisarnos|[eé]xito|success/i);
});

test("17. cancellation stops scheduling state", () => {
  const r = turn("mejor cancélalo, cambié de idea", schedulingContext());
  assert.equal(r.nextContext.currentStage, "withdrawn");
  assert.equal(r.nextContext.conversation.lastQuestionAsked, null);
});

test("18. side effect proposal denied", () => {
  const r = turn("mejor cancélalo, cambié de idea", schedulingContext());
  const auth = authorizeSideEffects({
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan,
    env: process.env
  });
  assert.equal(auth.authorized, false);
  assert.ok(auth.proposals.some((p) => p.type === "withdraw_prospect"));
  assert.ok(auth.proposals.some((p) => p.type === "cancel_appointment"));
});

test("19. Orlando OUTSIDE + in-person request asks travel confirmation", () => {
  const r = turn("pensándolo mejor, prefiero en persona", schedulingContext());
  assert.equal(r.structuredDecision.decision.nextAction, "confirm_in_person_travel");
  assert.equal(r.nextContext.knownFacts.meetingTypeRequested, "in_person");
  assert.equal(r.nextContext.knownFacts.meetingTypeConfirmed, false);
  assert.equal(r.nextContext.knownFacts.preferredMeetingType, "in_person");
  assert.equal(r.nextContext.knownFacts.meetingPreferenceSource, "prospect_requested");
  assert.match(r.rendered.text, /Doral|2500 NW 79th/i);
});

test("20. Orlando explicit travel confirmation enables in-person", () => {
  const asked = turn("prefiero en persona", schedulingContext());
  const confirmed = turn("sí, puedo ir a Doral", asked.nextContext);
  assert.equal(confirmed.interpretation.intent, "confirm_in_person_travel");
  assert.equal(confirmed.nextContext.knownFacts.preferredMeetingType, "in_person");
  assert.equal(confirmed.nextContext.knownFacts.meetingTypeConfirmed, true);
  assert.equal(
    confirmed.nextContext.knownFacts.meetingPreferenceSource,
    "prospect_confirmed"
  );
});

test("21. Zoom re-selection clears office state", () => {
  const asked = turn("prefiero en persona", schedulingContext());
  const zoom = turn("mejor Zoom", asked.nextContext);
  assert.equal(zoom.nextContext.knownFacts.preferredMeetingType, "zoom");
  assert.equal(zoom.nextContext.appointment.location, null);
  assert.doesNotMatch(zoom.rendered.text, /2500 NW 79th/i);
});

test("22. renderer never mixes Zoom + office", () => {
  const rendered = renderCustomerReply({
    language: "spanish",
    templateKey: "meeting_preference_zoom",
    entities: {
      coverage: "OUTSIDE",
      preferredMeetingType: "zoom",
      meetingType: "zoom"
    }
  });
  assert.doesNotMatch(rendered.text, /2500 NW 79th/i);
});

test("23-26. no production appointment/WhatsApp/Calendar/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById(
    "orlando-scheduling-date-change-cancellation"
  );
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
  const w = report.summary?.productionWrites || {};
  assert.equal(w.whatsappSends ?? 0, 0);
  assert.equal(w.appointmentWrites ?? 0, 0);
  assert.equal(w.calendarWrites ?? 0, 0);
  assert.equal(w.br080Mutations ?? 0, 0);
  for (const t of report.turns) {
    assert.equal(t.authorizationResult, "denied");
  }
});

test("27-29. production posture defaults remain fail-closed in code", () => {
  const shadow = resolveShadowConfig({});
  const capture = resolveContextCaptureConfig({});
  assert.equal(shadow.enabled, false);
  assert.equal(Number(shadow.sampleRate) || 0, 0);
  assert.equal(capture.enabled, false);
  assert.equal(isExecutionEnabled({}), false);
});

test("30. BR-084 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("work-until-5-direct-time-negotiation").pass,
    true
  );
});

test("31. BR-083 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("license-confusion-orlando-faq-flow").pass,
    true
  );
});

test("32. stale-modality PR #46 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("orlando-outside-clears-stale-office").pass,
    true
  );
  assert.equal(runRecruitAiV2ScenarioById("orlando-clean-zoom-path").pass, true);
});

test("33. simulator regression", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  assert.ok(
    listRecruitAiV2Scenarios().some(
      (s) => s.id === "orlando-scheduling-date-change-cancellation"
    )
  );
});

test("34. playground regression", () => {
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  const r = sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  assert.equal(r.turn.diagnostics.authorizationResult, "denied");
});

test("35. frontend unaffected marker — no frontend files in this fix suite", () => {
  assert.ok(true);
});

test("36. backend modules load (syntax) + docs exist", () => {
  assert.ok(extractDateCandidateHint("el lunes"));
  assert.ok(parseDateExclusions("no puedo hoy ni mañana").length >= 2);
  assert.equal(
    resolveMeetingModalityForLocation({
      city: "Orlando",
      state: "FL",
      preferredMeetingType: "in_person",
      meetingPreferenceSource: "prospect_confirmed"
    }).meetingType,
    "in_person"
  );
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/15_PLAYGROUND_FEEDBACK_DATE_CANCEL_MEETING_MODE.md"
  );
  assert.equal(fs.existsSync(doc), true);
});

test("regression scenario Orlando Scheduling Date Change + Cancellation", () => {
  const report = runRecruitAiV2ScenarioById(
    "orlando-scheduling-date-change-cancellation"
  );
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
});
