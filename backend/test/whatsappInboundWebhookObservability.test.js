/**
 * WhatsApp inbound webhook observability — sanitized raw payload capture (diagnostics only).
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const ORG = "00000000-0000-4000-8000-000000000001";

const {
  sanitizeWebhookBody,
  sanitizeRequestHeaders,
  SECRET_KEY_PATTERN
} = require("../core/whatsappInboundWebhookObservability/sanitizeWebhookPayload");
const {
  extractInboundMessageSnapshots
} = require("../core/whatsappInboundWebhookObservability/extractInboundMessageSnapshots");
const {
  captureInboundWebhookObservability,
  linkInboundWebhookObservability,
  findInboundWebhookObservability,
  purgeExpiredInboundWebhookObservability
} = require("../services/whatsappInboundWebhookObservabilityService");
const {
  evaluateAtlasInboundAutomationEligibility
} = require("../core/atlasInboundAutomationEligibility");
const { parseWhatsAppWebhookPayload } = require("../services/whatsappWebhookParser");

function memoryRepository() {
  const rows = new Map();

  return {
    rows,
    async insertSnapshot(row) {
      if (rows.has(row.provider_message_id)) {
        return { ok: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
      }
      const stored = {
        id: `obs-${rows.size + 1}`,
        ...row,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      rows.set(row.provider_message_id, stored);
      return { ok: true, row: stored };
    },
    async findByProviderMessageId(providerMessageId) {
      return rows.get(providerMessageId) || null;
    },
    async linkSnapshot(providerMessageId, patch) {
      const existing = rows.get(providerMessageId);
      if (!existing) {
        return { ok: false, row: null };
      }
      const updated = {
        ...existing,
        ...patch,
        updated_at: new Date().toISOString(),
        linked_at: new Date().toISOString()
      };
      rows.set(providerMessageId, updated);
      return { ok: true, row: updated };
    },
    async searchSnapshots(filters = {}) {
      let list = [...rows.values()];
      if (filters.organizationId) {
        list = list.filter((r) => r.organization_id === filters.organizationId);
      }
      if (filters.providerMessageId) {
        list = list.filter((r) => r.provider_message_id === filters.providerMessageId);
      }
      if (filters.prospectId) {
        list = list.filter((r) => r.prospect_id === filters.prospectId);
      }
      if (filters.phone) {
        list = list.filter((r) => r.prospect_phone === filters.phone);
      }
      if (filters.since) {
        list = list.filter((r) => r.received_at >= filters.since);
      }
      if (filters.until) {
        list = list.filter((r) => r.received_at <= filters.until);
      }
      list.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
      return list.slice(0, filters.limit || 20);
    },
    async purgeOlderThan(cutoffIso) {
      let deleted = 0;
      for (const [key, row] of rows.entries()) {
        if (row.received_at < cutoffIso) {
          rows.delete(key);
          deleted += 1;
        }
      }
      return { deleted };
    }
  };
}

function ctwaBody() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: "phone-id-9999",
                display_phone_number: "+17867528080"
              },
              contacts: [{ profile: { name: "Rosi" }, wa_id: "13053479639" }],
              messages: [
                {
                  from: "13053479639",
                  id: "wamid.ctwa-text-1",
                  timestamp: "1710000001",
                  type: "text",
                  text: { body: "Hello! Can I get more info on this?" },
                  referral: {
                    source_type: "ad",
                    source_id: "ad-123",
                    ctwa_clid: "clid-abc-123",
                    headline: "Join our team"
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function unsupportedBody() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-456",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: "phone-id-8888",
                display_phone_number: "+17867528080"
              },
              contacts: [{ profile: { name: "Danih" }, wa_id: "17863277481" }],
              messages: [
                {
                  from: "17863277481",
                  id: "wamid.unsupported-1",
                  timestamp: "1710000002",
                  type: "unsupported",
                  errors: [{ code: 131051, title: "Message type unknown" }],
                  vendor_specific_field: { nested: true }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function noReferralTextBody() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-789",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                phone_number_id: "phone-id-7777",
                display_phone_number: "+17867528080"
              },
              messages: [
                {
                  from: "17865557338",
                  id: "wamid.no-ref-1",
                  timestamp: "1710000003",
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
}

test("sanitizer removes secret keys and preserves unknown message fields", () => {
  const sanitized = sanitizeWebhookBody({
    object: "whatsapp_business_account",
    access_token: "must-not-persist",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  type: "unsupported",
                  vendor_specific_field: { nested: true },
                  authorization: "secret-header-value"
                }
              ]
            }
          }
        ]
      }
    ]
  });

  assert.equal(sanitized.access_token, undefined);
  assert.equal(
    sanitized.entry[0].changes[0].value.messages[0].vendor_specific_field.nested,
    true
  );
  assert.equal(sanitized.entry[0].changes[0].value.messages[0].authorization, undefined);
  assert.equal(sanitizeRequestHeaders({ authorization: "Bearer x" }), null);
  assert.match(SECRET_KEY_PATTERN.source, /authorization/i);
});

test("text + CTWA referral snapshot preserves text, referral, and ctwa_clid", () => {
  const snapshots = extractInboundMessageSnapshots(ctwaBody());
  assert.equal(snapshots.length, 1);
  const snap = snapshots[0];
  assert.equal(snap.messageType, "text");
  assert.equal(snap.hasReferral, true);
  assert.equal(snap.hasCtwaClid, true);
  assert.equal(snap.referralSourceType, "ad");
  const rawMessage = snap.payload.value.messages[0];
  assert.equal(rawMessage.text.body, "Hello! Can I get more info on this?");
  assert.equal(rawMessage.referral.ctwa_clid, "clid-abc-123");
  assert.equal(snap.payload.value.metadata.display_phone_number, "+17867528080");
});

test("unsupported message snapshot preserves exact raw message object fields", () => {
  const snapshots = extractInboundMessageSnapshots(unsupportedBody());
  assert.equal(snapshots.length, 1);
  const snap = snapshots[0];
  assert.equal(snap.messageType, "unsupported");
  assert.equal(snap.hasReferral, false);
  assert.equal(snap.hasCtwaClid, false);
  const rawMessage = snap.payload.value.messages[0];
  assert.equal(rawMessage.type, "unsupported");
  assert.equal(rawMessage.errors[0].code, 131051);
  assert.equal(rawMessage.vendor_specific_field.nested, true);
  assert.equal(rawMessage.text, undefined);
});

test("missing referral snapshot clearly shows absence", () => {
  const snapshots = extractInboundMessageSnapshots(noReferralTextBody());
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].hasReferral, false);
  assert.equal(snapshots[0].hasCtwaClid, false);
  assert.equal(snapshots[0].payload.value.messages[0].referral, undefined);
});

test("capture assigns tenant routing org and supports provider id lookup", async () => {
  const repo = memoryRepository();
  const body = ctwaBody();

  const captured = await captureInboundWebhookObservability(body, {
    repository: repo,
    purgeOnCapture: false,
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: ORG,
      source: "test"
    })
  });

  assert.equal(captured.captured, 1);
  const row = await repo.findByProviderMessageId("wamid.ctwa-text-1");
  assert.equal(row.organization_id, ORG);
  assert.equal(row.prospect_phone, "+13053479639");

  const found = await findInboundWebhookObservability(
    { providerMessageId: "wamid.ctwa-text-1" },
    { repository: repo }
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].has_ctwa_clid, true);
});

test("lookup by phone and received time works", async () => {
  const repo = memoryRepository();
  await captureInboundWebhookObservability(unsupportedBody(), {
    repository: repo,
    purgeOnCapture: false,
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: ORG,
      source: "test"
    })
  });

  const rows = await findInboundWebhookObservability(
    { phone: "+17863277481" },
    { repository: repo }
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].message_type, "unsupported");

  const since = new Date(Date.now() - 60_000).toISOString();
  const recentOnly = await findInboundWebhookObservability(
    { phone: "+17863277481", since },
    { repository: repo }
  );
  assert.equal(recentOnly.length, 0);
});

test("link enriches prospect and conversation ids after pipeline", async () => {
  const repo = memoryRepository();
  await captureInboundWebhookObservability(unsupportedBody(), {
    repository: repo,
    purgeOnCapture: false,
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: ORG,
      source: "test"
    })
  });

  const linked = await linkInboundWebhookObservability(
    {
      providerMessageId: "wamid.unsupported-1",
      organizationId: ORG,
      prospectId: "prospect-abc",
      conversationLogId: "log-xyz",
      ownerUserId: "owner-1",
      prospectPhone: "+17863277481"
    },
    { repository: repo }
  );

  assert.equal(linked.ok, true);
  assert.equal(linked.row.prospect_id, "prospect-abc");
  assert.equal(linked.row.conversation_log_id, "log-xyz");
  assert.equal(linked.row.owner_user_id, "owner-1");
});

test("retention purge deletes rows older than cutoff", async () => {
  const repo = memoryRepository();
  repo.rows.set("wamid.old", {
    id: "old",
    provider_message_id: "wamid.old",
    received_at: "2020-01-01T00:00:00.000Z",
    payload: {},
    organization_id: ORG
  });
  repo.rows.set("wamid.new", {
    id: "new",
    provider_message_id: "wamid.new",
    received_at: new Date().toISOString(),
    payload: {},
    organization_id: ORG
  });

  const result = await purgeExpiredInboundWebhookObservability({
    repository: repo,
    env: { ATLAS_WHATSAPP_WEBHOOK_OBSERVABILITY_RETENTION_DAYS: "30" }
  });

  assert.equal(result.deleted, 1);
  assert.equal(repo.rows.has("wamid.old"), false);
  assert.equal(repo.rows.has("wamid.new"), true);
});

test("parser normalization unchanged; unsupported still becomes [unsupported message]", () => {
  const parsed = parseWhatsAppWebhookPayload(unsupportedBody()).messages[0];
  assert.equal(parsed.messageType, "unsupported");
  assert.equal(parsed.body, "[unsupported message]");
  assert.equal(parsed.ctwaReferral, null);

  const snapshots = extractInboundMessageSnapshots(unsupportedBody());
  assert.equal(snapshots[0].payload.value.messages[0].type, "unsupported");
  assert.notEqual(snapshots[0].payload.value.messages[0].type, parsed.body);
});

test("BR-142 decisions unchanged for unsupported/unattributed inbound", () => {
  const parsed = parseWhatsAppWebhookPayload(unsupportedBody()).messages[0];
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: {
      phone: "+17863277481",
      entry_method: "UNATTRIBUTED",
      source: "UNKNOWN"
    },
    inbound: parsed
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "NOT_ELIGIBLE");
});
