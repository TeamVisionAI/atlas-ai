/**
 * Recruit AI v2 — first production feedback refinement (BR-082).
 * No live WhatsApp. No production mutation.
 */

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  interpretInboundMessage,
  decideConversationTurn,
  computeContextOnlyTurn,
  processRecruitAiV2TurnSync,
  createConversationContext,
  buildCaptureDiagnostic,
  authorizeSideEffects,
  isExecutionEnabled,
  isEligibleForContextCapture,
  isEligibleForShadowEvaluation,
  resolveContextCaptureConfig,
  resolveShadowConfig,
  containsInternalDiagnostics,
  INTENTS,
  NEXT_ACTIONS,
  FACT_CERTAINTY
} = require("../core/recruitAiV2");

const { extractInformation, inferStateFromCity } = require("../core/informationExtractor");
const {
  markCapturedFields,
  parseQualificationCapture,
  defaultCaptureState
} = require("../core/qualificationCaptureState");
const { getStateQuestion, getDayPartClarificationQuestion } = require("../core/teamVisionWorkflowCopy");
const { getMissingFields, deriveCurrentStep } = require("../core/informationModel");

const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures/recruitAiV2/first-production-feedback.json"
);

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

const ORG = "00000000-0000-4000-8000-000000000001";

function baseEnv() {
  return {
    RECRUIT_AI_V2_CONTEXT_CAPTURE_ENABLED: "true",
    RECRUIT_AI_V2_CONTEXT_CAPTURE_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_CONTEXT_CAPTURE_SAMPLE_RATE: "1",
    RECRUIT_AI_V2_SHADOW_ENABLED: "true",
    RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "0.10"
  };
}

test("1. Hola → greeting", () => {
  const interpretation = interpretInboundMessage({
    message: { text: "Hola" },
    context: createConversationContext({
      preferredLanguage: "english",
      languageMeta: { source: "inferred" }
    })
  });
  assert.equal(interpretation.intent, INTENTS.GREETING);
  assert.equal(interpretation.messageLanguage, "spanish");
});

test("2. Hello → greeting", () => {
  const interpretation = interpretInboundMessage({
    message: { text: "Hello" },
    context: createConversationContext()
  });
  assert.equal(interpretation.intent, INTENTS.GREETING);
});

test("3. Miami → partial location", () => {
  const interpretation = interpretInboundMessage({
    message: { text: "Miami" },
    context: createConversationContext({
      conversation: { lastQuestionAsked: "ask_location" },
      preferredLanguage: "spanish",
      languageMeta: { source: "active_conversation" }
    })
  });
  assert.equal(interpretation.intent, INTENTS.PROVIDE_LOCATION);
  assert.equal(interpretation.entities.city, "Miami");
  assert.equal(interpretation.entities.state, null);
  assert.equal(interpretation.entities.completeness, "partial");
  assert.equal(interpretation.requiresClarification, true);
});

test("4. Doral → partial location", () => {
  const interpretation = interpretInboundMessage({
    message: { text: "Doral" },
    context: createConversationContext({
      conversation: { lastQuestionAsked: "ask_location" }
    })
  });
  assert.equal(interpretation.intent, INTENTS.PROVIDE_LOCATION);
  assert.equal(interpretation.entities.city, "Doral");
  assert.equal(interpretation.entities.state, null);
});

test("5. Miami does not automatically persist FL as confirmed", () => {
  const turn = computeContextOnlyTurn({
    message: { text: "Miami" },
    context: createConversationContext({
      preferredLanguage: "spanish",
      languageMeta: { source: "active_conversation" },
      conversation: { lastQuestionAsked: "ask_location" }
    })
  });
  assert.equal(turn.nextContext.knownFacts.city, "Miami");
  assert.equal(turn.nextContext.knownFacts.state, null);
  assert.equal(turn.nextContext.knownFacts.cityCertainty, FACT_CERTAINTY.PARTIAL);
  assert.notEqual(turn.nextContext.knownFacts.stateCertainty, FACT_CERTAINTY.CONFIRMED);
  assert.equal(turn.nextContext.knownFacts.proposedState, "FL");
  assert.notEqual(turn.decisionCode, NEXT_ACTIONS.ESCALATE_TO_HUMAN);
});

