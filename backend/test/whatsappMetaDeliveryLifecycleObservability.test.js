/**
 * WhatsApp Meta delivery lifecycle observability (sent / delivered / read / failed).
 * Observability only — no ownership, follow-up, stall, workflow, or qualification side effects.
 */

const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  planMetaDeliveryLifecycleUpdate,
  META_DELIVERY_STATUS
} = require("../core/whatsappMetaDeliveryLifecycle");
const {
  parseWhatsAppWebhookPayload,
  parseWhatsAppWebhookBody
} = require("../services/whatsappWebhookParser");
const {
  applyWhatsAppMetaDeliveryStatus,
  applyWhatsAppMetaDeliveryStatuses,
  UNKNOWN_WAMID_RETRY_DELAYS_MS
} = require("../core/whatsappMetaDeliveryStatusService");
const {
  recordOutboundDelivery,
  linkOutboundDeliveryConversationLog,
  applyMetaDeliveryStatusEvent,
  findDeliveryByProviderMessageId
} = require("../repositories/whatsappOutboundDeliveryRepository");
const {
  attachDeliveriesToMessages,
  mapConversationLog,
  mapDelivery
} = require("../core/communicationsCenterReadModel");

const WEBHOOK_ROUTE = path.join(__dirname, "../routes/webhook.js");
const OUTBOUND_PIPELINE = path.join(__dirname, "../core/whatsappOutboundPipeline.js");
const LIFECYCLE = path.join(__dirname, "../core/whatsappMetaDeliveryLifecycle.js");
const STATUS_SERVICE = path.join(
  __dirname,
  "../core/whatsappMetaDeliveryStatusService.js"
);
const MIGRATION_035 = path.join(
  __dirname,
  "../database/migrations/035_whatsapp_meta_delivery_lifecycle.sql"
);

function event(status, providerMessageId, extra = {}) {
  return {
    providerMessageId,
    status,
    timestampIso: extra.at || "2026-08-12T12:00:00.000Z",
    failureCode: extra.failureCode || null,
    failureReason: extra.failureReason || null
  };
}

function apply(current, status, wamid = "wamid.TEST1", extra = {}) {
  return planMetaDeliveryLifecycleUpdate(current, event(status, wamid, extra));
}

function createMemoryClient(seedRows = []) {
  const rows = seedRows.map((row) => ({ ...row }));

  function matches(row, filters) {
    return filters.every(([col, op, val]) => {
      if (op === "eq") return row[col] === val;
      if (op === "in") return Array.isArray(val) && val.includes(row[col]);
      return true;
    });
  }

  function buildQuery(table, mode, payload) {
    const filters = [];
    let orderCol = null;
    let ascending = true;
    let limitN = null;
    let wantSingle = false;

    const api = {
      select() {
        return api;
      },
      insert(items) {
        payload.items = items;
        return api;
      },
      update(patch) {
        payload.patch = patch;
        return api;
      },
      eq(col, val) {
        filters.push([col, "eq", val]);
        return api;
      },
      in(col, val) {
        filters.push([col, "in", val]);
        return api;
      },
      order(col, opts = {}) {
        orderCol = col;
        ascending = opts.ascending !== false;
        return api;
      },
      limit(n) {
        limitN = n;
        return api;
      },
      single() {
        wantSingle = true;
        return api.then ? api : Promise.resolve(api);
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(() => {
            if (table !== "whatsapp_outbound_deliveries") {
              return { data: null, error: { message: "unknown table" } };
            }

            if (mode === "insert") {
              const inserted = (payload.items || []).map((item, idx) => ({
                id: item.id || `ins-${rows.length + idx + 1}`,
                created_at: item.created_at || new Date().toISOString(),
                ...item
              }));
              rows.push(...inserted);
              const data = wantSingle ? inserted[0] : inserted;
              return { data, error: null };
            }

            let matched = rows.filter((row) => matches(row, filters));
            if (orderCol) {
              matched = matched.sort((a, b) => {
                const av = a[orderCol];
                const bv = b[orderCol];
                if (av === bv) return 0;
                if (av == null) return 1;
                if (bv == null) return -1;
                return ascending ? (av < bv ? -1 : 1) : av > bv ? -1 : 1;
              });
            }
            if (limitN != null) {
              matched = matched.slice(0, limitN);
            }

            if (mode === "update") {
              for (const row of matched) {
                Object.assign(row, payload.patch || {});
              }
              const data = wantSingle ? matched[0] || null : matched;
              return { data, error: null };
            }

            const data = wantSingle ? matched[0] || null : matched;
            return { data, error: null };
          })
          .then(resolve, reject);
      }
    };

    return api;
  }

  return {
    rows,
    from(table) {
      return {
        select: () => buildQuery(table, "select", {}),
        insert: (items) => buildQuery(table, "insert", { items }),
        update: (patch) => buildQuery(table, "update", { patch })
      };
    }
  };
}

