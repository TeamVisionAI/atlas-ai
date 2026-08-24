/**
 * WhatsApp username / BSUID sender identity compatibility.
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseWhatsAppWebhookPayload
} = require("../services/whatsappWebhookParser");
const {
  extractWhatsAppSenderIdentity,
  buildWhatsAppStorageKey,
  isSyntheticWhatsAppStorageKey,
  mergeWhatsAppSenderIdentityOntoProspect,
  resolveMetaWhatsAppRecipient,
  formatProspectWhatsAppDisplayIdentity
} = require("../core/whatsappSenderIdentity");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
const {
  createMemoryWhatsAppInboundClaimStore
} = require("../core/whatsappInboundClaim");
const { formatProspectWhatsAppDisplayIdentity: formatFromReadModel } = require("../core/whatsappSenderIdentity");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const PHONE_ID = "1347188398469744";
const BSUID = "CC.A7K4BSUID1234567890";
const USERNAME = "paid_ad_lead";

const RECRUITING_MATCH = {
  matched: true,
  purpose: "RECRUITING",
  recruitingEligible: true,
  code: "TVR-0826-A7K4",
  campaignId: "camp-1"
};

function e164Webhook(phone = "+17865550111") {
  const digits = phone.replace(/\D/g, "");
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123456789012345",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PHONE_ID },
              contacts: [{ profile: { name: "Phone Lead" }, wa_id: digits }],
              messages: [
                {
                  from: digits,
                  id: "wamid.PHONE1",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "Hola" }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };
}

function bsuidWebhook({
  body = `¡Hola! Quiero más información. ${RECRUITING_MATCH.code}`,
  providerMessageId = "wamid.BSUID1"
} = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123456789012345",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PHONE_ID },
              contacts: [
                {
                  profile: { name: "Paid Ad Lead" },
                  user_id: BSUID,
                  username: USERNAME
                }
              ],
              messages: [
                {
                  from: BSUID,
                  id: providerMessageId,
                  timestamp: "1700000001",
                  type: "text",
                  text: { body },
                  referral: {
                    source_type: "ad",
                    ctwa_clid: "ctwa.test.clid"
                  }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };
}

function createHarness({ organizationId = ORG_A, campaignIntakeMatch = null } = {}) {
  const claimStore = createMemoryWhatsAppInboundClaimStore();
  const prospects = new Map();
  const logs = [];

  const deps = {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId,
      source: "explicit"
    }),
    claimWhatsAppInboundCorrelation: (input) => claimStore.claim(input),
    campaignIntakeAttributionService: {
      lookupInboundMatch: async ({ messageBody }) =>
        String(messageBody || "").includes(RECRUITING_MATCH.code)
          ? campaignIntakeMatch || RECRUITING_MATCH
          : null,
      establishInboundAttribution: async () => ({ success: true })
    },
    locateOrCreateWhatsAppProspect: async ({
      phone,
      name,
      firstMessage,
      organizationId: orgId,
      senderIdentity,
      campaignIntakeMatch: inboundMatch
    }) => {
      const match =
        inboundMatch ||
        (String(firstMessage || "").includes(RECRUITING_MATCH.code)
          ? campaignIntakeMatch || RECRUITING_MATCH
          : null);
      const key = `${orgId}:${senderIdentity?.whatsappSenderId || phone}`;
      let prospect = [...prospects.values()].find(
        (row) =>
          row.organization_id === orgId &&
          (row.whatsapp_sender_id === senderIdentity?.whatsappSenderId ||
            row.phone === phone)
      );
      const created = !prospect;
      if (!prospect) {
        prospect = {
          id: `prospect-${prospects.size + 1}`,
          phone,
          normalized_phone: senderIdentity?.phoneE164
            ? phone.replace(/\D/g, "")
            : null,
          whatsapp_sender_id: senderIdentity?.whatsappSenderId || null,
          whatsapp_username: senderIdentity?.whatsappUsername || null,
          name: name || "Unknown",
          organization_id: orgId,
          current_step: "NEW"
        };
        prospects.set(key, prospect);
      } else {
        Object.assign(
          prospect,
          mergeWhatsAppSenderIdentityOntoProspect(prospect, senderIdentity || {})
        );
      }
      return {
        prospect,
        created,
        storagePhone: prospect.phone,
        organizationId: orgId,
        campaignIntakeMatch: match?.matched ? match : null
      };
    },
    logConversation: async ({ message, phone }) => {
      logs.push({ phone, message });
      return { success: true, log: { id: `log-${logs.length}` } };
    },
    processConversationAfterInbound: async () => ({
      success: true,
      replied: true,
      delivery: { success: true }
    }),
    prospectHasDeliveredAutomatedOutbound: async () => false,
    prospectHasAutomatedOutboundReply: async () => false,
    disableFirstReplyRecovery: true,
    scheduleInboundBurstAggregation: async ({ text, inbound }) => ({
      combinedText: text,
      inbound,
      burst: false,
      anchorProviderMessageId: inbound.providerMessageId
    })
  };

  return { deps, logs, prospects };
}

test("1. normal E.164 inbound identity stays phone-based", () => {
  const { messages } = parseWhatsAppWebhookPayload(e164Webhook("+17865550111"));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].phone, "+17865550111");
  assert.equal(messages[0].senderIdentity.identityType, "phone");
  assert.equal(messages[0].senderIdentity.isUsable, true);
});

test("2. username-only inbound extracts BSUID storage key", () => {
  const { messages } = parseWhatsAppWebhookPayload(bsuidWebhook());
  assert.equal(messages.length, 1);
  assert.equal(messages[0].whatsappSenderId, BSUID);
  assert.equal(messages[0].whatsappUsername, USERNAME);
  assert.equal(messages[0].phoneE164, null);
  assert.equal(messages[0].phone, `wa:bsuid:${BSUID}`);
  assert.equal(messages[0].senderIdentity.isUsable, true);
});

test("3. username-only campaign intake routes through pipeline", async () => {
  const { messages } = parseWhatsAppWebhookPayload(bsuidWebhook());
  const { deps, logs } = createHarness();
  const result = await processInboundWhatsAppMessage(messages[0], deps);
  assert.equal(result.success, true);
  assert.equal(result.skipped, false);
  assert.equal(logs.length, 1);
  assert.match(logs[0].phone, /^wa:bsuid:/);
});

test("4. username-only inbound renders useful Conversations identity", () => {
  const label = formatProspectWhatsAppDisplayIdentity({
    phone: `wa:bsuid:${BSUID}`,
    whatsapp_username: USERNAME,
    name: "Paid Ad Lead"
  });
  assert.equal(label, `@${USERNAME}`);
  assert.equal(
    formatFromReadModel({
      phone: `wa:bsuid:${BSUID}`,
      whatsapp_sender_id: BSUID,
      name: "Unknown"
    }).startsWith("WhatsApp user"),
    true
  );
});

test("5. later phone link updates normalized phone without duplicate prospect key", () => {
  const existing = {
    phone: `wa:bsuid:${BSUID}`,
    whatsapp_sender_id: BSUID,
    normalized_phone: null
  };
  const updates = mergeWhatsAppSenderIdentityOntoProspect(existing, {
    whatsappSenderId: BSUID,
    phoneE164: "+17865550999",
    displayName: "Linked Lead"
  });
  assert.equal(existing.phone, `wa:bsuid:${BSUID}`);
  assert.equal(updates.normalized_phone, "17865550999");
  assert.equal(updates.phone, undefined);
});

test("6. tenant isolation uses org-scoped sender lookup in harness", async () => {
  const { messages } = parseWhatsAppWebhookPayload(bsuidWebhook({ providerMessageId: "wamid.ORGA" }));
  const orgA = createHarness({ organizationId: ORG_A });
  const orgB = createHarness({ organizationId: ORG_B, campaignIntakeMatch: null });

  await processInboundWhatsAppMessage(messages[0], orgA.deps);
  await processInboundWhatsAppMessage(
    { ...messages[0], providerMessageId: "wamid.ORGB" },
    orgB.deps
  );

  assert.equal(orgA.prospects.size, 1);
  assert.equal(orgB.prospects.size, 1);
});

test("7. campaign attribution preserved on username-only inbound", async () => {
  const { messages } = parseWhatsAppWebhookPayload(bsuidWebhook());
  let attributed = false;
  const { deps } = createHarness();
  deps.campaignIntakeAttributionService.establishInboundAttribution = async ({ match }) => {
    attributed = match?.code === RECRUITING_MATCH.code;
    return { success: true };
  };
  await processInboundWhatsAppMessage(messages[0], deps);
  assert.equal(attributed, true);
});

test("8. unusable sender identity fails closed instead of silent drop", async () => {
  const result = await processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.BAD",
      phone: "",
      body: "Hola",
      phoneNumberId: PHONE_ID,
      senderIdentity: {
        isUsable: false,
        reason: "WHATSAPP_SENDER_IDENTITY_UNUSABLE"
      }
    },
    createHarness().deps
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "WHATSAPP_SENDER_IDENTITY_UNUSABLE");
});

test("resolveMetaWhatsAppRecipient prefers linked phone then BSUID", () => {
  assert.equal(
    resolveMetaWhatsAppRecipient({
      storageKey: `wa:bsuid:${BSUID}`,
      normalizedPhone: "17865550999",
      whatsappSenderId: BSUID
    }),
    "17865550999"
  );
  assert.equal(
    resolveMetaWhatsAppRecipient({
      storageKey: `wa:bsuid:${BSUID}`,
      whatsappSenderId: BSUID
    }),
    BSUID
  );
});

test("buildWhatsAppStorageKey keeps E.164 when both phone and BSUID exist", () => {
  assert.equal(
    buildWhatsAppStorageKey({
      phoneE164: "+17865550111",
      whatsappSenderId: BSUID
    }),
    "+17865550111"
  );
  assert.equal(isSyntheticWhatsAppStorageKey(`wa:bsuid:${BSUID}`), true);
});

test("extractWhatsAppSenderIdentity fails closed without sender id", () => {
  const identity = extractWhatsAppSenderIdentity({ from: "" }, null, null);
  assert.equal(identity.isUsable, false);
});

test("6. outbound never digit-normalizes BSUID storage key", () => {
  const { normalizePhoneNumber } = require("../core/phoneNormalizer");
  const { resolveStoragePhone } = require("../core/whatsappProspectResolver");
  const storageKey = `wa:bsuid:${BSUID}`;

  assert.equal(resolveStoragePhone(storageKey), storageKey);
  assert.notEqual(resolveMetaWhatsAppRecipient({ storageKey, whatsappSenderId: BSUID }), BSUID.replace(/\D/g, ""));
  assert.notEqual(
    resolveMetaWhatsAppRecipient({ storageKey, whatsappSenderId: BSUID }),
    normalizePhoneNumber(storageKey)
  );
  assert.equal(resolveMetaWhatsAppRecipient({ storageKey, whatsappSenderId: BSUID }), BSUID);
});

test("5. UI displayIdentity hides synthetic storage key", () => {
  assert.equal(
    formatProspectWhatsAppDisplayIdentity({
      phone: `wa:bsuid:${BSUID}`,
      whatsapp_username: USERNAME,
      name: "Paid Ad Lead"
    }),
    `@${USERNAME}`
  );
  assert.doesNotMatch(
    formatProspectWhatsAppDisplayIdentity({
      phone: `wa:bsuid:${BSUID}`,
      whatsapp_username: USERNAME
    }),
    /wa:bsuid:/i
  );
});

test("7. phone later links to same prospect without changing storage key", () => {
  const existing = {
    id: "prospect-a",
    phone: `wa:bsuid:${BSUID}`,
    whatsapp_sender_id: BSUID,
    normalized_phone: null,
    organization_id: ORG_A
  };
  const updates = mergeWhatsAppSenderIdentityOntoProspect(existing, {
    whatsappSenderId: BSUID,
    phoneE164: "+17865550999"
  });
  assert.equal(existing.phone, `wa:bsuid:${BSUID}`);
  assert.equal(updates.normalized_phone, "17865550999");
  assert.equal(updates.phone, undefined);
});

test("8. existing E.164 prospect later links BSUID without duplicate phone key", () => {
  const existing = {
    id: "prospect-b",
    phone: "+17865550111",
    normalized_phone: "17865550111",
    whatsapp_sender_id: null
  };
  const updates = mergeWhatsAppSenderIdentityOntoProspect(existing, {
    whatsappSenderId: BSUID,
    whatsappUsername: USERNAME,
    phoneE164: "+17865550111"
  });
  assert.equal(existing.phone, "+17865550111");
  assert.equal(updates.whatsapp_sender_id, BSUID);
  assert.equal(updates.whatsapp_username, USERNAME);
  assert.equal(updates.phone, undefined);
});

test("9. transcript lookup keys preserve synthetic storage key", () => {
  const {
    fetchConversationLogsByPhones
  } = require("../core/conversationsCenter/conversationsCenterReadModel");
  assert.equal(typeof fetchConversationLogsByPhones, "function");
  const { resolvePhoneCandidates } = require("../core/whatsappCustomerCareWindow");
  const storageKey = `wa:bsuid:${BSUID}`;
  assert.deepEqual(resolvePhoneCandidates(storageKey), [storageKey]);
});

test("10. workflow storage key remains synthetic after phone link", () => {
  const prospect = {
    phone: `wa:bsuid:${BSUID}`,
    normalized_phone: "17865550999",
    whatsapp_sender_id: BSUID
  };
  const { resolveProspectVisiblePhone } = require("../core/whatsappSenderIdentity");
  assert.equal(prospect.phone, `wa:bsuid:${BSUID}`);
  assert.equal(resolveProspectVisiblePhone(prospect), "+17865550999");
});

test("11. Return-to-Atlas log lookup uses synthetic key only", () => {
  const storageKey = `wa:bsuid:${BSUID}`;
  const resume = require("../core/conversationsCenter/returnToAtlasResumeService");
  assert.ok(resume);
  const { resolvePhoneCandidates } = require("../core/whatsappCustomerCareWindow");
  assert.deepEqual(resolvePhoneCandidates(storageKey), [storageKey]);
});

test("12. scheduling/outbound can target BSUID when no linked phone", () => {
  assert.equal(
    resolveMetaWhatsAppRecipient({
      storageKey: `wa:bsuid:${BSUID}`,
      whatsappSenderId: BSUID
    }),
    BSUID
  );
});

test("13. customer-care window resolves synthetic inbound key", () => {
  const { resolvePhoneCandidates, evaluateCustomerCareWindowFromInboundAt } = require("../core/whatsappCustomerCareWindow");
  const storageKey = `wa:bsuid:${BSUID}`;
  assert.deepEqual(resolvePhoneCandidates(storageKey), [storageKey]);
  const open = evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: new Date().toISOString()
  });
  assert.equal(open.open, true);
});

test("14. burst aggregation accepts synthetic sender storage key", async () => {
  const {
    scheduleInboundBurstAggregation,
    resetInboundBurstAggregationForTests
  } = require("../core/whatsappInboundBurstAggregator");
  resetInboundBurstAggregationForTests();
  const storageKey = `wa:bsuid:${BSUID}`;
  const p1 = scheduleInboundBurstAggregation({
    phone: storageKey,
    text: "Hola",
    inbound: { providerMessageId: "wamid.b1", phone: storageKey }
  });
  await new Promise((r) => setTimeout(r, 50));
  const p2 = scheduleInboundBurstAggregation({
    phone: storageKey,
    text: "busco trabajo",
    inbound: { providerMessageId: "wamid.b2", phone: storageKey }
  });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.combinedText, "Hola busco trabajo");
  assert.equal(r2.combinedText, "Hola busco trabajo");
  resetInboundBurstAggregationForTests();
});

test("15. cross-tenant sender lookup remains org-scoped in harness", async () => {
  const { messages } = parseWhatsAppWebhookPayload(
    bsuidWebhook({ providerMessageId: "wamid.XORG" })
  );
  const orgA = createHarness({ organizationId: ORG_A });
  const orgB = createHarness({ organizationId: ORG_B, campaignIntakeMatch: null });
  await processInboundWhatsAppMessage(messages[0], orgA.deps);
  await processInboundWhatsAppMessage(
    { ...messages[0], providerMessageId: "wamid.YORG" },
    orgB.deps
  );
  assert.equal(orgA.prospects.size, 1);
  assert.equal(orgB.prospects.size, 1);
});

test("16. invalid identity fails closed with diagnostic", async () => {
  const result = await processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.INVALID",
      phone: "",
      body: "Hola",
      phoneNumberId: PHONE_ID,
      senderIdentity: { isUsable: false, reason: "WHATSAPP_SENDER_IDENTITY_UNUSABLE" }
    },
    createHarness().deps
  );
  assert.equal(result.error, "WHATSAPP_SENDER_IDENTITY_UNUSABLE");
});

test("17. normal E.164 resolveStoragePhone unchanged", () => {
  const { resolveStoragePhone } = require("../core/whatsappProspectResolver");
  assert.equal(resolveStoragePhone("7865550111"), "+17865550111");
});

test("end-to-end fixture: username-only recruiting intake identity chain", () => {
  const { messages } = parseWhatsAppWebhookPayload(bsuidWebhook());
  const inbound = messages[0];
  assert.equal(inbound.phoneE164, null);
  assert.equal(inbound.whatsappSenderId, BSUID);
  assert.match(inbound.body, /TVR-0826-A7K4/);
  assert.equal(inbound.senderIdentity.storageKey, `wa:bsuid:${BSUID}`);
  assert.equal(
    formatProspectWhatsAppDisplayIdentity({
      phone: inbound.phone,
      whatsapp_username: USERNAME,
      name: inbound.contactName
    }),
    `@${USERNAME}`
  );
});