test("6. Miami + Florida confirms location", () => {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    conversation: { lastQuestionAsked: "ask_location" }
  });
  ctx = computeContextOnlyTurn({ message: { text: "Miami" }, context: ctx }).nextContext;
  const confirmed = computeContextOnlyTurn({
    message: { text: "Florida" },
    context: {
      ...ctx,
      conversation: {
        ...ctx.conversation,
        lastQuestionAsked: "confirm_location",
        lastAtlasOutboundText: "Perfecto. ¿Miami, Florida?"
      }
    }
  });
  assert.equal(confirmed.interpretation.intent, INTENTS.PROVIDE_LOCATION);
  assert.equal(confirmed.nextContext.knownFacts.city, "Miami");
  assert.equal(confirmed.nextContext.knownFacts.state, "FL");
  assert.equal(confirmed.nextContext.knownFacts.cityCertainty, FACT_CERTAINTY.CONFIRMED);
  assert.equal(confirmed.nextContext.knownFacts.stateCertainty, FACT_CERTAINTY.CONFIRMED);
  assert.equal(confirmed.decisionCode, NEXT_ACTIONS.CONTINUE_QUALIFICATION);
  assert.equal(confirmed.nextContext.currentStage, "qualification");
});

test("7. active Spanish can supersede inferred/default English", () => {
  const turn = computeContextOnlyTurn({
    message: { text: "Hola" },
    context: createConversationContext({
      preferredLanguage: "english",
      languageMeta: { source: "inferred" }
    })
  });
  assert.equal(turn.interpretation.preferredLanguage, "spanish");
  assert.equal(turn.nextContext.preferredLanguage, "spanish");
  assert.equal(turn.interpretation.languageAdapted, true);
});

test("8. explicit English preference remains sticky", () => {
  const turn = computeContextOnlyTurn({
    message: { text: "Hola" },
    context: createConversationContext({
      preferredLanguage: "english",
      languageMeta: { source: "explicit" }
    })
  });
  assert.equal(turn.interpretation.preferredLanguage, "english");
  assert.equal(turn.interpretation.languageAdapted, false);
});

test("9. no bilingual output", () => {
  const result = processRecruitAiV2TurnSync({
    message: { text: "Hola" },
    context: createConversationContext({
      preferredLanguage: "english",
      languageMeta: { source: "inferred" }
    })
  });
  const text = result.rendered.text;
  const hasEs = /[¿¡]|ciudad|estado|mañana|tarde|gracias/i.test(text);
  const hasEn = /\b(what|city|state|morning|afternoon|thanks)\b/i.test(text);
  assert.ok(!(hasEs && hasEn), `bilingual reply: ${text}`);
});

test("10. La or is not a name", () => {
  const interpretation = interpretInboundMessage({
    message: { text: "La or" },
    context: createConversationContext({
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
      }
    })
  });
  assert.notEqual(interpretation.intent, INTENTS.PROVIDE_NAME);
  assert.ok(
    interpretation.intent === INTENTS.INCOMPLETE_DAY_PART ||
      interpretation.intent === INTENTS.AMBIGUOUS_FRAGMENT
  );
});

test("11. short fragment uses last-question context", () => {
  const interpretation = interpretInboundMessage({
    message: { text: "La or" },
    context: createConversationContext({
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText: "Do you prefer morning or afternoon?"
      }
    })
  });
  assert.equal(interpretation.intent, INTENTS.INCOMPLETE_DAY_PART);
});