function statusOnlyWebhook(statuses) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "PNID" },
              statuses
            },
            field: "messages"
          }
        ]
      }
    ]
  };
}

function messageOnlyWebhook(messages) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "PNID" },
              contacts: [{ profile: { name: "Prospect" }, wa_id: "15551234567" }],
              messages
            },
            field: "messages"
          }
        ]
      }
    ]
  };
}

// ─── Monotonic planner (B–H, E–G) ───────────────────────────────────────────

test("B. Meta sent → SENT", () => {
  const { patch } = apply({}, "sent");
  assert.equal(patch.meta_delivery_status, META_DELIVERY_STATUS.SENT);
  assert.ok(patch.sent_at);
});

test("C. Meta delivered → DELIVERED", () => {
  const { patch } = apply({ meta_delivery_status: "sent", sent_at: "t0" }, "delivered");
  assert.equal(patch.meta_delivery_status, META_DELIVERY_STATUS.DELIVERED);
  assert.ok(patch.delivered_at);
});

test("D. Meta read → READ", () => {
  const { patch } = apply(
    { meta_delivery_status: "delivered", delivered_at: "t1" },
    "read"
  );
  assert.equal(patch.meta_delivery_status, META_DELIVERY_STATUS.READ);
  assert.ok(patch.read_at);
});

test("E. sent → read with no delivered → READ and no fabricated delivered_at", () => {
  let state = { meta_delivery_status: "sent", sent_at: "t0" };
  const r1 = apply(state, "read", "wamid.E", { at: "t2" });
  state = { ...state, ...r1.patch };
  assert.equal(state.meta_delivery_status, "read");
  assert.equal(state.read_at, "t2");
  assert.equal(state.delivered_at, undefined);
});

test("F. read → delivered out of order remains READ", () => {
  let state = { meta_delivery_status: "read", read_at: "t2", sent_at: "t0" };
  const r = apply(state, "delivered", "wamid.F", { at: "t1" });
  state = { ...state, ...r.patch };
  assert.equal(state.meta_delivery_status, "read");
  assert.equal(state.delivered_at, "t1");
  assert.equal(state.read_at, "t2");
});

test("G. delivered → sent out of order remains DELIVERED", () => {
  let state = { meta_delivery_status: "delivered", delivered_at: "t1" };
  const r = apply(state, "sent", "wamid.G", { at: "t0" });
  state = { ...state, ...r.patch };
  assert.equal(state.meta_delivery_status, "delivered");
  assert.ok(state.sent_at);
});

test("H. failed → FAILED + failure fields", () => {
  const { patch } = apply(
    { meta_delivery_status: "sent" },
    "failed",
    "wamid.H",
    { failureCode: "131026", failureReason: "Message undeliverable", at: "tF" }
  );
  assert.equal(patch.meta_delivery_status, "failed");
  assert.equal(patch.failed_at, "tF");
  assert.equal(patch.failure_code, "131026");
  assert.equal(patch.failure_reason, "Message undeliverable");
});

