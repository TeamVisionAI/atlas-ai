/**
 * Mission Control /api/dashboard queue batching.
 * Synthetic fixtures only — no live tenant data.
 */

process.env.NODE_ENV = "test";
process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT || "1";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildPrioritizedWorkflowQueue,
  sortWorkflowQueue
} = require("../core/missionControlPriorityEngine");
const {
  CONVERSATION_PHONE_CHUNK,
  estimateBatchedQueueQueries,
  estimateLegacyQueueQueries,
  loadMissionControlQueueBatch,
  messageHintsFromLogs
} = require("../core/missionControlQueueBatch");
const { MILESTONES } = require("../core/workflowConstants");
const { isGlobalSuperAdminControlPlane } = require("../core/effectiveOrganizationContext");

const ORG = "21000000-0000-4000-8000-000000000317";
const OTHER_ORG = "21000000-0000-4000-8000-000000000999";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeProspect(overrides = {}) {
  const phone = overrides.phone || "+17865550100";
  return {
    id: overrides.id || `prospect-${phone.slice(-4)}`,
    organization_id: overrides.organization_id || ORG,
    phone,
    name: overrides.name || `Prospect ${phone.slice(-4)}`,
    current_step: overrides.current_step || "NEW",
    last_message: overrides.last_message || "",
    owner_user_id: overrides.owner_user_id || "41000000-0000-4000-8000-000000000317",
    acknowledged_at: overrides.acknowledged_at || new Date().toISOString(),
    workflow_state: overrides.workflow_state || {},
    source: overrides.source || "whatsapp"
  };
}

function queueOptions(extras = {}) {
  const queries = extras.queries || [];
  return {
    organizationId: ORG,
    fetchConversationLogsFn: extras.fetchConversationLogsFn || (async () => {
      queries.push("conversation");
      return extras.logs || [];
    }),
    listAppointmentsFn: extras.listAppointmentsFn || (async () => {
      queries.push("appointment");
      return { items: extras.appointments || [] };
    }),
    loadProspectPhoneOrgIndexFn: extras.loadProspectPhoneOrgIndexFn || (async () => {
      queries.push("phoneIndex");
      return extras.orgsByAlias || new Map();
    }),
    onQuery: extras.onQuery,
    stats: extras.stats || {},
    queries
  };
}

function phones(queue) {
  return queue.map((item) => item.phone);
}

test("empty queue stays empty with zero batch lookups", async () => {
  const queries = [];
  const queue = await buildPrioritizedWorkflowQueue([], queueOptions({ queries }));
  assert.deepEqual(queue, []);
  assert.deepEqual(queries, []);
});

test("one prospect returns a single ordered queue item", async () => {
  const prospect = makeProspect({ phone: "+17865550101", name: "One" });
  const queue = await buildPrioritizedWorkflowQueue([prospect], queueOptions());
  assert.equal(queue.length, 1);
  assert.equal(queue[0].phone, "+17865550101");
  assert.equal(queue[0].name, "One");
});

test("Needs Attention ranks above a quiet assigned lead", async () => {
  const quiet = makeProspect({
    phone: "+17865550110",
    workflow_state: { canonicalMilestone: MILESTONES.QUALIFICATION }
  });
  const attention = makeProspect({
    phone: "+17865550111",
    workflow_state: {
      canonicalMilestone: MILESTONES.QUALIFICATION,
      needsHumanAttention: true
    }
  });
  const queue = await buildPrioritizedWorkflowQueue([quiet, attention], queueOptions());
  assert.deepEqual(phones(queue), ["+17865550111", "+17865550110"]);
  assert.equal(queue[0].needsHumanAttention, true);
});

test("BR-044 appointment-close excludes Not Interested without a per-prospect lookup", async () => {
  let latestLookups = 0;
  const open = makeProspect({
    phone: "+17865550120",
    workflow_state: { canonicalMilestone: MILESTONES.INTERVIEW_READY }
  });
  const closed = makeProspect({
    phone: "+17865550121",
    workflow_state: { canonicalMilestone: MILESTONES.INTERVIEW_COMPLETED }
  });
  const queue = await buildPrioritizedWorkflowQueue(
    [open, closed],
    queueOptions({
      appointments: [
        {
          prospectPhone: "+17865550121",
          outcome: "not_interested",
          updatedAt: "2026-08-30T12:00:00.000Z",
          startDateTime: "2026-08-29T15:00:00.000Z"
        }
      ]
    })
  );
  assert.deepEqual(phones(queue), ["+17865550120"]);
  assert.equal(latestLookups, 0);
});

test("same fixtures produce the same queue contents and order", async () => {
  const prospects = [
    makeProspect({
      phone: "+17865550131",
      workflow_state: { canonicalMilestone: MILESTONES.NEW_LEAD }
    }),
    makeProspect({
      phone: "+17865550130",
      workflow_state: {
        canonicalMilestone: MILESTONES.QUALIFICATION,
        needsHumanAttention: true
      }
    }),
    makeProspect({
      phone: "+17865550132",
      current_step: "CLOSED",
      workflow_state: { canonicalMilestone: MILESTONES.CLOSED }
    })
  ];
  const options = () =>
    queueOptions({
      logs: [
        {
          prospect_phone: "+17865550130",
          direction: "outgoing",
          created_at: "2026-08-01T12:00:00.000Z",
          organization_id: ORG
        }
      ]
    });
  const first = await buildPrioritizedWorkflowQueue(prospects, options());
  const second = await buildPrioritizedWorkflowQueue(prospects, options());
  assert.deepEqual(phones(first), phones(second));
  assert.deepEqual(
    first.map((item) => item.missionControlPriority),
    second.map((item) => item.missionControlPriority)
  );
  assert.ok(!phones(first).includes("+17865550132"));
});

