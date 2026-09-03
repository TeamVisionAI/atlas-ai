/**
 * BR-222 — Fresh IUL campaign intake restarts the episode when no
 * confirmed policy-review appointment exists.
 */

"use strict";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createConversationContext,
  interpretInboundMessage,
  decideConversationTurn,
  buildResponsePlan,
  renderCustomerReply,
  INTENTS
} = require("../core/recruitAiV2");
const { REASON_CODES, APPOINTMENT_STATUS } = require("../core/recruitAiV2/constants");
const {
  ASK,
  CONVERSATION_GOAL,
  CAMPAIGN_KIND,
  meetingModeFacts
} = require("../core/recruitAiV2/iulAdConversation");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const { IUL_STAGES } = require("../core/iulWorkflowConstants");
const { INTAKE_CODE_STATUS } = require("../core/campaignIntakeCode/constants");
const {
  hasFreshIulIntakeSignal,
  hasConfirmedIulPolicyReviewAppointment,
  shouldResetIulEpisodeForFreshIntake,
  resetIulEpisodeFacts,
  resolveIulFreshIntakeEpisode
} = require("../core/recruitAiV2/iulFreshIntakeEpisode");
const { isIulBookingComplete } = require("../core/recruitAiV2/iulSchedulingOwnership");

const NOW = "2026-09-03T14:00:00.000Z";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PROSPECT_ID = "f11cb86d-83bb-44a8-8f82-f8e698541a98";
const OFFICE = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const IUL_CODE = "TVI-0824-VNC8";

const FRESH_IUL_MATCH = Object.freeze({
  matched: true,
  purpose: "IUL",
  status: INTAKE_CODE_STATUS.ACTIVE,
  iulReviewEligible: true,
  recruitingEligible: false,
  code: IUL_CODE
});

function slot(date, time) {
  return { dateKey: date, timeKey: time, date, time, timezone: "America/New_York" };
}

function researchFacts(mode = null) {
  return {
    name: "Eladio",
    iulQualificationStatus: IUL_OPTION_IDS.STATUS_RESEARCH,
    iulReviewIntent: IUL_OPTION_IDS.REVIEW_GROWTH,
    reviewReason: IUL_OPTION_IDS.REVIEW_GROWTH,
    iulWorkflowStage: IUL_STAGES.REVIEW_READY,
    ...(mode
      ? meetingModeFacts(mode, {
          organizationId: TEAM_VISION_ORG,
          knownFacts: { reviewOfficeAddress: OFFICE },
          _officeLocation: { fullAddress: OFFICE }
        })
      : {})
  };
}

function activeFacts(mode = "zoom") {
  return {
    name: "Ana",
    iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE,
    iulReviewIntent: IUL_OPTION_IDS.REVIEW_UNDERSTAND,
    iulPolicyActive: true,
    policyType: "IUL",
    carrier: "National Life",
    carrierResolved: true,
    policyAgeRange: "3-5",
    documentsAvailable: true,
    iulWorkflowStage: IUL_STAGES.REVIEW_READY,
    ...meetingModeFacts(mode, {
      organizationId: TEAM_VISION_ORG,
      knownFacts: { reviewOfficeAddress: OFFICE },
      _officeLocation: { fullAddress: OFFICE }
    }),
    reviewOfficeAddress: OFFICE
  };
}

function iulContext(overrides = {}) {
  return createConversationContext({
    prospectId: PROSPECT_ID,
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    organizationId: TEAM_VISION_ORG,
    agentId: AGENT_ID,
    prospectOwnerUserId: AGENT_ID,
    timezone: "America/New_York",
    _testNow: NOW,
    _officeLocation: { fullAddress: OFFICE },
    knownFacts: { name: "Eladio" },
    conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY },
    ...overrides
  });
}

function intakeMessage(text = `Hola, quiero revisar mi póliza IUL. ${IUL_CODE}`) {
  return { text, campaignIntakeMatch: FRESH_IUL_MATCH };
}

