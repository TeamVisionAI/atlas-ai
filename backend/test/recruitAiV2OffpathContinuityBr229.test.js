/**
 * BR-229 — Recruit V2 pending-state continuity across affirmatives, FAQs,
 * and location clarifications (production Case A / Case B).
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  parseWorkAuthorizationAnswer,
  WORK_AUTHORIZATION
} = require("../core/recruitAiV2/qualificationFacts");
const { isBareConversationalYes } = require("../core/languageLibrary");
const {
  looksLikeJobOverviewQuestion,
  looksLikeJobOpportunityQuestion,
  looksLikeOfficeLocationQuestion,
  looksLikeNearbyLocationPreference,
  extractNearbyCityPreference,
  looksLikeClarifiableNonresponsiveInput
} = require("../core/recruitAiV2/conversationContinuity");
const { canonicalizeCityName } = require("../core/recruitAiV2/locationFacts");
const {
  isRecruitingCampaignIntakeFirstTurnBurst,
  looksLikeRecruitingFirstTurnSupplement,
  shouldSkipDuplicateRecruitingFirstTurnReply
} = require("../core/recruitingFirstTurnBurst");
const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");

const TEAM_LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const GENERIC_FALLBACK =
  "Con gusto te ayudo — ¿puedes compartir el dato que te acabo de pedir para continuar?";
const HALLANDALE_TYPO =
  "Donde esran ubicado husconalgo serca a halandey";
const FIXED_NOW = new Date("2026-09-01T15:00:00.000-04:00");

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

function authPendingMiami(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "LOCAL"
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
    },
    ...overrides
  });
}

function dayPartOrlando(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "scheduling",
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Orlando",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "OUTSIDE",
      workAuthorization: true,
      workAuthorizationStatus: WORK_AUTHORIZATION.AUTHORIZED,
      preferredMeetingType: "zoom"
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Perfecto. Como estás en Orlando, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?"
    },
    ...overrides
  });
}

test("docs: BR-229 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-229/);
  assert.match(rules, /pending-state continuity/i);
});

test("A/B/C) stacked Spanish yes under ask_authorization is AUTHORIZED", () => {
  const ctx = authPendingMiami();
  for (const phrase of [
    "Si claro",
    "Sí claro",
    "si claro",
    "claro que si",
    "Claro que sí",
    "claro",
    "si tengo",
    "tengo permiso"
  ]) {
    assert.equal(isBareConversationalYes(phrase) || phrase.includes("tengo"), true, phrase);
    assert.equal(
      parseWorkAuthorizationAnswer(phrase, ctx),
      WORK_AUTHORIZATION.AUTHORIZED,
      phrase
    );
    const r = turn(phrase, ctx);
    assert.equal(r.interpretation.intent, "provide_authorization", phrase);
    assert.equal(r.nextContext.knownFacts.workAuthorization, true, phrase);
    assert.notEqual(r.nextContext.conversation.lastQuestionAsked, "ask_authorization", phrase);
    assert.doesNotMatch(r.rendered.text, new RegExp(GENERIC_FALLBACK.replace(/[—?]/g, ".")));
    assert.equal(r.nextContext.knownFacts.city, "Miami", phrase);
  }
});

test("D) Para que sería el trabajo? during day-part answers FAQ and resumes once", () => {
  assert.equal(looksLikeJobOverviewQuestion("Para que sería el trabajo?"), true);
  assert.equal(looksLikeJobOpportunityQuestion("Para que sería el trabajo?"), true);

  const r = turn("Para que sería el trabajo?", dayPartOrlando());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.match(r.rendered.text, /servicios financieros|oportunidad/i);
  assert.match(r.rendered.text, /mañana|tarde/i);
  assert.doesNotMatch(r.rendered.text, /ciudad y estado|permiso de trabajo/i);
  assert.doesNotMatch(r.rendered.text, /dato que te acabo de pedir/i);
  assert.equal(r.nextContext.knownFacts.city, "Orlando");
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.equal(r.nextContext.knownFacts.preferredMeetingType, "zoom");
  const morningHits = (r.rendered.text.match(/mañana/gi) || []).length;
  const afternoonHits = (r.rendered.text.match(/tarde/gi) || []).length;
  assert.ok(morningHits <= 2 && afternoonHits <= 2);
});

test("E) What is the job? English FAQ resume during day-part", () => {
  const ctx = dayPartOrlando({
    preferredLanguage: "english",
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Perfect. Since you are in Orlando, we can do the interview on Zoom. Do you prefer morning or afternoon?"
    }
  });
  assert.equal(looksLikeJobOpportunityQuestion("What is the job?"), true);
  const r = turn("What is the job?", ctx);
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.match(r.rendered.text, /financial services|opportunity/i);
  assert.match(r.rendered.text, /morning|afternoon/i);
  assert.doesNotMatch(r.rendered.text, /city and state|work permit/i);
  assert.doesNotMatch(r.rendered.text, /dato que te acabo de pedir/i);
  assert.equal(r.nextContext.knownFacts.city, "Orlando");
});

test("F) Hallandale typo is office/nearby preference, not handoff", () => {
  assert.equal(looksLikeOfficeLocationQuestion(HALLANDALE_TYPO), true);
  assert.equal(looksLikeNearbyLocationPreference(HALLANDALE_TYPO), true);
  assert.equal(extractNearbyCityPreference(HALLANDALE_TYPO), "Hallandale");
  assert.equal(canonicalizeCityName("halandey"), "Hallandale");

  const r = turn(HALLANDALE_TYPO, authPendingMiami());
  assert.equal(r.interpretation.intent, "office_location_question");
  assert.equal(r.structuredDecision.decision.shouldEscalate, false);
  assert.doesNotMatch(r.rendered.text, /te contactará|teammate will follow/i);
  assert.doesNotMatch(r.rendered.text, /dato que te acabo de pedir/i);
  assert.equal(r.nextContext.knownFacts.city, "Miami");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.match(r.rendered.text, /oficina|office|ubicación|location/i);
});

test("G) same inbound wamid contract: first-turn skip after delivered greeting", () => {
  const skip = shouldSkipDuplicateRecruitingFirstTurnReply({
    atlasEligibilitySource: "CTWA_REFERRAL",
    hasDeliveredAutomatedOutbound: true,
    workflowState: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      canonicalMilestone: "GREETING_SENT",
      conversation: { lastQuestionAsked: "ask_location" }
    },
    semanticBody: "Hola me.interesa wn busca de trabajo"
  });
  assert.equal(skip, true);
});

test("H/I) CTWA first-turn burst + intake/V2 greeting dedup", () => {
  assert.equal(
    isRecruitingCampaignIntakeFirstTurnBurst({
      atlasEligibilitySource: "CTWA_REFERRAL",
      hasDeliveredAutomatedOutbound: false
    }),
    true
  );
  assert.equal(
    looksLikeRecruitingFirstTurnSupplement("Hola me.interesa wn busca de trabajo"),
    true
  );
  assert.equal(
    shouldSkipDuplicateRecruitingFirstTurnReply({
      campaignIntakeMatch: null,
      hasDeliveredAutomatedOutbound: true,
      firstTurnInFlight: true,
      workflowState: {
        atlasEligibilitySource: "CTWA_REFERRAL",
        canonicalMilestone: "NEW_LEAD",
        conversation: { lastQuestionAsked: "ask_location" }
      },
      semanticBody: "Hola me.interesa wn busca de trabajo"
    }),
    true
  );
  assert.equal(
    shouldSkipDuplicateRecruitingFirstTurnReply({
      campaignIntakeMatch: null,
      hasDeliveredAutomatedOutbound: true,
      workflowState: {
        atlasEligibilitySource: "CTWA_REFERRAL",
        canonicalMilestone: "GREETING_SENT",
        conversation: { lastQuestionAsked: "ask_location" }
      },
      semanticBody: "En miami fl"
    }),
    false
  );
});

test("J) non-TV tenant escalate copy does not say Team Vision", () => {
  const rendered = renderCustomerReply({
    templateKey: "safe_uncertain_escalate",
    language: "spanish",
    entities: {
      requiresHuman: true,
      organizationId: TEAM_LEGACY_ORG
    }
  });
  assert.doesNotMatch(rendered.text, /Team Vision/i);
  assert.match(rendered.text, /compañero/i);

  const tv = renderCustomerReply({
    templateKey: "safe_uncertain_escalate",
    language: "spanish",
    entities: {
      requiresHuman: true,
      organizationId: TEAM_VISION_ORGANIZATION_ID
    }
  });
  assert.match(tv.text, /Team Vision/i);

  const office = turn(
    HALLANDALE_TYPO,
    authPendingMiami({ organizationId: TEAM_LEGACY_ORG })
  );
  assert.doesNotMatch(office.rendered.text, /Team Vision/i);
  assert.doesNotMatch(office.rendered.text, /2500 NW 79th/i);
});

test("K) known facts remain intact after FAQ", () => {
  const r = turn("Para que sería el trabajo?", dayPartOrlando());
  assert.equal(r.nextContext.knownFacts.city, "Orlando");
  assert.equal(r.nextContext.knownFacts.state, "FL");
  assert.equal(r.nextContext.knownFacts.workAuthorization, true);
  assert.equal(r.nextContext.knownFacts.preferredMeetingType, "zoom");
});

test("L) generic fallback only for truly unknown/nonresponsive input", () => {
  assert.equal(looksLikeClarifiableNonresponsiveInput("asdfghjkl"), true);
  assert.equal(looksLikeClarifiableNonresponsiveInput("Si claro"), true);
  assert.equal(
    looksLikeClarifiableNonresponsiveInput("Para que sería el trabajo?"),
    false
  );
  assert.equal(looksLikeClarifiableNonresponsiveInput(HALLANDALE_TYPO), false);

  const unknown = turn("asdfghjkl", dayPartOrlando());
  assert.match(unknown.rendered.text, /dato que te acabo de pedir/i);

  const yes = turn("Si claro", authPendingMiami());
  assert.doesNotMatch(yes.rendered.text, /dato que te acabo de pedir/i);
});

test("M) FAQ resume from auth, day-part, date, and slot confirmation", () => {
  const auth = turn("Para que sería el trabajo?", authPendingMiami());
  assert.match(auth.rendered.text, /servicios financieros|oportunidad/i);
  assert.match(auth.rendered.text, /permiso de trabajo|documentación legal/i);
  assert.doesNotMatch(auth.rendered.text, /dato que te acabo de pedir/i);

  const day = turn("Para que sería el trabajo?", dayPartOrlando());
  assert.match(day.rendered.text, /mañana|tarde/i);

  const dateCtx = dayPartOrlando({
    conversation: {
      lastQuestionAsked: "ask_date",
      lastAtlasOutboundText: "¿Qué día te funciona mejor?"
    }
  });
  const dateTurn = turn("Para que sería el trabajo?", dateCtx);
  assert.doesNotMatch(dateTurn.rendered.text, /dato que te acabo de pedir/i);
  assert.doesNotMatch(dateTurn.rendered.text, /permiso de trabajo/i);

  const slotCtx = dayPartOrlando({
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText: "¿Te funciona mañana a las 10:00 a.m.?"
    },
    appointment: {
      status: "proposed",
      proposedTime: "2026-09-02T14:00:00.000Z"
    }
  });
  const slotTurn = turn("Para que sería el trabajo?", slotCtx);
  assert.doesNotMatch(slotTurn.rendered.text, /dato que te acabo de pedir/i);
  assert.doesNotMatch(slotTurn.rendered.text, /ciudad y estado/i);
});

test("N) typo / no-accent Spanish variants", () => {
  assert.equal(looksLikeJobOverviewQuestion("para que seria el trabajo"), true);
  assert.equal(isBareConversationalYes("si claro"), true);
  assert.equal(isBareConversationalYes("claro que si"), true);
  const r = turn("para que seria el trabajo", dayPartOrlando());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.doesNotMatch(r.rendered.text, /dato que te acabo de pedir/i);
});
