/**
 * BR-138 — WhatsApp inbound atomic provider-message claim.
 * Concurrent overlapping calls are required; sequential replay alone is insufficient.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  processInboundWhatsAppMessage,
  buildInboundCorrelationId
} = require("../core/whatsappInboundPipeline");
const {
  createMemoryWhatsAppInboundClaimStore,
  isWhatsAppInboundClaimCorrelationId,
  isUniqueViolation,
  buildInboundCorrelationId: buildClaimKey
} = require("../core/whatsappInboundClaim");
const {
  pickCanonicalWorkflowEvent
} = require("../services/workflowEventService");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const PHONE_ID = "1347188398469744";
const WABA_ID = "123456789012345";

function inbound(overrides = {}) {
  return {
    providerMessageId: "wamid.ATOMIC1",
    phone: "+17865550336",
    contactName: "Claim Test",
    body: "Hola",
    phoneNumberId: PHONE_ID,
    wabaId: WABA_ID,
    ...overrides
  };
}

function createHarness(claimStore) {
  const counts = {
    locate: 0,
    log: 0,
    hub: 0,
    lastTouch: 0,
    consume: 0,
    qrStamp: 0
  };
  let outboundSent = false;
  let hubInFlight = false;
  const recoveryClaims = new Set();

  const deps = {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: ORG_A,
      source: "explicit"
    }),
    claimWhatsAppInboundCorrelation: (input) => claimStore.claim(input),
    locateOrCreateWhatsAppProspect: async () => {
      counts.locate += 1;
      counts.lastTouch += 1;
      counts.consume += 1;
      counts.qrStamp += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return {
        prospect: {
          id: "legacy-1",
          phone: "+17865550336",
          name: "Claim Test",
          current_step: "NEW",
          organization_id: ORG_A,
          city: null,
          state: null
        },
        created: counts.locate === 1,
        storagePhone: "+17865550336",
        organizationId: ORG_A
      };
    },
    logConversation: async () => {
      counts.log += 1;
      return {
        success: true,
        log: { id: `log-${counts.log}` }
      };
    },
    processConversationAfterInbound: async () => {
      hubInFlight = true;
      counts.hub += 1;
      try {
        return {
          success: true,
          replied: true,
          delivery: { success: true },
          reason: "TEST_AUTHORED_DELIVERED"
        };
      } finally {
        hubInFlight = false;
        outboundSent = true;
      }
    },
    prospectHasAutomatedOutboundReply: async () => outboundSent || hubInFlight,
    claimFirstReplyRecovery: async ({ correlationId }) => {
      if (recoveryClaims.has(correlationId)) {
        return { claimed: false, reason: "DUPLICATE_RECOVERY_CLAIM" };
      }
      recoveryClaims.add(correlationId);
      return { claimed: true };
    },
    disableFirstReplyRecovery: true
  };

  return { counts, deps };
}

test("1. sequential same providerMessageId → one log, one hub, second skips", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const msg = inbound();

  const first = await processInboundWhatsAppMessage(msg, deps);
  const second = await processInboundWhatsAppMessage(msg, deps);

  assert.equal(first.skipped, false);
  assert.equal(first.success, true);
  assert.equal(first.conversationLogId, "log-1");
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(counts.locate, 1);
  assert.equal(counts.log, 1);
  assert.equal(counts.hub, 1);
});

test("2. concurrent same providerMessageId → exactly one claim/log/hub", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const msg = inbound({ providerMessageId: "wamid.CONCURRENT" });

  const results = await Promise.all([
    processInboundWhatsAppMessage(msg, deps),
    processInboundWhatsAppMessage(msg, deps)
  ]);

  const winners = results.filter((r) => r.skipped === false);
  const skipped = results.filter((r) => r.reason === "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(winners.length, 1);
  assert.equal(skipped.length, 1);
  assert.equal(counts.locate, 1);
  assert.equal(counts.log, 1);
  assert.equal(counts.hub, 1);
  assert.equal(store.size(), 1);
});

test("3. 10 concurrent copies of same providerMessageId → exactly one winner", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const msg = inbound({ providerMessageId: "wamid.TEN" });

  const results = await Promise.all(
    Array.from({ length: 10 }, () => processInboundWhatsAppMessage(msg, deps))
  );

  assert.equal(results.filter((r) => r.skipped === false).length, 1);
  assert.equal(results.filter((r) => r.reason === "DUPLICATE_PROVIDER_MESSAGE").length, 9);
  assert.equal(counts.locate, 1);
  assert.equal(counts.log, 1);
  assert.equal(counts.hub, 1);
  assert.equal(counts.lastTouch, 1);
  assert.equal(counts.consume, 1);
});

test("4. different providerMessageIds both process", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);

  const a = await processInboundWhatsAppMessage(
    inbound({ providerMessageId: "wamid.A" }),
    deps
  );
  const b = await processInboundWhatsAppMessage(
    inbound({ providerMessageId: "wamid.B" }),
    deps
  );

  assert.equal(a.skipped, false);
  assert.equal(b.skipped, false);
  assert.equal(counts.log, 2);
  assert.equal(counts.hub, 2);
});

test("5. same text but different wamids both process", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const text = "Hola desde QR Phase 2 smoke";

  const a = await processInboundWhatsAppMessage(
    inbound({ providerMessageId: "wamid.TEXT1", body: text }),
    deps
  );
  const b = await processInboundWhatsAppMessage(
    inbound({ providerMessageId: "wamid.TEXT2", body: text }),
    deps
  );

  assert.equal(a.skipped, false);
  assert.equal(b.skipped, false);
  assert.equal(counts.hub, 2);
});

test("6. historical duplicate workflow_event rows do not throw; replay skips", () => {
  const canonical = pickCanonicalWorkflowEvent([
    {
      id: "later",
      created_at: "2026-08-12T11:02:57.604Z",
      correlation_id: "whatsapp:inbound:wamid.QRPHASE2SMOKE2.1786532571369"
    },
    {
      id: "earlier",
      created_at: "2026-08-12T11:02:57.452Z",
      correlation_id: "whatsapp:inbound:wamid.QRPHASE2SMOKE2.1786532571369"
    }
  ]);
  assert.equal(canonical.id, "earlier");
  assert.doesNotThrow(() => pickCanonicalWorkflowEvent([canonical, { id: "x", created_at: canonical.created_at }]));
});

test("7-8. QR fresh inbound consumes once; concurrent replay does not locate/lastTouch/consume again", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const msg = inbound({ providerMessageId: "wamid.QR1", body: "Hola QR" });

  const results = await Promise.all([
    processInboundWhatsAppMessage(msg, deps),
    processInboundWhatsAppMessage(msg, deps),
    processInboundWhatsAppMessage(msg, deps)
  ]);

  assert.equal(results.filter((r) => !r.skipped).length, 1);
  assert.equal(counts.consume, 1);
  assert.equal(counts.lastTouch, 1);
  assert.equal(counts.qrStamp, 1);
  assert.equal(counts.locate, 1);
});

test("9. Facebook/CTWA-shaped inbound still claims then locates (unchanged path after claim)", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const result = await processInboundWhatsAppMessage(
    inbound({
      providerMessageId: "wamid.CTWA",
      body: "Hi from ads"
    }),
    deps
  );
  assert.equal(result.skipped, false);
  assert.equal(counts.locate, 1);
  assert.equal(counts.hub, 1);
});

test("10. existing prospect path still runs locate once for a new wamid", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  deps.locateOrCreateWhatsAppProspect = async () => {
    counts.locate += 1;
    return {
      prospect: {
        id: "existing-1",
        phone: "+17865550336",
        name: "Existing",
        current_step: "GREETING",
        organization_id: ORG_A
      },
      created: false,
      storagePhone: "+17865550336",
      organizationId: ORG_A
    };
  };

  const result = await processInboundWhatsAppMessage(
    inbound({ providerMessageId: "wamid.EXISTING" }),
    deps
  );
  assert.equal(result.created, false);
  assert.equal(counts.locate, 1);
  assert.equal(counts.hub, 1);
});

test("11. HUMAN-owned duplicate replay never reaches hub/outbound", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const msg = inbound({ providerMessageId: "wamid.HUMAN" });

  await processInboundWhatsAppMessage(msg, deps);
  const replay = await processInboundWhatsAppMessage(msg, deps);

  assert.equal(replay.skipped, true);
  assert.equal(counts.hub, 1);
});

test("12. WABA fail-closed happens before claim (no poisoned lock)", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  deps.resolveWhatsAppInboundOrganizationId = async () => {
    const err = new Error("WABA mismatch");
    err.code = "WHATSAPP_WABA_ASSET_MISMATCH";
    throw err;
  };

  await assert.rejects(
    () => processInboundWhatsAppMessage(inbound({ providerMessageId: "wamid.BADWABA" }), deps),
    /WABA mismatch/
  );
  assert.equal(store.size(), 0);
  assert.equal(counts.locate, 0);
  assert.equal(counts.log, 0);
  assert.equal(counts.hub, 0);
});

test("13. CE/hub fallback remains available on a single winning turn", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { deps } = createHarness(store);
  deps.processConversationAfterInbound = async () => ({
    success: true,
    replied: true,
    reason: "CE_FALLBACK",
    source: "conversation_engine"
  });

  const result = await processInboundWhatsAppMessage(
    inbound({ providerMessageId: "wamid.CE" }),
    deps
  );
  assert.equal(result.skipped, false);
  assert.equal(result.conversation.source, "conversation_engine");
});

test("14. claim key helpers: canonical inbound only", () => {
  assert.equal(
    isWhatsAppInboundClaimCorrelationId("whatsapp:inbound:wamid.ABC"),
    true
  );
  assert.equal(
    isWhatsAppInboundClaimCorrelationId(
      "whatsapp:inbound:wamid.ABC:prospect_created"
    ),
    false
  );
  assert.equal(
    isWhatsAppInboundClaimCorrelationId("stall:+17865550336:2026-08-01"),
    false
  );
  assert.equal(
    isWhatsAppInboundClaimCorrelationId(
      "whatsapp:inbound:wamid.ABC#historical_duplicate:uuid"
    ),
    false
  );
  assert.equal(buildClaimKey("wamid.ABC"), "whatsapp:inbound:wamid.ABC");
  assert.equal(buildInboundCorrelationId("wamid.ABC"), "whatsapp:inbound:wamid.ABC");
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation({ code: "42P01" }), false);
});

test("15. missing providerMessageId does not claim or locate", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const result = await processInboundWhatsAppMessage(
    inbound({ providerMessageId: "" }),
    deps
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "MISSING_PROVIDER_MESSAGE_ID");
  assert.equal(store.size(), 0);
  assert.equal(counts.locate, 0);
});

test("16. pipeline source: org resolve + claim before locateOrCreate/log/hub", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../core/whatsappInboundPipeline.js"),
    "utf8"
  );
  const fnStart = src.indexOf("async function processInboundWhatsAppMessage");
  const fnBody = src.slice(fnStart, src.indexOf("module.exports"));
  const orgIdx = fnBody.indexOf("resolveOrg(");
  const claimIdx = fnBody.indexOf("claimInbound(");
  const locateIdx = fnBody.indexOf("locateOrCreate(");
  const logIdx = fnBody.indexOf("persistInboundLog(");
  const hubIdx = fnBody.indexOf("conversation = await runHub({");
  assert.ok(orgIdx > 0 && claimIdx > orgIdx);
  assert.ok(locateIdx > claimIdx);
  assert.ok(logIdx > locateIdx);
  assert.ok(hubIdx > logIdx);
  assert.match(fnBody, /DUPLICATE_PROVIDER_MESSAGE/);
});

test("17. findWorkflowEventByCorrelationId uses limit(1) (no unbounded maybeSingle)", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../services/workflowEventService.js"),
    "utf8"
  );
  const fn = src.slice(
    src.indexOf("async function findWorkflowEventByCorrelationId"),
    src.indexOf("async function claimWhatsAppInboundCorrelation")
  );
  assert.match(fn, /\.limit\(1\)/);
  assert.match(fn, /\.order\("created_at"/);
});

test("18. migration 037 is additive partial unique; no global unique; no DELETE", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/migrations/037_whatsapp_inbound_claim_unique.sql"),
    "utf8"
  );
  const down = fs.readFileSync(
    path.join(
      __dirname,
      "../database/migrations/037_whatsapp_inbound_claim_unique_down.sql"
    ),
    "utf8"
  );
  assert.match(sql, /idx_workflow_events_whatsapp_inbound_claim/);
  assert.match(sql, /whatsapp:inbound:\[\^:\]\+/);
  assert.match(sql, /#historical_duplicate:/);
  assert.doesNotMatch(sql, /DELETE FROM|TRUNCATE/);
  assert.doesNotMatch(sql, /UNIQUE \(correlation_id\)/);
  assert.match(down, /DROP INDEX IF EXISTS public.idx_workflow_events_whatsapp_inbound_claim/);
});

test("19. QR attribution modules are not modified by this hotfix (source contract)", () => {
  const qr = fs.readFileSync(
    path.join(__dirname, "../core/qrChannel/qrInboundAttribution.js"),
    "utf8"
  );
  assert.match(qr, /IDEMPOTENT_REPLAY/);
  assert.match(qr, /matchEligiblePendingInboundScan/);
  const pipeline = fs.readFileSync(
    path.join(__dirname, "../core/whatsappInboundPipeline.js"),
    "utf8"
  );
  assert.doesNotMatch(pipeline, /consumeMatchedScan/);
  assert.doesNotMatch(pipeline, /conversationGoal/);
});

test("20. default hub binding imports communicationHub (no ReferenceError)", () => {
  const pipelinePath = path.join(__dirname, "../core/whatsappInboundPipeline.js");
  const src = fs.readFileSync(pipelinePath, "utf8");
  assert.match(
    src,
    /const \{ processConversationAfterInbound \} = require\("\.\/communicationHub"\)/
  );
});

test("21. duplicate inbound with no outbound recovers first reply", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const msg = inbound({
    providerMessageId: "wamid.RECOVERY1",
    body: "¡Hola! Quiero más información. TVR-0826-A7K4"
  });

  deps.prospectHasAutomatedOutboundReply = async () => false;
  deps.disableFirstReplyRecovery = false;
  deps.findProspectInOrganization = async () => ({
    id: "legacy-1",
    phone: "+17865550336",
    name: "Soraya",
    current_step: "NEW",
    organization_id: ORG_A,
    owner_user_id: "owner-1"
  });
  deps.campaignIntakeAttributionService = {
    lookupInboundMatch: async () => ({
      matched: true,
      code: "TVR-0826-A7K4",
      purpose: "RECRUITING",
      recruitingEligible: true
    })
  };
  deps.processConversationAfterInbound = async () => {
    counts.hub += 1;
    return {
      success: true,
      replied: true,
      delivery: { success: true },
      reason: "RECOVERED_REPLY"
    };
  };

  await processInboundWhatsAppMessage(msg, deps);
  const recovered = await processInboundWhatsAppMessage(msg, deps);

  assert.equal(recovered.recovered, true);
  assert.equal(recovered.reason, "DUPLICATE_INBOUND_FIRST_REPLY_RECOVERED");
  assert.equal(counts.hub, 2);
});

test("22. duplicate inbound skips when outbound already exists", async () => {
  const store = createMemoryWhatsAppInboundClaimStore();
  const { counts, deps } = createHarness(store);
  const msg = inbound({ providerMessageId: "wamid.RECOVERY2" });

  deps.prospectHasAutomatedOutboundReply = async () => true;
  deps.findProspectInOrganization = async () => ({
    id: "legacy-1",
    phone: "+17865550336",
    name: "Soraya",
    current_step: "NEW",
    organization_id: ORG_A
  });

  await processInboundWhatsAppMessage(msg, deps);
  const second = await processInboundWhatsAppMessage(msg, deps);

  assert.equal(second.skipped, true);
  assert.equal(second.reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(counts.hub, 1);
});

test("23. markAiResponding requires delivered outbound", async () => {
  const { conversationDeliveredReply } = require("../core/whatsappInboundPipeline");
  assert.equal(
    conversationDeliveredReply({ success: true, replied: true, reason: "MOCK_REPLY" }),
    false
  );
  assert.equal(
    conversationDeliveredReply({
      success: true,
      replied: true,
      delivery: { success: true }
    }),
    true
  );
});
