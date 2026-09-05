/**
 * Native WhatsApp Business app outbound sync (smb_message_echoes) + ownership.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseWhatsAppWebhookPayload } = require("../services/whatsappWebhookParser");
const {
  processHumanWhatsAppOutboundEcho,
  isAtlasOriginatedOutbound
} = require("../core/whatsappHumanOutboundPipeline");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
const { takeOverConversation, returnConversationToAtlas } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
const { CONVERSATION_OWNERSHIP_STATE, HANDOFF_REASONS } = require("../core/conversationsCenter/constants");
const { applyMetaDeliveryStatusEvent } = require("../repositories/whatsappOutboundDeliveryRepository");
const { WHATSAPP_CORRELATION_PREFIX } = require("../core/whatsappConstants");
const {
  createMemoryWhatsAppInboundClaimStore
} = require("../core/whatsappInboundClaim");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const PHONE_ID = "1347188398469744";
const WABA_ID = "123456789012345";
const PROSPECT_PHONE = "+17864261592";
const USER_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function smbEchoWebhook(overrides = {}) {
  const echo = {
    from: "17867528080",
    to: "17864261592",
    id: "wamid.HUMAN.ECHO.1",
    timestamp: "1700000100",
    type: "text",
    text: { body: "Hola, soy Christell" },
    ...overrides.echo
  };

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "17867528080",
                phone_number_id: PHONE_ID
              },
              message_echoes: [echo],
              ...(overrides.value || {})
            }
          }
        ]
      }
    ]
  };
}

function normalizedEcho(overrides = {}) {
  const { humanEchoes } = parseWhatsAppWebhookPayload(smbEchoWebhook(overrides));
  return humanEchoes[0];
}

function createEchoHarness(options = {}) {
  const claimStore = new Map();
  const logs = [];
  const deliveries = new Map();
  const workflowEvents = new Map();
  const organizationId = options.organizationId || ORG_A;
  const ownerUserId = options.ownerUserId ?? null;

  const prospect = {
    id: options.prospectId || "prospect-1592",
    phone: PROSPECT_PHONE,
    name: "Christell",
    current_step: "NEW",
    organization_id: organizationId,
    city: null,
    state: null,
    ...(options.prospect || {})
  };

  const deps = {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId,
      ownerUserId,
      source: ownerUserId ? "whatsapp_personal_connection" : "whatsapp_organization_connection"
    }),
    claimWhatsAppHumanEchoCorrelation: async (input) => {
      const key = String(input.correlationId || "");
      if (claimStore.has(key)) {
        return { claimed: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
      }
      claimStore.set(key, input);
      return { claimed: true };
    },
    findProspectInOrganization: async (phone, orgId) => {
      if (orgId !== organizationId) {
        return null;
      }
      const digits = String(phone || "").replace(/\D/g, "");
      if (digits.endsWith("7864261592")) {
        return prospect;
      }
      return null;
    },
    findDeliveryByProviderMessageId: async (wamid) => deliveries.get(String(wamid)) || null,
    findWorkflowEventByCorrelationId: async (correlationId) =>
      workflowEvents.get(String(correlationId)) || null,
    logConversation: async (data) => {
      logs.push(data);
      return {
        success: true,
        log: {
          id: `log-${logs.length}`,
          ...data
        }
      };
    },
    recordOutboundDelivery: async (record) => {
      if (record.providerMessageId) {
        deliveries.set(String(record.providerMessageId), {
          ...record,
          id: `delivery-${deliveries.size + 1}`,
          meta_delivery_status: "sent",
          sent_at: new Date().toISOString()
        });
      }
      return { success: true };
    },
    takeOverConversation: options.takeOverConversation || takeOverConversation
  };

  return { deps, logs, deliveries, claimStore, prospect, workflowEvents };
}

test("1. parser: prospect inbound messages[] still parse as inbound only", () => {
  const body = {
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: PHONE_ID },
              contacts: [{ profile: { name: "Prospect" } }],
              messages: [
                {
                  from: "17864261592",
                  id: "wamid.INBOUND.1",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "Hola" }
                }
              ]
            }
          }
        ]
      }
    ]
  };

  const { messages, humanEchoes } = parseWhatsAppWebhookPayload(body);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].phone, "17864261592");
  assert.equal(humanEchoes.length, 0);
});

test("2. parser: smb_message_echoes normalize native human outbound", () => {
  const echo = normalizedEcho();
  assert.equal(echo.providerMessageId, "wamid.HUMAN.ECHO.1");
  assert.equal(echo.phone, "17864261592");
  assert.equal(echo.body, "Hola, soy Christell");
  assert.equal(echo.phoneNumberId, PHONE_ID);
  assert.equal(echo.changeField, "smb_message_echoes");
});

test("3. Atlas AI outbound wamid deduped — no Human row", async () => {
  const { deps, logs } = createEchoHarness();
  deps.findDeliveryByProviderMessageId = async () => ({
    id: "delivery-atlas",
    provider_message_id: "wamid.HUMAN.ECHO.1",
    status: "sent_freeform"
  });

  const result = await processHumanWhatsAppOutboundEcho(normalizedEcho(), deps);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "ATLAS_ORIGINATED_OUTBOUND");
  assert.equal(logs.length, 0);
});

test("4. native WhatsApp Business human outbound persists one Human message", async () => {
  const { deps, logs } = createEchoHarness();
  const result = await processHumanWhatsAppOutboundEcho(normalizedEcho(), deps);

  assert.equal(result.success, true);
  assert.equal(result.skipped, false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].intent, "HUMAN_WHATSAPP_BUSINESS_APP_REPLY");
  assert.equal(logs[0].direction, "outgoing");
  assert.equal(logs[0].actorOverride, "AGENT");
  assert.equal(logs[0].message, "Hola, soy Christell");
  assert.equal(logs[0].organizationId, ORG_A);
});

test("5. human outbound switches ownership ATLAS → HUMAN (sticky seal)", async () => {
  const { deps, prospect } = createEchoHarness();
  const result = await processHumanWhatsAppOutboundEcho(normalizedEcho(), deps);

  assert.equal(result.ownership.ownershipState, CONVERSATION_OWNERSHIP_STATE.HUMAN);
  assert.equal(result.ownership.next.manualAgentOwnership, true);
  assert.ok(result.ownership.next.humanTakenOverAt);
  assert.equal(result.ownership.next.handoffReason, HANDOFF_REASONS.WHATSAPP_BUSINESS_APP);

  const canAutoReply = await shouldDeliverAutomatedReply(prospect);
  assert.equal(canAutoReply, false);
});

test("6. duplicate provider message id → no duplicate row", async () => {
  const { deps, logs } = createEchoHarness();
  const echo = normalizedEcho();

  const first = await processHumanWhatsAppOutboundEcho(echo, deps);
  const second = await processHumanWhatsAppOutboundEcho(echo, deps);

  assert.equal(first.success, true);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(logs.length, 1);
});

test("7. wrong tenant phone_number_id fails closed", async () => {
  const { WhatsAppInboundOrganizationError } = require("../core/whatsappInboundOrganizationResolver");
  const deps = createEchoHarness({ organizationId: ORG_A }).deps;
  deps.resolveWhatsAppInboundOrganizationId = async () => {
    throw new WhatsAppInboundOrganizationError("asset mismatch", {
      code: "WHATSAPP_PHONE_ASSET_MISMATCH"
    });
  };

  const result = await processHumanWhatsAppOutboundEcho(normalizedEcho(), deps);
  assert.equal(result.success, false);
  assert.equal(result.error, "WHATSAPP_PHONE_ASSET_MISMATCH");
});

test("8. personal WhatsApp user-owned integration resolves ownerUserId", async () => {
  const { deps } = createEchoHarness({ ownerUserId: USER_ID });
  const result = await processHumanWhatsAppOutboundEcho(normalizedEcho(), deps);
  assert.equal(result.ownerUserId, USER_ID);
  assert.equal(result.organizationId, ORG_A);
});

test("9. org-owned WhatsApp routes to organization prospect scope", async () => {
  const { deps } = createEchoHarness({ ownerUserId: null, organizationId: ORG_B });
  deps.findProspectInOrganization = async (phone, orgId) => {
    assert.equal(orgId, ORG_B);
    if (String(phone).includes("7864261592")) {
      return {
        id: "prospect-org-b",
        phone: PROSPECT_PHONE,
        name: "Christell",
        current_step: "NEW",
        organization_id: ORG_B
      };
    }
    return null;
  };

  const result = await processHumanWhatsAppOutboundEcho(normalizedEcho(), deps);
  assert.equal(result.organizationId, ORG_B);
  assert.equal(result.prospectId, "prospect-org-b");
});

test("10. delivery/read lifecycle updates attach to Human outbound", async () => {
  const client = {
    rows: [],
    from() {
      return this;
    },
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve({
        data: this.rows,
        error: null
      });
    },
    update(patch) {
      const row = this.rows[0];
      Object.assign(row, patch);
      return {
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: row,
                error: null
              })
          })
        })
      };
    }
  };

  client.rows.push({
    id: "delivery-human-1",
    provider_message_id: "wamid.HUMAN.ECHO.1",
    meta_delivery_status: "sent",
    sent_at: "2026-01-01T00:00:00.000Z"
  });

  const delivered = await applyMetaDeliveryStatusEvent(
    {
      providerMessageId: "wamid.HUMAN.ECHO.1",
      status: "delivered",
      timestampIso: "2026-01-01T00:00:05.000Z"
    },
    client
  );

  assert.equal(delivered.success, true);
  assert.equal(client.rows[0].meta_delivery_status, "delivered");
  assert.ok(client.rows[0].delivered_at);
});

test("11. explicit TAKE OVER / return flow remains compatible", async () => {
  const phone = "+17865550999";
  const scope = { organizationId: ORG_A, prospectId: "p-return" };

  const taken = await takeOverConversation(phone, {
    ...scope,
    reason: HANDOFF_REASONS.TAKE_OVER
  });
  assert.equal(taken.ownershipState, CONVERSATION_OWNERSHIP_STATE.HUMAN);

  const returned = await returnConversationToAtlas(phone, scope);
  assert.equal(returned.ownershipState, CONVERSATION_OWNERSHIP_STATE.ATLAS);
  assert.equal(returned.next.manualAgentOwnership, false);
  assert.equal(returned.next.humanTakenOverAt, null);
});

test("12. isAtlasOriginatedOutbound checks delivery row and outbound workflow correlation", async () => {
  const atlas = await isAtlasOriginatedOutbound("wamid.ATLAS.1", {
    findDeliveryByProviderMessageId: async () => ({
      id: "d1",
      status: "sent_freeform"
    }),
    findWorkflowEventByCorrelationId: async () => null
  });
  assert.equal(atlas, true);

  const humanEchoDelivery = await isAtlasOriginatedOutbound("wamid.HUMAN.1", {
    findDeliveryByProviderMessageId: async () => ({
      id: "d2",
      status: "sent_native_human"
    }),
    findWorkflowEventByCorrelationId: async () => null
  });
  assert.equal(humanEchoDelivery, false);

  const workflowOnly = await isAtlasOriginatedOutbound("wamid.ATLAS.2", {
    findDeliveryByProviderMessageId: async () => null,
    findWorkflowEventByCorrelationId: async (id) =>
      id === `${WHATSAPP_CORRELATION_PREFIX.OUTBOUND}wamid.ATLAS.2` ? { id: "evt" } : null
  });
  assert.equal(workflowOnly, true);

  const external = await isAtlasOriginatedOutbound("wamid.HUMAN.ONLY", {
    findDeliveryByProviderMessageId: async () => null,
    findWorkflowEventByCorrelationId: async () => null
  });
  assert.equal(external, false);
});

test("13. inbound prospect path unchanged (smoke)", async () => {
  const claimStore = createMemoryWhatsAppInboundClaimStore();
  const deps = {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: ORG_A,
      source: "explicit"
    }),
    claimWhatsAppInboundCorrelation: (input) => claimStore.claim(input),
    locateOrCreateWhatsAppProspect: async () => ({
      prospect: {
        id: "p-in",
        phone: PROSPECT_PHONE,
        name: "Christell",
        current_step: "NEW",
        organization_id: ORG_A
      },
      created: false,
      storagePhone: PROSPECT_PHONE,
      organizationId: ORG_A
    }),
    logConversation: async (data) => ({
      success: true,
      log: { id: "log-in", direction: data.direction, intent: data.intent }
    }),
    processConversationAfterInbound: async () => ({
      success: true,
      replied: false,
      reason: "ATLAS_AUTOMATION_NOT_ELIGIBLE"
    })
  };

  const result = await processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.INBOUND.SMOKE",
      phone: PROSPECT_PHONE,
      contactName: "Christell",
      body: "Hola",
      phoneNumberId: PHONE_ID,
      wabaId: WABA_ID
    },
    deps
  );

  assert.equal(result.success, true);
});

test("14. webhook route wires human echo processor", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../routes/webhook.js"),
    "utf8"
  );
  assert.match(src, /processHumanWhatsAppOutboundEcho/);
  assert.match(src, /humanEchoes/);
});

test("15. Meta smb_message_echoes field documented in parser", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../services/whatsappWebhookParser.js"),
    "utf8"
  );
  assert.match(src, /message_echoes/);
  assert.match(src, /smb_message_echoes/);
});

test("16. native human echo appears in Communications Center transcript", async () => {
  const {
    buildCommunicationsCenterTimeline,
    mapConversationLog
  } = require("../core/communicationsCenterReadModel");
  const {
    isConversationBubbleItem
  } = require("../../frontend/src/engines/communicationsCenterViewModel.js");

  const logId = "log-human-echo-1";
  const body = "Prefieres en la mañana o en la tarde?";

  const legacyItem = mapConversationLog(
    {
      id: logId,
      message: body,
      direction: "outgoing",
      intent: "AGENT_ACTION",
      pipeline: "NEW",
      created_at: "2026-08-23T01:19:23.102Z"
    },
    {
      timezone: "America/New_York",
      prospectDisplayName: "Tania",
      nativeHumanLogIds: new Set([logId])
    }
  );

  assert.equal(legacyItem.eventType, "message.outbound.human");
  assert.equal(legacyItem.actor.displayName, "Human");
  assert.equal(legacyItem.content.text, body);
  assert.ok(legacyItem.flags.includes("human_reply"));
  assert.equal(isConversationBubbleItem(legacyItem), true);

  const timeline = await buildCommunicationsCenterTimeline({
    prospectId: "prospect-tania",
    organizationId: ORG_A,
    prospectDisplayName: "Tania",
    authorizedPhones: ["+14074197828"],
    phoneFallbackAllowed: true,
    loaders: {
      loadConversationLogs: async () => [
        {
          id: logId,
          prospect_phone: "+14074197828",
          organization_id: ORG_A,
          direction: "outgoing",
          message: body,
          intent: "AGENT_ACTION",
          pipeline: "NEW",
          created_at: "2026-08-23T01:19:23.102Z"
        }
      ],
      loadOutboundDeliveries: async () => [
        {
          id: "delivery-human",
          conversation_log_id: logId,
          status: "sent_native_human",
          provider_message_id: "wamid.HUMAN.ECHO.1",
          organization_id: ORG_A,
          prospect_phone: "+14074197828",
          created_at: "2026-08-23T01:19:24.473Z",
          intent: "WHATSAPP_BUSINESS_APP_OUTBOUND"
        }
      ],
      loadWorkflowEvents: async () => [
        {
          id: "wf-human",
          event_type: "MessageSent",
          actor: "AGENT",
          prospect_phone: "+14074197828",
          payload: {
            conversationLogId: logId,
            bodyPreview: body
          },
          created_at: "2026-08-23T01:19:22.774Z"
        }
      ],
      loadAppointments: async () => [],
      loadBusinessEvents: async () => ({ rows: [], gap: null }),
      loadTimelineEntries: async () => ({ rows: [], gap: null }),
      loadCommunicationMedia: async () => []
    }
  });

  const humanBubbles = timeline.items.filter(
    (item) =>
      item.eventType === "message.outbound.human" &&
      isConversationBubbleItem(item)
  );
  assert.equal(humanBubbles.length, 1);
  assert.equal(humanBubbles[0].content.text, body);
  assert.equal(
    timeline.items.filter((item) => item.eventType === "message.outbound").length,
    0
  );
});

test("17. new native human echo intent maps without delivery linkage", () => {
  const { mapConversationLog } = require("../core/communicationsCenterReadModel");
  const { HUMAN_WHATSAPP_BUSINESS_APP_REPLY_INTENT } = require("../core/whatsappConstants");
  const item = mapConversationLog(
    {
      id: "log-new-human",
      message: "Hola desde la app",
      direction: "outgoing",
      intent: HUMAN_WHATSAPP_BUSINESS_APP_REPLY_INTENT,
      pipeline: "NEW",
      created_at: "2026-08-23T02:00:00.000Z"
    },
    { timezone: "America/New_York", prospectDisplayName: "Prospect" }
  );

  assert.equal(item.eventType, "message.outbound.human");
  assert.equal(item.actor.displayName, "Human");
  assert.ok(item.flags.includes("human_reply"));
});