test("H2. failed after delivered does not demote success status", () => {
  const { patch } = apply(
    { meta_delivery_status: "delivered", delivered_at: "t1" },
    "failed",
    "wamid.H2",
    { failureCode: "1", failureReason: "late fail" }
  );
  assert.equal(patch.meta_delivery_status, undefined);
  assert.ok(patch.failed_at);
  assert.equal(patch.failure_code, "1");
});

test("late success after failed may upgrade status while retaining failure history", () => {
  let state = {
    meta_delivery_status: "failed",
    failed_at: "tF",
    failure_code: "131026",
    failure_reason: "undeliverable"
  };
  const r = apply(state, "delivered", "wamid.LATE", { at: "tD" });
  state = { ...state, ...r.patch };
  assert.equal(state.meta_delivery_status, "delivered");
  assert.equal(state.delivered_at, "tD");
  assert.equal(state.failed_at, "tF");
  assert.equal(state.failure_code, "131026");
});

// ─── Repository / service (A, I, J, K–M intents) ────────────────────────────

test("A. outbound send persists provider_message_id / wamid + initial Meta sent", async () => {
  const client = createMemoryClient();
  const result = await recordOutboundDelivery(
    {
      organizationId: "org-1",
      prospectPhone: "+15551234567",
      intent: "HUMAN_COMPOSER_REPLY",
      status: "sent_freeform",
      deliveryMode: "freeform",
      providerMessageId: "wamid.OUTBOUND1",
      conversationLogId: "log-1"
    },
    client
  );

  assert.equal(result.success, true);
  assert.equal(result.row.provider_message_id, "wamid.OUTBOUND1");
  assert.equal(result.row.meta_delivery_status, "sent");
  assert.ok(result.row.sent_at);
  // BR-075 gate status remains separate
  assert.equal(result.row.status, "sent_freeform");
});

test("I. unknown wamid → bounded retry then safe ignore / no corruption", async () => {
  const client = createMemoryClient([
    {
      id: "d1",
      provider_message_id: "wamid.KNOWN",
      meta_delivery_status: "sent",
      status: "sent_freeform",
      created_at: "2026-08-12T10:00:00.000Z"
    }
  ]);

  const result = await applyWhatsAppMetaDeliveryStatus(
    event("delivered", "wamid.UNKNOWN"),
    client,
    { retryDelaysMs: [1, 1], sleepFn: async () => {} }
  );
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "UNKNOWN_WAMID");
  assert.equal(result.attempts, 3);
  assert.equal(client.rows[0].meta_delivery_status, "sent");
  assert.equal(client.rows[0].delivered_at, undefined);
});

test("J. same phone, multiple outbound → only exact wamid updated", async () => {
  const client = createMemoryClient([
    {
      id: "d1",
      provider_message_id: "wamid.A",
      prospect_phone: "+15551234567",
      meta_delivery_status: "sent",
      status: "sent_freeform",
      created_at: "2026-08-12T10:00:00.000Z"
    },
    {
      id: "d2",
      provider_message_id: "wamid.B",
      prospect_phone: "+15551234567",
      meta_delivery_status: "sent",
      status: "sent_freeform",
      created_at: "2026-08-12T10:01:00.000Z"
    }
  ]);

  await applyWhatsAppMetaDeliveryStatus(event("read", "wamid.A"), client);
  assert.equal(client.rows.find((r) => r.id === "d1").meta_delivery_status, "read");
  assert.equal(client.rows.find((r) => r.id === "d2").meta_delivery_status, "sent");
});

