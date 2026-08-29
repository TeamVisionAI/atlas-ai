/**
 * Human composer must reply from the same WhatsApp asset that received inbound.
 * Implements BR-165 — inbound-authoritative routing. No named-user special cases.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveLastInboundWhatsAppPhoneNumberId
} = require("../core/whatsappLastInboundAsset");
const { resolveWhatsAppSendCredentials } = require("../core/whatsappSendCredentials");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "11111111-1111-4111-8111-111111111111";
const OWNER_USER = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PERSONAL_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHONE = "+17865550111";
const PERSONAL_PHONE_NUMBER_ID = "pnid-personal-channel-001";
const ORG_PHONE_NUMBER_ID = "pnid-org-channel-8080";
const ORG_WABA = "waba-org-channel-8080";
const PERSONAL_TOKEN = "personal-channel-token";
const ORG_TOKEN = "org-channel-token";
const ENV_TOKEN = "env-channel-token";
const TENANT_FEATURES = { conversationsCenterEnabled: true };
const ALLOWED_AUTH = {
  userId: OWNER_USER,
  organizationId: TEAM_VISION,
  permissions: ["prospect:communicate"],
  status: "active",
  role: "rvp"
};

const MEMORY_WORKFLOW = { backend: "memory" };

async function withEnv(overrides, run) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function prospectFixture() {
  return {
    id: "prospect-composer-asset-1",
    phone: PHONE,
    name: "Composer Asset Prospect",
    organization_id: TEAM_VISION,
    owner_user_id: OWNER_USER,
    current_step: "QUALIFICATION",
    city: "Miami",
    state: "FL"
  };
}

function inboundRow(overrides = {}) {
  return {
    organization_id: TEAM_VISION,
    prospect_id: "prospect-composer-asset-1",
    prospect_phone: PHONE,
    phone_number_id: PERSONAL_PHONE_NUMBER_ID,
    received_at: "2026-08-29T16:14:45.000Z",
    ...overrides
  };
}

function dualConnectionRepo() {
  const personalRow = {
    organization_id: TEAM_VISION,
    user_id: PERSONAL_USER,
    status: "connected",
    phone_number_id: PERSONAL_PHONE_NUMBER_ID,
    waba_id: "waba-personal-channel",
    access_token_encrypted: "enc:v1:personal"
  };
  const orgRow = {
    organization_id: TEAM_VISION,
    user_id: null,
    status: "connected",
    phone_number_id: ORG_PHONE_NUMBER_ID,
    waba_id: ORG_WABA,
    access_token_encrypted: "enc:v1:org"
  };

  return {
    async getConnection() {
      return structuredClone(orgRow);
    },
    async findConnectionByPhoneNumberId(phoneNumberId) {
      if (String(phoneNumberId) === PERSONAL_PHONE_NUMBER_ID) {
        return structuredClone(personalRow);
      }
      if (String(phoneNumberId) === ORG_PHONE_NUMBER_ID) {
        return structuredClone(orgRow);
      }
      return null;
    },
    async getDecryptedAccessToken(_organizationId, userId = null) {
      if (userId && String(userId) === PERSONAL_USER) {
        return PERSONAL_TOKEN;
      }
      return ORG_TOKEN;
    }
  };
}

async function sendComposerWithInbound(inboundPhoneNumberId) {
  const {
    takeOverConversation
  } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
  const {
    sendHumanComposerReply
  } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");

  await takeOverConversation(PHONE, MEMORY_WORKFLOW);

  let sendArgs = null;
  let sendCalls = 0;

  const result = await sendHumanComposerReply({
    phone: PHONE,
    message: "Human reply from composer",
    userId: OWNER_USER,
    organizationId: TEAM_VISION,
    clientRequestId: `req-asset-${inboundPhoneNumberId || "none"}`,
    tenantFeatures: TENANT_FEATURES,
    authContext: ALLOWED_AUTH,
    workflowStateOptions: MEMORY_WORKFLOW,
    findProspectFn: async () => prospectFixture(),
    resolveInboundPhoneNumberIdFn: async () => inboundPhoneNumberId || null,
    sendFn: async (args) => {
      sendCalls += 1;
      sendArgs = args;
      return {
        success: true,
        status: "sent_freeform",
        providerMessageId: "wamid.asset-1",
        conversationLogId: "log-asset-1",
        outboundPhoneNumberId: args.inboundPhoneNumberId || ORG_PHONE_NUMBER_ID,
        simulated: true
      };
    }
  });

  return { result, sendArgs, sendCalls };
}

test("resolver uses most recent tenant-scoped inbound phone_number_id", async () => {
  const resolved = await resolveLastInboundWhatsAppPhoneNumberId({
    organizationId: TEAM_VISION,
    prospectId: "prospect-composer-asset-1",
    prospectPhone: PHONE,
    findLatestInboundSnapshots: async (filters) => {
      assert.equal(filters.organizationId, TEAM_VISION);
      assert.equal(filters.prospectId, "prospect-composer-asset-1");
      return [
        inboundRow({ phone_number_id: PERSONAL_PHONE_NUMBER_ID }),
        inboundRow({
          phone_number_id: ORG_PHONE_NUMBER_ID,
          received_at: "2026-08-28T16:14:45.000Z"
        })
      ];
    }
  });

  assert.equal(resolved, PERSONAL_PHONE_NUMBER_ID);
});

test("resolver ignores inbound from another tenant", async () => {
  const resolved = await resolveLastInboundWhatsAppPhoneNumberId({
    organizationId: TEAM_VISION,
    prospectId: "prospect-composer-asset-1",
    prospectPhone: PHONE,
    findLatestInboundSnapshots: async () => [
      inboundRow({
        organization_id: OTHER_ORG,
        phone_number_id: PERSONAL_PHONE_NUMBER_ID
      })
    ]
  });

  assert.equal(resolved, null);
});

test("resolver fail-soft returns null when lookup throws", async () => {
  const resolved = await resolveLastInboundWhatsAppPhoneNumberId({
    organizationId: TEAM_VISION,
    prospectId: "prospect-composer-asset-1",
    prospectPhone: PHONE,
    findLatestInboundSnapshots: async () => {
      throw new Error("TABLE_UNAVAILABLE");
    }
  });

  assert.equal(resolved, null);
});

test("human reply to personal-channel inbound uses that personal phone_number_id", async () => {
  const { result, sendArgs, sendCalls } = await sendComposerWithInbound(
    PERSONAL_PHONE_NUMBER_ID
  );

  assert.equal(result.success, true);
  assert.equal(sendCalls, 1);
  assert.equal(sendArgs.inboundPhoneNumberId, PERSONAL_PHONE_NUMBER_ID);
  assert.equal(result.inboundPhoneNumberId, PERSONAL_PHONE_NUMBER_ID);
  assert.equal(result.outboundPhoneNumberId, PERSONAL_PHONE_NUMBER_ID);

  const credentials = await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ORG_PHONE_NUMBER_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ORG_WABA
    },
    () =>
      resolveWhatsAppSendCredentials(TEAM_VISION, {
        connectionRepository: dualConnectionRepo(),
        phoneNumberId: sendArgs.inboundPhoneNumberId
      })
  );

  assert.equal(credentials.phoneNumberId, PERSONAL_PHONE_NUMBER_ID);
  assert.equal(credentials.accessToken, PERSONAL_TOKEN);
});

test("human reply to org-channel inbound uses that org asset", async () => {
  const { result, sendArgs, sendCalls } = await sendComposerWithInbound(
    ORG_PHONE_NUMBER_ID
  );

  assert.equal(result.success, true);
  assert.equal(sendCalls, 1);
  assert.equal(sendArgs.inboundPhoneNumberId, ORG_PHONE_NUMBER_ID);
  assert.equal(result.inboundPhoneNumberId, ORG_PHONE_NUMBER_ID);

  const credentials = await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ORG_PHONE_NUMBER_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ORG_WABA
    },
    () =>
      resolveWhatsAppSendCredentials(TEAM_VISION, {
        connectionRepository: dualConnectionRepo(),
        phoneNumberId: sendArgs.inboundPhoneNumberId
      })
  );

  assert.equal(credentials.phoneNumberId, ORG_PHONE_NUMBER_ID);
  assert.equal(credentials.accessToken, ORG_TOKEN);
});

test("no known inbound asset keeps existing org/env fallback", async () => {
  const { result, sendArgs, sendCalls } = await sendComposerWithInbound(null);

  assert.equal(result.success, true);
  assert.equal(sendCalls, 1);
  assert.equal(sendArgs.inboundPhoneNumberId, null);

  const credentials = await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ORG_PHONE_NUMBER_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ORG_WABA
    },
    () =>
      resolveWhatsAppSendCredentials(TEAM_VISION, {
        connectionRepository: dualConnectionRepo(),
        phoneNumberId: sendArgs.inboundPhoneNumberId
      })
  );

  assert.equal(credentials.phoneNumberId, ORG_PHONE_NUMBER_ID);
  assert.equal(credentials.accessToken, ORG_TOKEN);
});

test("wrong-asset 131047 path is reproduced without inbound id and prevented with it", async () => {
  await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ORG_PHONE_NUMBER_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ORG_WABA
    },
    async () => {
      const repo = dualConnectionRepo();

      const wrongAsset = await resolveWhatsAppSendCredentials(TEAM_VISION, {
        connectionRepository: repo,
        phoneNumberId: null
      });
      assert.equal(
        wrongAsset.phoneNumberId,
        ORG_PHONE_NUMBER_ID,
        "omitting inboundPhoneNumberId sends from the org asset (Meta 131047 when the 24h session is on the personal asset)"
      );
      assert.equal(wrongAsset.accessToken, ORG_TOKEN);
      assert.notEqual(wrongAsset.phoneNumberId, PERSONAL_PHONE_NUMBER_ID);

      const { sendArgs, sendCalls } = await sendComposerWithInbound(
        PERSONAL_PHONE_NUMBER_ID
      );

      assert.equal(sendCalls, 1);
      assert.equal(sendArgs.inboundPhoneNumberId, PERSONAL_PHONE_NUMBER_ID);
      assert.notEqual(sendArgs.inboundPhoneNumberId, ORG_PHONE_NUMBER_ID);

      const routed = await resolveWhatsAppSendCredentials(TEAM_VISION, {
        connectionRepository: repo,
        phoneNumberId: sendArgs.inboundPhoneNumberId
      });

      assert.equal(routed.phoneNumberId, PERSONAL_PHONE_NUMBER_ID);
      assert.equal(routed.accessToken, PERSONAL_TOKEN);
      assert.notEqual(routed.phoneNumberId, wrongAsset.phoneNumberId);
    }
  );
});

test("human composer still requires HUMAN ownership after asset routing", async () => {
  const {
    returnConversationToAtlas
  } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
  const {
    sendHumanComposerReply
  } = require("../core/conversationsCenter/conversationsCenterHumanReplyService");

  await returnConversationToAtlas(PHONE, MEMORY_WORKFLOW);

  await assert.rejects(
    () =>
      sendHumanComposerReply({
        phone: PHONE,
        message: "Should block",
        userId: OWNER_USER,
        organizationId: TEAM_VISION,
        clientRequestId: "req-atlas-asset-block",
        tenantFeatures: TENANT_FEATURES,
        authContext: ALLOWED_AUTH,
        workflowStateOptions: MEMORY_WORKFLOW,
        findProspectFn: async () => prospectFixture(),
        resolveInboundPhoneNumberIdFn: async () => PERSONAL_PHONE_NUMBER_ID,
        sendFn: async () => {
          throw new Error("should not send");
        }
      }),
    (error) => error.code === "COMPOSER_REQUIRES_HUMAN_OWNERSHIP"
  );
});
