/**
 * BR-203 — persist HUMAN/AGENT WhatsApp Business app echoes for contact-only conversations.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseWhatsAppWebhookPayload } = require("../services/whatsappWebhookParser");
const {
  processHumanWhatsAppOutboundEcho
} = require("../core/whatsappHumanOutboundPipeline");
const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
const {
  evaluatePositiveAtlasLeadProvenance
} = require("../core/atlasInboundAutomationEligibility");
const {
  evaluateAutomationOutboundEligibility,
  OUTBOUND_REASONS
} = require("../core/automationOutboundEligibility");
const { applyMetaDeliveryStatusEvent } = require("../repositories/whatsappOutboundDeliveryRepository");
const { HUMAN_WHATSAPP_BUSINESS_APP_REPLY_INTENT } = require("../core/whatsappConstants");

const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE_ID = "1213865645144311";
const WABA_ID = "1017891724443238";
const CONTACT_PHONE = "+16162916747";
const CANARY_WAMID =
  "wamid.HBgTVVMuMTEwODY3Njg2ODE2MzE2NxUUABEYFDJBNUI4QThGMTI4RjdGOURBRURDAA==";

function smbEchoWebhook({ to = "16162916747", id = CANARY_WAMID, body = "Hola, te escribo", actor } = {}) {
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
                display_phone_number: "13059997338",
                phone_number_id: PHONE_ID
              },
              message_echoes: [
                {
                  from: "13059997338",
                  to,
                  id,
                  timestamp: "1788285994",
                  type: "text",
                  text: { body }
                }
              ]
            }
          }
        ]
      }
    ],
    actor
  };
}

function contactEcho(overrides = {}) {
  const { humanEchoes } = parseWhatsAppWebhookPayload(smbEchoWebhook(overrides));
  const echo = humanEchoes[0];
  if (overrides.actor) {
    echo.actor = overrides.actor;
  }
  return echo;
}

function createContactOnlyHarness(options = {}) {
  const claimStore = new Map();
  const logs = [];
  const deliveries = new Map();
  const takeovers = [];
  const eligibilityWrites = [];

  const deps = {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: ORG,
      ownerUserId: options.ownerUserId ?? null,
      source: "whatsapp_organization_connection"
    }),
    claimWhatsAppHumanEchoCorrelation: async (input) => {
      const key = String(input.correlationId || "");
      if (claimStore.has(key)) {
        return { claimed: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
      }
      claimStore.set(key, input);
      return { claimed: true };
    },
    findProspectInOrganization: async () => options.prospect || null,
    findDeliveryByProviderMessageId: async (wamid) => deliveries.get(String(wamid)) || null,
    findWorkflowEventByCorrelationId: async () => null,
    logConversation: async (data) => {
      logs.push(data);
      return { success: true, log: { id: `log-${logs.length}`, ...data } };
    },
    recordOutboundDelivery: async (record) => {
      if (record.providerMessageId) {
        deliveries.set(String(record.providerMessageId), {
          ...record,
          id: `delivery-${deliveries.size + 1}`,
          provider_message_id: record.providerMessageId,
          meta_delivery_status: "sent",
          sent_at: new Date().toISOString()
        });
      }
      return { success: true };
    },
    takeOverConversation: async (...args) => {
      takeovers.push(args);
      eligibilityWrites.push({ kind: "takeOver", args });
      return { ownershipState: "HUMAN" };
    }
  };

  return { deps, logs, deliveries, claimStore, takeovers, eligibilityWrites };
}

function statusClient(rows) {
  const client = {
    rows,
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
      return Promise.resolve({ data: this.rows, error: null });
    },
    update(patch) {
      const row = this.rows[0];
      if (row) {
        Object.assign(row, patch);
      }
      return {
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: row || null, error: null })
          })
        })
      };
    }
  };
  return client;
}

test("docs: BR-203 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-203 — Persist HUMAN WhatsApp Business App echoes for contact-only conversations/);
  assert.match(rules, /Do not create a prospect/);
});

test("A) contact-only HUMAN echo persists", async () => {
  const { deps, logs, deliveries, takeovers } = createContactOnlyHarness();
  const result = await processHumanWhatsAppOutboundEcho(
    contactEcho({ actor: "HUMAN" }),
    deps
  );

  assert.equal(result.success, true);
  assert.equal(result.contactOnly, true);
  assert.equal(result.prospectId, null);
  assert.equal(result.phone, CONTACT_PHONE);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].intent, HUMAN_WHATSAPP_BUSINESS_APP_REPLY_INTENT);
  assert.equal(logs[0].direction, "outgoing");
  assert.equal(logs[0].pipeline, "CONTACT");
  assert.equal(logs[0].actorOverride, "HUMAN");
  assert.equal(logs[0].providerMessageId, CANARY_WAMID);
  assert.equal(logs[0].organizationId, ORG);
  const delivery = deliveries.get(CANARY_WAMID);
  assert.ok(delivery);
  assert.equal(delivery.status, "sent_native_human");
  assert.equal(delivery.providerMessageId, CANARY_WAMID);
  assert.equal(delivery.metadata.contactOnly, true);
  assert.equal(takeovers.length, 0);
});

test("B) contact-only AGENT echo persists", async () => {
  const { deps, logs, deliveries } = createContactOnlyHarness();
  const result = await processHumanWhatsAppOutboundEcho(
    contactEcho({ actor: "AGENT", id: "wamid.CONTACT.AGENT.1" }),
    deps
  );
  assert.equal(result.success, true);
  assert.equal(result.contactOnly, true);
  assert.equal(logs[0].actorOverride, "AGENT");
  assert.equal(deliveries.get("wamid.CONTACT.AGENT.1").status, "sent_native_human");
});

test("C) ATLAS/SYSTEM contact-only automation still blocked", async () => {
  const { deps, logs, deliveries, claimStore } = createContactOnlyHarness();

  const atlas = await processHumanWhatsAppOutboundEcho(
    contactEcho({ actor: "ATLAS" }),
    deps
  );
  assert.equal(atlas.success, false);
  assert.equal(atlas.error, "AUTOMATED_ACTOR_NOT_ALLOWED");
  assert.equal(logs.length, 0);
  assert.equal(deliveries.size, 0);
  assert.equal(claimStore.size, 0);

  const system = await processHumanWhatsAppOutboundEcho(
    contactEcho({ actor: "SYSTEM", id: "wamid.CONTACT.SYSTEM.1" }),
    deps
  );
  assert.equal(system.error, "AUTOMATED_ACTOR_NOT_ALLOWED");

  const outbound = evaluateAutomationOutboundEligibility({
    prospect: null,
    inboundEvent: { messageType: "text", body: "Hola" },
    actor: "ATLAS"
  });
  assert.equal(outbound.eligible, false);
  assert.equal(outbound.reason, OUTBOUND_REASONS.MISSING_PROSPECT);
  assert.equal(await shouldDeliverAutomatedReply(null), false);
});

test("D) delivery/read status attaches without prospect", async () => {
  const { deps, deliveries } = createContactOnlyHarness();
  await processHumanWhatsAppOutboundEcho(contactEcho({ actor: "HUMAN" }), deps);
  const stored = deliveries.get(CANARY_WAMID);
  assert.equal(stored.metadata.prospectId, null);

  const client = statusClient([
    {
      id: stored.id,
      provider_message_id: CANARY_WAMID,
      meta_delivery_status: "sent",
      sent_at: stored.sent_at
    }
  ]);

  const delivered = await applyMetaDeliveryStatusEvent(
    {
      providerMessageId: CANARY_WAMID,
      status: "delivered",
      timestampIso: "2026-09-01T18:07:00.000Z"
    },
    client
  );
  assert.equal(delivered.success, true);
  assert.equal(client.rows[0].meta_delivery_status, "delivered");

  const read = await applyMetaDeliveryStatusEvent(
    {
      providerMessageId: CANARY_WAMID,
      status: "read",
      timestampIso: "2026-09-01T18:08:00.000Z"
    },
    client
  );
  assert.equal(read.success, true);
  assert.equal(client.rows[0].meta_delivery_status, "read");
});

test("E) existing prospect-backed echo unchanged", async () => {
  const prospect = {
    id: "prospect-1592",
    phone: "+17864261592",
    name: "Christell",
    current_step: "NEW",
    organization_id: ORG,
    city: null,
    state: null
  };
  const { deps, logs, takeovers } = createContactOnlyHarness({ prospect });
  deps.findProspectInOrganization = async (phone) => {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.endsWith("7864261592") ? prospect : null;
  };

  const { humanEchoes } = parseWhatsAppWebhookPayload({
    object: "whatsapp_business_account",
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PHONE_ID },
              message_echoes: [
                {
                  from: "17867528080",
                  to: "17864261592",
                  id: "wamid.HUMAN.ECHO.PROSPECT",
                  timestamp: "1700000100",
                  type: "text",
                  text: { body: "Hola, soy Christell" }
                }
              ]
            }
          }
        ]
      }
    ]
  });

  const result = await processHumanWhatsAppOutboundEcho(humanEchoes[0], deps);
  assert.equal(result.success, true);
  assert.equal(result.contactOnly, false);
  assert.equal(result.prospectId, "prospect-1592");
  assert.equal(logs[0].pipeline, "NEW");
  assert.equal(logs[0].name, "Christell");
  assert.equal(takeovers.length, 1);
});

test("F) no eligibility/provenance mutation", async () => {
  const { deps, takeovers, eligibilityWrites } = createContactOnlyHarness();
  const result = await processHumanWhatsAppOutboundEcho(
    contactEcho({ actor: "HUMAN" }),
    deps
  );
  assert.equal(result.success, true);
  assert.equal(takeovers.length, 0);
  assert.equal(eligibilityWrites.length, 0);
  assert.equal(
    evaluatePositiveAtlasLeadProvenance(
      { phone: CONTACT_PHONE, organization_id: ORG, source: null, entry_method: null },
      {}
    ).eligible,
    false
  );
});

test("G) no duplicate persistence on repeated echo", async () => {
  const { deps, logs, deliveries } = createContactOnlyHarness();
  const echo = contactEcho({ actor: "HUMAN" });
  const first = await processHumanWhatsAppOutboundEcho(echo, deps);
  const second = await processHumanWhatsAppOutboundEcho(echo, deps);
  assert.equal(first.success, true);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(logs.length, 1);
  assert.equal(deliveries.size, 1);
});

test("H) unknown wamid lifecycle remains safe", async () => {
  const client = statusClient([]);
  const result = await applyMetaDeliveryStatusEvent(
    {
      providerMessageId: "wamid.UNKNOWN.NO.ROW",
      status: "delivered",
      timestampIso: "2026-09-01T18:07:00.000Z"
    },
    client
  );
  assert.equal(result.success, true);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "UNKNOWN_WAMID");
});