test("K/L/M. HUMAN / V2 live-authoring / template outbound lifecycle by wamid", async () => {
  const intents = [
    { intent: "HUMAN_COMPOSER_REPLY", status: "sent_freeform", wamid: "wamid.HUMAN" },
    {
      intent: "LIVE_AUTHORING_REPLY",
      status: "sent_freeform",
      wamid: "wamid.V2"
    },
    {
      intent: "TEMPLATE_REMINDER",
      status: "sent_template",
      wamid: "wamid.TMPL",
      deliveryMode: "template",
      templateKey: "interview_reminder"
    }
  ];

  for (const spec of intents) {
    const client = createMemoryClient();
    await recordOutboundDelivery(
      {
        organizationId: "org-1",
        prospectPhone: "+15550001111",
        intent: spec.intent,
        status: spec.status,
        deliveryMode: spec.deliveryMode || "freeform",
        templateKey: spec.templateKey || null,
        providerMessageId: spec.wamid,
        conversationLogId: `log-${spec.wamid}`
      },
      client
    );

    await applyWhatsAppMetaDeliveryStatuses(
      [
        event("sent", spec.wamid),
        event("delivered", spec.wamid),
        event("read", spec.wamid)
      ],
      client
    );

    const row = await findDeliveryByProviderMessageId(spec.wamid, client);
    assert.equal(row.meta_delivery_status, "read");
    assert.ok(row.read_at);
    assert.equal(row.status, spec.status, "BR-075 status must remain gate status");
  }
});

// ─── Webhook parsing (N–P, O) ───────────────────────────────────────────────

test("N. status-only webhook payload processes correctly", () => {
  const parsed = parseWhatsAppWebhookPayload(
    statusOnlyWebhook([
      {
        id: "wamid.STATUS1",
        status: "delivered",
        timestamp: "1690000000",
        recipient_id: "15551234567"
      }
    ])
  );

  assert.equal(parsed.messages.length, 0);
  assert.equal(parsed.statuses.length, 1);
  assert.equal(parsed.statuses[0].providerMessageId, "wamid.STATUS1");
  assert.equal(parsed.statuses[0].status, "delivered");
  assert.ok(parsed.statuses[0].timestampIso);
});

test("O. message-only webhook payload still works", () => {
  const body = messageOnlyWebhook([
    {
      from: "15551234567",
      id: "wamid.IN1",
      timestamp: "1690000001",
      type: "text",
      text: { body: "Hola" }
    }
  ]);

  const viaLegacy = parseWhatsAppWebhookBody(body);
  const viaPayload = parseWhatsAppWebhookPayload(body);

  assert.equal(viaLegacy.length, 1);
  assert.equal(viaLegacy[0].body, "Hola");
  assert.equal(viaPayload.messages.length, 1);
  assert.equal(viaPayload.statuses.length, 0);
});

test("P. mixed messages + statuses webhook works safely", () => {
  const body = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "PNID" },
              contacts: [{ profile: { name: "P" }, wa_id: "15551234567" }],
              messages: [
                {
                  from: "15551234567",
                  id: "wamid.IN2",
                  timestamp: "1690000002",
                  type: "text",
                  text: { body: "ok" }
                }
              ],
              statuses: [
                {
                  id: "wamid.OUT2",
                  status: "read",
                  timestamp: "1690000003",
                  recipient_id: "15551234567"
                },
                {
                  id: "wamid.FAIL",
                  status: "failed",
                  timestamp: "1690000004",
                  recipient_id: "15551234567",
                  errors: [{ code: 131026, title: "Undeliverable" }]
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  const parsed = parseWhatsAppWebhookPayload(body);
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.statuses.length, 2);
  assert.equal(parsed.statuses[1].failureCode, "131026");
  assert.equal(parsed.statuses[1].failureReason, "Undeliverable");
});

test("failed status without messages still parses (status-only failure)", () => {
  const parsed = parseWhatsAppWebhookPayload(
    statusOnlyWebhook([
      {
        id: "wamid.F1",
        status: "failed",
        timestamp: "1690000010",
        errors: [{ code: 131047, title: "Re-engagement message" }]
      }
    ])
  );
  assert.equal(parsed.statuses[0].status, "failed");
  assert.equal(parsed.statuses[0].failureCode, "131047");
});

// ─── Read model / no duplicate bubbles (Q) ──────────────────────────────────

