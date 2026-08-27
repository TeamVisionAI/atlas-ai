/**
 * BR-163 — 24h customer-care window archives Active threads and reactivates on inbound.
 */

require("dotenv").config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INBOX_LIFECYCLE,
  INBOX_CLOSE_REASONS,
  resolveInboxLifecycle,
  isActiveInboxLifecycle
} = require("../core/conversationsCenter/conversationsCenterLifecycle");
const {
  matchesFilter,
  buildConversationListItem
} = require("../core/conversationsCenter/conversationsCenterReadModel");
const { CONVERSATION_FILTERS } = require("../core/conversationsCenter/constants");
const {
  latestQualifyingInboundAt,
  evaluateWindowFromLogs,
  shouldDeriveWindowExpiredArchive,
  shouldReactivateOnInbound,
  persistWindowExpiredArchive,
  reactivateWindowExpiredConversation
} = require("../core/conversationsCenter/conversationWindowInboxEngine");
const { CUSTOMER_CARE_WINDOW_MS } = require("../core/whatsappCustomerCareWindowMath");
const { savePersistedWorkflowState } = require("../core/workflowStateStore");
const { recruitingProspectFixture } = require("./helpers/conversationsCenterRecruitingFixture");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const NOW = "2026-08-27T20:00:00.000Z";

function inbound(hoursAgo, extras = {}) {
  return {
    direction: "incoming",
    message: extras.message || "hola",
    created_at: new Date(Date.parse(NOW) - hoursAgo * 3600 * 1000).toISOString(),
    organization_id: extras.organizationId || ORG_A,
    ...extras
  };
}

test("active inbound under 24h stays Active", () => {
  const windowEval = evaluateWindowFromLogs([inbound(2)], NOW);
  assert.equal(windowEval.open, true);
  const lifecycle = resolveInboxLifecycle({
    prospect: { current_step: "QUALIFICATION" },
    persisted: {},
    customerCareWindow: windowEval
  });
  assert.equal(lifecycle.lifecycle, INBOX_LIFECYCLE.ACTIVE);
  assert.equal(isActiveInboxLifecycle(lifecycle.lifecycle), true);
});

test("inbound older than 24h moves Active to Archived", () => {
  const windowEval = evaluateWindowFromLogs([inbound(25)], NOW);
  assert.equal(windowEval.open, false);
  assert.equal(windowEval.reason, "WINDOW_EXPIRED");
  const lifecycle = resolveInboxLifecycle({
    prospect: { current_step: "QUALIFICATION" },
    persisted: {},
    customerCareWindow: windowEval
  });
  assert.equal(lifecycle.lifecycle, INBOX_LIFECYCLE.ARCHIVED);
  assert.equal(lifecycle.closeReason, INBOX_CLOSE_REASONS.WINDOW_EXPIRED);
  assert.equal(
    matchesFilter({ inboxLifecycle: lifecycle.lifecycle }, CONVERSATION_FILTERS.ACTIVE),
    false
  );
  assert.equal(
    matchesFilter({ inboxLifecycle: lifecycle.lifecycle }, CONVERSATION_FILTERS.ARCHIVED),
    true
  );
});

test("read/delivery/reaction and Atlas outbound do not reset the window", () => {
  const stale = inbound(30);
  const logs = [
    stale,
    {
      direction: "incoming",
      message: "read",
      intent: "WHATSAPP_STATUS",
      pipeline: "SYSTEM",
      created_at: NOW
    },
    {
      direction: "incoming",
      message: "[reaction]",
      intent: "REACTION",
      pipeline: "DIAGNOSTIC",
      created_at: NOW
    },
    {
      direction: "outgoing",
      message: "Seguimos aquí",
      created_at: NOW
    }
  ];
  assert.equal(latestQualifyingInboundAt(logs), stale.created_at);
  const windowEval = evaluateWindowFromLogs(logs, NOW);
  assert.equal(windowEval.open, false);
  assert.equal(shouldDeriveWindowExpiredArchive({ persisted: {}, customerCareWindow: windowEval }), true);
});

