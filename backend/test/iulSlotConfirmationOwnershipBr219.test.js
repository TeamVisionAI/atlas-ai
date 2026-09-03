/**
 * BR-219 — IUL selected-slot confirmation ownership + timeout-safe booking.
 */
"use strict";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";

require("dotenv").config();

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
const { NEXT_ACTIONS, REASON_CODES } = require("../core/recruitAiV2/constants");
const {
  ASK,
  CONVERSATION_GOAL,
  CAMPAIGN_KIND,
  meetingModeFacts
} = require("../core/recruitAiV2/iulAdConversation");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const { buildIulSlotInteractive } = require("../core/recruitAiV2/iulSlotSelection");
const {
  isIulConfirmableSchedulingState,
  isIulSchedulingOwnedState,
  isIulQualificationCompleteForScheduling,
  buildIulDeferredAcknowledgement,
  resolveIulSelectedSlotFromInbound
} = require("../core/recruitAiV2/iulSchedulingOwnership");
const {
  attemptLiveV2Authoring,
  ownConfirmableProposalAfterAuthoringLoss,
  isConfirmableProposedDurable
} = require("../core/recruitAiV2/liveAuthoringBridge");
const {
  deliverIulBookingFollowUp,
  resetIulBookingFollowUpForTests
} = require("../core/recruitAiV2/iulBookingFollowUp");
const { applyExecutionOutcomeToReply } = require("../core/recruitAiV2/orchestrator");
const {
  createContextPersistenceService
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const { collectInteractiveOptionParts } = require("../core/whatsappInteractiveMessage");

const NOW = "2026-09-02T16:00:00.000Z";
const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PROSPECT_ID = "a1ffb1b2-051f-4f7f-9f85-9695c4adb72c";
const PHONE = "+13053991896";
const OFFICE = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";

function slot(date, time, selectionId) {
  return {
    dateKey: date,
    timeKey: time,
    date,
    time,
    timezone: "America/New_York",
    selectionId,
    purpose: "policy_review"
  };
}

function offeredMorning() {
  return [
    slot("2026-09-03", "09:00", "IUL_SLOT_0"),
    slot("2026-09-03", "12:00", "IUL_SLOT_1"),
    slot("2026-09-03", "09:30", "IUL_SLOT_2"),
    slot("2026-09-03", "10:00", "IUL_SLOT_3"),
    slot("2026-09-03", "10:30", "IUL_SLOT_4")
  ];
}

function qualifiedFacts(mode = "in_person") {
  return {
    name: "Paola",
    iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE,
    iulReviewIntent: IUL_OPTION_IDS.REVIEW_UNDERSTAND,
    iulPolicyActive: true,
    policyType: "IUL",
    ...meetingModeFacts(mode, {
      organizationId: ORG,
      knownFacts: { reviewOfficeAddress: OFFICE },
      _officeLocation: { fullAddress: OFFICE }
    }),
    reviewOfficeAddress: OFFICE,
    iulSelectedDayPart: "morning"
  };
}

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    organizationId: ORG,
    agentId: AGENT,
    prospectId: PROSPECT_ID,
    timezone: "America/New_York",
    _testNow: NOW,
    _officeLocation: { fullAddress: OFFICE },
    knownFacts: qualifiedFacts("in_person"),
    conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
    appointment: {
      status: "proposed",
      previouslyOfferedSlots: offeredMorning()
    },
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

function slotTap(id, title) {
  return {
    text: `${title} ${title}`,
    interactiveReply: {
      type: "list_reply",
      id,
      title,
      description: title
    }
  };
}

function authoringEnv(overrides = {}) {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: AGENT,
    RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS: "40",
    RECRUIT_AI_V2_LIVE_AUTHORING_POST_TIMEOUT_GRACE_MS: "20",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    ...overrides
  };
}

