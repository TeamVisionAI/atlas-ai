/**
 * Interview-details resend inside the 24h window must send without TAKE OVER.
 * Recruit AI stays eligible; HUMAN composer and explicit TAKE OVER are unchanged.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PERMISSIONS, roleHasPermission } = require("../security/permissions");
const { ROLES, normalizeRole } = require("../security/roles");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PHONE = "+17865550881";
const STATE_FILE = path.join(__dirname, "../data/workflowState.json");
const SERVICE_PATH = path.join(__dirname, "../services/communicationService.js");
const ROUTES_PATH = path.join(__dirname, "../routes/appointments.js");
const COMPOSER_PATH = path.join(
  __dirname,
  "../../frontend/src/components/communication/HumanWhatsAppComposer.jsx"
);

async function withTempWorkflowState(run) {
  const previous = fs.existsSync(STATE_FILE)
    ? fs.readFileSync(STATE_FILE, "utf8")
    : null;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, "{}");
  try {
    return await run();
  } finally {
    if (previous == null) {
      try {
        fs.unlinkSync(STATE_FILE);
      } catch {
        /* ignore */
      }
    } else {
      fs.writeFileSync(STATE_FILE, previous);
    }
  }
}

function prospectFixture(overrides = {}) {
  return {
    id: "prospect-interview-details-1",
    phone: PHONE,
    name: "Interview Prospect",
    organization_id: TEAM_VISION,
    owner_user_id: NIOVEL,
    current_step: "QUALIFICATION",
    city: "Miami",
    state: "FL",
    ...overrides
  };
}

function preparedInterviewDetails(overrides = {}) {
  return {
    phone: PHONE,
    message: "Hi Ana, your interview is tomorrow at 6 PM.",
    template: "interview_details",
    language: "english",
    zoomUrl: null,
    customerCareWindow: { open: true, reason: "WINDOW_OPEN" },
    ...overrides
  };
}

test("recruiter/FT/leader roles have prospect:write; support does not", () => {
  assert.equal(roleHasPermission(ROLES.AGENT, PERMISSIONS.PROSPECT_WRITE), true);
  assert.equal(roleHasPermission(ROLES.RECRUITER, PERMISSIONS.PROSPECT_WRITE), true);
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.PROSPECT_WRITE), true);
  assert.equal(roleHasPermission(ROLES.SUPPORT, PERMISSIONS.PROSPECT_WRITE), false);

  assert.equal(normalizeRole("representative"), ROLES.RECRUITER);
  assert.equal(normalizeRole("field_trainer"), ROLES.AGENT);
  assert.equal(
    roleHasPermission(normalizeRole("representative"), PERMISSIONS.PROSPECT_WRITE),
    true
  );
  assert.equal(
    roleHasPermission(normalizeRole("field_trainer"), PERMISSIONS.PROSPECT_WRITE),
    true
  );

  const routes = fs.readFileSync(ROUTES_PATH, "utf8");
  assert.match(routes, /send-interview-details/);
  assert.match(routes, /PERMISSIONS\.PROSPECT_WRITE/);
});

