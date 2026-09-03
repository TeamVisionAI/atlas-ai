/**
 * BR-213 — IUL meeting-mode choice, cross-date More pagination, booking completion.
 * Does not redesign BR-157 qualification. Preserves BR-211 delivery and BR-190 create-before-confirm.
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
const {
  NEXT_ACTIONS,
  REASON_CODES,
  FEATURE_FLAGS,
  V2_EXECUTABLE_ACTIONS
} = require("../core/recruitAiV2/constants");
const {
  ASK,
  CONVERSATION_GOAL,
  CAMPAIGN_KIND,
  resolveIulOfficeLocation,
  meetingModeFacts
} = require("../core/recruitAiV2/iulAdConversation");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const {
  IUL_SLOT_MORE_ID,
  formatIulSlotButtonTitle,
  selectIulCrossDatePage,
  rejectIdsForShown
} = require("../core/recruitAiV2/iulSlotSelection");
const { buildPolicyReviewSchedulingContext } = require("../core/recruitAiV2/iulPolicyReviewScheduling");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  resolveConfirmedSlot,
  resolveInterviewType,
  executeAuthorizedSideEffects
} = require("../core/recruitAiV2/sideEffectExecutor");
const { applyExecutionOutcomeToReply } = require("../core/recruitAiV2/orchestrator");
const { IUL_REVIEW_MEETING_TYPE } = require("../core/iulWorkflowConstants");
const { buildReminderMessage, REMINDER_TYPES } = require("../services/appointmentReminderEngine");
const policyReviewPipelineApplicationService = require("../application/policyReviewPipelineApplicationService");

const NOW = "2026-09-01T16:00:00.000Z";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OFFICE_ADDRESS = "8300 NW 53rd Street, Suite 350, Doral, FL 33166";

function slot(date, time) {
  return { dateKey: date, timeKey: time, date, time, timezone: "America/New_York" };
}

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    organizationId: TEAM_VISION_ORG,
    agentId: AGENT_ID,
    timezone: "America/New_York",
    _testNow: NOW,
    knownFacts: { name: "Miller" },
    conversation: { lastQuestionAsked: ASK.MEETING_MODE },
    ...overrides
  });
}

function turn(message, context) {
  const interpretation = interpretInboundMessage({
    message: typeof message === "string" ? { text: message } : message,
    context
  });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

function zoomTap() {
  return {
    text: "Por Zoom",
    interactiveReply: { type: "button_reply", id: IUL_OPTION_IDS.MEET_ZOOM, title: "Por Zoom" }
  };
}

function officeTap() {
  return {
    text: "En la oficina",
    interactiveReply: {
      type: "button_reply",
      id: IUL_OPTION_IDS.MEET_OFFICE,
      title: "En la oficina"
    }
  };
}

function morningTap() {
  return {
    text: "En la mañana",
    interactiveReply: {
      type: "button_reply",
      id: IUL_OPTION_IDS.DAY_MORNING,
      title: "En la mañana"
    }
  };
}

function moreTap() {
  return {
    text: "Ver más horarios",
    interactiveReply: { type: "button_reply", id: IUL_SLOT_MORE_ID, title: "Ver más horarios" }
  };
}

function slotTap(offered, index = 0) {
  const selected = offered[index];
  return {
    text: formatIulSlotButtonTitle(selected, "es"),
    interactiveReply: {
      type: "button_reply",
      id: selected.selectionId,
      title: formatIulSlotButtonTitle(selected, "es")
    }
  };
}

function interactive(decision) {
  return decision.customerReplyPlan?.entities?.whatsappInteractive || null;
}

function optionIds(decision) {
  const payload = interactive(decision);
  if (!payload) return [];
  if (payload.type === "button") {
    return (payload.action?.buttons || []).map((row) => row.reply?.id);
  }
  return (payload.action?.sections || []).flatMap((section) =>
    (section.rows || []).map((row) => row.id)
  );
}

function offeredDates(decision) {
  return (decision.contextPatch?.appointment?.previouslyOfferedSlots || []).map(
    (row) => row.date || row.dateKey
  );
}

const CROSS_DATE_SLOTS = [
  slot("2026-09-02", "12:00"),
  slot("2026-09-02", "13:00"),
  slot("2026-09-02", "14:00"),
  slot("2026-09-02", "15:00"),
  slot("2026-09-03", "09:00"),
  slot("2026-09-03", "12:00")
];

function afterZoom(slots = CROSS_DATE_SLOTS) {
  const chosen = turn(
    zoomTap(),
    iulContext({
      _officeLocation: { fullAddress: OFFICE_ADDRESS },
      _availabilityFixture: { slots }
    })
  );
  return iulContext({
    conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY_PART },
    knownFacts: chosen.decision.contextPatch.knownFacts,
    _officeLocation: { fullAddress: OFFICE_ADDRESS },
    _availabilityFixture: { slots }
  });
}

function firstOffer(slots = CROSS_DATE_SLOTS) {
  return turn(morningTap(), afterZoom(slots));
}

function moreContext(first, slots = CROSS_DATE_SLOTS) {
  return iulContext({
    conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
    appointment: {
      previouslyOfferedSlots: first.decision.contextPatch.appointment.previouslyOfferedSlots
    },
    knownFacts: first.decision.contextPatch.knownFacts,
    _officeLocation: { fullAddress: OFFICE_ADDRESS },
    _availabilityFixture: { slots }
  });
}

function executionEnv() {
  return {
    [FEATURE_FLAGS.EXECUTION_ENABLED_ENV]: "true",
    [FEATURE_FLAGS.EXECUTION_ORGANIZATION_IDS_ENV]: TEAM_VISION_ORG,
    [FEATURE_FLAGS.EXECUTION_USER_IDS_ENV]: AGENT_ID
  };
}

test("A) meeting-mode question appears before daypart", () => {
  const afterCosts = turn(
    { text: "Costos", interactiveReply: { id: IUL_OPTION_IDS.REVIEW_COSTS, title: "Costos" } },
    iulContext({
      conversation: { lastQuestionAsked: ASK.REVIEW_INTENT },
      knownFacts: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE },
      _officeLocation: { fullAddress: OFFICE_ADDRESS }
    })
  );
  assert.equal(afterCosts.decision.contextPatch.conversation.lastQuestionAsked, ASK.MEETING_MODE);
  assert.match(afterCosts.rendered.text, /¿Cómo prefiere hacer su revisión de póliza\?/);
  assert.deepEqual(optionIds(afterCosts.decision), [
    IUL_OPTION_IDS.MEET_ZOOM,
    IUL_OPTION_IDS.MEET_OFFICE
  ]);
  assert.doesNotMatch(afterCosts.rendered.text, /¿Qué horario prefiere/);
});

test("B) Zoom choice persists", () => {
  const chosen = turn(
    zoomTap(),
    iulContext({ _officeLocation: { fullAddress: OFFICE_ADDRESS } })
  );
  assert.equal(chosen.interpretation.intent, INTENTS.IUL_CHOOSE_MEETING_MODE);
  assert.equal(chosen.decision.contextPatch.knownFacts.meetingMode, "zoom");
  assert.equal(chosen.decision.contextPatch.knownFacts.reviewMeetingType, IUL_REVIEW_MEETING_TYPE.ZOOM);
  assert.equal(chosen.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  assert.match(chosen.rendered.text, /¿Qué día le funciona mejor\?/);
});

test("C) office choice persists", () => {
  const chosen = turn(
    officeTap(),
    iulContext({ _officeLocation: { fullAddress: OFFICE_ADDRESS } })
  );
  assert.equal(chosen.decision.contextPatch.knownFacts.meetingMode, "in_person");
  assert.equal(
    chosen.decision.contextPatch.knownFacts.reviewMeetingType,
    IUL_REVIEW_MEETING_TYPE.IN_PERSON
  );
  assert.equal(chosen.decision.contextPatch.knownFacts.reviewOfficeAddress, OFFICE_ADDRESS);
  assert.equal(chosen.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  assert.match(chosen.rendered.text, /¿Qué día le funciona mejor\?/);
});

test("D) office unavailable/config missing handled safely", () => {
  const missing = turn(officeTap(), iulContext({ _officeUnavailable: true }));
  assert.ok(missing.decision.reasonCodes.includes(REASON_CODES.IUL_OFFICE_UNAVAILABLE));
  assert.match(missing.rendered.text, /no tengo una dirección de oficina configurada/i);
  assert.equal(missing.decision.contextPatch.conversation.lastQuestionAsked, ASK.MEETING_MODE);
  assert.deepEqual(optionIds(missing.decision), [IUL_OPTION_IDS.MEET_ZOOM]);
  assert.equal(resolveIulOfficeLocation({ _officeUnavailable: true }), null);
});

test("E) Zoom availability uses Zoom profile", () => {
  const facts = meetingModeFacts("zoom", {});
  const scheduling = buildPolicyReviewSchedulingContext({}, facts);
  assert.equal(scheduling.knownFacts.preferredMeetingType, IUL_REVIEW_MEETING_TYPE.ZOOM);
  assert.equal(
    resolveInterviewType({ knownFacts: facts }),
    "Zoom"
  );
});

test("F) office availability uses in-person profile/location", () => {
  const facts = meetingModeFacts("in_person", {
    _officeLocation: { fullAddress: OFFICE_ADDRESS }
  });
  const scheduling = buildPolicyReviewSchedulingContext({}, facts);
  assert.equal(scheduling.knownFacts.preferredMeetingType, IUL_REVIEW_MEETING_TYPE.IN_PERSON);
  assert.equal(facts.reviewOfficeAddress, OFFICE_ADDRESS);
  assert.equal(
    resolveInterviewType({ knownFacts: facts, appointment: { meetingType: "in_person" } }),
    "In Person"
  );
});

test("G) More returns unused slots", () => {
  const first = firstOffer();
  const firstIds = rejectIdsForShown(
    first.decision.contextPatch.appointment.previouslyOfferedSlots
  );
  const more = turn(moreTap(), moreContext(first));
  const nextIds = rejectIdsForShown(
    more.decision.contextPatch.appointment.previouslyOfferedSlots
  );
  assert.ok(nextIds.every((id) => !firstIds.includes(id)));
});

test("H) More advances across dates", () => {
  const first = firstOffer();
  const more = turn(moreTap(), moreContext(first));
  const dates = new Set(offeredDates(more.decision));
  assert.ok(dates.has("2026-09-03"));
});

test("I) More does not monopolize one date when later dates exist", () => {
  const page = selectIulCrossDatePage(CROSS_DATE_SLOTS.slice(3), { maxCandidates: 2 });
  const dates = new Set(page.map((row) => row.date || row.dateKey));
  assert.equal(page.length, 2);
  assert.ok(dates.has("2026-09-02"));
  assert.ok(dates.has("2026-09-03"));
  const more = turn(moreTap(), moreContext(firstOffer()));
  const shownDates = new Set(offeredDates(more.decision));
  assert.ok(shownDates.size >= 2);
});

test("J) no duplicate slot rendering after selection", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = turn(slotTap(offered, 0), moreContext(first));
  assert.equal(selected.decision.contextPatch.conversation.lastQuestionAsked, ASK.CONFIRM_SLOT);
  assert.equal(interactive(selected.decision), null);
  assert.equal(selected.decision.customerReplyPlan.entities.offeredSlots, undefined);
  const title = formatIulSlotButtonTitle(offered[0], "es");
  const occurrences = selected.rendered.text.split(title).length - 1;
  assert.equal(occurrences, 0);
});

test("K) selected slot resolves once", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = turn(slotTap(offered, 0), moreContext(first));
  assert.equal(selected.interpretation.intent, INTENTS.IUL_SELECT_OFFERED_SLOT);
  assert.equal(
    selected.decision.contextPatch.appointment.proposedTime,
    offered[0].time
  );
  assert.match(selected.rendered.text, /Estoy reservando su cita/);
  assert.match(selected.rendered.text, /a las/);
});

test("L) selected slot enters create path", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = turn(slotTap(offered, 0), moreContext(first));
  assert.equal(selected.decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
  assert.equal(selected.decision.decision.mayCreateAppointment, true);
  const resolved = resolveConfirmedSlot({
    context: moreContext(first),
    structuredDecision: selected.decision
  });
  assert.equal(resolved.dateKey, offered[0].date);
  assert.equal(resolved.timeKey, offered[0].time);
});

async function runCreate(selected, extras = {}) {
  const auth = authorizeSideEffects({
    structuredDecision: selected.decision,
    responsePlan: selected.plan,
    context: iulContext({ organizationId: TEAM_VISION_ORG, agentId: AGENT_ID }),
    env: executionEnv(),
    profileConfigured: true,
    actingUserId: AGENT_ID,
    organizationId: TEAM_VISION_ORG
  });
  const payloads = [];
  const execution = await executeAuthorizedSideEffects({
    authorization: auth,
    structuredDecision: selected.decision,
    context: {
      ...selected.decision.contextPatch,
      organizationId: TEAM_VISION_ORG,
      agentId: AGENT_ID,
      prospectId: "prospect-iul-213",
      prospectPhone: "+17865550213",
      timezone: "America/New_York",
      conversationGoal: CONVERSATION_GOAL
    },
    options: { inboundMessageId: "wamid.iul-213", prospectPhone: "+17865550213" },
    dependencies: {
      executeScheduleInterview: async (_phone, payload) => {
        payloads.push(payload);
        return {
          success: true,
          appointmentId: extras.appointmentId || "appt-iul-213",
          appointment: { id: extras.appointmentId || "appt-iul-213", purpose: "policy_review" }
        };
      },
      findActiveAppointmentForProspect: async () => null,
      getSlots: async () => ({ slots: CROSS_DATE_SLOTS })
    }
  });
  return { auth, execution, payloads };
}

test("M) Zoom create succeeds before confirm", async () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = turn(slotTap(offered, 0), moreContext(first));
  assert.match(selected.rendered.text, /reservando/);
  assert.doesNotMatch(selected.rendered.text, /quedó agendada|Listo\. Su revisión/);
  const { execution, payloads } = await runCreate(selected);
  assert.equal(execution.success, true);
  assert.equal(payloads[0].purpose, "policy_review");
  assert.equal(payloads[0].interviewType, "Zoom");
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: selected.decision,
    responsePlan: selected.plan,
    rendered: selected.rendered,
    execution
  });
  assert.equal(applied.responsePlan.templateKey, "iul_review_confirmed_zoom");
});

test("N) office create succeeds before confirm", async () => {
  const officeCtx = iulContext({
    conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY_PART },
    knownFacts: meetingModeFacts("in_person", { _officeLocation: { fullAddress: OFFICE_ADDRESS } }),
    _officeLocation: { fullAddress: OFFICE_ADDRESS },
    _availabilityFixture: { slots: CROSS_DATE_SLOTS }
  });
  const first = turn(morningTap(), officeCtx);
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = turn(
    slotTap(offered, 0),
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      appointment: first.decision.contextPatch.appointment,
      knownFacts: first.decision.contextPatch.knownFacts,
      _officeLocation: { fullAddress: OFFICE_ADDRESS },
      _availabilityFixture: { slots: CROSS_DATE_SLOTS }
    })
  );
  const { execution, payloads } = await runCreate(selected, { appointmentId: "appt-office-213" });
  assert.equal(execution.success, true);
  assert.equal(payloads[0].purpose, "policy_review");
  assert.equal(payloads[0].interviewType, "In Person");
  assert.equal(payloads[0].officeLocation, OFFICE_ADDRESS);
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: selected.decision,
    responsePlan: selected.plan,
    rendered: selected.rendered,
    execution
  });
  assert.equal(applied.responsePlan.templateKey, "iul_review_confirmed_office");
});

test("O) Zoom final confirmation includes Zoom context", () => {
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT },
      customerReplyPlan: {
        templateKey: "iul_confirm_review_deferred",
        entities: { meetingMode: "zoom", slotLabel: "miércoles a las 3:00 PM" }
      },
      reasonCodes: [REASON_CODES.IUL_AD_CONVERSATION]
    },
    responsePlan: {
      templateKey: "iul_confirm_review_deferred",
      language: "spanish",
      entities: { meetingMode: "zoom", slotLabel: "miércoles a las 3:00 PM" }
    },
    rendered: { text: "deferred" },
    execution: {
      attempted: true,
      success: true,
      performed: [{ dateKey: "2026-09-02", timeKey: "15:00" }],
      scheduleResult: {
        zoomLink: "https://zoom.us/j/213000",
        meetingUrl: "https://zoom.us/j/213000"
      }
    }
  });
  assert.equal(applied.responsePlan.templateKey, "iul_review_confirmed_zoom");
  assert.match(applied.rendered.text, /Zoom/);
  assert.ok(applied.rendered.text.includes("https://zoom.us/j/213000"));
  assert.doesNotMatch(applied.rendered.text, /entrevista/i);
});

test("P) office final confirmation includes office address", () => {
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT },
      customerReplyPlan: {
        templateKey: "iul_confirm_review_deferred",
        entities: {
          meetingMode: "in_person",
          slotLabel: "miércoles a las 3:00 PM",
          officeAddress: OFFICE_ADDRESS
        }
      },
      reasonCodes: [REASON_CODES.IUL_AD_CONVERSATION]
    },
    responsePlan: {
      templateKey: "iul_confirm_review_deferred",
      language: "spanish",
      entities: {
        meetingMode: "in_person",
        slotLabel: "miércoles a las 3:00 PM",
        officeAddress: OFFICE_ADDRESS
      }
    },
    rendered: { text: "deferred" },
    execution: { attempted: true, success: true, performed: [{ dateKey: "2026-09-02", timeKey: "15:00" }] }
  });
  assert.equal(applied.responsePlan.templateKey, "iul_review_confirmed_office");
  assert.match(applied.rendered.text, /oficina/);
  assert.match(applied.rendered.text, /8300 NW 53rd Street/);
});

test("Q) reminders use correct mode", () => {
  const zoom = buildReminderMessage(
    {
      purpose: "policy_review",
      startDateTime: "2026-09-03T15:00:00.000Z",
      timezone: "America/New_York",
      meetingType: "virtual",
      virtualMeetingUrl: "https://zoom.example/j/1"
    },
    REMINDER_TYPES.REMINDER_24H,
    { name: "Miller", preferred_language: "es" }
  );
  const office = buildReminderMessage(
    {
      purpose: "policy_review",
      startDateTime: "2026-09-03T15:00:00.000Z",
      timezone: "America/New_York",
      meetingType: "in_person",
      meetingAddress: OFFICE_ADDRESS
    },
    REMINDER_TYPES.REMINDER_24H,
    { name: "Miller", preferred_language: "es" }
  );
  assert.match(zoom, /revisión de póliza IUL por Zoom/);
  assert.doesNotMatch(zoom, /entrevista/);
  assert.match(office, /revisión de póliza IUL en la oficina/);
  assert.match(office, /8300 NW 53rd Street/);
});

test("R) pipeline row created", async () => {
  const store = policyReviewPipelineApplicationService.createMemoryPolicyReviewStore();
  policyReviewPipelineApplicationService.setStoresForTests({
    pipeline: store,
    findClient: async (id, organizationId) =>
      id === "client-iul-213" && organizationId === TEAM_VISION_ORG
        ? { id, organizationId, ownerUserId: AGENT_ID, preferredLanguage: "es" }
        : null,
    findAppointment: async (id, organizationId) =>
      id === "appt-iul-213" && organizationId === TEAM_VISION_ORG
        ? { id, organizationId, purpose: "policy_review" }
        : null
  });
  try {
    const created = await policyReviewPipelineApplicationService.createPolicyReview(
      {
        organizationId: TEAM_VISION_ORG,
        clientId: "client-iul-213",
        ownerUserId: AGENT_ID,
        linkedProspectId: "prospect-iul-213",
        language: "es"
      },
      { userId: AGENT_ID, role: "agent" }
    );
    const linked = await policyReviewPipelineApplicationService.linkAppointmentForProspect(
      {
        organizationId: TEAM_VISION_ORG,
        linkedProspectId: "prospect-iul-213",
        appointmentId: "appt-iul-213",
        ownerUserId: AGENT_ID
      },
      { userId: AGENT_ID, role: "agent" }
    );
    assert.equal(linked.ok, true);
    assert.equal(linked.reviewId, created.id);
    const row = await store.findByLinkedProspectId("prospect-iul-213", TEAM_VISION_ORG);
    assert.equal(row.appointmentId, "appt-iul-213");
  } finally {
    policyReviewPipelineApplicationService.setStoresForTests({});
  }
});

test("S-X) prior IUL BRs and BR-190 remain in the suite", () => {
  const files = [
    "iulSlotPaginationBookingBr212.test.js",
    "iulInteractiveSlotDeliveryBr211.test.js",
    "iulInteractiveSlotSelectionBr210.test.js",
    "iulDaypartAvailabilityBr209.test.js",
    "iulEndToEndReadinessBr208.test.js",
    "recruitAiV2ConfirmSelectedSlotSiBr190.test.js"
  ];
  for (const file of files) {
    assert.ok(
      fs.existsSync(path.join(__dirname, file)),
      `missing regression ${file}`
    );
  }
  const mission = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  assert.match(mission, /isPolicyReview/);
  assert.match(mission, /APPOINTMENT_PURPOSES.POLICY_REVIEW/);
  assert.match(mission, /skipped: "policy_review"/);
  assert.doesNotMatch(
    mission.slice(mission.indexOf("const appointmentPurpose")),
    /purpose: "recruiting_interview"/
  );
});