test("12. partial morning reply clarifies", () => {
  const turn = computeContextOnlyTurn({
    message: { text: "maña" },
    context: createConversationContext({
      preferredLanguage: "spanish",
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?"
      }
    })
  });
  assert.equal(turn.interpretation.intent, INTENTS.INCOMPLETE_DAY_PART);
  assert.equal(turn.decisionCode, NEXT_ACTIONS.CLARIFY_DAY_PART);
  assert.equal(turn.structuredDecision.decision.shouldEscalate, false);
});

test("13. partial afternoon reply clarifies", () => {
  const turn = computeContextOnlyTurn({
    message: { text: "afte" },
    context: createConversationContext({
      conversation: {
        lastQuestionAsked: "ask_day_part",
        lastAtlasOutboundText: "Do you prefer morning or afternoon?"
      }
    })
  });
  assert.equal(turn.interpretation.intent, INTENTS.INCOMPLETE_DAY_PART);
  assert.equal(turn.structuredDecision.decision.shouldEscalate, false);
});

test("14. recoverable ambiguity does not immediately escalate", () => {
  const turn = computeContextOnlyTurn({
    message: { text: "Hola" },
    context: createConversationContext({
      preferredLanguage: "english",
      languageMeta: { source: "inferred" }
    })
  });
  assert.equal(turn.structuredDecision.decision.shouldEscalate, false);
  assert.notEqual(turn.decisionCode, NEXT_ACTIONS.ESCALATE_TO_HUMAN);
});

test("15. repeated ambiguity eventually requests human help", () => {
  let ctx = createConversationContext({
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText: "¿Prefieres en la mañana o en la tarde?",
      clarificationCount: 1
    }
  });
  const turn = computeContextOnlyTurn({
    message: { text: "La or" },
    context: ctx
  });
  assert.equal(turn.structuredDecision.decision.shouldEscalate, true);
  assert.equal(turn.decisionCode, NEXT_ACTIONS.ESCALATE_TO_HUMAN);
});

test("16. live CE city-only does not fabricate state", () => {
  const extracted = extractInformation("Miami", { city: null, state: null }, { nextField: "city" });
  assert.equal(extracted.city, "Miami");
  assert.equal(extracted.state, undefined);
  assert.equal(extracted.proposedState, "FL");
  const capture = markCapturedFields(defaultCaptureState(), extracted);
  assert.equal(capture.city, true);
  assert.equal(capture.state, false);
});

test("17. live CE does not advance to DAY_PART prematurely", () => {
  const extracted = extractInformation("Miami", { city: null, state: null }, { nextField: "city" });
  const profile = { city: extracted.city, state: null, authorization: null };
  const captureState = markCapturedFields(defaultCaptureState(), extracted);
  const missing = getMissingFields(profile, { captureState, notes: "" });
  assert.ok(missing.includes("state"), `missing=${missing.join(",")}`);
  assert.ok(!missing.includes("dayPart"));
  const step = deriveCurrentStep(profile, null, { captureState, notes: "" });
  assert.notEqual(step, "DAY_PART");
});

test("18. live CE avoids identical clarification loop", () => {
  const q1 = getDayPartClarificationQuestion("es", 1);
  const q2 = getDayPartClarificationQuestion("es", 2);
  assert.notEqual(q1, q2);
  assert.match(q1, /mañana|tarde/i);
  const stateQ = getStateQuestion("Miami", "es", { proposedState: inferStateFromCity("Miami") });
  assert.match(stateQ, /Miami.*Florida/i);
});

test("19. capture diagnostics sanitized", () => {
  const turn = computeContextOnlyTurn({
    message: { text: "Hola" },
    context: createConversationContext({
      preferredLanguage: "english",
      languageMeta: { source: "inferred" }
    })
  });
  const diagnostic = buildCaptureDiagnostic({
    inboundMessageId: "wamid.HBgLMTc4NjI5NjcyNTQVAgASGCFAKESECRET",
    interpretation: turn.interpretation,
    decisionCode: turn.decisionCode,
    nextContext: turn.nextContext,
    elapsedMs: 120
  });
  assert.equal(diagnostic.intent, INTENTS.GREETING);
  assert.ok(diagnostic.inboundMessageIdTail);
  assert.ok(!JSON.stringify(diagnostic).includes("Hola"));
  assert.ok(!/\+?\d{10,}/.test(JSON.stringify(diagnostic)));
});

