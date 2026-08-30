/**
 * BR-174 — provider-neutral semantic foundation. Shadow only.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { FEATURE_FLAGS } = require("../core/recruitAiV2/constants");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { processRecruitAiV2Turn } = require("../core/recruitAiV2/orchestrator");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const {
  validateSemanticInterpretation,
  createEmptySemanticInterpretation,
  stripProviderMetadata,
  resolveSemanticInterpreterConfig,
  isSemanticShadowEligible,
  observeSemanticInterpretation,
  SEMANTIC_SHADOW_STAGE,
  summarizeFacts,
  projectLegacyInterpretation,
  compareSemanticVsLegacy,
  routeSemanticInterpretation,
  estimateCostUsd
} = require("../core/recruitAiV2/semantic");

const FIXED_NOW = new Date("2026-08-29T21:00:00.000-04:00");

function locationAskContext() {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText: "¿En qué ciudad y estado te encuentras?"
    }
  });
}

function authAskContext(facts = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    knownFacts: facts,
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText: "¿Tienes permiso de trabajo?"
    }
  });
}

test("flags default off and apply is hard-false", () => {
  const config = resolveSemanticInterpreterConfig({});
  assert.equal(config.shadowEnabled, false);
  assert.equal(config.canaryEnabled, false);
  assert.equal(config.applyEnabled, false);
  assert.equal(config.provider, "openai");
  assert.equal(config.model, "gpt-4o-mini");
});

test("malformed shadow flag fails closed", () => {
  const config = resolveSemanticInterpreterConfig({
    [FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]: "yes"
  });
  assert.equal(config.shadowEnabled, false);
  assert.equal(config.failClosed, true);
});

test("canary true still does not enable apply", () => {
  const config = resolveSemanticInterpreterConfig({
    [FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]: "true",
    [FEATURE_FLAGS.SEMANTIC_CANARY_ENABLED_ENV]: "true"
  });
  assert.equal(config.shadowEnabled, true);
  assert.equal(config.canaryEnabled, true);
  assert.equal(config.applyEnabled, false);
});

test("invalid JSON is rejected and cannot mutate context", () => {
  const result = validateSemanticInterpretation("not-json");
  assert.equal(result.ok, false);
  assert.equal(result.interpretation, null);
  assert.ok(result.errors.includes("not_an_object"));
});

test("schema strips provider metadata before Atlas consumption", () => {
  const stripped = stripProviderMetadata({
    ...createEmptySemanticInterpretation({ intent: "provide_location" }),
    provider: "openai",
    model: "gpt-4o-mini",
    rawProviderOutput: { secret: true }
  });
  assert.equal(stripped.intent, "provide_location");
  assert.equal(stripped.provider, undefined);
  assert.equal(stripped.model, undefined);
  assert.equal(stripped.rawProviderOutput, undefined);
});

test("unsupported provider fails without an interpretation", async () => {
  const routed = await routeSemanticInterpretation({
    provider: "anthropic",
    inboundText: "Hola",
    context: {},
    config: { model: "claude", timeoutMs: 500 }
  });
  assert.equal(routed.ok, false);
  assert.equal(routed.reason, "UNSUPPORTED_PROVIDER");
  assert.equal(routed.interpretation, null);
});

test("shadow disabled skips provider and reports not eligible", async () => {
  const observed = await observeSemanticInterpretation({
    message: { text: "Sur Carolina" },
    context: locationAskContext(),
    legacyInterpretation: { intent: "provide_location" },
    options: { env: {} }
  });
  assert.equal(observed.eligible, false);
  assert.equal(observed.applied, false);
  assert.equal(observed.semantic, null);
});

test("production allowlist is on only for Niovel and Misleisys in Team Vision", () => {
  const env = {
    [FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]: "true",
    [FEATURE_FLAGS.SEMANTIC_CANARY_ENABLED_ENV]: "false",
    [FEATURE_FLAGS.SEMANTIC_ORGANIZATION_IDS_ENV]:
      "00000000-0000-4000-8000-000000000001",
    [FEATURE_FLAGS.SEMANTIC_USER_IDS_ENV]:
      "33ad243a-9d00-4a4d-810b-df2762c0f076,d8d75c0e-d93e-42c9-950e-004fbfabdc8d"
  };
  const teamVision = "00000000-0000-4000-8000-000000000001";
  const teamLegacy = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
  const niovel = "33ad243a-9d00-4a4d-810b-df2762c0f076";
  const misleisys = "d8d75c0e-d93e-42c9-950e-004fbfabdc8d";
  const otherVisionUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  assert.equal(
    isSemanticShadowEligible({ organizationId: teamVision, actingUserId: niovel, env }).eligible,
    true
  );
  assert.equal(
    isSemanticShadowEligible({ organizationId: teamVision, actingUserId: misleisys, env }).eligible,
    true
  );
  assert.equal(
    isSemanticShadowEligible({
      organizationId: teamVision,
      actingUserId: otherVisionUser,
      env
    }).eligible,
    false
  );
  assert.equal(
    isSemanticShadowEligible({ organizationId: teamLegacy, actingUserId: niovel, env }).eligible,
    false
  );
  assert.equal(resolveSemanticInterpreterConfig(env).applyEnabled, false);
});

test("eligible shadow emits structured telemetry without inbound text", async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => {
    lines.push(String(line));
  };
  try {
    await observeSemanticInterpretation({
      message: { text: "SECRET_INBOUND_TEXT" },
      context: locationAskContext(),
      legacyInterpretation: { intent: "provide_location" },
      options: {
        organizationId: "00000000-0000-4000-8000-000000000001",
        actingUserId: "33ad243a-9d00-4a4d-810b-df2762c0f076",
        env: {
          [FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]: "true",
          [FEATURE_FLAGS.SEMANTIC_ORGANIZATION_IDS_ENV]:
            "00000000-0000-4000-8000-000000000001",
          [FEATURE_FLAGS.SEMANTIC_USER_IDS_ENV]:
            "33ad243a-9d00-4a4d-810b-df2762c0f076"
        },
        semanticAdapters: {
          openai: async () => ({
            ok: true,
            interpretation: createEmptySemanticInterpretation({
              intent: "provide_location",
              facts: { state: "SC" },
              confidence: 0.91
            }),
            usage: {
              provider: "openai",
              model: "gpt-4o-mini",
              latencyMs: 22,
              promptTokens: 10,
              completionTokens: 4,
              totalTokens: 14,
              estimatedCostUsd: 0.000001
            }
          })
        }
      }
    });
  } finally {
    console.log = original;
  }
  const entry = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .find((row) => row?.stage === SEMANTIC_SHADOW_STAGE);
  assert.ok(entry);
  assert.equal(entry.applied, false);
  assert.equal(entry.eligible, true);
  assert.equal(entry.provider, "openai");
  assert.equal(entry.model, "gpt-4o-mini");
  assert.equal(entry.latencyMs, 22);
  assert.equal(entry.promptTokens, 10);
  assert.equal(entry.completionTokens, 4);
  assert.equal(entry.estimatedCostUsd, 0.000001);
  assert.equal(entry.semanticIntent, "provide_location");
  assert.equal(entry.legacyIntent, "provide_location");
  assert.equal(entry.confidence, 0.91);
  assert.equal(entry.timedOut, false);
  assert.equal(entry.invalidJson, false);
  assert.ok(!JSON.stringify(entry).includes("SECRET_INBOUND_TEXT"));
});

test("summarizeFacts omits email and name", () => {
  assert.deepEqual(
    summarizeFacts({
      city: "Bluffton",
      state: "SC",
      email: "hidden@example.com",
      name: "Hidden"
    }),
    {
      city: "Bluffton",
      state: "SC",
      workAuthorization: null,
      workAuthorizationStatus: null
    }
  );
});

test("allowlist miss does not call provider", async () => {
  let called = false;
  const observed = await observeSemanticInterpretation({
    message: { text: "Sur Carolina" },
    context: locationAskContext(),
    legacyInterpretation: { intent: "unknown" },
    options: {
      organizationId: "org-a",
      env: {
        [FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]: "true",
        [FEATURE_FLAGS.SEMANTIC_ORGANIZATION_IDS_ENV]: "org-b"
      },
      semanticAdapters: {
        openai: async () => {
          called = true;
          return { ok: true, interpretation: createEmptySemanticInterpretation() };
        }
      }
    }
  });
  assert.equal(called, false);
  assert.equal(observed.reason, "ORG_NOT_ALLOWLISTED");
});

test("invalid provider JSON does not produce accepted facts", async () => {
  const observed = await observeSemanticInterpretation({
    message: { text: "Sur Carolina" },
    context: locationAskContext(),
    legacyInterpretation: interpretInboundMessage({
      message: { text: "Sur Carolina" },
      context: locationAskContext()
    }),
    options: {
      env: { [FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]: "true" },
      semanticAdapters: {
        openai: async () => ({
          ok: false,
          reason: "INVALID_SEMANTIC_JSON",
          interpretation: null,
          usage: { provider: "openai", model: "gpt-4o-mini", latencyMs: 12, estimatedCostUsd: 0 }
        })
      }
    }
  });
  assert.equal(observed.applied, false);
  assert.equal(observed.semantic, null);
  assert.equal(observed.providerReason, "INVALID_SEMANTIC_JSON");
});

test("timeout/provider failure leaves facts untouched", async () => {
  const context = authAskContext({
    workAuthorization: true,
    workAuthorizationStatus: "authorized"
  });
  const before = { ...context.knownFacts };
  const observed = await observeSemanticInterpretation({
    message: { text: "ok" },
    context,
    legacyInterpretation: { intent: "soft_acknowledgement" },
    options: {
      env: { [FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]: "true" },
      semanticAdapters: {
        openai: async () => ({
          ok: false,
          reason: "PROVIDER_TIMEOUT",
          interpretation: null,
          usage: { provider: "openai", model: "gpt-4o-mini", latencyMs: 1500, estimatedCostUsd: 0 }
        })
      }
    }
  });
  assert.equal(observed.providerReason, "PROVIDER_TIMEOUT");
  assert.deepEqual(context.knownFacts, before);
});

test("regression fixtures validate the internal semantic contract", () => {
  const cases = [
    {
      inbound: "Si claro yo soy ciudadana hace mucho",
      expected: {
        intent: "provide_authorization",
        facts: { workAuthorization: true },
        schedulingIntent: "none"
      }
    },
    {
      inbound: "Los ciudadanos americanos no necesitan permiso de trabajo",
      expected: {
        intent: "provide_authorization",
        facts: { workAuthorization: true },
        corrections: [{ field: "workAuthorization", from: null, to: true }]
      }
    },
    {
      inbound: "Sur Carolina",
      expected: {
        intent: "provide_location",
        facts: { state: "SC", city: null },
        schedulingIntent: "none"
      }
    },
    {
      inbound: "Bluftton",
      expected: {
        intent: "provide_location",
        facts: { city: "Bluffton", cityCanonical: "Bluffton" },
        needsClarification: true
      }
    },
    {
      inbound: "Se podría reprogramar para el lunes",
      expected: {
        intent: "reschedule_request",
        schedulingIntent: "reschedule",
        requestedDate: "monday"
      }
    },
    {
      inbound: "Hola necesito reprogramarla",
      expected: {
        intent: "reschedule_request",
        schedulingIntent: "reschedule"
      }
    },
    {
      inbound: "SI NO SE TRATA SOBRE SEGUROS, PUEDES ESCRIBIRME",
      expected: {
        intent: "insurance_condition_objection",
        objections: [{ kind: "insurance_condition", detail: "pause_qualification" }],
        needsClarification: true
      }
    },
    {
      inbound: "no pienso darle mi social",
      expected: {
        intent: "ssn_privacy_objection",
        safety: { ssnPrivacy: true },
        facts: { workAuthorization: null }
      }
    }
  ];

  for (const item of cases) {
    const validated = validateSemanticInterpretation({
      language: "spanish",
      confidence: 0.9,
      ...item.expected
    });
    assert.equal(validated.ok, true, item.inbound);
    if (item.expected.facts?.state) {
      assert.equal(validated.interpretation.facts.state, item.expected.facts.state);
    }
    if (item.expected.facts?.city) {
      assert.equal(validated.interpretation.facts.city, item.expected.facts.city);
    }
    if (item.expected.schedulingIntent) {
      assert.equal(
        validated.interpretation.schedulingIntent,
        item.expected.schedulingIntent
      );
    }
    if (item.expected.safety?.ssnPrivacy) {
      assert.equal(validated.interpretation.safety.ssnPrivacy, true);
      assert.equal(validated.interpretation.facts.workAuthorization, null);
    }
  }
});

test("legacy vs semantic disagreement is recorded, not applied", async () => {
  const context = locationAskContext();
  const legacy = interpretInboundMessage({
    message: { text: "SI NO SE TRATA SOBRE SEGUROS, PUEDES ESCRIBIRME" },
    context
  });
  const semantic = createEmptySemanticInterpretation({
    intent: "insurance_condition_objection",
    language: "spanish",
    confidence: 0.88,
    objections: [{ kind: "insurance_condition", detail: "pause_qualification" }],
    needsClarification: true
  });
  const comparison = compareSemanticVsLegacy(
    projectLegacyInterpretation(legacy, context),
    semantic
  );
  assert.equal(comparison.agree, false);
  assert.ok(comparison.disagreements.some((row) => row.path === "intent"));

  const observed = await observeSemanticInterpretation({
    message: { text: "SI NO SE TRATA SOBRE SEGUROS, PUEDES ESCRIBIRME" },
    context,
    legacyInterpretation: legacy,
    options: {
      env: { [FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]: "true" },
      semanticAdapters: {
        openai: async () => ({
          ok: true,
          interpretation: semantic,
          usage: {
            provider: "openai",
            model: "gpt-4o-mini",
            latencyMs: 40,
            promptTokens: 600,
            completionTokens: 180,
            totalTokens: 780,
            estimatedCostUsd: estimateCostUsd({ promptTokens: 600, completionTokens: 180 })
          }
        })
      }
    }
  });
  assert.equal(observed.applied, false);
  assert.equal(observed.comparison.agree, false);
  assert.equal(observed.provider, "openai");
  assert.equal(observed.model, "gpt-4o-mini");
  assert.ok(observed.estimatedCostUsd > 0);
});

test("async orchestrator stays on legacy interpretation when shadow runs", async () => {
  const context = locationAskContext();
  const result = await processRecruitAiV2Turn({
    message: { text: "Sur Carolina" },
    context,
    options: {
      env: { [FEATURE_FLAGS.SEMANTIC_SHADOW_ENABLED_ENV]: "true" },
      persistContext: false,
      semanticAdapters: {
        openai: async () => ({
          ok: true,
          interpretation: createEmptySemanticInterpretation({
            intent: "provide_location",
            facts: { state: "SC" },
            confidence: 0.9
          }),
          usage: { provider: "openai", model: "gpt-4o-mini", latencyMs: 8, estimatedCostUsd: 0.0002 }
        })
      }
    }
  });
  assert.equal(result.interpretation.intent, "provide_location");
  assert.equal(result.interpretation.entities.state, "SC");
  assert.equal(result.semanticShadow.applied, false);
  assert.equal(result.semanticShadow.semantic.facts.state, "SC");
  assert.notEqual(result.structuredDecision.customerReplyPlan.templateKey, "ask_state");
});

test("isSemanticShadowEligible requires explicit true", () => {
  const gate = isSemanticShadowEligible({ env: {} });
  assert.equal(gate.eligible, false);
});

test("cost estimate is about $0.0002 for the planned token budget", () => {
  const cost = estimateCostUsd({ promptTokens: 600, completionTokens: 180 });
  assert.ok(cost >= 0.00015 && cost <= 0.0003);
});
