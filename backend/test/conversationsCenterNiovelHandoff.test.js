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
const { recruitingProspectFixture, seedRecruitingWorkflowState } = require("./helpers/conversationsCenterRecruitingFixture");

const os = require("node:os");

function clearWorkflowModules() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}workflowStateStore.js`) ||
      key.includes(`${path.sep}conversationsCenterReadModel.js`) ||
      key.includes(`${path.sep}conversationsCenterOwnershipService.js`)
    ) {
      delete require.cache[key];
    }
  }
}

async function withTempWorkflowState(run) {
  const previousFile = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const tempFile = path.join(
    os.tmpdir(),
    `atlas-cc-handoff-${process.pid}-${Date.now()}.json`
  );
  fs.writeFileSync(tempFile, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempFile;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "file";
  clearWorkflowModules();

  try {
    return await run();
  } finally {
    if (previousFile === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_FILE = previousFile;
    }
    if (previousBackend === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_BACKEND = previousBackend;
    }
    clearWorkflowModules();
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
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

test("list shows newest activity first; NEEDS_ATTENTION is not messaging unread", async () => {
  await withTempWorkflowState(async () => {
    const {
      markConversationNeedsAttention
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");
    const { savePersistedWorkflowState } = require("../core/workflowStateStore");

    await savePersistedWorkflowState(
      "+17865550111",
      {
        atlasEligibilitySource: "QR",
        needsHumanAttention: true,
        workflowOwnership: "AGENT",
        manualAgentOwnership: true,
        handoffReason: "ambiguity",
        handoffAt: new Date().toISOString()
      },
      { organizationId: TEAM_VISION, prospectId: "p-new" }
    );

    const model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      prospects: [
        recruitingProspectFixture({
          id: "p-old",
          phone: "+17865550110",
          name: "Old",
          last_message: "hola ayer",
          updated_at: "2026-08-01T10:00:00.000Z"
        }),
        recruitingProspectFixture({
          id: "p-new",
          phone: "+17865550111",
          name: "New",
          last_message: "necesito hablar con alguien",
          updated_at: "2026-08-03T15:00:00.000Z",
          lead_source: { conversationGoal: "interview", source: "facebook_ad" }
        })
      ]
    });

    assert.equal(model.items[0].phone, "+17865550111");
    assert.equal(model.items[0].ownershipState, "NEEDS_ATTENTION");
    assert.equal(model.items[0].unread, false);
    assert.equal(model.items[0].unreadCount, 0);
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

    const base = recruitingProspectFixture({
      id: "p1",
      phone: "+17865550120",
      name: "Ana",
      last_message: "first",
      updated_at: "2026-08-03T10:00:00.000Z"
    });

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
    const prospect = recruitingProspectFixture({
      phone,
      current_step: "QUALIFICATION"
    });
    const { savePersistedWorkflowState } = require("../core/workflowStateStore");
    await savePersistedWorkflowState(
      phone,
      { atlasEligibilitySource: "QR" },
      { organizationId: TEAM_VISION, prospectId: prospect.id }
    );
    await markConversationNeedsAttention(phone, "explicit_human_request", {}, {
      organizationId: TEAM_VISION,
      prospectId: prospect.id
    });
    assert.equal(
      resolveConversationOwnershipState(await loadPersistedWorkflowState(phone)),
      "NEEDS_ATTENTION"
    );
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);

    const taken = await takeOverConversation(phone);
    assert.equal(taken.ownershipState, "HUMAN");
    assert.equal((await loadPersistedWorkflowState(phone)).workflowOwnership, OWNERSHIP.AGENT);
    assert.equal((await loadPersistedWorkflowState(phone)).needsHumanAttention, false);
    assert.equal((await loadPersistedWorkflowState(phone)).handoffReason, "explicit_human_request");
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);
    assert.equal(
      await shouldDeliverAutomatedReply(prospect, { allowHandoffAck: true }),
      false
    );

    const returned = await returnConversationToAtlas(phone);
    assert.equal(returned.ownershipState, "ATLAS");
    assert.equal((await loadPersistedWorkflowState(phone)).workflowOwnership, OWNERSHIP.ATLAS);
    assert.equal((await loadPersistedWorkflowState(phone)).handoffReason, null);
    assert.equal(await shouldDeliverAutomatedReply(prospect), true);
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
    await savePersistedWorkflowState(phone, {
      canonicalMilestone: MILESTONES.QUALIFICATION,
      workflowOwnership: OWNERSHIP.ATLAS,
      needsHumanAttention: false
    });

    await takeOverConversation(phone, { reason: "take_over" });
    await returnConversationToAtlas(phone);

    const next = await loadPersistedWorkflowState(phone);
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

    await seedRecruitingWorkflowState("+17865550151", {}, {
      organizationId: TEAM_VISION,
      prospectId: "b"
    });
    await seedRecruitingWorkflowState("+17865550152", {}, {
      organizationId: TEAM_VISION,
      prospectId: "c"
    });
    await markConversationNeedsAttention("+17865550151", "escalation", {}, {
      organizationId: TEAM_VISION,
      prospectId: "b"
    });
    await takeOverConversation("+17865550152", {
      organizationId: TEAM_VISION,
      prospectId: "c"
    });

    const prospects = [
      recruitingProspectFixture({
        id: "a",
        phone: "+17865550150",
        updated_at: "2026-08-03T09:00:00.000Z"
      }),
      recruitingProspectFixture({
        id: "b",
        phone: "+17865550151",
        updated_at: "2026-08-03T10:00:00.000Z"
      }),
      recruitingProspectFixture({
        id: "c",
        phone: "+17865550152",
        updated_at: "2026-08-03T11:00:00.000Z"
      }),
      {
        id: "out",
        phone: "+17865550999",
        organization_id: TEAM_VISION,
        owner_user_id: OTHER_USER,
        updated_at: "2026-08-03T12:00:00.000Z",
        source: "UNKNOWN",
        entry_method: "UNATTRIBUTED"
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

test("detail list item includes full phone; unauthorized user remains forbidden", async () => {
  await withTempWorkflowState(async () => {
    const {
      buildConversationListItem
    } = require("../core/conversationsCenter/conversationsCenterReadModel");
    const {
      assertConversationsCenterPilotAccess
    } = require("../core/conversationsCenter/conversationsCenterAccess");

    const item = await buildConversationListItem({
      id: "p1",
      phone: "+13473369274",
      name: "Mayra",
      organization_id: TEAM_VISION,
      owner_user_id: NIOVEL,
      source: "whatsapp",
      appointment_status: "none",
      updated_at: "2026-08-10T18:00:00.000Z"
    });

    assert.equal(item.phone, "+13473369274");
    assert.equal(item.name, "Mayra");
    assert.equal(item.source, "whatsapp");
    assert.equal(item.appointmentStatus, "none");
    assert.equal(item.currentStep, null);

    assert.throws(
      () =>
        assertConversationsCenterPilotAccess({
          userId: OTHER_USER,
          organizationId: TEAM_VISION
        }),
      (error) =>
        error.code === "CONVERSATIONS_CENTER_USER_FORBIDDEN" &&
        error.statusCode === 403
    );
  });
});

test("current_step qualification tokens are not appointmentStatus", async () => {
  await withTempWorkflowState(async () => {
    const {
      buildConversationListItem
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    const item = await buildConversationListItem({
      id: "p-day-part",
      phone: "+17879398651",
      name: "Qualification In Progress",
      organization_id: TEAM_VISION,
      owner_user_id: NIOVEL,
      source: "FACEBOOK",
      current_step: "DAY_PART",
      appointment_status: null,
      updated_at: "2026-08-13T14:00:00.000Z"
    });

    assert.equal(item.appointmentStatus, null);
    assert.equal(item.currentStep, "DAY_PART");
    assert.notEqual(item.appointmentStatus, "DAY_PART");
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