test("20. no raw PII in diagnostics", () => {
  const diagnostic = buildCaptureDiagnostic({
    inboundMessageId: "wamid.secretphone17862967254payload",
    interpretation: {
      intent: "greeting",
      confidence: 0.9,
      messageLanguage: "spanish",
      preferredLanguage: "spanish",
      requiresClarification: false
    },
    decisionCode: "continue_after_greeting",
    nextContext: { currentStage: "qualification", knownFacts: {} },
    elapsedMs: 10
  });
  const raw = JSON.stringify(diagnostic);
  assert.ok(!raw.includes("17862967254"));
  assert.ok(!raw.includes("@"));
  assert.ok(!raw.includes("stack"));
});

test("21. context exactly-once preserved (idempotent decision path)", () => {
  const ctx = createConversationContext({
    preferredLanguage: "english",
    languageMeta: { source: "inferred" }
  });
  const a = computeContextOnlyTurn({ message: { id: "wamid.1", text: "Hola" }, context: ctx });
  const b = computeContextOnlyTurn({
    message: { id: "wamid.1", text: "Hola" },
    context: a.nextContext
  });
  // Same inbound content against advanced context still greeting; capture layer
  // enforces idempotency by inbound_message_id — decision remains non-escalating.
  assert.equal(a.interpretation.intent, INTENTS.GREETING);
  assert.equal(a.structuredDecision.decision.shouldEscalate, false);
  assert.equal(b.structuredDecision.decision.shouldEscalate, false);
});

test("22. 100% context capture preserved", () => {
  const cfg = resolveContextCaptureConfig(baseEnv());
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.sampleRate, 1);
  const elig = isEligibleForContextCapture({
    organizationId: ORG,
    prospectId: "p1",
    inboundMessageId: "wamid.x",
    env: baseEnv()
  });
  assert.equal(elig.eligible, true);
});

test("23. 10% shadow preserved", () => {
  const cfg = resolveShadowConfig(baseEnv());
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.sampleRate, 0.1);
});

test("24. v2 sideEffectAuthorizer fail-closed without org/user allowlists", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: "create_appointment",
        mayCreateAppointment: true,
        shouldEscalate: true
      },
      reasonCodes: []
    },
    responsePlan: { templateKey: "x" },
    env: { ...baseEnv(), RECRUIT_AI_V2_EXECUTION_ENABLED: "true" },
    profileConfigured: true,
    actingUserId: "user-1",
    organizationId: "org-1"
  });
  // Flag alone must never authorize (BR-111).
  assert.equal(auth.authorized, false);
});

test("25. live CE remains authoritative / v2 execution off", () => {
  assert.equal(isExecutionEnabled(baseEnv()), false);
  assert.equal(isExecutionEnabled({ RECRUIT_AI_V2_EXECUTION_ENABLED: "false" }), false);
});

test("26-29. BR-075/078/080/081 regression smoke", () => {
  const result = processRecruitAiV2TurnSync({
    message: { text: "Hola" },
    context: createConversationContext({
      preferredLanguage: "english",
      languageMeta: { source: "inferred" }
    })
  });
  assert.equal(result.authorization.authorized, false);
  assert.equal(result.execution.attempted, false);
  assert.equal(containsInternalDiagnostics(result.rendered.text), false);
  assert.ok(result.structuredDecision.reasonCodes.includes("SIDE_EFFECTS_DISABLED"));
});