test("new inbound after archive reactivates without creating a second identity", async () => {
  const phone = "+17865551111";
  await persistWindowExpiredArchive({
    phone,
    organizationId: ORG_A,
    prospectId: "prospect-a",
    now: NOW
  });
  const archived = await reactivateWindowExpiredConversation({
    phone,
    organizationId: ORG_A,
    prospectId: "prospect-a"
  });
  assert.equal(archived.reactivated, true);
  assert.equal(archived.next.inboxArchivedAt, null);
  assert.equal(archived.next.inboxWindowExpiredAt, null);
  assert.equal(archived.previous.workflowOwnership, archived.next.workflowOwnership);
});

test("same phone in two tenants uses org-scoped inbound independently", () => {
  const logsA = [inbound(2, { organizationId: ORG_A })];
  const logsB = [inbound(30, { organizationId: ORG_B })];
  assert.equal(evaluateWindowFromLogs(logsA, NOW).open, true);
  assert.equal(evaluateWindowFromLogs(logsB, NOW).open, false);
});

test("closed and test threads are not auto-archived or auto-restored", () => {
  const windowEval = evaluateWindowFromLogs([inbound(40)], NOW);
  const closed = resolveInboxLifecycle({
    prospect: { current_step: "QUALIFICATION" },
    persisted: { inboxClosedAt: NOW, inboxCloseReason: "NOT_INTERESTED" },
    customerCareWindow: windowEval
  });
  const testThread = resolveInboxLifecycle({
    prospect: { current_step: "QUALIFICATION", source: "TEST" },
    persisted: { inboxMarkedTestAt: NOW },
    customerCareWindow: windowEval
  });
  assert.equal(closed.lifecycle, INBOX_LIFECYCLE.CLOSED);
  assert.equal(testThread.lifecycle, INBOX_LIFECYCLE.TEST);
  assert.equal(
    shouldReactivateOnInbound({
      inboxArchivedAt: NOW,
      inboxClosedAt: NOW
    }),
    false
  );
});

test("human ownership and campaign fields survive window archive persist", async () => {
  const phone = "+17865553333";
  await savePersistedWorkflowState(
    phone,
    {
      workflowOwnership: "AGENT",
      manualAgentOwnership: true,
      humanTakenOverAt: "2026-08-26T12:00:00.000Z",
      conversationGoal: "recruiting",
      campaignCode: "car_recruiting_01"
    },
    { organizationId: ORG_A, prospectId: "human-1" }
  );
  const next = await persistWindowExpiredArchive({
    phone,
    organizationId: ORG_A,
    prospectId: "human-1",
    now: NOW
  });
  assert.equal(next.workflowOwnership, "AGENT");
  assert.equal(next.manualAgentOwnership, true);
  assert.equal(next.humanTakenOverAt, "2026-08-26T12:00:00.000Z");
  assert.equal(next.inboxCloseReason, INBOX_CLOSE_REASONS.WINDOW_EXPIRED);
});

test("fail closed without organization_id", async () => {
  await assert.rejects(
    () => persistWindowExpiredArchive({ phone: "+17865554444", organizationId: null }),
    /organization_id is required/
  );
});

test("window duration matches BR-075", () => {
  assert.equal(CUSTOMER_CARE_WINDOW_MS, 24 * 60 * 60 * 1000);
});

test("injected conversation lists do not persist window archives", async () => {
  const { buildConversationsCenterReadModel } = require("../core/conversationsCenter/conversationsCenterReadModel");
  const model = await buildConversationsCenterReadModel({
    organizationId: ORG_A,
    filter: CONVERSATION_FILTERS.ACTIVE,
    persistWindowArchive: false,
    conversationLogsByPhone: {
      "+17865556666": [inbound(30)]
    },
    prospects: [
      recruitingProspectFixture({
        id: "p-inject",
        phone: "+17865556666",
        organization_id: ORG_A,
        name: "Stale",
        current_step: "QUALIFICATION"
      })
    ]
  });
  assert.equal(model.items.length, 0);
  assert.equal(model.counts.archived >= 1, true);
});

test("list item uses qualifying inbound for lifecycle", async () => {
  const item = await buildConversationListItem(
    recruitingProspectFixture({
      id: "p1",
      phone: "+17865555555",
      organization_id: ORG_A,
      name: "Ana",
      current_step: "QUALIFICATION"
    }),
    {
      persisted: {},
      logs: [inbound(26)],
      now: NOW
    }
  );
  assert.equal(item.inboxLifecycle, INBOX_LIFECYCLE.ARCHIVED);
});