test("A) IUL_SLOT_3 resolves by ID even if title/description duplicate", () => {
  const context = iulContext();
  const { interpretation } = turn(slotTap("IUL_SLOT_3", "Jue 10:00 AM"), context);
  assert.equal(interpretation.intent, INTENTS.IUL_SELECT_OFFERED_SLOT);
  assert.equal(interpretation.entities.selectedSlot.time, "10:00");
  assert.equal(interpretation.entities.iulSlotSelectionId, "IUL_SLOT_3");
  const resolved = resolveIulSelectedSlotFromInbound(context, {
    text: "Jue 10:00 AM Jue 10:00 AM",
    interactiveReply: { id: "IUL_SLOT_3", title: "Jue 10:00 AM", description: "Jue 10:00 AM" }
  });
  assert.equal(resolved.selectionId, "IUL_SLOT_3");
});

test("A2) list description is omitted when it would duplicate the title", () => {
  const built = buildIulSlotInteractive(offeredMorning().slice(0, 4), "Horarios");
  const parts = collectInteractiveOptionParts(built.interactive);
  assert.ok(parts.length >= 4);
  const row = (built.interactive.action.sections || [])[0].rows.find(
    (item) => item.id === "IUL_SLOT_3"
  );
  assert.equal(row.title, "Jue 10:00 AM");
  assert.equal(row.description, undefined);
});

test("B/C) slow create >8s sends IUL deferred acknowledgement", async () => {
  const context = iulContext();
  assert.equal(isIulSchedulingOwnedState(context), true);
  const deferred = buildIulDeferredAcknowledgement({
    language: "es",
    slot: offeredMorning()[3],
    context,
    officeAddress: OFFICE
  });
  assert.match(deferred, /Estoy reservando su cita/);
  assert.match(deferred, /10:00 AM/);
  assert.match(deferred, /oficina/);
  assert.doesNotMatch(deferred, /Zoom/);
  assert.doesNotMatch(deferred, /quedó agendada/);

  const zoomDeferred = buildIulDeferredAcknowledgement({
    language: "es",
    slot: offeredMorning()[3],
    context: iulContext({
      knownFacts: qualifiedFacts("zoom")
    })
  });
  assert.match(zoomDeferred, /por Zoom/);
  assert.doesNotMatch(zoomDeferred, /enlace de Zoom/);
});

test("B2) authoring timeout sends deferred and does not fall through to CE", async () => {
  resetIulBookingFollowUpForTests();
  const persistence = createContextPersistenceService({
    repository: createMemoryContextRepository()
  });
  const seeded = iulContext();
  await persistence.compareAndSaveContext({
    organizationId: ORG,
    prospectId: PROSPECT_ID,
    channel: "whatsapp",
    nextContext: seeded,
    inboundMessageId: "wamid.offer",
    decisionCode: NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS,
    prospectPhone: PHONE
  });

  const result = await attemptLiveV2Authoring({
    normalized: {
      phone: PHONE,
      text: "Jue 10:00 AM Jue 10:00 AM",
      providerMessageId: "wamid.slot-3",
      channel: "whatsapp",
      interactiveReply: {
        type: "list_reply",
        id: "IUL_SLOT_3",
        title: "Jue 10:00 AM",
        description: "Jue 10:00 AM"
      }
    },
    prospect: {
      id: PROSPECT_ID,
      phone: PHONE,
      name: "Paola",
      organization_id: ORG,
      owner_user_id: AGENT,
      conversationGoal: CONVERSATION_GOAL,
      campaignKind: CAMPAIGN_KIND,
      lead_source: { conversationGoal: CONVERSATION_GOAL, campaignKind: CAMPAIGN_KIND }
    },
    env: authoringEnv(),
    persistenceService: persistence,
    processTurn: () =>
      new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              structuredDecision: {
                decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT }
              },
              execution: { attempted: true, success: false, performed: [], failed: [] },
              nextContext: {
                ...seeded,
                conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT }
              },
              rendered: { text: "late fail" }
            }),
          80
        );
      })
  });

  assert.equal(result.authored, true);
  assert.equal(result.fallThrough, false);
  assert.match(result.replyText, /Estoy reservando su cita/);
  assert.equal(result.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
});

