/**
 * Conversations unread + lastCommunicationAt + mark-read (not BR-080).
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const MEMORY = { backend: "memory" };

const {
  computeLastCommunication,
  computeUnreadState,
  isRealWhatsAppCommunication,
  activitySortMs
} = require("../core/conversationsCenter/conversationsUnreadEngine");
const {
  markConversationRead
} = require("../core/conversationsCenter/conversationsReadCursorService");
const {
  savePersistedWorkflowState,
  loadPersistedWorkflowState
} = require("../core/workflowStateStore");
const { OWNERSHIP } = require("../core/workflowConstants");

function withMemoryWorkflow(run) {
  return Promise.resolve().then(run);
}

function inbound(at, text, extras = {}) {
  return {
    id: extras.id || `in-${at}`,
    direction: "incoming",
    message: text,
    created_at: at,
    ...extras
  };
}

function outbound(at, text, extras = {}) {
  return {
    id: extras.id || `out-${at}`,
    direction: "outgoing",
    message: text,
    created_at: at,
    ...extras
  };
}

test("1–2. prospect inbound creates unread and increments", () => {
  const first = [inbound("2026-08-13T10:00:00.000Z", "hola")];
  const one = computeUnreadState({ logs: first, lastReadInboundAt: null });
  assert.equal(one.unread, true);
  assert.equal(one.unreadCount, 1);

  const two = computeUnreadState({
    logs: [
      ...first,
      inbound("2026-08-13T10:05:00.000Z", "¿siguen ahí?")
    ],
    lastReadInboundAt: null
  });
  assert.equal(two.unread, true);
  assert.equal(two.unreadCount, 2);
});

test("3–5. Atlas/Human outbound and system events do not create unread", () => {
  const logs = [
    outbound("2026-08-13T10:00:00.000Z", "Hola, soy Atlas"),
    outbound("2026-08-13T10:01:00.000Z", "Te escribo desde el equipo", {
      pipeline: "HUMAN"
    }),
    {
      direction: "incoming",
      message: "[Required Information Updated]",
      intent: "REQUIRED_INFORMATION_UPDATED",
      created_at: "2026-08-13T10:02:00.000Z"
    },
    {
      direction: "outgoing",
      message: "[workflow] milestone saved",
      pipeline: "WORKFLOW",
      created_at: "2026-08-13T10:03:00.000Z"
    },
    {
      direction: "incoming",
      message: "[Agent note] internal only",
      created_at: "2026-08-13T10:04:00.000Z"
    }
  ];

  assert.equal(isRealWhatsAppCommunication(logs[0]), true);
  assert.equal(isRealWhatsAppCommunication(logs[1]), true);
  assert.equal(isRealWhatsAppCommunication(logs[2]), false);
  assert.equal(isRealWhatsAppCommunication(logs[3]), false);
  assert.equal(isRealWhatsAppCommunication(logs[4]), false);

  const unread = computeUnreadState({ logs, lastReadInboundAt: null });
  assert.equal(unread.unread, false);
  assert.equal(unread.unreadCount, 0);
});

test("conservative no-cursor unread is trailing inbound after last outbound", () => {
  const logs = [
    inbound("2026-08-13T09:00:00.000Z", "old inbound"),
    outbound("2026-08-13T10:00:00.000Z", "Atlas replied"),
    inbound("2026-08-13T11:00:00.000Z", "new inbound")
  ];
  const unread = computeUnreadState({ logs, lastReadInboundAt: null });
  assert.equal(unread.unreadCount, 1);
});

test("6–8. mark-read clears unread without mutating ownership or BR-080 fields", async () => {
  await withMemoryWorkflow(async () => {
    const phone = "+17865558001";
    await savePersistedWorkflowState(
      phone,
      {
        workflowOwnership: OWNERSHIP.ATLAS,
        manualAgentOwnership: false,
        needsHumanAttention: true,
        stalledAt: "2026-08-13T08:00:00.000Z",
        stallEpisodeKey: "stall-1",
        humanTakenOverAt: null,
        handoffReason: "ambiguity"
      },
      MEMORY
    );

    const logs = [
      inbound("2026-08-13T11:00:00.000Z", "necesito ayuda"),
      inbound("2026-08-13T11:05:00.000Z", "hola?")
    ];
    assert.equal(
      computeUnreadState({ logs, lastReadInboundAt: null }).unreadCount,
      2
    );

    const result = await markConversationRead({
      phone,
      lastReadInboundAt: "2026-08-13T11:06:00.000Z",
      lastSeenInboundMessageId: "in-2026-08-13T11:05:00.000Z",
      backend: "memory"
    });

    assert.equal(result.ownershipUnchanged, true);
    const persisted = await loadPersistedWorkflowState(phone, MEMORY);
    assert.equal(persisted.workflowOwnership, OWNERSHIP.ATLAS);
    assert.equal(persisted.manualAgentOwnership, false);
    assert.equal(persisted.needsHumanAttention, true);
    assert.equal(persisted.stalledAt, "2026-08-13T08:00:00.000Z");
    assert.equal(persisted.stallEpisodeKey, "stall-1");
    assert.equal(persisted.humanTakenOverAt, null);
    assert.equal(persisted.handoffReason, "ambiguity");
    assert.equal(
      persisted.conversationsLastReadInboundAt,
      "2026-08-13T11:06:00.000Z"
    );

    assert.equal(
      computeUnreadState({
        logs,
        lastReadInboundAt: persisted.conversationsLastReadInboundAt
      }).unreadCount,
      0
    );
  });
});

test("19. unread cursor persists across a fresh load", async () => {
  await withMemoryWorkflow(async () => {
    const phone = "+17865558002";
    await markConversationRead({
      phone,
      lastReadInboundAt: "2026-08-13T12:00:00.000Z",
      backend: "memory"
    });
    const again = await loadPersistedWorkflowState(phone, MEMORY);
    assert.equal(again.conversationsLastReadInboundAt, "2026-08-13T12:00:00.000Z");
  });
});

test("9–11. lastCommunicationAt sorts real WhatsApp; system events ignored", () => {
  const older = computeLastCommunication([
    inbound("2026-08-13T09:00:00.000Z", "ayer")
  ]);
  const newerInbound = computeLastCommunication([
    inbound("2026-08-13T12:00:00.000Z", "ahora")
  ]);
  const afterSystem = computeLastCommunication([
    inbound("2026-08-13T12:00:00.000Z", "ahora"),
    {
      direction: "outgoing",
      message: "[Required Information Updated]",
      intent: "REQUIRED_INFORMATION_UPDATED",
      created_at: "2026-08-13T12:30:00.000Z"
    }
  ]);
  const afterOutbound = computeLastCommunication([
    inbound("2026-08-13T12:00:00.000Z", "ahora"),
    outbound("2026-08-13T12:45:00.000Z", "Claro, te ayudo")
  ]);

  assert.ok(
    Date.parse(newerInbound.lastCommunicationAt) >
      Date.parse(older.lastCommunicationAt)
  );
  assert.equal(afterSystem.lastCommunicationAt, newerInbound.lastCommunicationAt);
  assert.equal(afterSystem.lastMessagePreview, "ahora");
  assert.equal(afterOutbound.lastDirection, "outbound");
  assert.equal(afterOutbound.lastMessagePreview, "Claro, te ayudo");
  assert.ok(
    activitySortMs({ lastCommunicationAt: afterOutbound.lastCommunicationAt }) >
      activitySortMs({ lastCommunicationAt: newerInbound.lastCommunicationAt })
  );
});

test("read model: inbound unread + sort + system event does not reorder", async () => {
  await withMemoryWorkflow(async () => {
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    const prospects = [
      {
        id: "p-old",
        phone: "+17865558110",
        name: "Older Comm",
        organization_id: TEAM_VISION,
        owner_user_id: NIOVEL,
        last_message: "stale preview",
        updated_at: "2026-08-13T18:00:00.000Z"
      },
      {
        id: "p-new",
        phone: "+17865558111",
        name: "Nancy Ortiz",
        organization_id: TEAM_VISION,
        owner_user_id: NIOVEL,
        last_message: "[Required Information Updated]",
        updated_at: "2026-08-13T08:00:00.000Z"
      }
    ];

    const logsByPhone = {
      "+17865558110": [outbound("2026-08-13T09:00:00.000Z", "Atlas ayer")],
      "+17865558111": [
        inbound("2026-08-13T11:00:00.000Z", "Hola soy Nancy", { id: "n1" }),
        inbound("2026-08-13T11:10:00.000Z", "¿Me pueden llamar?", { id: "n2" }),
        {
          direction: "incoming",
          message: "[Required Information Updated]",
          intent: "REQUIRED_INFORMATION_UPDATED",
          created_at: "2026-08-13T19:00:00.000Z"
        }
      ]
    };

    const model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects,
      conversationLogsByPhone: logsByPhone
    });

    assert.equal(model.items[0].phone, "+17865558111");
    assert.equal(model.items[0].unread, true);
    assert.equal(model.items[0].unreadCount, 2);
    assert.equal(model.items[0].lastMessagePreview, "¿Me pueden llamar?");
    assert.equal(model.items[0].lastDirection, "inbound");
    assert.equal(model.items[1].phone, "+17865558110");
    assert.equal(model.items[1].unread, false);
    assert.equal(model.items[1].unreadCount, 0);
  });
});

test("20. tenant/org isolation: other-org prospects stay out of the list", async () => {
  await withMemoryWorkflow(async () => {
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    const model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects: [
        {
          id: "tv",
          phone: "+17865558120",
          name: "TV lead",
          organization_id: TEAM_VISION,
          owner_user_id: NIOVEL,
          updated_at: "2026-08-13T10:00:00.000Z"
        },
        {
          id: "other",
          phone: "+17865558121",
          name: "Other org",
          organization_id: OTHER_ORG,
          owner_user_id: NIOVEL,
          updated_at: "2026-08-13T12:00:00.000Z"
        }
      ],
      conversationLogsByPhone: {
        "+17865558121": [inbound("2026-08-13T12:00:00.000Z", "secret inbound")]
      }
    });

    assert.equal(model.items.length, 1);
    assert.equal(model.items[0].phone, "+17865558120");
    assert.equal(model.items[0].unread, false);
  });
});

test("mark-read route does not acknowledge BR-080 or mutate ownership", () => {
  const routeSrc = fs.readFileSync(
    path.join(__dirname, "../routes/conversationsCenter.js"),
    "utf8"
  );
  const start = routeSrc.indexOf('router.post("/mark-read"');
  assert.ok(start > 0);
  const block = routeSrc.slice(start, routeSrc.indexOf("router.get(\"/:phone\"", start));
  assert.match(block, /markConversationRead/);
  assert.doesNotMatch(block, /acknowledgeLead/);
  assert.doesNotMatch(block, /takeOverConversation/);
  assert.doesNotMatch(block, /acknowledgeCurrentBr080/);
  assert.match(block, /ownershipUnchanged/);

  const serviceSrc = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/services/conversationsCenterService.js"),
    "utf8"
  );
  assert.match(serviceSrc, /\/api\/conversations\/mark-read/);
  assert.match(serviceSrc, /export async function markConversationRead/);
});

test("router stack registers POST /mark-read", () => {
  const resolved = require.resolve("../routes/conversationsCenter");
  delete require.cache[resolved];
  const router = require("../routes/conversationsCenter");
  const posts = (router.stack || [])
    .filter((layer) => layer.route && layer.route.methods && layer.route.methods.post)
    .map((layer) => layer.route.path);
  assert.ok(posts.includes("/mark-read"), `expected /mark-read in ${JSON.stringify(posts)}`);
});
