/**
 * Conversations Center — Niovel pilot handoff + visibility tests.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OTHER_USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";

const STATE_FILE = path.join(__dirname, "../data/workflowState.json");

async function withTempWorkflowState(run) {
  const previous = fs.existsSync(STATE_FILE)
    ? fs.readFileSync(STATE_FILE, "utf8")
    : null;

  const dir = path.dirname(STATE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, "{}");

  try {
    return await run();
  } finally {
    if (previous == null) {
      try {
        fs.unlinkSync(STATE_FILE);
      } catch {
        /* ignore */
      }
    } else {
      fs.writeFileSync(STATE_FILE, previous);
    }
  }
}

test("pilot access allows only Niovel in Team Vision", () => {
  const {
    assertConversationsCenterPilotAccess,
    isConversationsCenterPilotUser,
    isProspectInNiovelPilotScope
  } = require("../core/conversationsCenter/conversationsCenterAccess");

  assert.equal(
    isConversationsCenterPilotUser({ userId: NIOVEL, organizationId: TEAM_VISION }),
    true
  );
  assert.equal(
    isConversationsCenterPilotUser({ userId: OTHER_USER, organizationId: TEAM_VISION }),
    false
  );
  assert.equal(
    isConversationsCenterPilotUser({ userId: NIOVEL, organizationId: OTHER_ORG }),
    false
  );

  assert.throws(
    () => assertConversationsCenterPilotAccess({ userId: OTHER_USER, organizationId: TEAM_VISION }),
    (error) => error.code === "CONVERSATIONS_CENTER_USER_FORBIDDEN"
  );

  assert.equal(
    isProspectInNiovelPilotScope({
      organization_id: TEAM_VISION,
      owner_user_id: NIOVEL,
      phone: "+17865550101"
    }),
    true
  );
  assert.equal(
    isProspectInNiovelPilotScope({
      organization_id: TEAM_VISION,
      owner_user_id: OTHER_USER,
      phone: "+17865550102"
    }),
    false
  );
});

test("list shows newest activity first and unread for NEEDS_ATTENTION", async () => {
  await withTempWorkflowState(async () => {
    const {
      markConversationNeedsAttention
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    markConversationNeedsAttention("+17865550111", "ambiguity");

    const model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects: [
        {
          id: "p-old",
          phone: "+17865550110",
          name: "Old",
          organization_id: TEAM_VISION,
          owner_user_id: NIOVEL,
          last_message: "hola ayer",
          updated_at: "2026-08-01T10:00:00.000Z",
          source: "facebook_ad"
        },
        {
          id: "p-new",
          phone: "+17865550111",
          name: "New",
          organization_id: TEAM_VISION,
          owner_user_id: NIOVEL,
          last_message: "necesito hablar con alguien",
          updated_at: "2026-08-03T15:00:00.000Z",
          lead_source: { conversationGoal: "interview", source: "facebook_ad" }
        }
      ]
    });

    assert.equal(model.items[0].phone, "+17865550111");
    assert.equal(model.items[0].ownershipState, "NEEDS_ATTENTION");
    assert.equal(model.items[0].unread, true);
    assert.equal(model.items[0].handoffReason, "ambiguity");
    assert.equal(model.items[0].conversationGoal, "interview");
    assert.equal(model.items[0].lastMessagePreview.includes("necesito"), true);
    assert.equal(model.needsAttentionCount, 1);
    assert.equal(model.items[1].ownershipState, "ATLAS");
  });
});

test("subsequent message updates visibility on existing conversation", async () => {
  await withTempWorkflowState(async () => {
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    const base = {
      id: "p1",
      phone: "+17865550120",
      name: "Ana",
      organization_id: TEAM_VISION,
      owner_user_id: NIOVEL,
      last_message: "first",
      updated_at: "2026-08-03T10:00:00.000Z"
    };

    let model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects: [base]
    });
    assert.equal(model.items[0].lastMessagePreview, "first");

    model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects: [
        {
          ...base,
          last_message: "second inbound",
          updated_at: "2026-08-03T11:00:00.000Z"
        }
      ]
    });
    assert.equal(model.items[0].lastMessagePreview, "second inbound");
  });
});