function turn(message, context) {
  const inbound = typeof message === "string" ? { text: message } : message;
  const interpretation = interpretInboundMessage({
    message: inbound,
    context,
    options: { campaignIntakeMatch: inbound.campaignIntakeMatch || null }
  });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

test("A) stale research IUL context + fresh intake + no appointment → resets to fresh intake", () => {
  const context = iulContext({
    knownFacts: researchFacts("zoom"),
    conversation: { lastQuestionAsked: ASK.RESEARCH_INTENT, lastOfferMade: "iul_ask_research_intent" }
  });
  const { interpretation, decision, rendered } = turn(intakeMessage(), context);
  assert.equal(interpretation.intent, INTENTS.IUL_GREETING);
  assert.equal(interpretation.entities.iulFreshEpisodeReset, true);
  assert.ok(decision.reasonCodes.includes(REASON_CODES.IUL_FRESH_EPISODE_RESET));
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
  assert.equal(decision.contextPatch.knownFacts.iulQualificationStatus, null);
  assert.equal(decision.contextPatch.knownFacts.iulReviewIntent, null);
  assert.equal(decision.contextPatch.knownFacts.iulWorkflowStage, IUL_STAGES.NEW_IUL_LEAD);
  assert.match(rendered.text, /situación|orientarle/i);
  assert.doesNotMatch(rendered.text, /día le funciona/i);
});

test("B) stale Zoom/day selection + fresh intake + no appointment → does not resume day picker", () => {
  const context = iulContext({
    knownFacts: {
      ...researchFacts("zoom"),
      iulOfferedDays: [{ dateKey: "2026-09-04", title: "Vie 4" }],
      iulAvailableDays: [{ dateKey: "2026-09-04" }],
      iulShownDayKeys: ["2026-09-04"]
    },
    conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY, lastOfferMade: "iul_ask_review_day" },
    appointment: {
      status: APPOINTMENT_STATUS.PROPOSED,
      previouslyOfferedSlots: [slot("2026-09-04", "09:00")]
    }
  });
  const { decision, rendered } = turn(intakeMessage(), context);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
  assert.deepEqual(decision.contextPatch.knownFacts.iulOfferedDays, []);
  assert.equal(decision.contextPatch.knownFacts.meetingMode, null);
  assert.equal(decision.customerReplyPlan.entities?.whatsappInteractive?.type !== "list" ||
    !JSON.stringify(decision.customerReplyPlan.entities?.whatsappInteractive || {}).includes("IUL_DAY_"), true);
  assert.match(rendered.text, /situación|orientarle/i);
  assert.doesNotMatch(rendered.text, /Perfecto\. ¿Qué día/i);
});

test("C) stale booking-pending with no persisted/confirmed appointment + fresh intake → fresh episode", () => {
  const context = iulContext({
    knownFacts: {
      ...researchFacts("zoom"),
      iulBookingPending: true,
      reviewProposedDate: "2026-09-04",
      reviewProposedTime: "09:00",
      iulWorkflowStage: IUL_STAGES.REVIEW_SCHEDULED
    },
    conversation: {
      lastQuestionAsked: ASK.CONFIRM_SLOT,
      lastOfferMade: "iul_confirm_review_deferred"
    },
    appointment: {
      status: APPOINTMENT_STATUS.PROPOSED,
      proposedDate: "2026-09-04",
      proposedTime: "09:00",
      appointmentId: null
    }
  });
  assert.equal(hasConfirmedIulPolicyReviewAppointment(context), false);
  const { interpretation, decision, rendered } = turn(intakeMessage(), context);
  assert.equal(interpretation.intent, INTENTS.IUL_GREETING);
  assert.equal(decision.contextPatch.knownFacts.iulBookingPending, false);
  assert.equal(decision.contextPatch.appointment.appointmentId, null);
  assert.equal(decision.contextPatch.appointment.status, APPOINTMENT_STATUS.NONE);
  assert.equal(decision.decision.mayCreateAppointment, false);
  assert.match(rendered.text, /situación|orientarle/i);
});