test("Q. status lifecycle attaches to original outbound; no status bubbles", () => {
  const items = [
    mapConversationLog(
      {
        id: "log-out-1",
        direction: "outgoing",
        message: "Hello from Atlas",
        pipeline: "HUMAN",
        intent: "HUMAN_COMPOSER_REPLY",
        created_at: "2026-08-12T10:00:00.000Z",
        channel: "whatsapp"
      },
      { timezone: "America/New_York" }
    ),
    mapConversationLog(
      {
        id: "log-in-1",
        direction: "incoming",
        message: "Hi",
        created_at: "2026-08-12T10:01:00.000Z",
        channel: "whatsapp"
      },
      { timezone: "America/New_York" }
    )
  ];

  const deliveries = [
    {
      id: "del-1",
      conversation_log_id: "log-out-1",
      status: "sent_freeform",
      provider_message_id: "wamid.ATTACH1",
      meta_delivery_status: "read",
      sent_at: "t0",
      delivered_at: "t1",
      read_at: "t2",
      delivery_mode: "freeform"
    }
  ];

  const linkedIds = new Set(["log-out-1"]);
  const orphanBubble = mapDelivery(deliveries[0], { timezone: "UTC" }, linkedIds);
  assert.equal(orphanBubble, null, "linked delivery must not create a second bubble");

  const enriched = attachDeliveriesToMessages(items, deliveries);
  const outbound = enriched.find((i) => i.source.recordId === "log-out-1");
  const inbound = enriched.find((i) => i.source.recordId === "log-in-1");

  assert.equal(outbound.delivery.metaDeliveryStatus, "read");
  assert.equal(outbound.delivery.status, "sent_freeform");
  assert.equal(outbound.delivery.sentAt, "t0");
  assert.equal(outbound.delivery.deliveredAt, "t1");
  assert.equal(outbound.delivery.readAt, "t2");
  assert.ok(outbound.delivery.providerMessageId);
  assert.notEqual(outbound.delivery.providerMessageId, "wamid.ATTACH1");

  assert.equal(inbound.delivery.metaDeliveryStatus, null);
  assert.equal(inbound.delivery.status, null);
});

// ─── Safety / unchanged boundaries (R–W source seals) ───────────────────────

test("R–T/U/V/W. ownership + execution + Meta Reviewer + CE gate paths unchanged by lifecycle module", () => {
  const lifecycleSrc = fs.readFileSync(LIFECYCLE, "utf8");
  const serviceSrc = fs.readFileSync(STATUS_SERVICE, "utf8");
  const webhookSrc = fs.readFileSync(WEBHOOK_ROUTE, "utf8");
  const pipelineSrc = fs.readFileSync(OUTBOUND_PIPELINE, "utf8");
  const migrationSrc = fs.readFileSync(MIGRATION_035, "utf8");

  for (const src of [lifecycleSrc, serviceSrc]) {
    assert.doesNotMatch(src, /manualAgentOwnership|humanTakenOverAt|takeOver|returnToAtlas/i);
    assert.doesNotMatch(src, /followUp|markStalled|qualification|missionControl/i);
    assert.doesNotMatch(src, /sendWhatsApp|graph\.facebook|EXECUTION_ENABLED/i);
  }

  assert.match(webhookSrc, /applyWhatsAppMetaDeliveryStatus/);
  assert.match(webhookSrc, /processInboundWhatsAppMessage/);
  assert.match(webhookSrc, /statuses/);

  assert.match(pipelineSrc, /recordOutboundDelivery/);
  assert.match(pipelineSrc, /linkOutboundDeliveryConversationLog/);
  assert.match(pipelineSrc, /conversationLogId:\s*null/);
  assert.match(pipelineSrc, /providerMessageId/);
  assert.match(serviceSrc, /UNKNOWN_WAMID_RETRY_DELAYS_MS/);
  assert.deepEqual([...UNKNOWN_WAMID_RETRY_DELAYS_MS], [100, 250, 500, 900]);

  assert.match(migrationSrc, /meta_delivery_status/);
  assert.match(migrationSrc, /idx_whatsapp_outbound_deliveries_provider_message_id/);
  assert.doesNotMatch(migrationSrc, /DROP COLUMN.*\bstatus\b/);

  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
  assert.notEqual(process.env.RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED, "true");
});

