/**
 * BR-237 — concurrent-turn coherence + WhatsApp Business App HUMAN seal.
 */

"use strict";

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  withConversationTurnLock,
  resetConversationTurnLocksForTests,
  lockKey
} = require("../core/recruitAiV2/conversationTurnLock");
const {
  evaluateStaleInbound,
  guardLastMeterAutomatedOutbound,
  recordProspectInboundCoherenceMarker,
  LAST_INBOUND_ID_FIELD,
  LAST_INBOUND_AT_FIELD
} = require("../core/recruitAiV2/lastMeterOutboundGuard");
const { REASONS } = require("../core/recruitAiV2/globalConversationCoherenceGuard");
const { EVENTS } = require("../core/recruitAiV2/stage1Observability");
const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
const {
  takeOverConversation,
  returnConversationToAtlas
} = require("../core/conversationsCenter/conversationsCenterOwnershipService");
const { HANDOFF_REASONS } = require("../core/conversationsCenter/constants");
const { processHumanWhatsAppOutboundEcho } = require("../core/whatsappHumanOutboundPipeline");
const { parseWhatsAppWebhookPayload } = require("../services/whatsappWebhookParser");
const { loadPersistedWorkflowState } = require("../core/workflowStateStore");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const PROSPECT_A = "11111111-1111-4111-8111-111111111111";
const PROSPECT_B = "22222222-2222-4222-8222-222222222222";
const PHONE_A = "+17543141700";
const PHONE_B = "+17543141701";

function withIsolatedWorkflowState(fn) {
  const prev = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev == null) {
        delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
      } else {
        process.env.ATLAS_WORKFLOW_STATE_BACKEND = prev;
      }
    });
}

test("A. inbound B arrives before A sends — A suppressed, B may proceed", async () => {
  const stale = evaluateStaleInbound({
    authoredInboundProviderMessageId: "wamid-a",
    latestInboundProviderMessageId: "wamid-b"
  });
  assert.equal(stale.stale, true);
  assert.equal(stale.reason, REASONS.STALE_OUTBOUND);

  const fresh = evaluateStaleInbound({
    authoredInboundProviderMessageId: "wamid-b",
    latestInboundProviderMessageId: "wamid-b"
  });
  assert.equal(fresh.stale, false);
});

test("B/C. 4s and 11s later inbounds suppress the older authored reply", () => {
  const fourSeconds = evaluateStaleInbound({
    authoredInboundProviderMessageId: "wamid-si",
    authoredInboundAt: "2026-09-05T20:19:40.000Z",
    latestInboundProviderMessageId: "wamid-ciudadano",
    latestInboundAt: "2026-09-05T20:19:44.000Z"
  });
  assert.equal(fourSeconds.stale, true);

  const elevenSeconds = evaluateStaleInbound({
    authoredInboundProviderMessageId: "wamid-hola",
    authoredInboundAt: "2026-09-05T20:19:10.000Z",
    latestInboundProviderMessageId: "wamid-dania",
    latestInboundAt: "2026-09-05T20:19:21.000Z"
  });
  assert.equal(elevenSeconds.stale, true);
});