test("D) confirmed appointment + fresh intake → preserve appointment; no duplicate scheduling", () => {
  const context = iulContext({
    knownFacts: {
      ...researchFacts("zoom"),
      zoomJoinUrl: "https://zoom.us/j/222-preserved",
      iulWorkflowStage: IUL_STAGES.REVIEW_SCHEDULED
    },
    conversation: {
      lastQuestionAsked: ASK.CONFIRM_SLOT,
      lastOfferMade: "iul_review_confirmed_zoom"
    },
    appointment: {
      status: APPOINTMENT_STATUS.CONFIRMED,
      appointmentId: "appt-iul-confirmed-222",
      proposedDate: "2026-09-04",
      proposedTime: "09:00",
      confirmedDate: "2026-09-04",
      confirmedTime: "09:00",
      meetingUrl: "https://zoom.us/j/222-preserved"
    }
  });
  assert.equal(isIulBookingComplete(context), true);
  assert.equal(hasConfirmedIulPolicyReviewAppointment(context), true);
  const { interpretation, decision, rendered } = turn(intakeMessage(), context);
  assert.equal(interpretation.intent, INTENTS.IUL_BOOKING_REHYDRATE);
  assert.ok(decision.reasonCodes.includes(REASON_CODES.IUL_CONFIRMED_APPOINTMENT_PRESERVED));
  assert.equal(decision.decision.mayCreateAppointment, false);
  assert.equal(decision.customerReplyPlan.templateKey, "iul_review_confirmed_zoom");
  assert.notEqual(decision.contextPatch.conversation.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
  assert.equal(context.appointment.appointmentId, "appt-iul-confirmed-222");
  assert.doesNotMatch(rendered.text, /situación|orientarle/i);
  assert.doesNotMatch(rendered.text, /Qué día le funciona/i);
});

test("E) identity/org/owner/language/provenance preserved", () => {
  const context = iulContext({
    knownFacts: { ...researchFacts("zoom"), name: "Eladio", email: "eladio@example.com" },
    languageMeta: { source: "inferred", lastMessageLanguage: "spanish" }
  });
  const reset = resetIulEpisodeFacts(context);
  assert.equal(reset.organizationId, TEAM_VISION_ORG);
  assert.equal(reset.prospectId, PROSPECT_ID);
  assert.equal(reset.agentId, AGENT_ID);
  assert.equal(reset.prospectOwnerUserId, AGENT_ID);
  assert.equal(reset.preferredLanguage, "spanish");
  assert.equal(reset.campaignIntakePurpose, "IUL");
  assert.equal(reset.campaignKind, CAMPAIGN_KIND);
  assert.equal(reset.conversationGoal, CONVERSATION_GOAL);
  assert.equal(reset.knownFacts.name, "Eladio");
  assert.equal(reset.knownFacts.email, "eladio@example.com");
  assert.equal(reset.languageMeta.source, "inferred");
});

test("F) historical conversation logs untouched", () => {
  const logs = Object.freeze([
    { id: "log-1", body: "Estoy buscando información" },
    { id: "log-2", body: "Por Zoom" }
  ]);
  const context = iulContext({
    knownFacts: researchFacts("zoom"),
    conversationLogs: logs
  });
  const reset = resetIulEpisodeFacts(context);
  assert.equal(reset.conversationLogs, logs);
  assert.deepEqual(logs, [
    { id: "log-1", body: "Estoy buscando información" },
    { id: "log-2", body: "Por Zoom" }
  ]);
  assert.equal(shouldResetIulEpisodeForFreshIntake({ context, campaignIntakeMatch: FRESH_IUL_MATCH }), true);
});

test("G) active-policy stale facts cleared on true new episode", () => {
  const context = iulContext({
    knownFacts: activeFacts("zoom"),
    conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY }
  });
  const { decision } = turn(intakeMessage(), context);
  const facts = decision.contextPatch.knownFacts;
  assert.equal(facts.iulPolicyActive, null);
  assert.equal(facts.policyType, null);
  assert.equal(facts.carrier, null);
  assert.equal(facts.carrierResolved, false);
  assert.equal(facts.policyAgeRange, null);
  assert.equal(facts.documentsAvailable, null);
  assert.equal(facts.iulQualificationStatus, null);
  assert.equal(facts.iulWorkflowStage, IUL_STAGES.NEW_IUL_LEAD);
});

