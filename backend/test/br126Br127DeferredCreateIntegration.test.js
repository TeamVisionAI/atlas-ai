/**
 * BR-126 × BR-127 integration — deferred confirm (exec OFF) then create (exec ON)
 * with sparse legacy + durable Miami/FL/auth, then forced rollback + V2 ownership.
 *
 * Offline only: zero live WhatsApp / Calendar / production mutations.
 */
"use strict";

require("dotenv").config();

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  processRecruitAiV2Turn
} = require("../core/recruitAiV2/orchestrator");
const {
  ownConfirmableProposalAfterAuthoringLoss,
  isConfirmableProposedDurable
} = require("../core/recruitAiV2/liveAuthoringBridge");
const {
  createContextPersistenceService
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const {
  createConversationContext,
  APPOINTMENT_STATUS
} = require("../core/recruitAiV2/conversationContext");
const {
  executeScheduleInterview
} = require("../application/missionExecutionApplicationService");
const { validateMilestoneAdvancement } = require("../core/milestoneValidationEngine");
const { MILESTONES } = require("../core/workflowConstants");

const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const CORE = "6a52ef58-511e-4a25-9f81-b5ea211a51be";
const LEGACY = "cc539cb3-1bfd-4329-8ddb-e3b74bf75c33";
const PHONE = "+17863071530";
const DATE = "2026-08-10";
const TIME = "13:00";
const APPT_ID = "appt-br126-br127-1";
const START_ISO = "2026-08-10T17:00:00.000Z";

function authoringEnv(executionOn) {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: AGENT,
    RECRUIT_AI_V2_EXECUTION_ENABLED: executionOn ? "true" : "false",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: executionOn ? "true" : "false",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: AGENT
  };
}

function proposedConfirmableContext() {
  return createConversationContext({
    organizationId: ORG,
    prospectId: CORE,
    prospectPhone: PHONE,
    legacyProspectId: LEGACY,
    agentId: AGENT,
    preferredLanguage: "spanish",
    currentStage: "proposed",
    timezone: "America/New_York",
    knownFacts: {
      name: "Marielena Campo",
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredDayPart: "afternoon",
      preferredMeetingType: "in_person"
    },
    appointment: {
      status: APPOINTMENT_STATUS.PROPOSED,
      proposedDate: DATE,
      proposedTime: TIME,
      appointmentId: null,
      previouslyOfferedSlots: [
        { date: DATE, time: TIME, timezone: "America/New_York" }
      ]
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastProspectIntent: "select_offered_slot",
      lastOfferMade: "ask_confirm_slot",
      lastAtlasOutboundText:
        "Gracias. Antes de confirmar, responde SI para confirmar esa hora, o sugiere otra hora.",
      clarificationCount: 0,
      pendingClarification: null
    }
  });
}

function sparseLegacy() {
  return {
    id: LEGACY,
    phone: PHONE,
    name: "Marielena Campo",
    organization_id: ORG,
    city: null,
    state: null,
    work_authorized: null,
    occupation: null,
    notes: null,
    current_step: "NEW"
  };
}

function missionDeps({
  legacy,
  advances,
  calendarCreates,
  rollbacks,
  forceAdvanceFail = false
}) {
  return {
    resolveTenantProspect: async () => legacy,
    resolveCanonicalProspectIdentity: async () => ({
      ok: true,
      coreProspectId: CORE,
      legacyProspectId: LEGACY
    }),
    resolveInterviewLocation: async () => ({
      configured: true,
      location: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
      meetingUrl: null
    }),
    getGoogleCalendarIntegrationStatus: async () => ({ connected: true }),
    scheduleAppointment: async () => {
      calendarCreates.count += 1;
      return {
        success: true,
        googleCalendarEventId: "cal-br126-br127",
        startTimeISO: START_ISO,
        meetingUrl: null
      };
    },
    updateProspect: async (_phone, patch) => {
      Object.assign(legacy, patch);
    },
    createPersistedScheduleAppointment: async (args) => ({
      id: APPT_ID,
      status: "scheduled",
      calendarEventId: "cal-br126-br127",
      confirmationStatus: args.attendeeEmail ? "pending" : "missing_email",
      emailInvitationStatus: args.attendeeEmail ? "pending" : "missing",
      prospectId: CORE
    }),
    advanceProspectWorkflow: async (_phone, payload) => {
      advances.count += 1;
      advances.capturedFields = payload.capturedFields;
      if (forceAdvanceFail) {
        return {
          success: false,
          error: "WORKFLOW_ADVANCE_FAILED",
          message: "forced failure"
        };
      }
      const validation = validateMilestoneAdvancement({
        currentMilestone: MILESTONES.INTERVIEW_READY,
        targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
        prospect: legacy,
        capturedFields: payload.capturedFields
      });
      assert.equal(validation.valid, true);
      assert.ok(!validation.missingFields.includes("email"));
      assert.ok(!validation.missingFields.includes("occupation"));
      return { success: true, workflow: { canonicalMilestone: "INTERVIEW_SCHEDULED" } };
    },
    rollbackPersistedAppointment: async () => {
      rollbacks.count += 1;
    },
    cancelAppointment: async () => ({ success: true }),
    findAppointmentById: async () => null
  };
}