test("BR-166 no-op closed: missing version still fail-closed on newer inbound", async () => {
  const result = await guardLastMeterAutomatedOutbound({
    actor: "ATLAS",
    prospect: { id: PROSPECT_A, phone: PHONE_A, organization_id: ORG_A },
    normalized: { providerMessageId: "wamid-a", phone: PHONE_A },
    engineResult: { source: "recruit_ai_v2_live_authoring", owner: "v2", v2Result: {} },
    loadWorkflowState: async () => ({
      [LAST_INBOUND_ID_FIELD]: "wamid-b",
      [LAST_INBOUND_AT_FIELD]: "2026-09-05T20:19:21.000Z"
    })
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, REASONS.STALE_OUTBOUND);
});

test("D. native human echo after authoring / before Graph suppresses send", async () => {
  await withIsolatedWorkflowState(async () => {
    await takeOverConversation(PHONE_A, {
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      reason: HANDOFF_REASONS.WHATSAPP_BUSINESS_APP
    });
    const result = await guardLastMeterAutomatedOutbound({
      actor: "ATLAS",
      prospect: { id: PROSPECT_A, phone: PHONE_A, organization_id: ORG_A },
      normalized: { providerMessageId: "wamid-a", phone: PHONE_A },
      engineResult: { source: "recruit_ai_v2_live_authoring", owner: "v2" }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "HUMAN_OWNED");
    assert.equal(result.handoffReason, HANDOFF_REASONS.WHATSAPP_BUSINESS_APP);
  });
});

test("E. native human echo before authoring blocks automated reply", async () => {
  await withIsolatedWorkflowState(async () => {
    const prospect = {
      id: PROSPECT_A,
      phone: PHONE_A,
      organization_id: ORG_A,
      current_step: "QUALIFICATION",
      entry_method: "QR",
      source: "car_magnet"
    };
    await takeOverConversation(PHONE_A, {
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      prospect,
      reason: HANDOFF_REASONS.WHATSAPP_BUSINESS_APP
    });
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);
    assert.equal(
      await shouldDeliverAutomatedReply(prospect, { allowHandoffAck: true }),
      false
    );
  });
});

test("F. Return to Atlas clears HUMAN seal and automation may resume", async () => {
  await withIsolatedWorkflowState(async () => {
    const prospect = {
      id: PROSPECT_A,
      phone: PHONE_A,
      organization_id: ORG_A,
      current_step: "QUALIFICATION",
      entry_method: "QR",
      source: "car_magnet"
    };
    await takeOverConversation(PHONE_A, {
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      reason: HANDOFF_REASONS.WHATSAPP_BUSINESS_APP
    });
    await returnConversationToAtlas(PHONE_A, {
      organizationId: ORG_A,
      prospectId: PROSPECT_A
    });
    assert.equal(await shouldDeliverAutomatedReply(prospect), true);
    const lastMeter = await guardLastMeterAutomatedOutbound({
      actor: "ATLAS",
      prospect,
      normalized: { providerMessageId: "wamid-resume", phone: PHONE_A },
      engineResult: {
        authoredInboundProviderMessageId: "wamid-resume"
      },
      loadWorkflowState: async () => ({
        manualAgentOwnership: false,
        humanTakenOverAt: null,
        [LAST_INBOUND_ID_FIELD]: "wamid-resume"
      })
    });
    assert.equal(lastMeter.allowed, true);
  });
});

test("G. different prospects in the same org process concurrently", async () => {
  resetConversationTurnLocksForTests();
  process.env.ATLAS_CONVERSATION_TURN_LOCK_BACKEND = "memory";
  const started = [];
  const order = [];
  let releaseA;
  const holdA = new Promise((resolve) => {
    releaseA = resolve;
  });

  const turnA = withConversationTurnLock(
    { organizationId: ORG_A, prospectId: PROSPECT_A },
    async () => {
      started.push("A");
      await holdA;
      order.push("A");
    }
  );
  await new Promise((resolve) => setImmediate(resolve));
  const turnB = withConversationTurnLock(
    { organizationId: ORG_A, prospectId: PROSPECT_B },
    async () => {
      started.push("B");
      order.push("B");
    }
  );

  await turnB;
  assert.deepEqual(started.sort(), ["A", "B"]);
  assert.ok(order.includes("B"));
  releaseA();
  await turnA;
  delete process.env.ATLAS_CONVERSATION_TURN_LOCK_BACKEND;
});

test("H. different orgs process concurrently", async () => {
  resetConversationTurnLocksForTests();
  process.env.ATLAS_CONVERSATION_TURN_LOCK_BACKEND = "memory";
  let releaseA;
  const holdA = new Promise((resolve) => {
    releaseA = resolve;
  });
  const started = [];

  const turnA = withConversationTurnLock(
    { organizationId: ORG_A, prospectId: PROSPECT_A },
    async () => {
      started.push("A");
      await holdA;
    }
  );
  await new Promise((resolve) => setImmediate(resolve));
  const turnB = withConversationTurnLock(
    { organizationId: ORG_B, prospectId: PROSPECT_A },
    async () => {
      started.push("B");
    }
  );
  await turnB;
  assert.ok(started.includes("B"));
  releaseA();
  await turnA;
  delete process.env.ATLAS_CONVERSATION_TURN_LOCK_BACKEND;
});

test("same conversation serializes later inbound behind the first", async () => {
  resetConversationTurnLocksForTests();
  process.env.ATLAS_CONVERSATION_TURN_LOCK_BACKEND = "memory";
  const order = [];
  let releaseA;
  const holdA = new Promise((resolve) => {
    releaseA = resolve;
  });

  const first = withConversationTurnLock(
    { organizationId: ORG_A, prospectId: PROSPECT_A },
    async () => {
      order.push("start-A");
      await holdA;
      order.push("end-A");
    }
  );
  await new Promise((resolve) => setImmediate(resolve));
  const second = withConversationTurnLock(
    { organizationId: ORG_A, prospectId: PROSPECT_A },
    async () => {
      order.push("B");
    }
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(order, ["start-A"]);
  releaseA();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["start-A", "end-A", "B"]);
  delete process.env.ATLAS_CONVERSATION_TURN_LOCK_BACKEND;
});

test("I. duplicate provider_message_id remains idempotent on human echo", async () => {
  const claimStore = new Set();
  const logs = [];
  const echoBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123",
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "1213865645144311" },
              message_echoes: [
                {
                  from: "17867528080",
                  to: "17543141700",
                  id: "wamid.DUP.1",
                  timestamp: "1700000100",
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
  const echo = parseWhatsAppWebhookPayload(echoBody).humanEchoes[0];
  const deps = {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: ORG_A,
      ownerUserId: null
    }),
    claimWhatsAppHumanEchoCorrelation: async ({ correlationId }) => {
      if (claimStore.has(correlationId)) {
        return { claimed: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
      }
      claimStore.add(correlationId);
      return { claimed: true };
    },
    findProspectInOrganization: async () => ({
      id: PROSPECT_A,
      phone: PHONE_A,
      name: "Samuel",
      current_step: "NEW",
      organization_id: ORG_A
    }),
    logConversation: async (data) => {
      logs.push(data);
      return { success: true, log: { id: `log-${logs.length}`, ...data } };
    },
    recordOutboundDelivery: async () => ({ success: true }),
    takeOverConversation: async () => ({
      ownershipState: "HUMAN",
      next: {
        manualAgentOwnership: true,
        humanTakenOverAt: new Date().toISOString(),
        handoffReason: HANDOFF_REASONS.WHATSAPP_BUSINESS_APP
      }
    })
  };

  const first = await processHumanWhatsAppOutboundEcho(echo, deps);
  const second = await processHumanWhatsAppOutboundEcho(echo, deps);
  assert.equal(first.success, true);
  assert.equal(second.skipped, true);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].organizationId, ORG_A);
});