test("D) late successful create follow-up sends confirmation once", async () => {
  resetIulBookingFollowUpForTests();
  const sent = [];
  const context = iulContext({
    conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      previouslyOfferedSlots: offeredMorning()
    }
  });
  const first = await deliverIulBookingFollowUp({
    normalized: { providerMessageId: "wamid.follow-1", phone: PHONE },
    prospect: { id: PROSPECT_ID, phone: PHONE },
    organizationId: ORG,
    v2Result: {
      structuredDecision: {
        decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT }
      },
      execution: {
        attempted: true,
        success: true,
        appointmentId: "appt-1",
        performed: [{ type: "create_appointment", dateKey: "2026-09-03", timeKey: "10:00" }]
      },
      nextContext: context
    },
    deliverReply: async (payload) => {
      sent.push(payload);
      return { sent: true };
    }
  });
  const second = await deliverIulBookingFollowUp({
    normalized: { providerMessageId: "wamid.follow-1", phone: PHONE },
    prospect: { id: PROSPECT_ID, phone: PHONE },
    organizationId: ORG,
    v2Result: {
      structuredDecision: {
        decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT }
      },
      execution: {
        attempted: true,
        success: true,
        appointmentId: "appt-1",
        performed: [{ type: "create_appointment", dateKey: "2026-09-03", timeKey: "10:00" }]
      },
      nextContext: context
    },
    deliverReply: async (payload) => {
      sent.push(payload);
      return { sent: true };
    }
  });
  assert.equal(first.sent, true);
  assert.equal(first.templateKey, "iul_review_confirmed_office");
  assert.equal(first.confirmationIdempotencyKey, "iul-booking-follow-up:wamid.follow-1");
  assert.equal(second.sent, false);
  assert.equal(sent.length, 1);
  assert.match(sent[0].replyText, /oficina|agendada|10:00/i);
  assert.doesNotMatch(sent[0].replyText, /https:\/\//);
});

test("E) failed create sends failure/re-offer, not discovery", () => {
  const context = iulContext({
    conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      previouslyOfferedSlots: offeredMorning()
    }
  });
  const structured = {
    intent: INTENTS.IUL_SELECT_OFFERED_SLOT,
    preferredLanguage: "spanish",
    reasonCodes: [],
    customerReplyPlan: { entities: {} },
    decision: {},
    contextPatch: {}
  };
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      ...structured,
      decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT },
      customerReplyPlan: { templateKey: "iul_confirm_review_deferred", entities: {} }
    },
    responsePlan: { templateKey: "iul_confirm_review_deferred", entities: {} },
    rendered: { text: "deferred" },
    execution: {
      attempted: true,
      success: false,
      failed: [{ type: "create_appointment", reason: "EXECUTION_CANONICAL_FAILED" }]
    }
  });
  assert.equal(applied.responsePlan.templateKey, "iul_review_create_failed");
  assert.ok(
    (applied.structuredDecision.reasonCodes || []).includes(
      REASON_CODES.IUL_CREATE_FAILED_NO_HANDOFF
    )
  );
  const replay = turn("ok", context);
  assert.notEqual(replay.decision.decision.nextAction, NEXT_ACTIONS.IUL_ASK_CARRIER);
  assert.doesNotMatch(String(replay.rendered.text || ""), /compañía|aseguradora/);
});

test("F/G) proposed/pending inbound never asks carrier", () => {
  const pending = iulContext({
    knownFacts: { ...qualifiedFacts("in_person"), iulBookingPending: true },
    conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT, lastOfferMade: "iul_confirm_review_deferred" },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      appointmentId: null,
      previouslyOfferedSlots: offeredMorning()
    }
  });
  assert.equal(isIulConfirmableSchedulingState(pending), true);
  const { interpretation, rendered, decision } = turn("No se", pending);
  assert.equal(interpretation.intent, INTENTS.IUL_BOOKING_PENDING);
  assert.equal(decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
  assert.match(String(rendered.text || ""), /reservando|confirmo/i);
  assert.doesNotMatch(String(rendered.text || ""), /compañía|aseguradora|carrier/i);
});