test("BR-075 status column is never overwritten by Meta lifecycle planner", () => {
  const { patch } = apply(
    { status: "sent_freeform", meta_delivery_status: "sent" },
    "read"
  );
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "status"), false);
  assert.equal(patch.meta_delivery_status, "read");
});

test("applyMetaDeliveryStatusEvent uses exact provider_message_id lookup only", async () => {
  const client = createMemoryClient([
    {
      id: "d-phone-bait",
      provider_message_id: "wamid.OTHER",
      prospect_phone: "+15559999999",
      meta_delivery_status: "sent",
      status: "sent_freeform",
      created_at: "2026-08-12T09:00:00.000Z"
    }
  ]);

  const result = await applyMetaDeliveryStatusEvent(
    {
      ...event("delivered", "wamid.MISSING"),
      recipientId: "15559999999"
    },
    client
  );

  assert.equal(result.reason, "UNKNOWN_WAMID");
  assert.equal(client.rows[0].meta_delivery_status, "sent");
});

// ─── Race hotfix: early persist + bounded UNKNOWN_WAMID retry ───────────────

test("1–2. early delivery row then link conversation_log_id (no duplicate)", async () => {
  const client = createMemoryClient();
  const early = await recordOutboundDelivery(
    {
      organizationId: "org-1",
      prospectPhone: "+15551234567",
      intent: "HUMAN_COMPOSER_REPLY",
      status: "sent_freeform",
      deliveryMode: "freeform",
      providerMessageId: "wamid.EARLY1",
      conversationLogId: null
    },
    client
  );
  assert.equal(early.success, true);
  assert.equal(early.row.conversation_log_id, null);
  assert.equal(early.row.meta_delivery_status, "sent");
  assert.equal(client.rows.length, 1);

  const linked = await linkOutboundDeliveryConversationLog(
    {
      deliveryId: early.row.id,
      providerMessageId: "wamid.EARLY1",
      conversationLogId: "log-early-1"
    },
    client
  );
  assert.equal(linked.success, true);
  assert.equal(client.rows.length, 1);
  assert.equal(client.rows[0].conversation_log_id, "log-early-1");
  assert.equal(client.rows[0].status, "sent_freeform");
});

test("3. sent callback after row applies normally", async () => {
  const client = createMemoryClient([
    {
      id: "d-after",
      provider_message_id: "wamid.AFTER",
      meta_delivery_status: "sent",
      status: "sent_freeform",
      created_at: "t0"
    }
  ]);
  const result = await applyWhatsAppMetaDeliveryStatus(
    event("delivered", "wamid.AFTER"),
    client,
    { retryDelaysMs: [] }
  );
  assert.equal(result.ignored, false);
  assert.equal(result.attempts, 1);
  assert.equal(client.rows[0].meta_delivery_status, "delivered");
});

test("4–5. sent/delivered callback before row → retry finds row", async () => {
  const client = createMemoryClient();
  let inserts = 0;
  const sleepFn = async () => {
    inserts += 1;
    if (inserts === 1) {
      await recordOutboundDelivery(
        {
          organizationId: "org-1",
          prospectPhone: "+15550001111",
          intent: "HUMAN_COMPOSER_REPLY",
          status: "sent_freeform",
          deliveryMode: "freeform",
          providerMessageId: "wamid.RACE_DELIV",
          conversationLogId: null
        },
        client
      );
    }
  };

  const result = await applyWhatsAppMetaDeliveryStatus(
    event("delivered", "wamid.RACE_DELIV"),
    client,
    { retryDelaysMs: [1, 1, 1], sleepFn }
  );
  assert.equal(result.reason, undefined);
  assert.equal(result.ignored, false);
  assert.ok(result.attempts >= 2);
  assert.equal(client.rows[0].meta_delivery_status, "delivered");
  assert.equal(client.rows[0].status, "sent_freeform");
});

