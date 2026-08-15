/**
 * BR-131 — first-turn info request vs false resume/clarify_once.
 * Camila Arenas production: “Hello! Can I get more info on this?” with no prior
 * Atlas question must not use “the detail I just asked for”.
 * Execution / live path remain OFF. No ads / ownership / scheduling mutation.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  interpretInboundMessage,
  decideConversationTurn,
  createConversationContext,
  buildResponsePlan,
  renderCustomerReply,
  loadConversationContext,
  createMemoryContextRepository,
  createContextPersistenceService,
  buildReconstructionInput,
  INTENTS,
  STAGES,
  isExecutionEnabled
} = require("../core/recruitAiV2");
const { isLiveExecutionPathEnabled } = require("../core/recruitAiV2/liveExecutionPathConfig");
const {
  looksLikeEnglishInfoRequest,
  looksLikeSpanishInfoRequest,
  hasConcretePriorAtlasQuestion
} = require("../core/recruitAiV2/conversationContinuity");
const { getJobOverviewFaqAnswer } = require("../core/teamVisionWorkflowCopy");
const { resolveRecruitFaqAnswer } = require("../core/recruitConversationSequencing");

const ENGLISH_OVERVIEW = getJobOverviewFaqAnswer("en");
const SPANISH_OVERVIEW = getJobOverviewFaqAnswer("es");

function renderTurn(message, context) {
  const interpretation = interpretInboundMessage({
    message: { text: message },
    context
  });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

test("execution gates remain OFF", () => {
  assert.equal(isExecutionEnabled({ env: process.env }), false);
  assert.equal(isLiveExecutionPathEnabled({ env: process.env }), false);
});

test("1. Brand-new English lead: Hello! Can I get more info on this? → overview + city/state", () => {
  assert.equal(looksLikeEnglishInfoRequest("Hello! Can I get more info on this?"), true);
  const ctx = createConversationContext({ preferredLanguage: "english" });
  assert.equal(hasConcretePriorAtlasQuestion(ctx), false);

  const { interpretation, plan, rendered } = renderTurn(
    "Hello! Can I get more info on this?",
    ctx
  );

  assert.equal(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(plan.templateKey, "job_overview_faq_then_resume");
  assert.equal(rendered.text, `${ENGLISH_OVERVIEW} What city and state do you live in?`);
  assert.doesNotMatch(rendered.text, /detail I just asked/i);
  assert.doesNotMatch(rendered.text, /keep moving/i);
  assert.equal(resolveRecruitFaqAnswer("Hello! Can I get more info on this?", "en"), ENGLISH_OVERVIEW);
});

test("2. Brand-new Spanish lead: ¡Hola! Quiero más información → overview + city/state", () => {
  assert.equal(looksLikeSpanishInfoRequest("¡Hola! Quiero más información"), true);
  const { interpretation, plan, rendered } = renderTurn(
    "¡Hola! Quiero más información",
    createConversationContext({ preferredLanguage: "spanish" })
  );
  assert.equal(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(plan.templateKey, "job_overview_faq_then_resume");
  assert.equal(
    rendered.text,
    "¡Hola! Claro 😊 Es una oportunidad en servicios financieros y con gusto te explicamos cómo funciona. ¿En qué ciudad estás?"
  );
  assert.doesNotMatch(rendered.text, /dato que te acabo de pedir/i);

  const puedo = renderTurn(
    "¡Hola! ¿Puedo obtener más información?",
    createConversationContext({ preferredLanguage: "spanish" })
  );
  assert.equal(puedo.interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(puedo.plan.templateKey, "job_overview_faq_then_resume");
  assert.match(puedo.rendered.text, /servicios financieros/i);
  assert.match(puedo.rendered.text, /ciudad estás/i);
  assert.doesNotMatch(puedo.rendered.text, /ciudad y estado/i);
  assert.doesNotMatch(puedo.rendered.text, /dato que te acabo de pedir/i);
});

test("3. current_step / missingFields / leaked token without Atlas outbound → still first-turn", () => {
  const reconstructed = buildReconstructionInput({
    id: "camila-like",
    phone: "+573152115744",
    name: "Camila Arenas",
    current_step: "CITY"
  });
  assert.equal(reconstructed.conversation.lastQuestionAsked, null);

  const loaded = loadConversationContext({
    ...reconstructed,
    preferredLanguage: "english",
    conversation: {
      ...reconstructed.conversation,
      unresolvedFields: ["city", "state", "workAuthorization"],
      lastQuestionAsked: "DAY_PART",
      lastAtlasOutboundText: null
    }
  });
  assert.equal(hasConcretePriorAtlasQuestion(loaded), false);

  const { interpretation, plan, rendered } = renderTurn(
    "Hello! Can I get more info on this?",
    createConversationContext({
      preferredLanguage: "english",
      currentStage: STAGES.QUALIFICATION,
      knownFacts: loaded.knownFacts,
      conversation: loaded.conversation
    })
  );
  assert.equal(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(plan.templateKey, "job_overview_faq_then_resume");
  assert.match(rendered.text, /financial services/i);
  assert.match(rendered.text, /city and state/i);
  assert.doesNotMatch(rendered.text, /detail I just asked/i);
  assert.doesNotMatch(rendered.text, /\bDAY_PART\b|\bWORK_AUTHORIZATION\b|\bQUAL_CAPTURE\b/i);
});

test("4. Existing conversation: Atlas asked city/state, unrelated FAQ → answer + resume city/state", () => {
  const ctx = createConversationContext({
    preferredLanguage: "english",
    conversation: {
      lastQuestionAsked: "ask_location",
      lastAtlasOutboundText:
        "Hi! Thanks for reaching out. What city and state do you live in?"
    }
  });
  assert.equal(hasConcretePriorAtlasQuestion(ctx), true);

  const { interpretation, plan, rendered } = renderTurn(
    "What is this about?",
    ctx
  );
  assert.equal(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(plan.templateKey, "job_overview_faq_then_resume");
  assert.match(rendered.text, /financial services/i);
  assert.match(rendered.text, /city and state/i);
  assert.doesNotMatch(rendered.text, /detail I just asked/i);
  assert.doesNotMatch(rendered.text, /work authorization/i);
});

test("5. Existing conversation with genuine pending question → resume/clarify preserved", () => {
  const ctx = createConversationContext({
    preferredLanguage: "english",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      lastAtlasOutboundText: "Perfect. What time in the afternoon works best for you?",
      clarificationCount: 0
    }
  });
  assert.equal(hasConcretePriorAtlasQuestion(ctx), true);

  const unknown = renderTurn("xyzzy plugh 999", ctx);
  assert.equal(unknown.interpretation.intent, INTENTS.UNKNOWN);
  assert.equal(unknown.plan.templateKey, "clarify_once");
  assert.match(unknown.rendered.text, /detail I just asked/i);

  const faq = renderTurn("What is this about?", ctx);
  assert.equal(faq.plan.templateKey, "job_overview_faq_then_resume");
  assert.match(faq.rendered.text, /financial services/i);
  assert.match(faq.rendered.text, /time|afternoon/i);
  assert.doesNotMatch(faq.rendered.text, /city and state/i);
});

test("6. No cross-prospect / session contamination", () => {
  const prospectA = createConversationContext({
    prospectId: "prospect-a",
    preferredLanguage: "english",
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "Do you have work authorization or legal documentation to work in the United States?"
    }
  });
  const prospectB = createConversationContext({
    prospectId: "prospect-b",
    preferredLanguage: "english"
  });

  const aTurn = renderTurn("Hello! Can I get more info on this?", prospectA);
  const bTurn = renderTurn("Hello! Can I get more info on this?", prospectB);

  assert.match(aTurn.rendered.text, /work authorization|legal documentation/i);
  assert.equal(bTurn.plan.templateKey, "job_overview_faq_then_resume");
  assert.equal(bTurn.rendered.text, `${ENGLISH_OVERVIEW} What city and state do you live in?`);
  assert.doesNotMatch(bTurn.rendered.text, /detail I just asked/i);
  assert.equal(prospectA.conversation.lastQuestionAsked, "ask_authorization");
  assert.equal(prospectB.conversation.lastQuestionAsked, null);
});

test("7. Phone/legacy correlation cannot import pending-question state from another conversation", async () => {
  const repo = createMemoryContextRepository();
  const service = createContextPersistenceService({
    repository: repo,
    resolveIdentity: async ({ prospectId }) => ({
      ok: true,
      coreProspectId: prospectId,
      legacyProspectId: null
    })
  });
  const org = "00000000-0000-4000-8000-000000000001";

  await service.createContext({
    organizationId: org,
    prospectId: "prospect-a",
    prospectPhone: "+15550001111",
    ensureCore: false,
    context: createConversationContext({
      organizationId: org,
      prospectId: "prospect-a",
      preferredLanguage: "english",
      conversation: {
        lastQuestionAsked: "ask_authorization",
        lastAtlasOutboundText:
          "Do you have work authorization or legal documentation to work in the United States?"
      }
    })
  });

  const loadedB = await service.loadOrReconstruct({
    organizationId: org,
    prospectId: "prospect-b",
    prospectPhone: "+15550001111",
    ensureCore: false,
    reconstructionInput: {
      preferredLanguage: "english",
      conversation: {
        lastQuestionAsked: null,
        lastAtlasOutboundText: null
      }
    }
  });

  assert.equal(loadedB.source, "reconstructed");
  assert.notEqual(
    loadedB.context.conversation?.lastQuestionAsked,
    "ask_authorization"
  );

  const { rendered, plan } = renderTurn(
    "Hello! Can I get more info on this?",
    createConversationContext({
      preferredLanguage: "english",
      conversation: {
        lastQuestionAsked: loadedB.context.conversation?.lastQuestionAsked || null,
        lastAtlasOutboundText:
          loadedB.context.conversation?.lastAtlasOutboundText || null
      }
    })
  );
  assert.equal(plan.templateKey, "job_overview_faq_then_resume");
  assert.match(rendered.text, /financial services/i);
  assert.doesNotMatch(rendered.text, /detail I just asked/i);
});

test("8. English / Spanish first-turn parity (info request)", () => {
  const en = renderTurn(
    "Can I get more info on this?",
    createConversationContext({ preferredLanguage: "english" })
  );
  const es = renderTurn(
    "¿Puedo obtener más información?",
    createConversationContext({ preferredLanguage: "spanish" })
  );
  assert.equal(en.plan.templateKey, es.plan.templateKey);
  assert.equal(en.plan.templateKey, "job_overview_faq_then_resume");
  assert.match(en.rendered.text, /city and state/i);
  assert.match(es.rendered.text, /ciudad estás/i);
  assert.doesNotMatch(es.rendered.text, /ciudad y estado/i);
  assert.doesNotMatch(en.rendered.text, /detail I just asked/i);
  assert.doesNotMatch(es.rendered.text, /dato que te acabo de pedir/i);
});