test("31. first production fixture sequential turns", () => {
  const fx = loadFixture();
  let ctx = createConversationContext({
    prospectId: fx.identity.prospectId,
    organizationId: fx.identity.organizationId,
    preferredLanguage: fx.identity.preferredLanguage,
    languageMeta: fx.identity.languageMeta,
    timezone: fx.identity.timezone
  });

  for (const turn of fx.turns) {
    if (turn.setup?.seedPartialMiami) {
      ctx = {
        ...ctx,
        knownFacts: {
          ...ctx.knownFacts,
          city: "Miami",
          state: null,
          cityCertainty: "partial",
          stateCertainty: "proposed",
          proposedState: "FL"
        },
        conversation: {
          ...ctx.conversation,
          lastQuestionAsked: "confirm_location",
          lastAtlasOutboundText: "Perfecto. ¿Miami, Florida?"
        },
        preferredLanguage: "spanish",
        languageMeta: { source: "active_conversation", spanishEvidenceCount: 1 }
      };
    }
    if (turn.setup?.lastQuestionAsked) {
      ctx = {
        ...ctx,
        conversation: {
          ...ctx.conversation,
          lastQuestionAsked: turn.setup.lastQuestionAsked,
          lastAtlasOutboundText: turn.setup.lastAtlasOutboundText || null
        }
      };
    }

    const computed = computeContextOnlyTurn({
      message: { text: turn.text, id: turn.id },
      context: ctx
    });
    const expect = turn.expect || {};

    if (expect.intent) {
      assert.equal(computed.interpretation.intent, expect.intent, turn.id);
    }
    if (expect.notIntent) {
      assert.notEqual(computed.interpretation.intent, expect.notIntent, turn.id);
    }
    if (expect.messageLanguage) {
      assert.equal(computed.interpretation.messageLanguage, expect.messageLanguage, turn.id);
    }
    if (expect.preferredLanguage) {
      assert.equal(computed.interpretation.preferredLanguage, expect.preferredLanguage, turn.id);
    }
    if (expect.shouldEscalate === false) {
      assert.equal(computed.structuredDecision.decision.shouldEscalate, false, turn.id);
    }
    if (expect.nextAction) {
      assert.equal(computed.decisionCode, expect.nextAction, turn.id);
    }
    if (expect.city !== undefined) {
      assert.equal(
        computed.interpretation.entities.city || computed.nextContext.knownFacts.city,
        expect.city,
        turn.id
      );
    }
    if (expect.state !== undefined) {
      assert.equal(computed.nextContext.knownFacts.state, expect.state, turn.id);
    }
    if (expect.completeness) {
      assert.equal(computed.interpretation.entities.completeness, expect.completeness, turn.id);
    }
    if (expect.requiresClarification) {
      assert.equal(computed.interpretation.requiresClarification, true, turn.id);
    }
    if (expect.proposedState) {
      assert.equal(computed.nextContext.knownFacts.proposedState, expect.proposedState, turn.id);
    }
    if (expect.cityCertainty) {
      assert.equal(computed.nextContext.knownFacts.cityCertainty, expect.cityCertainty, turn.id);
    }
    if (expect.stateCertainty) {
      assert.equal(computed.nextContext.knownFacts.stateCertainty, expect.stateCertainty, turn.id);
    }
    if (expect.noDayPart || expect.noDayPartScheduling) {
      assert.notEqual(computed.nextContext.currentStage, "scheduling", turn.id);
      assert.ok(
        computed.decisionCode !== "clarify_day_part",
        `${turn.id} should not jump to day-part`
      );
    }
    if (expect.noFabricatedName) {
      assert.notEqual(computed.nextContext.knownFacts.name, "La or", turn.id);
    }
    if (expect.stage) {
      assert.equal(computed.nextContext.currentStage, expect.stage, turn.id);
    }

    ctx = computed.nextContext;
  }
});

test("32. backend syntax/module load", () => {
  assert.ok(typeof interpretInboundMessage === "function");
  assert.ok(typeof decideConversationTurn === "function");
  assert.ok(typeof parseQualificationCapture === "function");
  assert.ok(isEligibleForShadowEvaluation);
});
