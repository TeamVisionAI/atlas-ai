/**
 * BR-125 — Live WhatsApp entrypoint ownership after V2 create (Ana canary FAIL).
 * Proves timeout/fallthrough cannot hand reply ownership to CE "already confirmed" stub
 * when V2 already mutated / an active appointment matches the proposed slot.
 */
"use strict";

require("dotenv").config();

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  processRecruitAiV2Turn
} = require("../core/recruitAiV2/orchestrator");
const {
  attemptLiveV2Authoring,
  reclaimOwnershipAfterAuthoringLoss
} = require("../core/recruitAiV2/liveAuthoringBridge");
const {
  processNormalizedInboundMessage
} = require("../core/communicationHub");
const {
  createContextPersistenceService
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const {
  createConversationContext,
  APPOINTMENT_STATUS,
  STAGES
} = require("../core/recruitAiV2/conversationContext");
const {
  buildAppointmentConfirmedReply,
  resolvePostCreateOwnership
} = require("../core/recruitAiV2/postCreateOwnership");

const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const CORE = "6be056b0-b646-4e6c-9928-7c8378666b12";
const LEGACY = "af02e5a9-bafd-442a-b333-346d099b8378";
const PHONE = "+17862967254";
const DATE = "2026-08-10";
const TIME = "12:00";
const APPT_ID = "a46121d4-2c2a-40ec-8c23-e68aa59cd5a5";

function execEnv(overrides = {}) {
  return {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: AGENT,
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: AGENT,
    RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS: "50",
    ...overrides
  };
}

function anaProposedContext() {
  return createConversationContext({
    organizationId: ORG,
    prospectId: CORE,
    prospectPhone: PHONE,
    legacyProspectId: LEGACY,
    agentId: AGENT,
    prospectOwnerUserId: AGENT,
    preferredLanguage: "spanish",
    currentStage: "proposed",
    timezone: "America/New_York",
    knownFacts: {
      name: "Ana Perez",
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredMeetingType: "in_person",
      preferredDayPart: "afternoon",
      currentOccupation: null
    },
    appointment: {
      status: "proposed",
      proposedDate: DATE,
      proposedTime: TIME,
      appointmentId: null,
      confirmedDate: null,
      confirmedTime: null,
      meetingType: "in_person",
      previouslyOfferedSlots: [
        { date: "2026-08-09", time: "13:00", timezone: "America/New_York" },
        { date: DATE, time: TIME, timezone: "America/New_York" }
      ]
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastProspectIntent: "schedule_confirm",
      lastOfferMade: "appointment_confirm_deferred",
      clarificationCount: 0
    }
  });
}

function successfulScheduleDeps() {
  let creates = 0;
  let active = null;
  return {
    creates: () => creates,
    setActive: (row) => {
      active = row;
    },
    deps: {
      findActiveAppointmentForProspect: async () => active,
      getSlots: async () => [{ dateKey: DATE, timeKey: TIME }],
      executeScheduleInterview: async () => {
        creates += 1;
        active = {
          id: APPT_ID,
          prospect_id: CORE,
          status: "scheduled",
          start_date_time: "2026-08-10T16:00:00.000Z",
          timezone: "America/New_York",
          calendar_event_id: "dttofp98lpf596cnugaodng3i4"
        };
        return {
          success: true,
          appointmentId: APPT_ID,
          appointment: active,
          booking: {
            startTimeISO: "2026-08-10T16:00:00.000Z",
            dateKey: DATE,
            timeKey: TIME
          }
        };
      }
    }
  };
}

describe("BR-125 live post-create ownership", () => {
  test("1. Ana fixture Si + execution ON → durable confirmed + V2 appointment_confirmed", async () => {
    const repo = createMemoryContextRepository();
    const persistence = createContextPersistenceService({ repository: repo });
    await persistence.createContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp",
      context: anaProposedContext(),
      legacyProspectId: LEGACY,
      prospectPhone: PHONE
    });

    const schedule = successfulScheduleDeps();
    const authoring = await attemptLiveV2Authoring({
      normalized: {
        phone: PHONE,
        text: "Si",
        channel: "whatsapp",
        providerMessageId: "wa-ana-si-1",
        messageType: "text"
      },
      prospect: {
        id: LEGACY,
        phone: PHONE,
        name: "Ana Perez",
        organization_id: ORG,
        owner_user_id: AGENT
      },
      env: execEnv({ RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS: "8000" }),
      persistenceService: persistence,
      dependencies: schedule.deps,
      processTurn: async (args) => {
        const loaded = await persistence.loadContext({
          organizationId: ORG,
          prospectId: CORE,
          channel: "whatsapp",
          legacyProspectId: LEGACY,
          prospectPhone: PHONE
        });
        return processRecruitAiV2Turn({
          ...args,
          context: loaded || anaProposedContext(),
          options: {
            ...args.options,
            profileConfigured: true,
            dependencies: schedule.deps
          }
        });
      }
    });

    assert.equal(authoring.authored, true);
    assert.equal(authoring.fallThrough, false);
    assert.equal(schedule.creates(), 1);
    assert.ok(authoring.v2Result?.execution?.success);
    assert.equal(authoring.v2Result.execution.appointmentId, APPT_ID);
    assert.match(authoring.replyText || "", /confirmada|Perfecto/i);
    assert.doesNotMatch(
      authoring.replyText || "",
      /Un agente de Team Vision se comunicará|already confirmed\. A Team Vision agent/i
    );

    const loaded = await persistence.loadContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp",
      legacyProspectId: LEGACY,
      prospectPhone: PHONE
    });
    assert.equal(loaded.appointment?.status, APPOINTMENT_STATUS.CONFIRMED);
    assert.equal(loaded.appointment?.appointmentId, APPT_ID);
    assert.equal(loaded.appointment?.confirmedDate, DATE);
    assert.equal(loaded.appointment?.confirmedTime, TIME);
  });

  test("2. WhatsApp hub entrypoint: timeout after mutation → reclaim, no CE", async () => {
    let ceCalls = 0;
    const originalCE = require("../core/conversationEngine");
    const originalHandle = originalCE.handleIncomingMessage;
    originalCE.handleIncomingMessage = async () => {
      ceCalls += 1;
      return {
        reply:
          "✅ Tu entrevista ya está confirmada. Un agente de Team Vision se comunicará contigo si es necesario realizar algún ajuste."
      };
    };

    const schedule = successfulScheduleDeps();
    const repo = createMemoryContextRepository();
    const persistence = createContextPersistenceService({ repository: repo });
    await persistence.createContext({
      organizationId: ORG,
      prospectId: CORE,
      channel: "whatsapp",
      context: anaProposedContext(),
      legacyProspectId: LEGACY,
      prospectPhone: PHONE
    });

    try {
      const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
      const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
      liveAuthoringBridge.attemptLiveV2Authoring = async (args) => {
        const loaded = await persistence.loadContext({
          organizationId: ORG,
          prospectId: CORE,
          channel: "whatsapp",
          legacyProspectId: LEGACY,
          prospectPhone: PHONE
        });
        const turnPromise = processRecruitAiV2Turn({
          message: { text: "Si", providerMessageId: "wa-ana-timeout" },
          context: loaded || anaProposedContext(),
          persistenceService: persistence,
          options: {
            channel: "whatsapp",
            allowExecution: true,
            persistContext: true,
            env: execEnv(),
            actingUserId: AGENT,
            agentId: AGENT,
            organizationId: ORG,
            prospectPhone: PHONE,
            legacyProspectId: LEGACY,
            inboundMessageId: "wa-ana-timeout",
            profileConfigured: true,
            dependencies: schedule.deps
          }
        });

        // Simulate soft timeout while mutation completes, then reclaim.
        await new Promise((r) => setTimeout(r, 20));
        const late = await turnPromise;
        assert.equal(late.execution?.success, true);

        // Seed active for reclaim finder after create.
        schedule.setActive({
          id: APPT_ID,
          prospect_id: CORE,
          status: "scheduled",
          start_date_time: "2026-08-10T16:00:00.000Z",
          timezone: "America/New_York",
          calendar_event_id: "dttofp98lpf596cnugaodng3i4"
        });

        return (
          (await reclaimOwnershipAfterAuthoringLoss({
            v2Result: late,
            prospect: args.prospect,
            normalized: args.normalized,
            organizationId: ORG,
            actingUserId: AGENT,
            allowExecution: true,
            persistence,
            findActiveAppointment: schedule.deps.findActiveAppointmentForProspect
          })) || {
            eligible: true,
            authored: false,
            fallThrough: true,
            reason: "LIVE_AUTHORING_TIMEOUT",
            replyText: null,
            v2Result: late,
            nextAction: "create_appointment",
            allowExecution: true
          }
        );
      };

      const whatsappOutboundPipeline = require("../core/whatsappOutboundPipeline");
      const originalSend = whatsappOutboundPipeline.sendAndPersistWhatsAppMessage;
      const delivered = [];
      whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = async (payload) => {
        delivered.push(payload.message);
        return {
          success: true,
          providerMessageId: "wamid.test",
          simulated: true
        };
      };

      try {
        // Force workflow gate open for delivery.
        const result = await processNormalizedInboundMessage(
          {
            phone: PHONE,
            text: "Si",
            channel: "whatsapp",
            providerMessageId: "wa-ana-timeout",
            contactName: "Ana Perez",
            messageType: "text"
          },
          {
            prospect: {
              id: LEGACY,
              phone: PHONE,
              name: "Ana Perez",
              organization_id: ORG,
              owner_user_id: AGENT,
              current_step: "DAY_PART"
            },
            env: execEnv(),
            authoringDependencies: schedule.deps
          }
        );

        assert.equal(ceCalls, 0);
        assert.equal(result.replied, true);
        assert.match(String(result.replyText || ""), /Perfecto|confirmada/i);
        assert.doesNotMatch(
          String(result.replyText || ""),
          /Un agente de Team Vision se comunicará/
        );
        assert.equal(schedule.creates(), 1);
        assert.ok(delivered.length <= 1);
      } finally {
        whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = originalSend;
        liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
      }
    } finally {
      originalCE.handleIncomingMessage = originalHandle;
    }
  });

  test("3. mutation owner called once; CE completeInterview not required after V2 owns", async () => {
    const schedule = successfulScheduleDeps();
    const result = await processRecruitAiV2Turn({
      message: { text: "Si" },
      context: anaProposedContext(),
      options: {
        allowExecution: true,
        persistContext: false,
        env: execEnv(),
        actingUserId: AGENT,
        agentId: AGENT,
        organizationId: ORG,
        prospectPhone: PHONE,
        profileConfigured: true,
        dependencies: schedule.deps
      }
    });
    assert.equal(result.execution.success, true);
    assert.equal(schedule.creates(), 1);
    // Idempotent exact-slot replay should not create again.
    schedule.setActive({
      id: APPT_ID,
      prospect_id: CORE,
      status: "scheduled",
      start_date_time: "2026-08-10T16:00:00.000Z",
      timezone: "America/New_York"
    });
    const replay = await processRecruitAiV2Turn({
      message: { text: "Si" },
      context: {
        ...anaProposedContext(),
        appointment: {
          ...anaProposedContext().appointment,
          status: APPOINTMENT_STATUS.CONFIRMED,
          appointmentId: APPT_ID,
          confirmedDate: DATE,
          confirmedTime: TIME
        }
      },
      options: {
        allowExecution: true,
        persistContext: false,
        env: execEnv(),
        actingUserId: AGENT,
        agentId: AGENT,
        organizationId: ORG,
        prospectPhone: PHONE,
        profileConfigured: true,
        dependencies: schedule.deps
      }
    });
    assert.ok(replay);
    assert.equal(schedule.creates(), 1);
  });

  test("5. execution OFF → deferred, no mutation", async () => {
    const schedule = successfulScheduleDeps();
    const result = await processRecruitAiV2Turn({
      message: { text: "Si" },
      context: anaProposedContext(),
      options: {
        allowExecution: false,
        persistContext: false,
        env: execEnv({
          RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
          RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
        }),
        actingUserId: AGENT,
        organizationId: ORG,
        profileConfigured: true,
        dependencies: schedule.deps
      }
    });
    assert.equal(result.decision?.nextAction || result.structuredDecision?.decision?.nextAction, "create_appointment");
    assert.equal(result.execution?.success, false);
    assert.equal(schedule.creates(), 0);
    assert.equal(
      result.responsePlan?.templateKey ||
        result.structuredDecision?.customerReplyPlan?.templateKey,
      "appointment_confirm_deferred"
    );
  });

  test("ownership helper builds V2 confirmed copy (not CE stub)", () => {
    const text = buildAppointmentConfirmedReply({
      language: "spanish",
      dateKey: DATE,
      timeKey: TIME
    });
    assert.match(text, /Perfecto/);
    assert.match(text, /12:00/);
    assert.doesNotMatch(text, /Un agente de Team Vision se comunicará/);
  });

  test("docs: BR-125 documented", () => {
    const docs = fs.readFileSync(
      path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
      "utf8"
    );
    assert.match(docs, /## BR-125/);
    assert.match(docs, /Single Post-Create Ownership/i);
  });

  test("reconcile from active appointment when v2Result missing", async () => {
    const ownership = await resolvePostCreateOwnership({
      v2Result: null,
      findActiveAppointment: async () => ({
        id: APPT_ID,
        prospect_id: CORE,
        status: "scheduled",
        start_date_time: "2026-08-10T16:00:00.000Z",
        timezone: "America/New_York"
      }),
      prospectPhone: PHONE,
      organizationId: ORG,
      proposedDate: DATE,
      proposedTime: TIME,
      language: "spanish"
    });
    assert.equal(ownership.owned, true);
    assert.equal(ownership.appointmentId, APPT_ID);
    assert.equal(ownership.dateKey, DATE);
    assert.equal(ownership.timeKey, TIME);
    assert.equal(ownership.nextContext.appointment.status, APPOINTMENT_STATUS.CONFIRMED);
    assert.equal(ownership.nextContext.currentStage, STAGES.CONFIRMED);
  });
});
