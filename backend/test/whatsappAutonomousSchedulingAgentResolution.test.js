/**
 * Hotfix — autonomous WhatsApp scheduling agent resolution + safe failure copy.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveAutonomousScheduleAgentId,
  buildSafeScheduleFailureReply,
  isUnsafeCustomerScheduleMessage,
  isEligibleScheduleAgent,
  readConfiguredDefaultRecruiterId
} = require("../core/autonomousScheduleAgentResolver");
const { resolveScheduleAgentId } = require("../application/missionExecutionApplicationService");
const {
  authorizeWhatsAppOutbound,
  DELIVERY_STATUSES
} = require("../core/whatsappOutboundAuthorizationGate");
const { evaluateCustomerCareWindowFromInboundAt } = require("../core/whatsappCustomerCareWindow");

const ORG = "00000000-0000-4000-8000-000000000001";
const RVP_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const DEFAULT_RECRUITER_ID = "22222222-2222-4222-8222-222222222222";
const SUPPORT_ADMIN_ID = "00000000-0000-4000-8000-000000000002";

test("1. resolveScheduleAgentId still requires authenticated identifiers for Mission Control", () => {
  assert.equal(resolveScheduleAgentId({}), null);
  assert.equal(resolveScheduleAgentId({ userId: "user-1" }), "user-1");
});

test("2. existing prospect owner is preferred for autonomous scheduling", async () => {
  const atlasUserService = require("../services/atlasUserService");
  const original = atlasUserService.findUserById;
  atlasUserService.findUserById = async (id) => {
    if (id === OWNER_ID) {
      return { id: OWNER_ID, email: "owner@example.com", role: "recruiter", status: "active", rep_id: "OWNER1" };
    }
    return null;
  };

  try {
    const resolved = await resolveAutonomousScheduleAgentId({
      organizationId: ORG,
      prospect: { owner_user_id: OWNER_ID, organization_id: ORG },
      organizationSettings: {}
    });
    assert.equal(resolved.agentId, OWNER_ID);
    assert.equal(resolved.source, "prospect_owner");
  } finally {
    atlasUserService.findUserById = original;
  }
});

test("3. organization default recruiter is used through canonical settings only", async () => {
  const atlasUserService = require("../services/atlasUserService");
  const originalFind = atlasUserService.findUserById;
  atlasUserService.findUserById = async (id) => {
    if (id === DEFAULT_RECRUITER_ID) {
      return {
        id: DEFAULT_RECRUITER_ID,
        email: "recruiter@example.com",
        role: "recruiter",
        status: "active",
        rep_id: "REC1"
      };
    }
    return null;
  };

  try {
    const settings = { scheduling: { defaultRecruiterUserId: DEFAULT_RECRUITER_ID } };
    assert.equal(readConfiguredDefaultRecruiterId(settings), DEFAULT_RECRUITER_ID);

    const resolved = await resolveAutonomousScheduleAgentId({
      organizationId: ORG,
      prospect: { organization_id: ORG, owner_user_id: null },
      organizationSettings: settings
    });
    assert.equal(resolved.agentId, DEFAULT_RECRUITER_ID);
    assert.equal(resolved.source, "organization_default_recruiter");
  } finally {
    atlasUserService.findUserById = originalFind;
  }
});

test("4. support admin is never eligible as autonomous schedule owner", () => {
  assert.equal(
    isEligibleScheduleAgent({
      id: SUPPORT_ADMIN_ID,
      email: "support@teamvisionfinancial.com",
      role: "administrator",
      status: "active"
    }),
    false
  );
});

test("5. missing agent fails safely with null agentId", async () => {
  const atlasUserService = require("../services/atlasUserService");
  const originalFind = atlasUserService.findUserById;
  const originalRep = atlasUserService.findUserByRepId;
  const supabaseService = require("../services/supabaseService");
  const originalFrom = supabaseService.supabase.from;

  atlasUserService.findUserById = async () => null;
  atlasUserService.findUserByRepId = async () => null;
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    order() {
      return chain;
    },
    limit: async () => ({ data: [], error: null })
  };
  supabaseService.supabase.from = () => chain;

  try {
    const resolved = await resolveAutonomousScheduleAgentId({
      organizationId: ORG,
      prospect: { organization_id: ORG },
      organizationSettings: {}
    });
    assert.equal(resolved.agentId, null);
    assert.equal(resolved.source, null);
  } finally {
    atlasUserService.findUserById = originalFind;
    atlasUserService.findUserByRepId = originalRep;
    supabaseService.supabase.from = originalFrom;
  }
});

test("6. internal persistence errors are unsafe for WhatsApp customers", () => {
  assert.equal(
    isUnsafeCustomerScheduleMessage("Missing authenticated agent id for appointment persistence."),
    true
  );
  assert.equal(
    isUnsafeCustomerScheduleMessage(buildSafeScheduleFailureReply("en")),
    false
  );
});

test("7. safe failure reply matches required customer copy", () => {
  assert.match(
    buildSafeScheduleFailureReply("en"),
    /couldn't complete the appointment just now/i
  );
  assert.match(buildSafeScheduleFailureReply("es"), /no pude completar la cita/i);
});

test("8. completeInterview uses autonomous resolver and never returns internal error text", async () => {
  const semantic = require("../core/semanticConversationEngine");
  const orgResolver = require("../core/autonomousScheduleAgentResolver");
  const mission = require("../application/missionExecutionApplicationService");
  const supabaseService = require("../services/supabaseService");
  const workflowStateStore = require("../core/workflowStateStore");

  const originalResolve = orgResolver.resolveAutonomousScheduleAgentId;
  const originalExecute = mission.executeScheduleInterview;
  const originalUpdate = supabaseService.updateProspect;
  const originalSave = workflowStateStore.savePersistedWorkflowState;

  let humanAssistSaved = false;
  orgResolver.resolveAutonomousScheduleAgentId = async () => ({
    agentId: null,
    source: null,
    repId: null
  });
  mission.executeScheduleInterview = async () => {
    throw new Error("should not execute without agent");
  };
  supabaseService.updateProspect = async () => ({});
  workflowStateStore.savePersistedWorkflowState = () => {
    humanAssistSaved = true;
  };

  try {
    const result = await semantic.completeInterview(
      {
        phone: "+17865537338",
        organization_id: ORG,
        owner_user_id: null,
        appointment_date: "2026-08-10T17:15:00.000Z",
        interview_time: "Monday at 5:15 PM",
        interview_type: "In Person",
        notes: JSON.stringify({
          scheduling: { phase: "confirmed", dateKey: "2026-08-10", timeKey: "17:15" }
        })
      },
      {
        interviewType: "In Person",
        preferredTime: "Monday at 5:15 PM",
        email: null
      },
      "en"
    );

    assert.equal(result.success, false);
    assert.equal(result.humanAssist, true);
    assert.equal(humanAssistSaved, true);
    assert.equal(result.reply.includes("authenticated agent"), false);
    assert.equal(result.reply.includes("appointment persistence"), false);
    assert.match(result.reply, /team member will help you confirm/i);
  } finally {
    orgResolver.resolveAutonomousScheduleAgentId = originalResolve;
    mission.executeScheduleInterview = originalExecute;
    supabaseService.updateProspect = originalUpdate;
    workflowStateStore.savePersistedWorkflowState = originalSave;
  }
});

test("9. failed persistence path does not claim success or expose diagnostics", async () => {
  const semantic = require("../core/semanticConversationEngine");
  const orgResolver = require("../core/autonomousScheduleAgentResolver");
  const mission = require("../application/missionExecutionApplicationService");
  const supabaseService = require("../services/supabaseService");
  const workflowStateStore = require("../core/workflowStateStore");
  const capacityEngine = require("../core/capacityEngine");

  const originalResolve = orgResolver.resolveAutonomousScheduleAgentId;
  const originalExecute = mission.executeScheduleInterview;
  const originalUpdate = supabaseService.updateProspect;
  const originalSave = workflowStateStore.savePersistedWorkflowState;
  const originalRelease = capacityEngine.releaseSlotByIso;

  orgResolver.resolveAutonomousScheduleAgentId = async () => ({
    agentId: RVP_ID,
    source: "organization_rvp",
    repId: "4TJLK"
  });
  mission.executeScheduleInterview = async () => ({
    success: false,
    error: "APPOINTMENT_PERSISTENCE_FAILED",
    message: "Missing authenticated agent id for appointment persistence."
  });
  supabaseService.updateProspect = async (_phone, updates) => updates;
  workflowStateStore.savePersistedWorkflowState = () => {};
  capacityEngine.releaseSlotByIso = () => {};

  try {
    const result = await semantic.completeInterview(
      {
        phone: "+17865537338",
        organization_id: ORG,
        owner_user_id: null,
        appointment_date: "2026-08-10T17:15:00.000Z",
        interview_type: "In Person",
        notes: JSON.stringify({
          scheduling: { phase: "confirmed", dateKey: "2026-08-10", timeKey: "17:15" }
        })
      },
      { interviewType: "In Person", preferredTime: "Monday at 5:15 PM" },
      "en",
      // Keep legacy CE booking path under test (not LIVE_AUTHORING speak-only canary).
      { env: { RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "false" } }
    );

    assert.equal(result.success, false);
    assert.equal(Boolean(result.appointmentId), false);
    assert.equal(result.reply.includes("Missing authenticated"), false);
  } finally {
    orgResolver.resolveAutonomousScheduleAgentId = originalResolve;
    mission.executeScheduleInterview = originalExecute;
    supabaseService.updateProspect = originalUpdate;
    workflowStateStore.savePersistedWorkflowState = originalSave;
    capacityEngine.releaseSlotByIso = originalRelease;
  }
});

test("10. successful persistence returns appointment id and stamps owner", async () => {
  const servicePath = require.resolve("../services/supabaseService");
  const semanticPath = require.resolve("../core/semanticConversationEngine");
  const originalService = require(servicePath);
  const orgResolver = require("../core/autonomousScheduleAgentResolver");
  const mission = require("../application/missionExecutionApplicationService");
  const capacityEngine = require("../core/capacityEngine");

  const originalResolve = orgResolver.resolveAutonomousScheduleAgentId;
  const originalExecute = mission.executeScheduleInterview;
  const originalRelease = capacityEngine.releaseSlotByIso;
  let stampedOwner = null;

  orgResolver.resolveAutonomousScheduleAgentId = async () => ({
    agentId: RVP_ID,
    source: "organization_rvp",
    repId: "4TJLK"
  });
  mission.executeScheduleInterview = async (_phone, _payload, options) => {
    assert.equal(options.agentId, RVP_ID);
    assert.equal(options.userId, RVP_ID);
    return {
      success: true,
      appointmentId: "appt-success-1",
      booking: { startTimeISO: "2026-08-10T17:15:00.000Z", googleCalendarEventId: "gcal-1" }
    };
  };
  capacityEngine.releaseSlotByIso = () => {};

  require.cache[servicePath].exports = {
    ...originalService,
    updateProspectInOrganization: async (_phone, _organizationId, updates) => {
      stampedOwner = updates.owner_user_id || null;
      return updates;
    }
  };
  delete require.cache[semanticPath];
  const semantic = require("../core/semanticConversationEngine");

  try {
    const result = await semantic.completeInterview(
      {
        phone: "+17865537338",
        organization_id: ORG,
        owner_user_id: null,
        appointment_date: "2026-08-10T17:15:00.000Z",
        interview_type: "In Person",
        notes: JSON.stringify({
          scheduling: { phase: "confirmed", dateKey: "2026-08-10", timeKey: "17:15" }
        })
      },
      { interviewType: "In Person", preferredTime: "Monday at 5:15 PM" },
      "en",
      { env: { RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "false" } }
    );

    assert.equal(result.success, true);
    assert.equal(result.appointmentId, "appt-success-1");
    assert.equal(stampedOwner, RVP_ID);
    assert.equal(result.agentSource, "organization_rvp");
  } finally {
    orgResolver.resolveAutonomousScheduleAgentId = originalResolve;
    mission.executeScheduleInterview = originalExecute;
    capacityEngine.releaseSlotByIso = originalRelease;
    require.cache[servicePath].exports = originalService;
    delete require.cache[semanticPath];
  }
});

test("11. BR-075 outbound gate remains active", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "FOLLOW_UP",
    phone: "+17865550100",
    message: "no send",
    now: Date.parse("2026-08-05T18:00:00.000Z"),
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: null,
        now: Date.parse("2026-08-05T18:00:00.000Z")
      })
  });
  assert.equal(auth.authorized, false);
  assert.ok(
    [
      DELIVERY_STATUSES.BLOCKED_TEMPLATE_MISSING,
      DELIVERY_STATUSES.BLOCKED_TEMPLATE_UNAPPROVED,
      DELIVERY_STATUSES.BLOCKED_WINDOW_CLOSED
    ].includes(auth.status)
  );
});

test("12. Meta Review surface remains present and unchanged by this hotfix", () => {
  const metaReviewTest = path.join(
    __dirname,
    "../../frontend/src/config/metaReviewWorkspace.test.js"
  );
  assert.equal(fs.existsSync(metaReviewTest), true);
});

test("13. tenant isolation: resolver stays within provided organization settings/users", async () => {
  const atlasUserService = require("../services/atlasUserService");
  const originalFind = atlasUserService.findUserById;
  atlasUserService.findUserById = async (id) => {
    if (id === OWNER_ID) {
      return {
        id: OWNER_ID,
        email: "owner@example.com",
        role: "recruiter",
        status: "active",
        organization_id: ORG,
        rep_id: "OWN1"
      };
    }
    return null;
  };

  try {
    const resolved = await resolveAutonomousScheduleAgentId({
      organizationId: ORG,
      prospect: { owner_user_id: OWNER_ID, organization_id: ORG },
      organizationSettings: {
        scheduling: { defaultRecruiterUserId: "should-not-win-over-owner" }
      }
    });
    assert.equal(resolved.agentId, OWNER_ID);
    assert.notEqual(resolved.agentId, "should-not-win-over-owner");
  } finally {
    atlasUserService.findUserById = originalFind;
  }
});