test("take over stops Atlas ownership; inbound does not allow automated reply", async () => {
  await withTempWorkflowState(async () => {
    const {
      markConversationNeedsAttention,
      takeOverConversation,
      returnConversationToAtlas,
      resolveConversationOwnershipState
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865550130";
    const prospect = { phone, current_step: "QUALIFICATION" };

    markConversationNeedsAttention(phone, "explicit_human_request");
    assert.equal(
      resolveConversationOwnershipState(loadPersistedWorkflowState(phone)),
      "NEEDS_ATTENTION"
    );
    assert.equal(shouldDeliverAutomatedReply(prospect), false);

    const taken = takeOverConversation(phone);
    assert.equal(taken.ownershipState, "HUMAN");
    assert.equal(loadPersistedWorkflowState(phone).workflowOwnership, OWNERSHIP.AGENT);
    assert.equal(loadPersistedWorkflowState(phone).needsHumanAttention, false);
    assert.equal(loadPersistedWorkflowState(phone).handoffReason, "explicit_human_request");
    assert.equal(shouldDeliverAutomatedReply(prospect), false);
    assert.equal(
      shouldDeliverAutomatedReply(prospect, { allowHandoffAck: true }),
      false
    );

    const returned = returnConversationToAtlas(phone);
    assert.equal(returned.ownershipState, "ATLAS");
    assert.equal(loadPersistedWorkflowState(phone).workflowOwnership, OWNERSHIP.ATLAS);
    assert.equal(loadPersistedWorkflowState(phone).handoffReason, null);
    assert.equal(shouldDeliverAutomatedReply(prospect), true);
  });
});

test("return to Atlas preserves prospect phone / does not reset qualification fields", async () => {
  await withTempWorkflowState(async () => {
    const {
      takeOverConversation,
      returnConversationToAtlas
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const { savePersistedWorkflowState, loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865550140";
    savePersistedWorkflowState(phone, {
      canonicalMilestone: MILESTONES.QUALIFICATION,
      workflowOwnership: OWNERSHIP.ATLAS,
      needsHumanAttention: false
    });

    takeOverConversation(phone, { reason: "take_over" });
    returnConversationToAtlas(phone);

    const next = loadPersistedWorkflowState(phone);
    assert.equal(next.canonicalMilestone, MILESTONES.QUALIFICATION);
    assert.equal(next.workflowOwnership, OWNERSHIP.ATLAS);
  });
});

test("filters isolate NEEDS_ATTENTION / ATLAS / HUMAN", async () => {
  await withTempWorkflowState(async () => {
    const {
      markConversationNeedsAttention,
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    markConversationNeedsAttention("+17865550151", "escalation");
    takeOverConversation("+17865550152");

    const prospects = [
      {
        id: "a",
        phone: "+17865550150",
        organization_id: TEAM_VISION,
        owner_user_id: NIOVEL,
        updated_at: "2026-08-03T09:00:00.000Z"
      },
      {
        id: "b",
        phone: "+17865550151",
        organization_id: TEAM_VISION,
        owner_user_id: NIOVEL,
        updated_at: "2026-08-03T10:00:00.000Z"
      },
      {
        id: "c",
        phone: "+17865550152",
        organization_id: TEAM_VISION,
        owner_user_id: NIOVEL,
        updated_at: "2026-08-03T11:00:00.000Z"
      },
      {
        id: "out",
        phone: "+17865550999",
        organization_id: TEAM_VISION,
        owner_user_id: OTHER_USER,
        updated_at: "2026-08-03T12:00:00.000Z"
      }
    ];

    const all = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects,
      filter: "all"
    });
    assert.equal(all.items.length, 3);

    const needs = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects,
      filter: "needs_attention"
    });
    assert.equal(needs.items.length, 1);
    assert.equal(needs.items[0].phone, "+17865550151");

    const human = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects,
      filter: "human"
    });
    assert.equal(human.items.length, 1);
    assert.equal(human.items[0].phone, "+17865550152");

    const atlas = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects,
      filter: "atlas"
    });
    assert.equal(atlas.items.length, 1);
    assert.equal(atlas.items[0].phone, "+17865550150");
  });
});

test("execution flags remain disabled by default for this pilot phase", () => {
  const {
    isExecutionEnabled
  } = require("../core/recruitAiV2/sideEffectAuthorizer");
  const {
    isLiveExecutionPathEnabled
  } = require("../core/recruitAiV2/liveExecutionPathConfig");

  assert.equal(isExecutionEnabled(process.env), false);
  assert.equal(isLiveExecutionPathEnabled(process.env), false);
});
