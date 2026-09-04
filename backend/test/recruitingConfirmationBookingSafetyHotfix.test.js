/**
 * Recruiting confirmation-time booking safety hotfix (BR-190 / BR-126).
 * Targeted matrix — does not change IUL BR-219 or unrelated conversation rules.
 */

"use strict";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

require("dotenv").config();

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { processRecruitAiV2Turn, applyExecutionOutcomeToReply } = require("../core/recruitAiV2/orchestrator");
const {
  createConversationContext,
  APPOINTMENT_STATUS
} = require("../core/recruitAiV2/conversationContext");
const { NEXT_ACTIONS, REASON_CODES } = require("../core/recruitAiV2/constants");
const {
  isRecruitingConfirmSlotTurn,
  selectedSlotFromContext,
  recheckSelectedSlotAvailability,
  appointmentMatchesConfirmedIntent,
  selectAdoptedConcurrentAppointment,
  pickReplacementSlots
} = require("../core/recruitAiV2/recruitingConfirmationBookingSafety");
const {
  settleRecruitingConfirmBookingAfterTimeout,
  withTimeout
} = require("../core/recruitAiV2/liveAuthoringBridge");
const { isSafeOrganizationDisplayName } = require("../core/recruitAiV2/tenantBranding");
const { evaluateCoverage } = require("../core/businessRulesEngine");

const ORG = "00000000-0000-4000-8000-000000000001";
const LEGACY_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const VISIONARIES_ORG = "aa045173-5eee-4c6e-978c-cc2f6125be29";
const AGENT = "26c9fa71-01f1-46d5-af02-8948abfece46";
const MILLER = "d2bb9459-371b-41f3-8825-588cb8b04d7b";
const CORE = "d5f56020-b4a8-4e13-95c9-3971f2de4ed0";
const LEGACY = "001bb1f1-7509-4ae7-b520-58963f8094fe";
const PHONE = "+13054578914";
const DATE = "2026-09-04";
const TIME = "10:30";
const TZ = "America/New_York";

function authoringEnv(executionOn = true) {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: `${ORG},${LEGACY_ORG},${VISIONARIES_ORG}`,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: `${AGENT},${MILLER}`,
    RECRUIT_AI_V2_EXECUTION_ENABLED: executionOn ? "true" : "false",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: `${ORG},${LEGACY_ORG},${VISIONARIES_ORG}`,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: `${AGENT},${MILLER}`
  };
}

function slots(list) {
  return list.map((time) => ({
    date: DATE,
    dateKey: DATE,
    time,
    timeKey: time,
    timezone: TZ
  }));
}

function confirmContext(overrides = {}) {
  return createConversationContext({
    organizationId: LEGACY_ORG,
    organizationName: "Team Legacy",
    prospectId: CORE,
    legacyProspectId: LEGACY,
    prospectPhone: PHONE,
    agentId: AGENT,
    prospectOwnerUserId: AGENT,
    preferredLanguage: "spanish",
    timezone: TZ,
    currentStage: "proposed",
    officeAddress: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      coverage: "LOCAL",
      preferredMeetingType: "in_person",
      preferredDayPart: "morning"
    },
    appointment: {
      status: APPOINTMENT_STATUS.PROPOSED,
      proposedDate: DATE,
      proposedTime: TIME,
      previouslyOfferedSlots: slots(["10:30", "11:30"])
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastOfferMade: "confirm_selected_slot",
      lastAtlasOutboundText:
        "Perfecto, hoy a las 10:30 AM. Responde SI para confirmar esa hora."
    },
    ...overrides
  });
}

function matchingAppointment(overrides = {}) {
  return {
    id: "9c5031a2-0060-4279-8040-6b73fbc6b318",
    organization_id: LEGACY_ORG,
    prospect_id: LEGACY,
    agent_id: AGENT,
    interviewer_user_id: AGENT,
    status: "scheduled",
    start_date_time: "2026-09-04T14:30:00.000Z",
    timezone: TZ,
    meeting_type: "in_person",
    created_at: new Date().toISOString(),
    metadata: { coreProspectId: CORE, lifecycleState: "scheduled" },
    calendar_event_id: "6f3o3anvhapql7r15iogi9dgdk",
    ...overrides
  };
}