test("6. read callback before row → retry → READ", async () => {
  const client = createMemoryClient();
  let ready = false;
  const sleepFn = async () => {
    if (!ready) {
      ready = true;
      await recordOutboundDelivery(
        {
          organizationId: "org-1",
          prospectPhone: "+15550002222",
          intent: "LIVE_AUTHORING_REPLY",
          status: "sent_freeform",
          deliveryMode: "freeform",
          providerMessageId: "wamid.RACE_READ",
          conversationLogId: null
        },
        client
      );
    }
  };

  const result = await applyWhatsAppMetaDeliveryStatus(
    event("read", "wamid.RACE_READ"),
    client,
    { retryDelaysMs: [1, 1], sleepFn }
  );
  assert.equal(result.ignored, false);
  assert.equal(client.rows[0].meta_delivery_status, "read");
  assert.equal(client.rows[0].delivered_at, undefined);
});

test("7. early sent + delivered before/around row → final DELIVERED", async () => {
  const client = createMemoryClient();
  let inserted = false;
  const sleepFn = async () => {
    if (!inserted) {
      inserted = true;
      await recordOutboundDelivery(
        {
          organizationId: "org-1",
          prospectPhone: "+15550003333",
          intent: "TEMPLATE_REMINDER",
          status: "sent_template",
          deliveryMode: "template",
          providerMessageId: "wamid.RACE_SD",
          conversationLogId: null
        },
        client
      );
    }
  };

  await applyWhatsAppMetaDeliveryStatus(event("sent", "wamid.RACE_SD"), client, {
    retryDelaysMs: [1],
    sleepFn
  });
  await applyWhatsAppMetaDeliveryStatus(
    event("delivered", "wamid.RACE_SD"),
    client,
    { retryDelaysMs: [] }
  );
  const row = await findDeliveryByProviderMessageId("wamid.RACE_SD", client);
  assert.equal(row.meta_delivery_status, "delivered");
  assert.equal(row.status, "sent_template");
});

test("8. early delivered + read → final READ", async () => {
  const client = createMemoryClient();
  let inserted = false;
  const sleepFn = async () => {
    if (!inserted) {
      inserted = true;
      await recordOutboundDelivery(
        {
          organizationId: "org-1",
          prospectPhone: "+15550004444",
          intent: "HUMAN_COMPOSER_REPLY",
          status: "sent_freeform",
          deliveryMode: "freeform",
          providerMessageId: "wamid.RACE_DR",
          conversationLogId: null
        },
        client
      );
    }
  };

  await applyWhatsAppMetaDeliveryStatus(
    event("delivered", "wamid.RACE_DR"),
    client,
    { retryDelaysMs: [1], sleepFn }
  );
  await applyWhatsAppMetaDeliveryStatus(event("read", "wamid.RACE_DR"), client, {
    retryDelaysMs: []
  });
  assert.equal(client.rows[0].meta_delivery_status, "read");
});

test("pipeline source: early persist before transcript; link after", () => {
  const pipelineSrc = fs.readFileSync(OUTBOUND_PIPELINE, "utf8");
  const earlyIdx = pipelineSrc.indexOf(
    "Persist delivery SoR immediately after wamid"
  );
  const successPath = pipelineSrc.slice(earlyIdx);
  const logIdx = successPath.indexOf("await logConversation(");
  const linkIdx = successPath.indexOf("linkOutboundDeliveryConversationLog");
  assert.ok(earlyIdx > 0);
  assert.ok(logIdx > 0, "logConversation must follow early delivery persist");
  assert.ok(linkIdx > logIdx, "conversation_log_id link must follow transcript");
});
