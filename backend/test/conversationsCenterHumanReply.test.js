/**
 * Conversations Center — HUMAN composer reply coverage.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OTHER_USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PHONE = "+17865550999";
const TENANT_FEATURES = { conversationsCenterEnabled: true };
const ALLOWED_AUTH = {
  userId: NIOVEL,
  organizationId: TEAM_VISION,
  permissions: ["prospect:communicate"],
  status: "active",
  role: "rvp"
};

const STATE_FILE = path.join(__dirname, "../data/workflowState.json");

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

function prospectFixture() {
  return {
    id: "prospect-human-composer-1",
    phone: PHONE,
    name: "Composer Prospect",
    organization_id: TEAM_VISION,
    owner_user_id: NIOVEL,
    current_step: "QUALIFICATION",
    city: "Miami",
    state: "FL"
  };
}

test("HUMAN owner can send via composer", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      sendHumanComposerReply
    } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");

    await takeOverConversation(PHONE);

    let sendArgs = null;
    const result = await sendHumanComposerReply({
      phone: PHONE,
      message: "Hola desde Human",
      userId: NIOVEL,
      organizationId: TEAM_VISION,
      clientRequestId: "req-human-1",
      tenantFeatures: TENANT_FEATURES,
      authContext: ALLOWED_AUTH,
      findProspectFn: async () => prospectFixture(),
      resolveInboundPhoneNumberIdFn: async () => null,
      sendFn: async (args) => {
        sendArgs = args;
        return {
          success: true,
          status: "sent_freeform",
          providerMessageId: "wamid.1",
          conversationLogId: "log-1",
          simulated: true
        };
      }
    });

    assert.equal(result.success, true);
    assert.equal(result.actor, "HUMAN");
    assert.equal(sendArgs.actor, "HUMAN");
    assert.equal(sendArgs.pipeline, "HUMAN");
    assert.equal(sendArgs.intent, "HUMAN_COMPOSER_REPLY");
    assert.equal(sendArgs.message, "Hola desde Human");
    assert.equal(sendArgs.inboundPhoneNumberId, null);
    assert.match(sendArgs.idempotencyKey, /req-human-1/);
  });
});

test("ATLAS owner cannot use human composer", async () => {
  await withTempWorkflowState(async () => {
    const {
      returnConversationToAtlas
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      sendHumanComposerReply
    } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");

    await returnConversationToAtlas(PHONE);

    await assert.rejects(
      () =>
        sendHumanComposerReply({
          phone: PHONE,
          message: "Should block",
          userId: NIOVEL,
          organizationId: TEAM_VISION,
          clientRequestId: "req-atlas-block",
          tenantFeatures: TENANT_FEATURES,
          authContext: ALLOWED_AUTH,
          findProspectFn: async () => prospectFixture(),
          sendFn: async () => {
            throw new Error("should not send");
          }
        }),
      (error) => error.code === "COMPOSER_REQUIRES_HUMAN_OWNERSHIP"
    );
  });
});

test("non-Niovel user forbidden", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      sendHumanComposerReply
    } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");

    await takeOverConversation(PHONE);

    await assert.rejects(
      () =>
        sendHumanComposerReply({
          phone: PHONE,
          message: "Nope",
          userId: OTHER_USER,
          organizationId: TEAM_VISION,
          clientRequestId: "req-other",
          tenantFeatures: TENANT_FEATURES,
          authContext: {
            userId: OTHER_USER,
            organizationId: TEAM_VISION,
            permissions: [],
            status: "active",
            role: "support"
          },
          findProspectFn: async () => prospectFixture(),
          sendFn: async () => ({ success: true })
        }),
      (error) =>
        error.code === "CONVERSATIONS_CENTER_FORBIDDEN" ||
        error.code === "CONVERSATIONS_CENTER_USER_FORBIDDEN"
    );
  });
});

test("duplicate clientRequestId does not duplicate send (idempotent success)", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      sendHumanComposerReply
    } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");

    await takeOverConversation(PHONE);
    let calls = 0;

    const sendFn = async () => {
      calls += 1;
      return {
        success: true,
        status: calls === 1 ? "sent_freeform" : "duplicate_suppressed",
        providerMessageId: "wamid.dup",
        conversationLogId: "log-dup",
        simulated: true
      };
    };

    const first = await sendHumanComposerReply({
      phone: PHONE,
      message: "Same",
      userId: NIOVEL,
      organizationId: TEAM_VISION,
      clientRequestId: "req-dup-1",
      tenantFeatures: TENANT_FEATURES,
      authContext: ALLOWED_AUTH,
      findProspectFn: async () => prospectFixture(),
      resolveInboundPhoneNumberIdFn: async () => null,
      sendFn
    });
    const second = await sendHumanComposerReply({
      phone: PHONE,
      message: "Same",
      userId: NIOVEL,
      organizationId: TEAM_VISION,
      clientRequestId: "req-dup-1",
      tenantFeatures: TENANT_FEATURES,
      authContext: ALLOWED_AUTH,
      findProspectFn: async () => prospectFixture(),
      resolveInboundPhoneNumberIdFn: async () => null,
      sendFn
    });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.duplicateSuppressed, true);
    assert.equal(calls, 2);
  });
});

test("outside messaging window blocks free-form and does not send template", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      sendHumanComposerReply
    } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");
    const {
      DELIVERY_STATUSES
    } = require("../core/whatsappOutboundAuthorizationGate");

    await takeOverConversation(PHONE);

    await assert.rejects(
      () =>
        sendHumanComposerReply({
          phone: PHONE,
          message: "Outside window",
          userId: NIOVEL,
          organizationId: TEAM_VISION,
          clientRequestId: "req-window",
          tenantFeatures: TENANT_FEATURES,
          authContext: ALLOWED_AUTH,
          resolveInboundPhoneNumberIdFn: async () => null,
          findProspectFn: async () => prospectFixture(),
          sendFn: async (args) => {
            assert.equal(args.templateKey, undefined);
            return {
              success: false,
              status: DELIVERY_STATUSES.BLOCKED_TEMPLATE_MISSING,
              error: "WINDOW_CLOSED",
              delivery: {
                status: DELIVERY_STATUSES.BLOCKED_TEMPLATE_MISSING,
                reason: "WINDOW_CLOSED",
                windowClosed: true,
                window: { open: false }
              }
            };
          }
        }),
      (error) => error.code === "WHATSAPP_TEMPLATE_REQUIRED_OUTSIDE_WINDOW"
    );
  });
});

test("send failure surfaces safely", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      sendHumanComposerReply
    } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");

    await takeOverConversation(PHONE);

    await assert.rejects(
      () =>
        sendHumanComposerReply({
          phone: PHONE,
          message: "fail please",
          userId: NIOVEL,
          organizationId: TEAM_VISION,
          clientRequestId: "req-fail",
          tenantFeatures: TENANT_FEATURES,
          authContext: ALLOWED_AUTH,
          resolveInboundPhoneNumberIdFn: async () => null,
          findProspectFn: async () => prospectFixture(),
          sendFn: async () => ({
            success: false,
            status: "provider_failed",
            error: "Graph API down",
            retryable: true
          })
        }),
      (error) =>
        error.code === "HUMAN_REPLY_SEND_FAILED" &&
        error.message.includes("Graph API")
    );
  });
});

test("HUMAN attribution maps in Communications Center read model", () => {
  const { mapConversationLog } = require("../core/communicationsCenterReadModel");
  const item = mapConversationLog(
    {
      id: "1",
      message: "Hola humano",
      direction: "outgoing",
      pipeline: "HUMAN",
      intent: "HUMAN_COMPOSER_REPLY",
      created_at: "2026-08-10T12:00:00.000Z"
    },
    { timezone: "America/New_York", prospectDisplayName: "Prospect" }
  );
  assert.equal(item.actor.type, "agent");
  assert.equal(item.actor.displayName, "Human");
  assert.equal(item.direction, "outbound");
  assert.ok(item.flags.includes("human_reply"));
  assert.equal(item.content.text, "Hola humano");
});

test("Atlas auto-reply remains suppressed after human send ownership", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const {
      sendHumanComposerReply
    } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");

    await takeOverConversation(PHONE);
    await sendHumanComposerReply({
      phone: PHONE,
      message: "Human spoke",
      userId: NIOVEL,
      organizationId: TEAM_VISION,
      clientRequestId: "req-silence",
      tenantFeatures: TENANT_FEATURES,
      authContext: ALLOWED_AUTH,
      resolveInboundPhoneNumberIdFn: async () => null,
      findProspectFn: async () => prospectFixture(),
      sendFn: async () => ({
        success: true,
        status: "sent_freeform",
        providerMessageId: "wamid.s",
        conversationLogId: "log-s"
      })
    });

    assert.equal(
      await shouldDeliverAutomatedReply({ phone: PHONE, current_step: "QUALIFICATION" }),
      false
    );
  });
});

test("execution flags remain OFF", () => {
  const {
    isExecutionEnabled
  } = require("../core/recruitAiV2/sideEffectAuthorizer");
  const {
    isLiveExecutionPathEnabled
  } = require("../core/recruitAiV2/liveExecutionPathConfig");
  assert.equal(isExecutionEnabled(process.env), false);
  assert.equal(isLiveExecutionPathEnabled(process.env), false);
});