test("H) qualified Office→Zoom preserves qualification and stays in scheduling", () => {
  const context = iulContext({
    conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      previouslyOfferedSlots: offeredMorning()
    }
  });
  assert.equal(isIulQualificationCompleteForScheduling(context), true);
  const { interpretation, decision } = turn(
    {
      text: "Por Zoom",
      interactiveReply: {
        type: "button_reply",
        id: IUL_OPTION_IDS.MEET_ZOOM,
        title: "Por Zoom"
      }
    },
    context
  );
  assert.equal(interpretation.intent, INTENTS.IUL_CHOOSE_MEETING_MODE);
  assert.equal(interpretation.entities.meetingMode, "zoom");
  assert.equal(decision.contextPatch.knownFacts.iulQualificationStatus, IUL_OPTION_IDS.STATUS_ACTIVE);
  assert.equal(decision.contextPatch.knownFacts.iulReviewIntent, IUL_OPTION_IDS.REVIEW_UNDERSTAND);
  assert.equal(decision.contextPatch.knownFacts.meetingMode, "zoom");
  assert.equal(decision.decision.nextAction, NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE);
  assert.ok((decision.reasonCodes || []).includes(REASON_CODES.IUL_MODE_SWITCH_PRESERVED));
  assert.notEqual(decision.decision.nextAction, NEXT_ACTIONS.IUL_ASK_CARRIER);
});

test("H2) qualified Zoom→Office preserves qualification and stays in scheduling", () => {
  const context = iulContext({
    knownFacts: qualifiedFacts("zoom"),
    conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      previouslyOfferedSlots: offeredMorning()
    }
  });
  const { interpretation, decision } = turn(
    {
      text: "En la oficina",
      interactiveReply: {
        type: "button_reply",
        id: IUL_OPTION_IDS.MEET_OFFICE,
        title: "En la oficina"
      }
    },
    context
  );
  assert.equal(interpretation.intent, INTENTS.IUL_CHOOSE_MEETING_MODE);
  assert.equal(interpretation.entities.meetingMode, "in_person");
  assert.equal(decision.contextPatch.knownFacts.iulQualificationStatus, IUL_OPTION_IDS.STATUS_ACTIVE);
  assert.equal(decision.contextPatch.knownFacts.meetingMode, "in_person");
  assert.equal(decision.decision.nextAction, NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE);
  assert.ok((decision.reasonCodes || []).includes(REASON_CODES.IUL_MODE_SWITCH_PRESERVED));
});

test("I) fresh Zoom before qualification complete continues qualification", () => {
  const context = iulContext({
    knownFacts: { name: "Paola" },
    conversation: { lastQuestionAsked: ASK.QUALIFICATION_STATUS },
    appointment: { status: "none", previouslyOfferedSlots: [] }
  });
  const { interpretation, decision } = turn(
    {
      text: "Por Zoom",
      interactiveReply: {
        type: "button_reply",
        id: IUL_OPTION_IDS.MEET_ZOOM,
        title: "Por Zoom"
      }
    },
    context
  );
  assert.notEqual(interpretation.intent, INTENTS.IUL_CHOOSE_MEETING_MODE);
  assert.notEqual(decision.decision.nextAction, NEXT_ACTIONS.IUL_SOFT_REVIEW_INVITE);
});

test("J) retry/replay does not invent a second create while pending", () => {
  const context = iulContext({
    knownFacts: { ...qualifiedFacts("in_person"), iulBookingPending: true },
    conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      appointmentId: null,
      previouslyOfferedSlots: offeredMorning()
    }
  });
  const { decision } = turn("ok", context);
  assert.equal(decision.decision.mayCreateAppointment, false);
  assert.equal(decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
});

