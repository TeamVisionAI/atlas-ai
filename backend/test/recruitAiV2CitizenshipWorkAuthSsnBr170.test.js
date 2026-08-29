/**
 * BR-170 — citizenship durably resolves work authorization; SSN/privacy
 * must not erase it or re-ask; in-person is a scheduling preference.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const {
  parseWorkAuthorizationAnswer,
  looksLikeSsnPrivacyObjection,
  WORK_AUTHORIZATION
} = require("../core/recruitAiV2/qualificationFacts");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  asksAlreadyResolvedFact
} = require("../core/recruitAiV2/globalConversationCoherenceGuard");

const FIXED_NOW = new Date("2026-08-29T15:17:00.000-04:00");
const PHRASES = {
  citizenshipLong: "Si claro yo soy ciudadana hace mucho",
  citizenshipAmerican: "soy ciudadana americana",
  ssnRefusal: "no pienso darle mi social",
  citizenCorrection:
    "Los ciudadanos americanos no necesitan permiso de trabajo",
  inPersonOk: "Pero si en persona una entrevista sería bien",
  ssnCompound:
    "Solo el social es lo que usan los ciudadanos americanos tendría que ser en persona no pienso darle mi social así como así a alguien que no conozco ."
};

function turn(text, context) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
  const structuredDecision = decideConversationTurn({ context, interpretation });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

function authPendingContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Davie",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "LOCAL",
      ...(overrides.knownFacts || {})
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

function assertAuthResolved(result) {
  assert.equal(result.nextContext.knownFacts.workAuthorization, true);
  assert.equal(
    result.nextContext.knownFacts.workAuthorizationStatus,
    WORK_AUTHORIZATION.AUTHORIZED
  );
  assert.doesNotMatch(
    result.rendered.text,
    /permiso de trabajo|documentaci[oó]n legal para trabajar/i
  );
}

test("Si claro yo soy ciudadana hace mucho resolves work authorization", () => {
  assert.equal(
    parseWorkAuthorizationAnswer(PHRASES.citizenshipLong, {
      conversation: { lastQuestionAsked: "ask_authorization" }
    }),
    WORK_AUTHORIZATION.AUTHORIZED
  );
  const r = turn(PHRASES.citizenshipLong, authPendingContext());
  assert.equal(r.interpretation.intent, "provide_authorization");
  assertAuthResolved(r);
});

test("soy ciudadana americana resolves work authorization", () => {
  assert.equal(
    parseWorkAuthorizationAnswer(PHRASES.citizenshipAmerican, {
      conversation: { lastQuestionAsked: "ask_authorization" }
    }),
    WORK_AUTHORIZATION.AUTHORIZED
  );
  const r = turn(PHRASES.citizenshipAmerican, authPendingContext());
  assert.equal(r.interpretation.intent, "provide_authorization");
  assertAuthResolved(r);
});

test("Los ciudadanos americanos no necesitan permiso de trabajo resolves YES", () => {
  assert.equal(
    parseWorkAuthorizationAnswer(PHRASES.citizenCorrection, {
      conversation: { lastQuestionAsked: "ask_authorization" }
    }),
    WORK_AUTHORIZATION.AUTHORIZED
  );
  const r = turn(PHRASES.citizenCorrection, authPendingContext());
  assert.equal(r.interpretation.intent, "provide_authorization");
  assertAuthResolved(r);
  assert.notEqual(r.structuredDecision.decision.nextAction, "escalate_to_human");
});

test("no pienso darle mi social is an SSN privacy objection", () => {
  assert.equal(looksLikeSsnPrivacyObjection(PHRASES.ssnRefusal), true);
  const prior = turn(PHRASES.citizenshipLong, authPendingContext());
  const r = turn(PHRASES.ssnRefusal, prior.nextContext);
  assert.equal(r.interpretation.intent, "ssn_privacy_objection");
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.match(r.rendered.text, /no te pedimos el social|Seguro Social/i);
  assert.doesNotMatch(r.rendered.text, /permiso de trabajo/i);
});

test("SSN + citizenship + in-person does not re-ask work authorization", () => {
  const r = turn(PHRASES.ssnCompound, authPendingContext());
  assert.equal(r.interpretation.intent, "ssn_privacy_objection");
  assert.equal(r.interpretation.entities.workAuthorization, true);
  assert.equal(r.interpretation.entities.appointmentType, "in_person");
  assertAuthResolved(r);
  assert.match(r.rendered.text, /no te pedimos el social|Seguro Social/i);
  assert.match(r.rendered.text, /en persona/i);
});

test("in-person preference after resolved auth does not re-ask authorization", () => {
  const prior = turn(PHRASES.citizenshipLong, authPendingContext());
  const r = turn(PHRASES.inPersonOk, prior.nextContext);
  assert.equal(r.interpretation.intent, "provide_meeting_preference");
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.doesNotMatch(r.rendered.text, /permiso de trabajo/i);
  assert.match(r.rendered.text, /en persona/i);
});

test("resolved work authorization cannot be re-asked on a later turn", () => {
  let ctx = authPendingContext();
  ctx = turn(PHRASES.citizenshipLong, ctx).nextContext;
  ctx = turn(PHRASES.ssnCompound, ctx).nextContext;
  const r = turn(PHRASES.inPersonOk, ctx);
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.doesNotMatch(r.rendered.text, /permiso de trabajo/i);
  assert.equal(
    asksAlreadyResolvedFact("ask_authorization", r.nextContext),
    true
  );
});

test("BR-166 would suppress a residual ask_authorization after citizenship", () => {
  const latest = {
    knownFacts: {
      city: "Davie",
      state: "FL",
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    }
  };
  assert.equal(asksAlreadyResolvedFact("ask_authorization", latest), true);
  assert.equal(
    asksAlreadyResolvedFact("continue_qualification_after_location", latest),
    true
  );
});

test("no soy ciudadana remains not authorized while auth is pending", () => {
  assert.equal(
    parseWorkAuthorizationAnswer("no soy ciudadana", {
      conversation: { lastQuestionAsked: "ask_authorization" }
    }),
    WORK_AUTHORIZATION.NOT_AUTHORIZED
  );
});

test("HUMAN_REQUIRED hold does not continue automated qualification", async () => {
  const { attemptLiveV2Authoring } = require("../core/recruitAiV2/liveAuthoringBridge");
  const orgId = "00000000-0000-4000-8000-000000000001";
  const userId = "33ad243a-9d00-4a4d-810b-df2762c0f076";
  let processed = 0;
  const attempt = await attemptLiveV2Authoring({
    normalized: {
      phone: "+15555550199",
      text: PHRASES.inPersonOk,
      channel: "whatsapp",
      providerMessageId: "wamid.br170-hold"
    },
    prospect: {
      id: "prospect-br170-hold",
      phone: "+15555550199",
      organization_id: orgId,
      owner_user_id: userId
    },
    env: {
      RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
      RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: orgId,
      RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: userId,
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
    },
    dependencies: { v2Grant: { tenantSuspended: false } },
    processTurn: async () => {
      processed += 1;
      return { rendered: { text: "should not author after handoff" } };
    },
    persistenceService: {
      loadContext: async () => ({
        currentStage: "human_required",
        attention: {
          needsHumanAttention: true,
          reason: "repeated_clarification_ambiguity"
        },
        knownFacts: { city: "Davie", state: "FL", workAuthorization: true }
      })
    }
  });
  assert.equal(processed, 0);
  assert.equal(attempt.reason, "V2_HUMAN_REQUIRED_HOLD");
  assert.equal(attempt.authored, false);
  assert.equal(attempt.fallThrough, false);
});

test("fix is systemic: no prospect, phone, or user special-case", () => {
  const roots = [
    "qualificationFacts.js",
    "interpreter.js",
    "decisionEngine.js",
    "responseRenderer.js",
    "liveAuthoringBridge.js"
  ].map((name) =>
    fs.readFileSync(
      path.join(__dirname, "../core/recruitAiV2", name),
      "utf8"
    )
  );
  const joined = roots.join("\n");
  assert.doesNotMatch(joined, /Suset|Prieto|7817/i);
});