describe("recruiting confirmation-time booking safety hotfix", () => {
  test("docs: BR-190 confirmation-time safety documented", () => {
    const rules = fs.readFileSync(
      path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
      "utf8"
    );
    assert.match(rules, /Confirmation-time recheck/);
    assert.match(rules, /Timeout-safe recruiting create/);
    assert.match(rules, /## BR-219/);
    assert.match(rules, /## BR-224/);
    assert.match(rules, /## BR-229/);
  });

  test("A) selected slot still available at SI => create_appointment", () => {
    const context = confirmContext();
    const interpretation = interpretInboundMessage({
      message: { text: "si" },
      context
    });
    assert.equal(interpretation.intent, "schedule_confirm");
    assert.equal(isRecruitingConfirmSlotTurn({ context, interpretation }), true);
    const structured = decideConversationTurn({
      context,
      interpretation,
      availability: {
        confirmationRecheck: {
          checked: true,
          stillAvailable: true,
          replacements: []
        }
      }
    });
    assert.equal(structured.decision.nextAction, NEXT_ACTIONS.CREATE_APPOINTMENT);
    assert.ok(
      !structured.reasonCodes.includes(REASON_CODES.SELECTED_SLOT_NO_LONGER_AVAILABLE)
    );
  });

  test("B) selected slot taken before SI => no stale booking, fresh alternatives", () => {
    const context = confirmContext();
    const interpretation = interpretInboundMessage({
      message: { text: "si" },
      context
    });
    const replacements = slots(["11:30", "13:00"]);
    const structured = decideConversationTurn({
      context,
      interpretation,
      availability: {
        confirmationRecheck: {
          checked: true,
          stillAvailable: false,
          replacements
        }
      }
    });
    assert.equal(structured.decision.nextAction, NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS);
    assert.equal(structured.decision.mayCreateAppointment, false);
    assert.equal(
      structured.customerReplyPlan.templateKey,
      "selected_slot_no_longer_available"
    );
    assert.equal(structured.contextPatch.conversation.lastQuestionAsked, "offer_time_choices");
    assert.equal(structured.contextPatch.appointment.proposedTime, null);
    const rendered = renderCustomerReply(structured.customerReplyPlan);
    assert.match(rendered.text, /ya no está disponible/i);
    assert.match(rendered.text, /11:30|1:00|13:00/i);
    assert.doesNotMatch(rendered.text, /Team Vision/i);
    assert.doesNotMatch(rendered.text, /anoté tu confirmación/i);
  });

  test("C) replacement slot selected becomes active selection", () => {
    const context = confirmContext({
      appointment: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate: null,
        proposedTime: null,
        previouslyOfferedSlots: slots(["11:30", "13:00"])
      },
      conversation: {
        lastQuestionAsked: "offer_time_choices",
        lastOfferMade: "selected_slot_no_longer_available"
      }
    });
    const interpretation = interpretInboundMessage({
      message: { text: "11:30" },
      context
    });
    const structured = decideConversationTurn({
      context,
      interpretation,
      availability: null
    });
    assert.equal(
      structured.customerReplyPlan.templateKey,
      "confirm_selected_slot"
    );
    assert.equal(structured.contextPatch.appointment.proposedTime, "11:30");
    assert.equal(structured.contextPatch.conversation.lastQuestionAsked, "confirm_slot");
  });

  test("D/E) replacement confirm rechecks; taken again offers fresh alternatives", () => {
    const context = confirmContext({
      appointment: {
        status: APPOINTMENT_STATUS.PROPOSED,
        proposedDate: DATE,
        proposedTime: "11:30",
        previouslyOfferedSlots: slots(["11:30", "13:00"])
      }
    });
    const interpretation = interpretInboundMessage({
      message: { text: "si" },
      context
    });
    const structured = decideConversationTurn({
      context,
      interpretation,
      availability: {
        confirmationRecheck: {
          checked: true,
          stillAvailable: false,
          replacements: slots(["14:00", "15:00"])
        }
      }
    });
    assert.equal(
      structured.customerReplyPlan.templateKey,
      "selected_slot_no_longer_available"
    );
    assert.deepEqual(
      structured.contextPatch.appointment.previouslyOfferedSlots.map((s) => s.time),
      ["14:00", "15:00"]
    );
  });

  test("F) create inside budget => appointment_confirmed", async () => {
    let creates = 0;
    const result = await processRecruitAiV2Turn({
      message: { text: "si" },
      context: confirmContext(),
      options: {
        channel: "whatsapp",
        allowExecution: true,
        persistContext: false,
        profileConfigured: true,
        env: authoringEnv(true),
        actingUserId: AGENT,
        organizationId: LEGACY_ORG,
        prospectPhone: PHONE,
        dependencies: {
          getSlots: async () => ({ slots: slots(["10:30", "11:30"]) }),
          findActiveAppointmentForProspect: async () => null,
          executeScheduleInterview: async () => {
            creates += 1;
            return { success: true, appointmentId: "appt-f" };
          }
        }
      }
    });
    assert.equal(creates, 1);
    assert.equal(result.responsePlan?.templateKey, "appointment_confirmed");
    assert.match(String(result.rendered?.text || ""), /confirmada|confirmed/i);
    assert.equal(result.execution?.success, true);
    assert.equal(result.nextContext.appointment.appointmentId, "appt-f");
  });

  test("G) late settlement create => appointment_confirmed, no deferred", async () => {
    const slowCreate = new Promise((resolve) => {
      setTimeout(
        () =>
          resolve({
            execution: {
              attempted: true,
              success: true,
              appointmentId: "appt-late",
              performed: [{ dateKey: DATE, timeKey: TIME, type: "create_appointment" }]
            },
            nextContext: confirmContext({
              appointment: {
                status: APPOINTMENT_STATUS.CONFIRMED,
                appointmentId: "appt-late",
                proposedDate: DATE,
                proposedTime: TIME,
                confirmedDate: DATE,
                confirmedTime: TIME
              }
            }),
            interpretation: { intent: "schedule_confirm" },
            rendered: { text: "Perfecto — tu entrevista quedó confirmada para el hoy a las 10:30 AM." }
          }),
        30
      );
    });
    const tracked = withTimeout(slowCreate, 5, "LIVE_AUTHORING_TIMEOUT");
    let error = null;
    try {
      await tracked;
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    const settled = await settleRecruitingConfirmBookingAfterTimeout({
      error,
      prospect: { id: LEGACY, phone: PHONE, owner_user_id: AGENT },
      normalized: { phone: PHONE, text: "si", providerMessageId: "wamid.G" },
      organizationId: LEGACY_ORG,
      actingUserId: AGENT,
      allowExecution: true,
      env: {
        ...authoringEnv(true),
        RECRUIT_AI_V2_RECRUITING_CONFIRM_POST_TIMEOUT_GRACE_MS: "200"
      },
      findActiveAppointment: async () => null
    });
    assert.equal(settled?.authored, true);
    assert.match(String(settled?.replyText || ""), /confirmada|confirmed/i);
    assert.doesNotMatch(String(settled?.replyText || ""), /anoté tu confirmación/i);
  });

  test("H) matching Mission Control appointment during race => adopt, no duplicate", async () => {
    const appt = matchingAppointment();
    const settled = await settleRecruitingConfirmBookingAfterTimeout({
      v2Result: {
        nextContext: confirmContext(),
        interpretation: { intent: "schedule_confirm" },
        execution: { attempted: true, success: false }
      },
      prospect: { id: LEGACY, phone: PHONE, owner_user_id: AGENT },
      normalized: { phone: PHONE, text: "si" },
      organizationId: LEGACY_ORG,
      actingUserId: AGENT,
      allowExecution: true,
      env: authoringEnv(true),
      findActiveAppointment: async () => appt
    });
    // attempted+failed should not adopt — definitive failure stays deferred
    assert.equal(settled, null);

    const adopted = await settleRecruitingConfirmBookingAfterTimeout({
      v2Result: {
        nextContext: confirmContext(),
        interpretation: { intent: "schedule_confirm" },
        execution: { attempted: false, success: false }
      },
      prospect: { id: LEGACY, phone: PHONE, owner_user_id: AGENT },
      normalized: { phone: PHONE, text: "si" },
      organizationId: LEGACY_ORG,
      actingUserId: AGENT,
      allowExecution: true,
      env: authoringEnv(true),
      findActiveAppointment: async () => appt
    });
    assert.equal(adopted?.authored, true);
    assert.match(String(adopted?.replyText || ""), /confirmada|confirmed/i);
    assert.equal(adopted?.v2Result?.execution?.appointmentId || appt.id, appt.id);
  });

  test("I) create definitively fails => deferred fallback remains available", () => {
    const applied = applyExecutionOutcomeToReply({
      structuredDecision: {
        decision: { nextAction: "create_appointment" },
        customerReplyPlan: { templateKey: "appointment_confirm_deferred", entities: {} },
        reasonCodes: []
      },
      responsePlan: { templateKey: "appointment_confirm_deferred", entities: {} },
      rendered: { text: "deferred" },
      execution: {
        attempted: true,
        success: false,
        failed: [{ type: "create_appointment", reason: "EXECUTION_CANONICAL_FAILED" }]
      }
    });
    assert.equal(applied.responsePlan.templateKey, "appointment_create_failed");
  });

  test("J) unresolved execution with no DB evidence => no false success", async () => {
    const settled = await settleRecruitingConfirmBookingAfterTimeout({
      v2Result: {
        nextContext: confirmContext(),
        interpretation: { intent: "schedule_confirm" },
        execution: { attempted: false, success: false }
      },
      prospect: { id: LEGACY, phone: PHONE, owner_user_id: AGENT },
      normalized: { phone: PHONE, text: "si" },
      organizationId: LEGACY_ORG,
      actingUserId: AGENT,
      findActiveAppointment: async () => null
    });
    assert.equal(settled, null);
  });

  test("K/L) duplicate SI / create race => one appointment maximum", async () => {
    const existing = matchingAppointment();
    let creates = 0;
    const first = await processRecruitAiV2Turn({
      message: { text: "si" },
      context: confirmContext(),
      options: {
        allowExecution: true,
        persistContext: false,
        profileConfigured: true,
        env: authoringEnv(true),
        actingUserId: AGENT,
        organizationId: LEGACY_ORG,
        prospectPhone: PHONE,
        dependencies: {
          getSlots: async () => ({ slots: slots(["10:30", "11:30"]) }),
          findActiveAppointmentForProspect: async () => existing,
          executeScheduleInterview: async () => {
            creates += 1;
            return { success: true, appointmentId: "dup" };
          }
        }
      }
    });
    assert.equal(creates, 0);
    assert.equal(first.execution?.success, true);
    assert.equal(first.execution?.appointmentId, existing.id);
    assert.equal(first.responsePlan?.templateKey, "appointment_confirmed");
  });

  test("H-strict) concurrent adopt requires exact match; ambiguous fail-closed", () => {
    const a = matchingAppointment({ id: "a" });
    const b = matchingAppointment({ id: "b" });
    const intent = {
      organizationId: LEGACY_ORG,
      prospectId: CORE,
      legacyProspectId: LEGACY,
      agentId: AGENT,
      dateKey: DATE,
      timeKey: TIME,
      timezone: TZ,
      meetingType: "in_person",
      now: Date.now()
    };
    const ok = appointmentMatchesConfirmedIntent(matchingAppointment(), intent);
    assert.equal(ok.ok, true);
    const otherDay = appointmentMatchesConfirmedIntent(
      matchingAppointment({ start_date_time: "2026-09-05T14:30:00.000Z" }),
      intent
    );
    assert.equal(otherDay.ok, false);
    const old = appointmentMatchesConfirmedIntent(
      matchingAppointment({
        created_at: "2026-08-01T12:00:00.000Z"
      }),
      intent
    );
    assert.equal(old.ok, false);
    const ambiguous = selectAdoptedConcurrentAppointment([a, b], intent);
    assert.equal(ambiguous.appointment, null);
    assert.equal(ambiguous.reason, "MULTIPLE_CANDIDATES");
  });

  test("M) Team Legacy branding / office has no Team Vision leak", () => {
    const rendered = renderCustomerReply({
      templateKey: "appointment_confirmed",
      language: "spanish",
      organizationId: LEGACY_ORG,
      organizationName: "Team Legacy",
      entities: { dateLabel: "hoy", requestedTime: "10:30 AM" }
    });
    assert.doesNotMatch(rendered.text, /Team Vision(?!aries)/i);
    const stale = renderCustomerReply({
      templateKey: "selected_slot_no_longer_available",
      language: "spanish",
      organizationId: LEGACY_ORG,
      organizationName: "Team Legacy",
      entities: { offeredSlots: slots(["11:30", "13:00"]) }
    });
    assert.doesNotMatch(stale.text, /Team Vision/i);
    assert.match(stale.text, /ya no está disponible/i);
  });

  test("N) Team Visionaries empty coverage / Zoom preserved", async () => {
    assert.equal(
      isSafeOrganizationDisplayName("Team Visionaries", VISIONARIES_ORG),
      false
    );
    const coverage = evaluateCoverage({
      organizationId: VISIONARIES_ORG,
      city: "Miami",
      localCities: []
    });
    assert.equal(coverage.coverage, "OUTSIDE");
    const context = confirmContext({
      organizationId: VISIONARIES_ORG,
      organizationName: "Team Visionaries",
      agentId: MILLER,
      prospectOwnerUserId: MILLER,
      officeAddress: "2500 NW 79th Ave Suite 189 Doral Fl 33122",
      localCities: [],
      knownFacts: {
        city: "Miami",
        state: "FL",
        cityCertainty: "confirmed",
        stateCertainty: "confirmed",
        workAuthorization: true,
        workAuthorizationStatus: "authorized",
        coverage: "OUTSIDE",
        preferredMeetingType: "zoom",
        preferredDayPart: "morning"
      }
    });
    let creates = 0;
    const result = await processRecruitAiV2Turn({
      message: { text: "si" },
      context,
      options: {
        allowExecution: true,
        persistContext: false,
        profileConfigured: true,
        env: authoringEnv(true),
        actingUserId: MILLER,
        organizationId: VISIONARIES_ORG,
        prospectPhone: PHONE,
        dependencies: {
          getSlots: async () => ({ slots: slots(["10:30", "11:30"]) }),
          findActiveAppointmentForProspect: async () => null,
          executeScheduleInterview: async (_phone, payload) => {
            creates += 1;
            assert.equal(payload.interviewType, "Zoom");
            return { success: true, appointmentId: "appt-vis" };
          }
        }
      }
    });
    assert.equal(creates, 1);
    assert.doesNotMatch(String(result.rendered?.text || ""), /Team Vision(?!aries)/i);
    assert.equal(result.responsePlan?.templateKey, "appointment_confirmed");

    const stale = decideConversationTurn({
      context,
      interpretation: interpretInboundMessage({ message: { text: "si" }, context }),
      availability: {
        confirmationRecheck: {
          checked: true,
          stillAvailable: false,
          replacements: slots(["11:30", "13:00"])
        }
      }
    });
    const staleText = renderCustomerReply({
      ...stale.customerReplyPlan,
      organizationId: VISIONARIES_ORG,
      organizationName: "Team Visionaries"
    });
    assert.match(staleText.text, /ya no está disponible/i);
    assert.doesNotMatch(staleText.text, /Team Vision(?!aries)/i);
  });

  test("O) BR-219 IUL helpers remain exported and distinct", () => {
    const iul = fs.readFileSync(
      path.join(__dirname, "../core/recruitAiV2/iulBookingFollowUp.js"),
      "utf8"
    );
    assert.match(iul, /BR-219/);
    const bridge = fs.readFileSync(
      path.join(__dirname, "../core/recruitAiV2/liveAuthoringBridge.js"),
      "utf8"
    );
    assert.match(bridge, /IUL selected-slot timeout must send deferred now/);
    assert.match(bridge, /settleRecruitingConfirmBookingAfterTimeout/);
  });

  test("helpers: recheck + replacement picker", async () => {
    const context = confirmContext();
    const recheck = await recheckSelectedSlotAvailability({
      context,
      options: {
        actingUserId: AGENT,
        getSlots: async () => ({ slots: slots(["11:30", "13:00"]) })
      }
    });
    assert.equal(recheck.checked, true);
    assert.equal(recheck.stillAvailable, false);
    assert.deepEqual(
      recheck.replacements.map((s) => s.time),
      ["11:30", "13:00"]
    );
    assert.equal(selectedSlotFromContext(context).time, "10:30");
    assert.equal(pickReplacementSlots(slots(["10:30", "11:30"]), { date: DATE, time: TIME }).length, 1);
  });
});