test("inside-window interview details send does not TAKE OVER and Recruit AI stays eligible", async () => {
  await withTempWorkflowState(async () => {
    const {
      sendNativeInterviewDetailsFreeform
    } = require("../services/communicationService");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const {
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

    const prospect = prospectFixture();
    let sendArgs = null;

    const result = await sendNativeInterviewDetailsFreeform({
      appointmentId: "appt-interview-1",
      context: {
        organizationId: TEAM_VISION,
        message: "Hi Ana, your interview is tomorrow at 6 PM.",
        clientRequestId: "req-interview-1",
        findProspectInOrganizationFn: async (phone, organizationId) => {
          assert.equal(phone, PHONE);
          assert.equal(organizationId, TEAM_VISION);
          return prospect;
        },
        sendTextMessageFn: async (to, message, options) => {
          sendArgs = { to, message, options };
          return {
            success: true,
            status: "sent_freeform",
            providerMessageId: "wamid.interview-1",
            conversationLogId: "log-interview-1"
          };
        }
      },
      prepared: preparedInterviewDetails()
    });

    assert.equal(result.success, true);
    assert.equal(result.opensWaMe, false);
    assert.equal(sendArgs.to, PHONE);
    assert.match(sendArgs.message, /interview is tomorrow/);
    assert.equal(sendArgs.options.actor, "ATLAS");
    assert.equal(sendArgs.options.intent, "INTERVIEW_DETAILS");
    assert.equal(sendArgs.options.organizationId, TEAM_VISION);
    assert.match(sendArgs.options.idempotencyKey, /req-interview-1/);

    const persisted = await loadPersistedWorkflowState(PHONE, {
      organizationId: TEAM_VISION,
      prospectId: prospect.id
    });
    assert.equal(persisted.humanTakenOverAt, null);
    assert.equal(persisted.manualAgentOwnership, false);
    assert.equal(resolveConversationOwnershipState(persisted), "ATLAS");
    assert.equal(await shouldDeliverAutomatedReply(prospect), true);
  });
});

test("cross-tenant interview details send is blocked", async () => {
  const {
    sendNativeInterviewDetailsFreeform
  } = require("../services/communicationService");

  const result = await sendNativeInterviewDetailsFreeform({
    appointmentId: "appt-other-org",
    context: {
      organizationId: OTHER_ORG,
      message: "Should not send",
      findProspectInOrganizationFn: async () => null,
      sendTextMessageFn: async () => {
        throw new Error("must not send across tenants");
      }
    },
    prepared: preparedInterviewDetails()
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "PROSPECT_NOT_FOUND");
});

test("HUMAN composer still requires HUMAN ownership after interview-details send", async () => {
  await withTempWorkflowState(async () => {
    const {
      sendNativeInterviewDetailsFreeform
    } = require("../services/communicationService");
    const {
      sendHumanComposerReply
    } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");

    await sendNativeInterviewDetailsFreeform({
      appointmentId: "appt-composer-gate",
      context: {
        organizationId: TEAM_VISION,
        message: "Interview details sent under ATLAS.",
        findProspectInOrganizationFn: async () => prospectFixture(),
        sendTextMessageFn: async () => ({
          success: true,
          status: "sent_freeform"
        })
      },
      prepared: preparedInterviewDetails()
    });

    await assert.rejects(
      () =>
        sendHumanComposerReply({
          phone: PHONE,
          message: "Freeform should still be blocked",
          userId: NIOVEL,
          organizationId: TEAM_VISION,
          clientRequestId: "req-atlas-still-blocked",
          findProspectFn: async () => prospectFixture(),
          sendFn: async () => {
            throw new Error("human composer must not send under ATLAS");
          }
        }),
      (error) => error.code === "COMPOSER_REQUIRES_HUMAN_OWNERSHIP"
    );
  });
});

test("explicit TAKE OVER still transitions to HUMAN and silences Recruit AI", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation,
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");

    const taken = await takeOverConversation(PHONE, {
      reason: "take_over",
      organizationId: TEAM_VISION,
      prospectId: "prospect-interview-details-1"
    });

    assert.equal(taken.ownershipState, "HUMAN");
    assert.equal(resolveConversationOwnershipState(taken.next), "HUMAN");
    assert.ok(taken.next.humanTakenOverAt);
    assert.equal(taken.next.manualAgentOwnership, true);
    assert.equal(await shouldDeliverAutomatedReply(prospectFixture()), false);
  });
});

test("interview-details path never calls TAKE OVER; custom composer still uses human-reply", () => {
  const service = fs.readFileSync(SERVICE_PATH, "utf8");
  assert.match(service, /sendNativeInterviewDetailsFreeform/);
  assert.match(service, /sourceAction === "resend_interview_details"/);
  assert.match(service, /actor: "ATLAS"/);
  assert.doesNotMatch(service, /takeOverConversation/);

  const composer = fs.readFileSync(COMPOSER_PATH, "utf8");
  assert.match(composer, /sendInterviewDetails/);
  assert.match(composer, /sendVia === "interview_details"/);
  assert.match(composer, /sendHumanConversationReply/);
  assert.doesNotMatch(composer, /takeOverConversation/);
});