test("H) information-seeker stale facts cleared on true new episode", () => {
  const context = iulContext({
    knownFacts: {
      ...researchFacts("zoom"),
      policyType: "UNSURE",
      carrier: "Manufactured"
    }
  });
  const { decision } = turn(intakeMessage(), context);
  assert.equal(decision.contextPatch.knownFacts.iulQualificationStatus, null);
  assert.equal(decision.contextPatch.knownFacts.iulReviewIntent, null);
  assert.equal(decision.contextPatch.knownFacts.policyType, null);
  assert.equal(decision.contextPatch.knownFacts.carrier, null);
  assert.equal(decision.contextPatch.knownFacts.meetingMode, null);
});

test("I) ordinary continuation without intake code does NOT reset", () => {
  const context = iulContext({
    knownFacts: {
      ...researchFacts("zoom"),
      iulOfferedDays: [{ dateKey: "2026-09-04", title: "Vie 4", weekdayIndex: 5 }]
    },
    conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY }
  });
  assert.equal(
    hasFreshIulIntakeSignal({ context, message: { text: "Viernes" } }),
    false
  );
  const { interpretation, decision, rendered } = turn("Viernes", context);
  assert.notEqual(interpretation.intent, INTENTS.IUL_GREETING);
  assert.ok(!decision.reasonCodes.includes(REASON_CODES.IUL_FRESH_EPISODE_RESET));
  assert.notEqual(decision.contextPatch.conversation.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
  assert.doesNotMatch(rendered.text, /cuál describe su situación/i);
});

test("J) recruiting flow unchanged", () => {
  const recruitingMatch = {
    matched: true,
    purpose: "RECRUITING",
    status: INTAKE_CODE_STATUS.ACTIVE,
    iulReviewEligible: false,
    recruitingEligible: true,
    code: "TVR-0824-REC1"
  };
  const recruiting = createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: "interview",
    organizationId: TEAM_VISION_ORG,
    agentId: AGENT_ID,
    conversation: { lastQuestionAsked: "ask_location" },
    knownFacts: { name: "Luis" }
  });
  assert.equal(
    shouldResetIulEpisodeForFreshIntake({
      context: recruiting,
      campaignIntakeMatch: recruitingMatch
    }),
    false
  );
  const { interpretation, decision } = turn(
    { text: "Miami, FL", campaignIntakeMatch: recruitingMatch },
    recruiting
  );
  assert.notEqual(interpretation.intent, INTENTS.IUL_GREETING);
  assert.notEqual(decision.contextPatch?.conversation?.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
  assert.ok(!decision.reasonCodes?.includes(REASON_CODES.IUL_FRESH_EPISODE_RESET));
});

test("K) BR-219 confirmed ownership helper remains the booking-complete gate", () => {
  const pending = iulContext({
    appointment: { status: APPOINTMENT_STATUS.PROPOSED, appointmentId: null }
  });
  const confirmed = iulContext({
    appointment: {
      status: APPOINTMENT_STATUS.CONFIRMED,
      appointmentId: "appt-real"
    }
  });
  assert.equal(isIulBookingComplete(pending), false);
  assert.equal(isIulBookingComplete(confirmed), true);
  assert.equal(hasConfirmedIulPolicyReviewAppointment(pending), false);
  assert.equal(hasConfirmedIulPolicyReviewAppointment(confirmed), true);
  const staleId = iulContext({
    appointment: { status: APPOINTMENT_STATUS.PROPOSED, appointmentId: "ghost" },
    _confirmedPolicyReviewAppointment: false
  });
  assert.equal(hasConfirmedIulPolicyReviewAppointment(staleId), false);
  assert.equal(
    resolveIulFreshIntakeEpisode({
      context: confirmed,
      campaignIntakeMatch: FRESH_IUL_MATCH
    }).alreadyBooked,
    true
  );
});

test("L) no migration required", () => {
  const migrationsDir = path.join(__dirname, "../database/migrations");
  const names = fs.readdirSync(migrationsDir);
  assert.ok(!names.some((name) => /br[-_]?222|fresh.intake.episode/i.test(name)));
  assert.ok(
    fs.existsSync(
      path.join(__dirname, "../core/recruitAiV2/iulFreshIntakeEpisode.js")
    )
  );
});
