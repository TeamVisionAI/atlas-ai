/**
 * Hotfix — LIVE_AUTHORING canary must not CE-create while BR-111 execution is OFF.
 * Covers required cases A–E, I (+ hub fallthrough B–D). F–H / J are existing suites.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluateLegacyCeAppointmentMutation,
  buildDeferredMutationDeniedReply,
  DENY_REASON,
  DENY_STAGE
} = require("../core/recruitAiV2/legacyCeAppointmentMutationGate");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OTHER_RVP = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const WRONG_ORG = "99999999-9999-4999-8999-999999999999";

function authoringOnExecutionOff(overrides = {}) {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: PRIMARY_RVP,
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP,
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false",
    ...overrides
  };
}

function scheduleCompleteProspect(overrides = {}) {
  return {
    phone: "+17865550999",
    organization_id: TEAM_VISION_ORG,
    owner_user_id: PRIMARY_RVP,
    entry_method: "QR",
    source: "car_magnet",
    appointment_date: "2026-08-10T17:15:00.000Z",
    interview_type: "In Person",
    notes: JSON.stringify({
      scheduling: { phase: "confirmed", dateKey: "2026-08-10", timeKey: "17:15" }
    }),
    ...overrides
  };
}

test("gate: non-LIVE_AUTHORING cohort allows CE mutation (I)", () => {
  const deniedAuthoringOff = evaluateLegacyCeAppointmentMutation({
    organizationId: TEAM_VISION_ORG,
    actingUserId: PRIMARY_RVP,
    env: authoringOnExecutionOff({ RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "false" })
  });
  assert.equal(deniedAuthoringOff.allowed, true);

  const wrongUser = evaluateLegacyCeAppointmentMutation({
    organizationId: TEAM_VISION_ORG,
    actingUserId: OTHER_RVP,
    env: authoringOnExecutionOff()
  });
  assert.equal(wrongUser.allowed, true);

  const wrongOrg = evaluateLegacyCeAppointmentMutation({
    organizationId: WRONG_ORG,
    actingUserId: PRIMARY_RVP,
    env: authoringOnExecutionOff()
  });
  assert.equal(wrongOrg.allowed, true);
});

test("gate: authoring cohort + execution OFF denies CE mutation", () => {
  const result = evaluateLegacyCeAppointmentMutation({
    organizationId: TEAM_VISION_ORG,
    actingUserId: PRIMARY_RVP,
    env: authoringOnExecutionOff()
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, DENY_REASON);
  assert.equal(result.authoringEligible, true);
});

test("gate: authoring cohort + BR-111 execution eligible allows CE mutation", () => {
  const result = evaluateLegacyCeAppointmentMutation({
    organizationId: TEAM_VISION_ORG,
    actingUserId: PRIMARY_RVP,
    env: authoringOnExecutionOff({ RECRUIT_AI_V2_EXECUTION_ENABLED: "true" })
  });
  assert.equal(result.allowed, true);
  assert.equal(result.executionEligible, true);
});

test("deferred deny copy is safe EN/ES", () => {
  assert.match(buildDeferredMutationDeniedReply("en"), /finalize the booking/i);
  assert.match(buildDeferredMutationDeniedReply("es"), /finalizará/i);
});

test("E. completeInterview authoring canary: conversational deny; no capacity / no executeScheduleInterview", async () => {
  const semantic = require("../core/semanticConversationEngine");
  const orgResolver = require("../core/autonomousScheduleAgentResolver");
  const mission = require("../application/missionExecutionApplicationService");
  const capacityEngine = require("../core/capacityEngine");

  const originalResolve = orgResolver.resolveAutonomousScheduleAgentId;
  const originalExecute = mission.executeScheduleInterview;
  const originalRelease = capacityEngine.releaseSlotByIso;

  let executeCalled = 0;
  let capacityReleased = 0;
  const stages = [];

  orgResolver.resolveAutonomousScheduleAgentId = async () => ({
    agentId: PRIMARY_RVP,
    source: "prospect_owner",
    repId: "4TJLK"
  });
  mission.executeScheduleInterview = async () => {
    executeCalled += 1;
    return { success: true, appointmentId: "should-not-create" };
  };
  capacityEngine.releaseSlotByIso = () => {
    capacityReleased += 1;
  };

  try {
    const result = await semantic.completeInterview(
      scheduleCompleteProspect(),
      { interviewType: "In Person", preferredTime: "Monday at 5:15 PM" },
      "en",
      {
        env: authoringOnExecutionOff(),
        logStage: (stage, details) => {
          stages.push({ stage, details });
        }
      }
    );

    assert.equal(result.success, false);
    assert.equal(result.reason, DENY_REASON);
    assert.equal(result.humanAssist, true);
    assert.match(result.reply, /finalize the booking/i);
    assert.equal(executeCalled, 0);
    assert.equal(capacityReleased, 0);
    assert.ok(stages.some((s) => s.stage === DENY_STAGE));
  } finally {
    orgResolver.resolveAutonomousScheduleAgentId = originalResolve;
    mission.executeScheduleInterview = originalExecute;
    capacityEngine.releaseSlotByIso = originalRelease;
  }
});

test("I. completeInterview non-authoring org still schedules via executeScheduleInterview", async () => {
  const semantic = require("../core/semanticConversationEngine");
  const orgResolver = require("../core/autonomousScheduleAgentResolver");
  const mission = require("../application/missionExecutionApplicationService");
  const capacityEngine = require("../core/capacityEngine");
  const supabaseService = require("../services/supabaseService");

  const originalResolve = orgResolver.resolveAutonomousScheduleAgentId;
  const originalExecute = mission.executeScheduleInterview;
  const originalRelease = capacityEngine.releaseSlotByIso;
  const originalUpdate = supabaseService.updateProspect;

  let executeCalled = 0;

  orgResolver.resolveAutonomousScheduleAgentId = async () => ({
    agentId: OTHER_RVP,
    source: "prospect_owner",
    repId: "OTHER"
  });
  mission.executeScheduleInterview = async () => {
    executeCalled += 1;
    return {
      success: true,
      appointmentId: "appt-non-canary-1",
      booking: { startTimeISO: "2026-08-10T17:15:00.000Z", googleCalendarEventId: "gcal-1" }
    };
  };
  capacityEngine.releaseSlotByIso = () => {};
  supabaseService.updateProspect = async (_phone, updates) => updates;

  try {
    const result = await semantic.completeInterview(
      scheduleCompleteProspect({
        organization_id: WRONG_ORG,
        owner_user_id: OTHER_RVP
      }),
      { interviewType: "In Person", preferredTime: "Monday at 5:15 PM" },
      "en",
      { env: authoringOnExecutionOff() }
    );

    assert.equal(result.success, true);
    assert.equal(result.appointmentId, "appt-non-canary-1");
    assert.equal(executeCalled, 1);
  } finally {
    orgResolver.resolveAutonomousScheduleAgentId = originalResolve;
    mission.executeScheduleInterview = originalExecute;
    capacityEngine.releaseSlotByIso = originalRelease;
    supabaseService.updateProspect = originalUpdate;
  }
});

async function withHubOutboundMock(fn) {
  const outbound = require("../core/whatsappOutboundPipeline");
  const originalSend = outbound.sendAndPersistWhatsAppMessage;
  outbound.sendAndPersistWhatsAppMessage = async () => ({ success: true, simulated: true });
  try {
    return await fn();
  } finally {
    outbound.sendAndPersistWhatsAppMessage = originalSend;
  }
}

test("A. V2 live authoring success skips CE (no appointment mutation)", async () => {
  const hub = require("../core/communicationHub");
  const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
  const conversationEngine = require("../core/conversationEngine");
  const mission = require("../application/missionExecutionApplicationService");

  const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
  const originalHandle = conversationEngine.handleIncomingMessage;
  const originalExecute = mission.executeScheduleInterview;

  let ceCalled = 0;
  let executeCalled = 0;

  liveAuthoringBridge.attemptLiveV2Authoring = async () => ({
    authored: true,
    fallThrough: false,
    replyText: "Perfecto — ¿en qué ciudad y estado vives?",
    nextAction: "ask_city",
    reason: null,
    v2Result: { decision: { nextAction: "ask_city" } },
    actingUserId: PRIMARY_RVP,
    allowExecution: false,
    stage: "live_authoring_used"
  });
  conversationEngine.handleIncomingMessage = async () => {
    ceCalled += 1;
    return { reply: "CE should not run" };
  };
  mission.executeScheduleInterview = async () => {
    executeCalled += 1;
    return { success: true, appointmentId: "leak" };
  };

  try {
    await withHubOutboundMock(async () => {
      const result = await hub.processNormalizedInboundMessage(
        {
          phone: "+17865550999",
          text: "Hola",
          channel: "whatsapp",
          providerMessageId: "wamid.a-1",
          contactName: "Canary"
        },
        {
          prospect: scheduleCompleteProspect({ current_step: "CITY", appointment_date: null }),
          env: authoringOnExecutionOff()
        }
      );

      assert.equal(ceCalled, 0);
      assert.equal(executeCalled, 0);
      assert.equal(result.engineResult?.source, "recruit_ai_v2_live_authoring");
      if (result.reason !== "REPLY_SUPPRESSED") {
        assert.equal(result.replied, true);
      }
    });
  } finally {
    liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
    conversationEngine.handleIncomingMessage = originalHandle;
    mission.executeScheduleInterview = originalExecute;
  }
});

async function runHubFallthroughCase({ reason }) {
  const hub = require("../core/communicationHub");
  const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
  const conversationEngine = require("../core/conversationEngine");
  const semantic = require("../core/semanticConversationEngine");
  const mission = require("../application/missionExecutionApplicationService");
  const orgResolver = require("../core/autonomousScheduleAgentResolver");
  const capacityEngine = require("../core/capacityEngine");

  const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
  const originalHandle = conversationEngine.handleIncomingMessage;
  const originalExecute = mission.executeScheduleInterview;
  const originalResolve = orgResolver.resolveAutonomousScheduleAgentId;
  const originalRelease = capacityEngine.releaseSlotByIso;

  let executeCalled = 0;
  let capacityReleased = 0;
  let ceCalled = 0;

  liveAuthoringBridge.attemptLiveV2Authoring = async () => ({
    authored: false,
    fallThrough: true,
    replyText: null,
    nextAction: null,
    reason,
    v2Result: null,
    actingUserId: PRIMARY_RVP,
    allowExecution: false
  });

  conversationEngine.handleIncomingMessage = async () => {
    ceCalled += 1;
    return { reply: "Gracias — ¿qué ciudad y estado?" };
  };

  mission.executeScheduleInterview = async () => {
    executeCalled += 1;
    return { success: true, appointmentId: "should-not" };
  };
  capacityEngine.releaseSlotByIso = () => {
    capacityReleased += 1;
  };
  orgResolver.resolveAutonomousScheduleAgentId = async () => ({
    agentId: PRIMARY_RVP,
    source: "prospect_owner",
    repId: "4TJLK"
  });

  try {
    await withHubOutboundMock(async () => {
      const result = await hub.processNormalizedInboundMessage(
        {
          phone: "+17865550999",
          text: "Hola quiero info",
          channel: "whatsapp",
          providerMessageId: `wamid.${reason}`,
          contactName: "Canary"
        },
        {
          prospect: scheduleCompleteProspect({ current_step: "CITY", appointment_date: null }),
          env: authoringOnExecutionOff()
        }
      );
      assert.ok(ceCalled >= 1);
      assert.equal(result.replyText, "Gracias — ¿qué ciudad y estado?");
    });

    const deny = await semantic.completeInterview(
      scheduleCompleteProspect(),
      { interviewType: "In Person", preferredTime: "Monday at 5:15 PM" },
      "en",
      { env: authoringOnExecutionOff() }
    );
    assert.equal(deny.success, false);
    assert.equal(deny.reason, DENY_REASON);
    assert.equal(executeCalled, 0);
    assert.equal(capacityReleased, 0);
  } finally {
    liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
    conversationEngine.handleIncomingMessage = originalHandle;
    mission.executeScheduleInterview = originalExecute;
    orgResolver.resolveAutonomousScheduleAgentId = originalResolve;
    capacityEngine.releaseSlotByIso = originalRelease;
  }
}

test("B. V2 throws → CE can reply → executeScheduleInterview not called", async () => {
  await runHubFallthroughCase({ reason: "LIVE_AUTHORING_TECHNICAL_FAILURE" });
});

test("C. V2 timeout → CE can reply → executeScheduleInterview not called", async () => {
  await runHubFallthroughCase({ reason: "LIVE_AUTHORING_TIMEOUT" });
});

test("D. V2 empty/unsafe → CE can reply → executeScheduleInterview not called", async () => {
  await runHubFallthroughCase({ reason: "EMPTY_OR_UNSAFE_REPLY" });
});

test("static: Meta Reviewer / ads / gate ownership markers unchanged in this hotfix", () => {
  const gateSrc = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/legacyCeAppointmentMutationGate.js"),
    "utf8"
  );
  assert.match(gateSrc, /BR-111/);
  assert.match(gateSrc, /isEligibleForLiveAuthoring/);
  assert.match(gateSrc, /isEligibleForExecution/);
  assert.doesNotMatch(gateSrc, /ads?Enabled|ADS_ON|enableAds/i);

  const hubSrc = fs.readFileSync(path.join(__dirname, "../core/communicationHub.js"), "utf8");
  assert.doesNotMatch(hubSrc, /5ace4c1b-6329-49ac-9d63-bfb38da106a1/);

  const br114 = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(br114, /CE fallthrough respects BR-111/);
  assert.match(br114, /legacyCeAppointmentMutationGate/);
});
