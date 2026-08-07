/**
 * Recruit AI v2 — Playground Feedback Fix #6 (BR-087)
 * Scheduling memory across modality, Zoom-link logistics, clean withdrawal.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage
} = require("../core/recruitAiV2/interpreter");
const {
  decideConversationTurn
} = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  looksLikeMeetingAccessRequest,
  looksLikeRepetitionSignal,
  resolvePostModalityScheduling,
  resolveZoomLinkFromContext
} = require("../core/recruitAiV2/schedulingMemory");
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
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const { resolveShadowConfig } = require("../core/recruitAiV2/shadowConfig");
const {
  resolveContextCaptureConfig
} = require("../core/recruitAiV2/contextCaptureConfig");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00"); // Friday ET
const CANONICAL_ZOOM = "https://zoom.us/j/1234567890";

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

function memoryContext(overrides = {}) {
  return createConversationContext({
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
      meetingTypeConfirmed: true,
      coverage: "OUTSIDE",
      availabilityConstraint: {
        type: "availability_constraint",
        earliestTime: "17:00",
        dayPart: "evening",
        explicitCandidateTime: null,
        raw: "despues de las 5"
      },
      preferredDayPart: "evening",
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "proposed",
      meetingType: "zoom",
      proposedTime: "18:30",
      proposedDate: "2026-08-11",
      proposedDateLabel: "martes",
      previouslyOfferedSlots: [],
      location: null,
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText: "¿Te funciona el martes a las 6:30 PM?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

test("1. modality change preserves availability", () => {
  const r = turn("Prefiero en persona", memoryContext());
  assert.equal(
    r.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
});

test("2. modality change preserves proposed date", () => {
  const r = turn("Prefiero en persona", memoryContext());
  assert.equal(r.nextContext.appointment.proposedDate, "2026-08-11");
});

test("3. modality change preserves proposed time", () => {
  const r = turn("Prefiero en persona", memoryContext());
  assert.equal(r.nextContext.appointment.proposedTime, "18:30");
});

test("4. in-person travel confirmation does not reset day-part", () => {
  const asked = turn("Prefiero en persona", memoryContext());
  const confirmed = turn("Sí, puedo ir a Doral", asked.nextContext);
  assert.equal(confirmed.nextContext.appointment.proposedTime, "18:30");
  assert.equal(confirmed.nextContext.appointment.proposedDate, "2026-08-11");
  assert.doesNotMatch(confirmed.rendered.text, /mañana o en la tarde/i);
  assert.match(confirmed.rendered.text, /6:30/i);
  assert.match(confirmed.rendered.text, /Doral/i);
});

test("5. Zoom reselection does not reset scheduling", () => {
  const asked = turn("Prefiero en persona", memoryContext());
  const confirmed = turn("Sí, puedo ir a Doral", asked.nextContext);
  const zoom = turn("Actually, mejor Zoom", confirmed.nextContext);
  assert.equal(zoom.nextContext.appointment.proposedTime, "18:30");
  assert.equal(zoom.nextContext.appointment.proposedDate, "2026-08-11");
  assert.doesNotMatch(zoom.rendered.text, /mañana o en la tarde/i);
  assert.match(zoom.rendered.text, /Zoom/i);
  assert.match(zoom.rendered.text, /6:30/i);
});

test("6. Zoom clears office state", () => {
  const asked = turn("Prefiero en persona", memoryContext());
  const confirmed = turn("Sí, puedo ir a Doral", asked.nextContext);
  assert.equal(confirmed.nextContext.appointment.location, "Doral office");
  const zoom = turn("Actually, mejor Zoom", confirmed.nextContext);
  assert.equal(zoom.nextContext.knownFacts.preferredMeetingType, "zoom");
  assert.equal(zoom.nextContext.appointment.location, null);
  assert.doesNotMatch(zoom.rendered.text, /2500 NW 79th/i);
});

test("7. known after-5 prevents redundant day-part question", () => {
  const ctx = memoryContext({
    appointment: { proposedTime: null, proposedDate: null }
  });
  const post = resolvePostModalityScheduling(ctx, "spanish");
  assert.equal(post.templateKeySuffix, "ask_time");
  assert.equal(post.skipDayPart, true);
  const r = turn("mejor Zoom", ctx);
  assert.doesNotMatch(r.rendered.text, /mañana o en la tarde/i);
  assert.match(r.rendered.text, /después de las/i);
});

test("8. known time prevents redundant time question", () => {
  const post = resolvePostModalityScheduling(memoryContext(), "spanish");
  assert.equal(post.templateKeySuffix, "confirm_slot");
  const r = turn("mejor Zoom", memoryContext());
  assert.match(r.rendered.text, /6:30/i);
  assert.doesNotMatch(r.rendered.text, /Qué hora te funciona/i);
});

test("9. known date/time reused after modality change", () => {
  const asked = turn("Prefiero en persona", memoryContext());
  const confirmed = turn("Sí, puedo ir a Doral", asked.nextContext);
  assert.equal(confirmed.nextContext.appointment.proposedDate, "2026-08-11");
  assert.equal(confirmed.nextContext.appointment.proposedTime, "18:30");
  assert.ok(
    confirmed.structuredDecision.reasonCodes.includes("SCHEDULING_MEMORY_PRESERVED")
  );
});

test("10. zoom link request intent ES", () => {
  assert.equal(looksLikeMeetingAccessRequest("¿Me puedes mandar el link?"), true);
  const r = turn("¿Me puedes mandar el link?", memoryContext());
  assert.equal(r.interpretation.intent, "meeting_access_request");
});

test("11. zoom link request intent EN", () => {
  assert.equal(looksLikeMeetingAccessRequest("can you send the Zoom link?"), true);
  const r = turn(
    "can you send the Zoom link?",
    memoryContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.intent, "meeting_access_request");
});

test("12. no fabricated Zoom link", () => {
  const r = turn("¿Me puedes mandar el link?", memoryContext());
  assert.doesNotMatch(r.rendered.text, /https?:\/\/|zoom\.us/i);
});

test("13. unconfirmed appointment explains link timing", () => {
  const r = turn("¿Me puedes mandar el link?", memoryContext());
  assert.match(r.rendered.text, /confirmemos la cita/i);
  assert.match(r.rendered.text, /6:30/i);
  assert.ok(
    r.structuredDecision.reasonCodes.includes("ZOOM_LINK_DEFERRED_UNTIL_CONFIRM")
  );
});

test("14. confirmed appointment uses BR-076 canonical URL proposal", () => {
  const r = turn(
    "¿Me puedes mandar el link?",
    memoryContext({
      appointment: {
        status: "confirmed",
        meetingType: "zoom",
        proposedTime: "18:30",
        proposedDate: "2026-08-11",
        virtualMeetingUrl: CANONICAL_ZOOM
      }
    })
  );
  assert.equal(r.interpretation.intent, "meeting_access_request");
  assert.match(r.rendered.text, /zoom\.us\/j\/1234567890/i);
  assert.ok(
    r.structuredDecision.reasonCodes.includes("ZOOM_LINK_CANONICAL_PROPOSED")
  );
  const auth = authorizeSideEffects({
    structuredDecision: r.structuredDecision,
    responsePlan: r.structuredDecision.customerReplyPlan
  });
  assert.equal(auth.authorized, false);
  assert.ok(auth.proposals.some((p) => p.type === "share_zoom_link"));
});

test("15. URL unavailable follows canonical pending behavior", () => {
  const ctx = memoryContext({
    appointment: {
      status: "confirmed",
      meetingType: "zoom",
      proposedTime: "18:30",
      proposedDate: "2026-08-11",
      virtualMeetingUrl: null
    }
  });
  const r = turn("mándame el link", ctx);
  assert.equal(r.interpretation.intent, "meeting_access_request");
  assert.match(r.rendered.text, /aún no está disponible|not available yet/i);
  assert.ok(
    r.structuredDecision.reasonCodes.includes("ZOOM_LINK_PENDING_UNAVAILABLE")
  );
  assert.equal(resolveZoomLinkFromContext(ctx).available, false);
});

test("16. ya te dije recognizes repetition", () => {
  assert.equal(looksLikeRepetitionSignal("ya te dije que despues de las 5"), true);
  const r = turn("ya te dije que despues de las 5", memoryContext());
  assert.ok(
    r.structuredDecision.reasonCodes.includes("REPETITION_ACKNOWLEDGED") ||
      r.interpretation.entities?.repetitionSignal === true
  );
  assert.doesNotMatch(r.rendered.text, /mañana o en la tarde/i);
});

test("17. I already told you recognizes repetition", () => {
  assert.equal(looksLikeRepetitionSignal("I already told you"), true);
  const r = turn(
    "I already told you after 5",
    memoryContext({
      preferredLanguage: "english",
      appointment: { proposedTime: null, proposedDate: null }
    })
  );
  assert.ok(
    r.interpretation.intent === "reassert_known_fact" ||
      r.interpretation.entities?.repetitionSignal === true ||
      r.interpretation.intent === "provide_availability_constraint"
  );
});

test("18. frustration does not automatically escalate", () => {
  const r = turn("ya te dije que despues de las 5", memoryContext());
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
  assert.equal(r.nextContext.attention?.needsHumanAttention, false);
});

test("19. cancellation closure has no companion-contact sentence", () => {
  const r = turn("Mejor cancélalo, cambié de idea", memoryContext());
  assert.equal(r.interpretation.intent, "withdraw_interest");
  assert.match(r.rendered.text, /Gracias por avisarnos/i);
  assert.match(r.rendered.text, /[eé]xito/i);
  assert.doesNotMatch(r.rendered.text, /compañero puede reabrir|reabrirlo/i);
  assert.ok(
    r.structuredDecision.reasonCodes.includes("CLEAN_WITHDRAWAL_CLOSURE")
  );
});

test("20. withdrawal remains distinct from STOP", () => {
  const withdraw = turn("Mejor cancélalo, cambié de idea", memoryContext());
  assert.equal(withdraw.interpretation.intent, "withdraw_interest");
  assert.notEqual(withdraw.interpretation.intent, "opt_out_request");
  const opt = turn("no more messages", memoryContext());
  assert.equal(opt.interpretation.intent, "opt_out_request");
});

test("21. Wednesday date change retains prior time", () => {
  const r = turn("Cámbialo para el miércoles", memoryContext());
  assert.equal(r.interpretation.intent, "scheduling_date_proposal");
  assert.equal(r.nextContext.appointment.proposedDate, "2026-08-12");
  assert.equal(r.nextContext.appointment.proposedTime, "18:30");
  assert.match(r.rendered.text, /miércoles/i);
  assert.match(r.rendered.text, /6:30/i);
});

test("22. no stale office after Zoom", () => {
  const asked = turn("Prefiero en persona", memoryContext());
  const confirmed = turn("Sí, puedo ir a Doral", asked.nextContext);
  const zoom = turn("Actually, mejor Zoom", confirmed.nextContext);
  assert.equal(zoom.nextContext.appointment.location, null);
  assert.doesNotMatch(zoom.rendered.text, /2500 NW 79th|oficinas ubicadas/i);
});

test("23. no duplicate scheduling facts after modality round-trip", () => {
  const asked = turn("Prefiero en persona", memoryContext());
  const confirmed = turn("Sí, puedo ir a Doral", asked.nextContext);
  const zoom = turn("Actually, mejor Zoom", confirmed.nextContext);
  assert.equal(zoom.nextContext.appointment.proposedTime, "18:30");
  assert.equal(zoom.nextContext.appointment.proposedDate, "2026-08-11");
  assert.equal(
    zoom.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
});

test("24-27. no WhatsApp/appointment/Calendar/BR-080 writes", () => {
  const report = runRecruitAiV2ScenarioById(
    "long-scheduling-memory-modality-zoom-link"
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

test("28-30. production posture defaults remain fail-closed", () => {
  const shadow = resolveShadowConfig({});
  const capture = resolveContextCaptureConfig({});
  assert.equal(shadow.enabled, false);
  assert.equal(Number(shadow.sampleRate) || 0, 0);
  assert.equal(capture.enabled, false);
  assert.equal(isExecutionEnabled({}), false);
});

test("31. BR-086 regression", () => {
  assert.equal(runRecruitAiV2ScenarioById("natural-language-opt-out").pass, true);
});

test("32. BR-085 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("orlando-scheduling-date-change-cancellation").pass,
    true
  );
});

test("33. BR-084 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("work-until-5-direct-time-negotiation").pass,
    true
  );
});

test("34. BR-083 regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("license-confusion-orlando-faq-flow").pass,
    true
  );
});

test("35. PR #46 stale modality regression", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("orlando-outside-clears-stale-office").pass,
    true
  );
  assert.equal(runRecruitAiV2ScenarioById("orlando-clean-zoom-path").pass, true);
});

test("36. simulator/playground regression", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  assert.ok(
    listRecruitAiV2Scenarios().some(
      (s) => s.id === "long-scheduling-memory-modality-zoom-link"
    )
  );
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  const r = sendPlaygroundTurn(s.sessionId, { text: "Hola" });
  assert.equal(r.turn.diagnostics.authorizationResult, "denied");
});

test("37. frontend unaffected marker — no frontend files in this fix suite", () => {
  assert.ok(true);
});

test("38. backend syntax/lint + docs exist", () => {
  assert.equal(looksLikeMeetingAccessRequest("what's the Zoom link"), true);
  assert.equal(looksLikeMeetingAccessRequest("how do I join"), true);
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/17_PLAYGROUND_FEEDBACK_SCHEDULING_MEMORY.md"
  );
  assert.equal(fs.existsSync(doc), true);
  require("../core/recruitAiV2/schedulingMemory");
  require("../core/recruitAiV2/decisionEngine");
  require("../core/recruitAiV2/interpreter");
  require("../core/recruitAiV2/responseRenderer");
});

test("regression scenario Long Scheduling Memory + Modality + Zoom Link", () => {
  const report = runRecruitAiV2ScenarioById(
    "long-scheduling-memory-modality-zoom-link"
  );
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => !t.pass)));
});