test("1) successful Zoom booking includes the exact join URL", () => {
  const url = "https://zoom.us/j/555111222";
  const zoomSuccess = renderCustomerReply({
    templateKey: "iul_review_confirmed_zoom",
    language: "spanish",
    entities: {
      slotLabel: "jueves a las 10:00 AM",
      meetingMode: "zoom",
      zoomJoinUrl: url
    }
  });
  assert.match(zoomSuccess.text, /confirmada/);
  assert.ok(zoomSuccess.text.includes(url));
  assert.doesNotMatch(zoomSuccess.text, /Le enviaré el enlace/);

  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT },
      customerReplyPlan: {
        templateKey: "iul_confirm_review_deferred",
        entities: { meetingMode: "zoom", slotLabel: "jueves a las 10:00 AM" }
      },
      reasonCodes: [REASON_CODES.IUL_AD_CONVERSATION]
    },
    responsePlan: {
      templateKey: "iul_confirm_review_deferred",
      language: "spanish",
      entities: { meetingMode: "zoom", slotLabel: "jueves a las 10:00 AM" }
    },
    rendered: { text: "deferred" },
    execution: {
      attempted: true,
      success: true,
      performed: [{ dateKey: "2026-09-03", timeKey: "10:00" }],
      scheduleResult: { zoomLink: url, meetingUrl: url }
    }
  });
  assert.equal(applied.responsePlan.templateKey, "iul_review_confirmed_zoom");
  assert.ok(applied.rendered.text.includes(url));
});

test("2) deferred Zoom acknowledgement contains no URL", () => {
  const deferred = buildIulDeferredAcknowledgement({
    language: "es",
    slot: offeredMorning()[3],
    context: iulContext({ knownFacts: qualifiedFacts("zoom") })
  });
  assert.match(deferred, /Estoy reservando su cita por Zoom/);
  assert.doesNotMatch(deferred, /https:\/\//);
  assert.doesNotMatch(deferred, /Enlace de Zoom/);
  const pending = renderCustomerReply({
    templateKey: "iul_review_booking_pending",
    language: "spanish",
    entities: {
      slotLabel: "jueves a las 10:00 AM",
      meetingMode: "zoom",
      zoomJoinUrl: "https://zoom.us/j/should-not-appear"
    }
  });
  assert.doesNotMatch(pending.text, /https:\/\//);
});

test("3) failed Zoom create contains no URL", () => {
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT },
      customerReplyPlan: {
        templateKey: "iul_confirm_review_deferred",
        entities: {
          meetingMode: "zoom",
          slotLabel: "jueves a las 10:00 AM",
          zoomJoinUrl: "https://zoom.us/j/should-not-appear"
        }
      }
    },
    responsePlan: {
      templateKey: "iul_confirm_review_deferred",
      language: "spanish",
      entities: {
        meetingMode: "zoom",
        zoomJoinUrl: "https://zoom.us/j/should-not-appear"
      }
    },
    rendered: { text: "deferred" },
    execution: {
      attempted: true,
      success: false,
      failed: [{ type: "create_appointment", reason: "EXECUTION_CANONICAL_FAILED" }]
    }
  });
  assert.equal(applied.responsePlan.templateKey, "iul_review_create_failed");
  assert.doesNotMatch(applied.rendered.text, /https:\/\//);
  assert.doesNotMatch(applied.rendered.text, /Enlace de Zoom/);
});