test("human echo prospect path always persists organizationId", async () => {
  const logs = [];
  const echoBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123",
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "1213865645144311" },
              message_echoes: [
                {
                  from: "17867528080",
                  to: "17543141700",
                  id: "wamid.ORG.1",
                  timestamp: "1700000100",
                  type: "text",
                  text: { body: "Te confirmo" }
                }
              ]
            }
          }
        ]
      }
    ]
  };
  const echo = parseWhatsAppWebhookPayload(echoBody).humanEchoes[0];
  const result = await processHumanWhatsAppOutboundEcho(echo, {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: ORG_A,
      ownerUserId: null
    }),
    claimWhatsAppHumanEchoCorrelation: async () => ({ claimed: true }),
    findProspectInOrganization: async () => ({
      id: PROSPECT_A,
      phone: PHONE_A,
      name: "Samuel",
      current_step: "NEW",
      organization_id: ORG_A
    }),
    logConversation: async (data) => {
      logs.push(data);
      return { success: true, log: { id: "log-org", ...data } };
    },
    recordOutboundDelivery: async () => ({ success: true }),
    takeOverConversation: async () => ({
      ownershipState: "HUMAN",
      next: { manualAgentOwnership: true, humanTakenOverAt: new Date().toISOString() }
    })
  });
  assert.equal(result.success, true);
  assert.equal(logs[0].organizationId, ORG_A);
});