test("100+ synthetic prospects stay on a bounded query plan", async () => {
  const prospects = Array.from({ length: 120 }, (_, index) =>
    makeProspect({
      phone: `+1786555${String(2000 + index).padStart(4, "0")}`,
      id: `prospect-bulk-${index}`
    })
  );
  const queries = [];
  const stats = {};
  const queue = await buildPrioritizedWorkflowQueue(
    prospects,
    queueOptions({ queries, stats })
  );
  assert.equal(queue.length, 120);
  assert.deepEqual(phones(queue), sortWorkflowQueue(queue).map((item) => item.phone));
  assert.equal(queries.filter((name) => name === "conversation").length, 2);
  assert.equal(queries.filter((name) => name === "appointment").length, 1);
  assert.equal(queries.filter((name) => name === "phoneIndex").length, 1);
  assert.deepEqual(estimateBatchedQueueQueries(120), {
    conversationQueries: 2,
    phoneIndexQueries: 1,
    appointmentQueries: 1
  });
  const legacy = estimateLegacyQueueQueries(120, 120);
  assert.ok(legacy.conversationQueries + legacy.workflowQueries + legacy.appointmentQueries >= 360);
  assert.ok(queries.length < 8);
  assert.ok(CONVERSATION_PHONE_CHUNK >= 80);
});

test("wrong-org conversation rows cannot change queue hints", async () => {
  const prospect = makeProspect({ phone: "+17865550140" });
  const foreignHints = messageHintsFromLogs([
    {
      prospect_phone: "+17865550140",
      direction: "outgoing",
      created_at: "2026-01-01T00:00:00.000Z",
      organization_id: OTHER_ORG
    }
  ]);
  assert.equal(foreignHints.lastOutboundAt, "2026-01-01T00:00:00.000Z");

  const batch = await loadMissionControlQueueBatch([prospect], {
    organizationId: ORG,
    fetchConversationLogsFn: async () => [
      {
        prospect_phone: "+17865550140",
        direction: "outgoing",
        created_at: "2026-01-01T00:00:00.000Z",
        organization_id: OTHER_ORG
      }
    ],
    listAppointmentsFn: async () => ({ items: [] }),
    loadProspectPhoneOrgIndexFn: async () => new Map()
  });
  const kept = messageHintsFromLogs(batch.logsByPhone.get("+17865550140") || []);
  assert.equal(kept.lastOutboundAt, null);
});

test("synthetic large-org batch is faster than an O(n) delay model", async () => {
  const prospects = Array.from({ length: 120 }, (_, index) =>
    makeProspect({
      phone: `+1786556${String(index).padStart(4, "0")}`,
      id: `bench-${index}`
    })
  );
  const delayMs = 8;
  const started = Date.now();
  await buildPrioritizedWorkflowQueue(
    prospects,
    queueOptions({
      fetchConversationLogsFn: async () => {
        await sleep(delayMs);
        return [];
      },
      listAppointmentsFn: async () => {
        await sleep(delayMs);
        return { items: [] };
      },
      loadProspectPhoneOrgIndexFn: async () => {
        await sleep(delayMs);
        return new Map();
      }
    })
  );
  const elapsed = Date.now() - started;
  const legacy = estimateLegacyQueueQueries(120, 40);
  const legacySerialMs =
    (legacy.conversationQueries + legacy.workflowQueries + legacy.appointmentQueries) *
    delayMs;
  assert.ok(elapsed < legacySerialMs / 2, `batch elapsed ${elapsed}ms vs legacy ${legacySerialMs}ms`);
  assert.ok(legacySerialMs > 2000);
});

test("dashboard route keeps isolation, control plane, and Support Mode tenant bind", () => {
  const dashboard = fs.readFileSync(
    path.join(__dirname, "../routes/dashboard.js"),
    "utf8"
  );
  const engine = fs.readFileSync(
    path.join(__dirname, "../core/missionControlPriorityEngine.js"),
    "utf8"
  );
  assert.match(dashboard, /operationalControlPlaneEmpty\(emptyDashboard\)/);
  assert.match(dashboard, /getTenantOrganizationId/);
  assert.match(dashboard, /organizationGuard/);
  assert.match(dashboard, /buildPrioritizedWorkflowQueue\(prospects, \{ organizationId \}\)/);
  assert.match(dashboard, /Promise\.all/);
  assert.match(engine, /loadMissionControlQueueBatch/);
  assert.match(engine, /workflowStateFromProspectRow/);
  assert.doesNotMatch(engine, /fetchMessageHints\(/);
  assert.equal(isGlobalSuperAdminControlPlane({ saasRole: "SUPER_ADMIN" }, null), true);
  assert.equal(
    isGlobalSuperAdminControlPlane({ saasRole: "SUPER_ADMIN" }, { organizationId: ORG }),
    false
  );
});