test("4) successful office create includes address and no Zoom URL", () => {
  const officeText = renderCustomerReply({
    templateKey: "iul_review_confirmed_office",
    language: "spanish",
    entities: {
      slotLabel: "jueves a las 10:00 AM",
      meetingMode: "in_person",
      officeAddress: OFFICE,
      zoomJoinUrl: "https://zoom.us/j/should-not-appear"
    }
  });
  assert.match(officeText.text, /oficina|agendada/i);
  assert.match(officeText.text, /2500 NW 79th Ave/);
  assert.doesNotMatch(officeText.text, /https:\/\//);
  assert.doesNotMatch(officeText.text, /Enlace de Zoom/);
});

test("5) Zoom success without a URL is safe and does not fabricate a link", () => {
  const noLink = renderCustomerReply({
    templateKey: "iul_review_confirmed_zoom",
    language: "spanish",
    entities: {
      slotLabel: "jueves a las 10:00 AM",
      meetingMode: "zoom"
    }
  });
  assert.match(noLink.text, /confirmada/);
  assert.doesNotMatch(noLink.text, /https:\/\//);
  assert.doesNotMatch(noLink.text, /Le enviaré el enlace/);
  assert.doesNotMatch(noLink.text, /\{zoomJoinUrl\}/);

  const applied = applyExecutionOutcomeToReply({
    structuredDecision: {
      decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT },
      customerReplyPlan: {
        templateKey: "iul_confirm_review_deferred",
        entities: { meetingMode: "zoom", slotLabel: "jueves a las 10:00 AM" }
      },
      reasonCodes: [REASON_CODES.IUL_AD_CONVERSATION]
    },
    responsePlan: {
      templateKey: "iul_confirm_review_deferred",
      language: "spanish",
      entities: { meetingMode: "zoom", slotLabel: "jueves a las 10:00 AM" }
    },
    rendered: { text: "deferred" },
    execution: {
      attempted: true,
      success: true,
      performed: [{ dateKey: "2026-09-03", timeKey: "10:00" }]
    }
  });
  assert.equal(applied.responsePlan.templateKey, "iul_review_confirmed_zoom");
  assert.doesNotMatch(applied.rendered.text, /https:\/\//);
  assert.doesNotMatch(applied.rendered.text, /Le enviaré el enlace/);
  assert.ok(
    (applied.structuredDecision.reasonCodes || []).includes(REASON_CODES.IUL_ZOOM_LINK_MISSING)
  );
});

test("follow-up Zoom success includes URL and durable idempotency key", async () => {
  resetIulBookingFollowUpForTests();
  const url = "https://us06web.zoom.us/j/999888777";
  const sent = [];
  const result = await deliverIulBookingFollowUp({
    normalized: { providerMessageId: "wamid.zoom-follow", phone: PHONE },
    prospect: { id: PROSPECT_ID, phone: PHONE },
    organizationId: ORG,
    v2Result: {
      structuredDecision: {
        decision: { nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT }
      },
      execution: {
        attempted: true,
        success: true,
        appointmentId: "appt-zoom-1",
        performed: [{ type: "create_appointment", dateKey: "2026-09-03", timeKey: "10:00" }],
        scheduleResult: { zoomLink: url, meetingUrl: url }
      },
      nextContext: iulContext({
        knownFacts: qualifiedFacts("zoom"),
        conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT },
        appointment: {
          status: "proposed",
          proposedDate: "2026-09-03",
          proposedTime: "10:00",
          previouslyOfferedSlots: offeredMorning()
        }
      })
    },
    deliverReply: async (payload) => {
      sent.push(payload);
      return { sent: true };
    }
  });
  assert.equal(result.sent, true);
  assert.equal(result.templateKey, "iul_review_confirmed_zoom");
  assert.equal(result.confirmationIdempotencyKey, "iul-booking-follow-up:wamid.zoom-follow");
  assert.ok(sent[0].replyText.includes(url));
  assert.equal(sent[0].confirmationIdempotencyKey, "iul-booking-follow-up:wamid.zoom-follow");
});

test("confirmable durable recognizes IUL proposed state", () => {
  const context = iulContext({
    conversation: {
      lastQuestionAsked: ASK.CONFIRM_SLOT,
      lastOfferMade: "iul_confirm_review_deferred"
    },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      appointmentId: null
    }
  });
  assert.equal(isConfirmableProposedDurable(context), true);
});