test("inbound coherence marker is durable and last-meter reads it", async () => {
  await withIsolatedWorkflowState(async () => {
    await recordProspectInboundCoherenceMarker({
      phone: PHONE_A,
      organizationId: ORG_A,
      prospectId: PROSPECT_A,
      providerMessageId: "wamid-dania",
      inboundAt: "2026-09-05T20:19:21.000Z"
    });
    const stored = await loadPersistedWorkflowState(PHONE_A, {
      organizationId: ORG_A,
      prospectId: PROSPECT_A
    });
    assert.equal(stored[LAST_INBOUND_ID_FIELD], "wamid-dania");
    const result = await guardLastMeterAutomatedOutbound({
      actor: "ATLAS",
      prospect: { id: PROSPECT_A, phone: PHONE_A, organization_id: ORG_A },
      normalized: { providerMessageId: "wamid-hola", phone: PHONE_A },
      engineResult: { authoredInboundProviderMessageId: "wamid-hola" }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.latestInboundProviderMessageId, "wamid-dania");
  });
});

test("observability event names are stable and PII-free", () => {
  assert.equal(EVENTS.REPLY_SUPPRESSED_STALE, "recruit_ai_v2.reply.suppressed_stale");
  assert.equal(
    EVENTS.REPLY_SUPPRESSED_HUMAN_OWNED,
    "recruit_ai_v2.reply.suppressed_human_owned"
  );
  const lock = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/lastMeterOutboundGuard.js"),
    "utf8"
  );
  assert.doesNotMatch(lock, /message body|rawMessage|prospect\.name/i);
});

test("J. booking / IUL last-meter does not block same-inbound confirmation", () => {
  const result = evaluateStaleInbound({
    authoredInboundProviderMessageId: "wamid-si",
    latestInboundProviderMessageId: "wamid-si",
    authoredVersion: 9,
    latestVersion: 10
  });
  assert.equal(result.stale, false);
});

test("lock key is org + prospect only", () => {
  assert.equal(lockKey(ORG_A, PROSPECT_A), `${ORG_A}::${PROSPECT_A}`);
  assert.equal(lockKey(ORG_A, PROSPECT_B) !== lockKey(ORG_B, PROSPECT_B), true);
  assert.equal(lockKey(null, PROSPECT_A), null);
});

test("production with Supabase uses the leased Postgres lock", () => {
  const { resolveLockBackend } = require("../core/recruitAiV2/conversationTurnLock");
  assert.equal(resolveLockBackend({ NODE_ENV: "production", SUPABASE_URL: "https://example.supabase.co" }), "postgres");
  assert.equal(resolveLockBackend({ NODE_ENV: "test", SUPABASE_URL: "https://example.supabase.co" }), "memory");
  assert.equal(resolveLockBackend({ NODE_ENV: "production" }), "memory");
});

test("same-inbound confirmation is not treated as a later inbound", async () => {
  const result = await guardLastMeterAutomatedOutbound({
    actor: "ATLAS",
    prospect: { id: PROSPECT_A, phone: PHONE_A, organization_id: ORG_A },
    normalized: { providerMessageId: "wamid-si", phone: PHONE_A },
    engineResult: {
      authoredInboundProviderMessageId: "wamid-si",
      v2Result: {
        nextContext: { _persistence: { contextVersion: 9 } },
        persistence: { result: { contextVersion: 9 } }
      }
    },
    loadWorkflowState: async () => ({
      [LAST_INBOUND_ID_FIELD]: "wamid-si"
    }),
    latestContext: { _persistence: { contextVersion: 10, lastProcessedMessageId: "wamid-si" } }
  });
  assert.equal(result.allowed, true);
});
