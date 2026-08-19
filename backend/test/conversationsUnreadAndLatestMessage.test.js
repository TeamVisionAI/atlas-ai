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
const { recruitingProspectFixture } = require("./helpers/conversationsCenterRecruitingFixture");
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

test("preview ignores blocked_template_missing and keeps prior prospect message", () => {
  const realAt = "2026-08-13T12:00:00.000Z";
  const blockedAt = "2026-08-13T18:00:00.000Z";
  const result = computeLastCommunication([
    inbound(realAt, "Hola Santander, quiero info"),
    outbound(blockedAt, "[whatsapp_outbound:blocked_template_missing] intent=HUMAN_COMPOSER_REPLY; reason=NO_TEMPLATE_FOR_INTENT", {
      intent: "WHATSAPP_OUTBOUND_BLOCKED_TEMPLATE_MISSING",
      pipeline: "NEW",
      status: "blocked_template_missing"
    })
  ]);

  assert.equal(isRealWhatsAppCommunication({
    direction: "outgoing",
    message: "[whatsapp_outbound:blocked_template_missing] intent=HUMAN_COMPOSER_REPLY; reason=NO_TEMPLATE_FOR_INTENT",
    intent: "WHATSAPP_OUTBOUND_BLOCKED_TEMPLATE_MISSING",
    pipeline: "NEW"
  }), false);
  assert.equal(result.lastMessagePreview, "Hola Santander, quiero info");
  assert.equal(result.lastDirection, "inbound");
  assert.equal(result.lastCommunicationAt, realAt);
});

test("preview ignores workflow/system events and keeps prior human message", () => {
  const humanAt = "2026-08-13T14:00:00.000Z";
  const result = computeLastCommunication([
    inbound("2026-08-13T13:00:00.000Z", "buenos dias"),
    outbound(humanAt, "Te escribo yo, Niovel", { pipeline: "HUMAN" }),
    {
      direction: "outgoing",
      message: "[workflow] milestone saved",
      pipeline: "WORKFLOW",
      created_at: "2026-08-13T19:00:00.000Z"
    },
    {
      direction: "incoming",
      message: "[Required Information Updated] City",
      intent: "REQUIRED_INFORMATION_UPDATED",
      created_at: "2026-08-13T19:05:00.000Z"
    }
  ]);

  assert.equal(result.lastMessagePreview, "Te escribo yo, Niovel");
  assert.equal(result.lastDirection, "outbound");
  assert.equal(result.lastCommunicationAt, humanAt);
});

test("operational events do not change lastCommunicationAt or unread", () => {
  const inboundAt = "2026-08-13T11:00:00.000Z";
  const outboundAt = "2026-08-13T11:10:00.000Z";
  const logs = [
    inbound(inboundAt, "necesito ayuda", { id: "in-1" }),
    outbound(outboundAt, "Claro, te ayudo", { id: "out-1" }),
    outbound("2026-08-13T20:00:00.000Z", "[whatsapp_outbound:blocked_window_closed] intent=HUMAN_COMPOSER_REPLY; reason=WINDOW_CLOSED", {
      intent: "WHATSAPP_OUTBOUND_BLOCKED_WINDOW_CLOSED",
      pipeline: "NEW"
    })
  ];

  const last = computeLastCommunication(logs);
  assert.equal(last.lastCommunicationAt, outboundAt);
  assert.equal(last.lastMessagePreview, "Claro, te ayudo");

  const unread = computeUnreadState({ logs, lastReadInboundAt: outboundAt });
  assert.equal(unread.unread, false);
  assert.equal(unread.unreadCount, 0);
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
      recruitingProspectFixture({
        id: "p-old",
        phone: "+17865558110",
        name: "Older Comm",
        last_message: "stale preview",
        updated_at: "2026-08-13T18:00:00.000Z"
      }),
      recruitingProspectFixture({
        id: "p-new",
        phone: "+17865558111",
        name: "Nancy Ortiz",
        last_message: "[Required Information Updated]",
        updated_at: "2026-08-13T08:00:00.000Z"
      })
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
    assert.equal(model.items[0].lastCommunicationAt, "2026-08-13T11:10:00.000Z");
    assert.equal(model.items[1].phone, "+17865558110");
    assert.equal(model.items[1].unread, false);
    assert.equal(model.items[1].unreadCount, 0);
  });
});

test("read model: blocked_template_missing does not become preview or sort key", async () => {
  await withMemoryWorkflow(async () => {
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    const model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects: [
        recruitingProspectFixture({
          id: "p-block",
          phone: "+17865558130",
          name: "Santander Sweets",
          last_message:
            "[whatsapp_outbound:blocked_template_missing] intent=HUMAN_COMPOSER_REPLY; reason=NO_TEMPLATE_FOR_INTENT",
          last_message_at: "2026-08-13T21:00:00.000Z",
          updated_at: "2026-08-13T21:00:00.000Z"
        }),
        recruitingProspectFixture({
          id: "p-real-later",
          phone: "+17865558131",
          name: "Later Real",
          last_message: "ok gracias",
          updated_at: "2026-08-13T08:00:00.000Z"
        })
      ],
      conversationLogsByPhone: {
        "+17865558130": [
          inbound("2026-08-13T15:00:00.000Z", "Quiero una cita", { id: "s-in" }),
          outbound(
            "2026-08-13T21:00:00.000Z",
            "[whatsapp_outbound:blocked_template_missing] intent=HUMAN_COMPOSER_REPLY; reason=NO_TEMPLATE_FOR_INTENT",
            {
              intent: "WHATSAPP_OUTBOUND_BLOCKED_TEMPLATE_MISSING",
              pipeline: "NEW"
            }
          )
        ],
        "+17865558131": [
          inbound("2026-08-13T16:00:00.000Z", "ok gracias", { id: "l-in" })
        ]
      }
    });

    assert.equal(model.items[0].phone, "+17865558131");
    assert.equal(model.items[0].lastMessagePreview, "ok gracias");
    assert.equal(model.items[1].phone, "+17865558130");
    assert.equal(model.items[1].lastMessagePreview, "Quiero una cita");
    assert.equal(model.items[1].lastCommunicationAt, "2026-08-13T15:00:00.000Z");
    assert.equal(model.items[1].unread, true);
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
        recruitingProspectFixture({
          id: "tv",
          phone: "+17865558120",
          name: "TV lead",
          updated_at: "2026-08-13T10:00:00.000Z"
        }),
        recruitingProspectFixture({
          id: "other",
          phone: "+17865558121",
          name: "Other org",
          organization_id: OTHER_ORG,
          updated_at: "2026-08-13T12:00:00.000Z"
        })
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