describe("BR-126 × BR-127 deferred→create integration", () => {
  test("A–F: exec OFF deferred → exec ON create with BR-127 sync → V2 confirmed", async () => {
    const persistence = createContextPersistenceService({
      repository: createMemoryContextRepository()
    });
    await persistence.compareAndSaveContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp",
      nextContext: proposedConfirmableContext(),
      decisionCode: "propose_slot"
    });

    // E. Si with execution OFF → deferred / confirmable proposed / zero mutations
    let earlyCreates = 0;
    const deferred = await processRecruitAiV2Turn({
      message: { text: "Si" },
      contextInput: {
        organizationId: ORG,
        prospectId: CORE,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY
      },
      persistenceService: persistence,
      options: {
        channel: "whatsapp",
        allowExecution: false,
        persistContext: true,
        env: authoringEnv(false),
        actingUserId: AGENT,
        organizationId: ORG,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY,
        dependencies: {
          executeScheduleInterview: async () => {
            earlyCreates += 1;
            throw new Error("must not mutate while execution OFF");
          }
        }
      }
    });

    assert.equal(earlyCreates, 0);
    assert.equal(deferred.responsePlan?.templateKey, "appointment_confirm_deferred");
    assert.equal(deferred.nextContext.appointment.status, APPOINTMENT_STATUS.PROPOSED);
    assert.equal(deferred.nextContext.appointment.proposedDate, DATE);
    assert.equal(deferred.nextContext.appointment.proposedTime, TIME);
    assert.equal(isConfirmableProposedDurable(deferred.nextContext), true);
    assert.equal(deferred.nextContext.knownFacts.city, "Miami");
    assert.equal(deferred.nextContext.knownFacts.state, "FL");
    assert.equal(deferred.nextContext.knownFacts.workAuthorization, true);

    // F. Si with execution ON → BR-127 sync + create + ownership
    const legacy = sparseLegacy();
    const advances = { count: 0, capturedFields: null };
    const calendarCreates = { count: 0 };
    const rollbacks = { count: 0 };
    let seenRecruitContext = null;

    const created = await processRecruitAiV2Turn({
      message: { text: "Si" },
      contextInput: {
        organizationId: ORG,
        prospectId: CORE,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY
      },
      persistenceService: persistence,
      options: {
        channel: "whatsapp",
        allowExecution: true,
        persistContext: true,
        profileConfigured: true,
        env: authoringEnv(true),
        actingUserId: AGENT,
        organizationId: ORG,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY,
        dependencies: {
          findActiveAppointmentForProspect: async () => null,
          getSlots: async () => [{ dateKey: DATE, timeKey: TIME }],
          getAppointmentProfile: async () => ({ profileConfigured: true }),
          executeScheduleInterview: async (phone, payload, opts) => {
            seenRecruitContext = opts.recruitAiV2Context || null;
            assert.ok(seenRecruitContext);
            assert.equal(seenRecruitContext.knownFacts.city, "Miami");
            assert.equal(seenRecruitContext.knownFacts.state, "FL");
            assert.equal(seenRecruitContext.knownFacts.workAuthorization, true);
            assert.equal(opts.recruitAiV2CoreProspectId, CORE);
            return executeScheduleInterview(phone, payload, {
              ...opts,
              dependencies: missionDeps({
                legacy,
                advances,
                calendarCreates,
                rollbacks
              })
            });
          }
        }
      }
    });

    assert.equal(created.execution?.success, true);
    assert.equal(calendarCreates.count, 1);
    assert.equal(advances.count, 1);
    assert.equal(rollbacks.count, 0);
    assert.equal(advances.capturedFields.city, "Miami");
    assert.equal(advances.capturedFields.state, "FL");
    assert.equal(advances.capturedFields.authorization, true);
    assert.equal(legacy.city, "Miami");
    assert.equal(legacy.state, "FL");
    assert.equal(legacy.work_authorized, true);
    assert.equal(created.responsePlan?.templateKey, "appointment_confirmed");
    assert.match(String(created.rendered?.text || ""), /confirmad/i);
    assert.doesNotMatch(String(created.rendered?.text || ""), /estado está Si/i);
    assert.equal(created.nextContext.appointment.status, APPOINTMENT_STATUS.CONFIRMED);
    assert.equal(created.nextContext.appointment.appointmentId, APPT_ID);
    assert.equal(created.nextContext.appointment.confirmedDate, DATE);
    assert.equal(created.nextContext.appointment.confirmedTime, TIME);
    // No confirmed → proposed downgrade
    assert.notEqual(created.nextContext.appointment.status, APPOINTMENT_STATUS.PROPOSED);
  });

  test("forced create/workflow failure → BR-121 rollback + V2 owns turn (no CE Si-as-city)", async () => {
    const persistence = createContextPersistenceService({
      repository: createMemoryContextRepository()
    });
    const deferredCtx = proposedConfirmableContext();
    deferredCtx.conversation.lastOfferMade = "appointment_confirm_deferred";
    deferredCtx.conversation.lastProspectIntent = "schedule_confirm";
    deferredCtx.conversation.lastAtlasOutboundText =
      "Gracias — anoté tu confirmación. Un compañero finalizará los detalles en breve.";
    await persistence.compareAndSaveContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp",
      nextContext: deferredCtx,
      decisionCode: "create_appointment"
    });

    const legacy = sparseLegacy();
    const advances = { count: 0, capturedFields: null };
    const calendarCreates = { count: 0 };
    const rollbacks = { count: 0 };

    const failedTurn = await processRecruitAiV2Turn({
      message: { text: "Si" },
      contextInput: {
        organizationId: ORG,
        prospectId: CORE,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY
      },
      persistenceService: persistence,
      options: {
        channel: "whatsapp",
        allowExecution: true,
        persistContext: true,
        profileConfigured: true,
        env: authoringEnv(true),
        actingUserId: AGENT,
        organizationId: ORG,
        prospectPhone: PHONE,
        legacyProspectId: LEGACY,
        dependencies: {
          findActiveAppointmentForProspect: async () => null,
          getSlots: async () => [{ dateKey: DATE, timeKey: TIME }],
          getAppointmentProfile: async () => ({ profileConfigured: true }),
          executeScheduleInterview: async (phone, payload, opts) =>
            executeScheduleInterview(phone, payload, {
              ...opts,
              dependencies: missionDeps({
                legacy,
                advances,
                calendarCreates,
                rollbacks,
                forceAdvanceFail: true
              })
            })
        }
      }
    });

    assert.equal(failedTurn.execution?.success, false);
    assert.equal(calendarCreates.count, 1);
    assert.equal(advances.count, 1);
    assert.equal(rollbacks.count, 1);
    // BR-127 still synced before advance attempt
    assert.equal(legacy.city, "Miami");
    assert.equal(advances.capturedFields.authorization, true);
    assert.doesNotMatch(String(failedTurn.rendered?.text || ""), /estado está Si|qué estado/i);
    assert.notEqual(failedTurn.responsePlan?.templateKey, "ask_state");

    const owned = await ownConfirmableProposalAfterAuthoringLoss({
      v2Result: failedTurn,
      prospect: {
        id: LEGACY,
        phone: PHONE,
        organization_id: ORG,
        owner_user_id: AGENT
      },
      normalized: { phone: PHONE, text: "Si", channel: "whatsapp" },
      organizationId: ORG,
      actingUserId: AGENT,
      allowExecution: true,
      persistence
    });

    assert.ok(owned);
    assert.equal(owned.authored, true);
    assert.equal(owned.fallThrough, false);
    assert.doesNotMatch(String(owned.replyText || ""), /estado está Si/i);

    const loaded = await persistence.loadContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp"
    });
    assert.equal(loaded.appointment.status, APPOINTMENT_STATUS.PROPOSED);
    assert.equal(loaded.appointment.proposedDate, DATE);
    assert.equal(loaded.appointment.proposedTime, TIME);
    assert.notEqual(loaded.knownFacts?.city, "Si");
    assert.equal(loaded.knownFacts?.city, "Miami");
  });
});
