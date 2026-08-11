/**
 * Conversations Center inbox lifecycle — Active work inbox.
 * Presentation derived from workflow / outcomes / soft flags.
 * Does not mutate Calendar or appointments. HUMAN silence unchanged.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";

const AGENT_FILE = path.join(__dirname, "../data/agentActionState.json");

async function withTempStores(run) {
  const previousWorkflowEnv = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const tempDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "atlas-cc-life-"));
  const tempWorkflow = path.join(tempDir, "workflowState.json");
  fs.writeFileSync(tempWorkflow, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempWorkflow;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "file";

  const prevAgent = fs.existsSync(AGENT_FILE)
    ? fs.readFileSync(AGENT_FILE, "utf8")
    : null;
  fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
  fs.writeFileSync(AGENT_FILE, "{}");

  try {
    return await run();
  } finally {
    if (previousWorkflowEnv === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_FILE = previousWorkflowEnv;
    }
    if (previousBackend === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_BACKEND = previousBackend;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }

    if (prevAgent == null) {
      try {
        fs.unlinkSync(AGENT_FILE);
      } catch {
        /* ignore */
      }
    } else {
      fs.writeFileSync(AGENT_FILE, prevAgent);
    }
  }
}

function prospect(overrides = {}) {
  return {
    id: overrides.id || "p1",
    organization_id: TEAM_VISION,
    owner_user_id: NIOVEL,
    phone: overrides.phone || "+17865551001",
    name: overrides.name || "Prospect",
    source: overrides.source || "whatsapp",
    current_step: overrides.current_step || "QUALIFICATION",
    appointment_status: overrides.appointment_status || null,
    entry_method: overrides.entry_method || null,
    updated_at: "2026-08-10T12:00:00.000Z",
    ...overrides
  };
}

test("A–C Active: ATLAS / NEEDS_ATTENTION / HUMAN stay Active", async () => {
  await withTempStores(async () => {
    const {
      savePersistedWorkflowState
    } = require("../core/workflowStateStore");
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");
    const { OWNERSHIP } = require("../core/workflowConstants");

    await savePersistedWorkflowState("+17865551001", {
      workflowOwnership: OWNERSHIP.ATLAS,
      needsHumanAttention: false
    });
    await savePersistedWorkflowState("+17865551002", {
      workflowOwnership: OWNERSHIP.AGENT,
      needsHumanAttention: true,
      manualAgentOwnership: true
    });
    await savePersistedWorkflowState("+17865551003", {
      workflowOwnership: OWNERSHIP.AGENT,
      needsHumanAttention: false,
      manualAgentOwnership: true
    });

    const model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "active",
      prospects: [
        prospect({ phone: "+17865551001", name: "Atlas" }),
        prospect({ phone: "+17865551002", name: "Attention" }),
        prospect({ phone: "+17865551003", name: "Human" })
      ]
    });

    assert.equal(model.items.length, 3);
    assert.equal(model.counts.active, 3);
    assert.equal(model.counts.needs_attention, 1);
    assert.equal(model.counts.human, 1);
    assert.equal(model.needsAttentionCount, 1);
  });
});

test("D–E Scheduled interview leaves Active; remains in Archived", async () => {
  await withTempStores(async () => {
    const {
      savePersistedWorkflowState
    } = require("../core/workflowStateStore");
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    await savePersistedWorkflowState("+17865551010", {
      workflowOwnership: OWNERSHIP.ATLAS,
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED
    });

    const active = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "active",
      prospects: [prospect({ phone: "+17865551010", name: "Scheduled", current_step: "INTERVIEW_SCHEDULED" })]
    });
    assert.equal(active.items.length, 0);

    const archived = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "archived",
      prospects: [prospect({ phone: "+17865551010", name: "Scheduled", current_step: "INTERVIEW_SCHEDULED" })]
    });
    assert.equal(archived.items.length, 1);
    assert.equal(archived.items[0].inboxLifecycle, "SCHEDULED");
  });
});

test("F Interview completed + Not Interested leaves Active", async () => {
  await withTempStores(async () => {
    const {
      savePersistedWorkflowState
    } = require("../core/workflowStateStore");
    const { mergeAgentState } = require("../core/agentActionState");
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    await savePersistedWorkflowState("+17865551020", {
      workflowOwnership: OWNERSHIP.CLOSED,
      canonicalMilestone: MILESTONES.CLOSED
    });
    mergeAgentState("+17865551020", {
      outcome: "Not Interested",
      agentNotes: [
        {
          text: "Interview completed. Outcome: Not Interested.",
          at: "2026-08-01T12:00:00.000Z"
        }
      ]
    });

    const active = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "active",
      prospects: [
        prospect({
          phone: "+17865551020",
          name: "Ana Perez",
          current_step: "INTERVIEW_COMPLETED"
        })
      ]
    });
    assert.equal(active.items.length, 0);

    const archived = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "archived",
      prospects: [
        prospect({
          phone: "+17865551020",
          name: "Ana Perez",
          current_step: "INTERVIEW_COMPLETED"
        })
      ]
    });
    assert.equal(archived.items.length, 1);
    assert.equal(archived.items[0].inboxLifecycle, "CLOSED");
  });
});

test("G Explicit close removes from Active; I findable in Archived; J restore", async () => {
  await withTempStores(async () => {
    const {
      closeConversation,
      restoreConversation,
      archiveConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    const phone = "+17865551030";
    const prospects = [prospect({ phone, name: "Close Me" })];

    await closeConversation(phone, "NOT_INTERESTED");
    let model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "active",
      prospects
    });
    assert.equal(model.items.length, 0);

    model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "archived",
      prospects
    });
    assert.equal(model.items.length, 1);
    assert.equal(model.items[0].inboxCloseReason, "NOT_INTERESTED");

    await restoreConversation(phone);
    model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "active",
      prospects
    });
    assert.equal(model.items.length, 1);

    await archiveConversation(phone);
    model = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "archived",
      prospects
    });
    assert.equal(model.items.length, 1);
    assert.equal(model.items[0].inboxLifecycle, "ARCHIVED");
  });
});

test("H TEST/CANARY excluded from Active and attention badge", async () => {
  await withTempStores(async () => {
    const {
      markConversationAsTest,
      markConversationNeedsAttention
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      buildConversationsCenterReadModel,
      getConversationsAttentionCount
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    const phone = "+17865551040";
    await markConversationNeedsAttention(phone, "stall");
    await markConversationAsTest(phone);

    const prospects = [
      prospect({ phone, name: "Canary", source: "whatsapp" }),
      prospect({
        phone: "+17865551041",
        name: "MetaDemo",
        entry_method: "META_REVIEW_DEMO"
      })
    ];

    const active = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "active",
      prospects
    });
    assert.equal(active.items.length, 0);
    assert.equal(active.needsAttentionCount, 0);

    const testFilter = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "test",
      prospects
    });
    assert.equal(testFilter.items.length, 2);

    const badge = await getConversationsAttentionCount(TEAM_VISION, prospects);
    assert.equal(badge.needsAttentionCount, 0);
  });
});

test("L HUMAN hard guard source unchanged (communicationHub silence contract)", () => {
  const hub = fs.readFileSync(
    path.join(__dirname, "../core/communicationHub.js"),
    "utf8"
  );
  assert.match(hub, /Hard ownership guard/);
  assert.match(hub, /manualAgentOwnership/);
  assert.match(hub, /needsHumanAttention/);
  assert.match(hub, /allowHandoffAck/);
});

test("M–N no Calendar/execution enablement in lifecycle module", () => {
  const lifecycle = fs.readFileSync(
    path.join(
      __dirname,
      "../core/conversationsCenter/conversationsCenterLifecycle.js"
    ),
    "utf8"
  );
  const ownership = fs.readFileSync(
    path.join(
      __dirname,
      "../core/conversationsCenter/conversationsCenterOwnershipService.js"
    ),
    "utf8"
  );
  assert.doesNotMatch(lifecycle, /executeScheduleInterview|createAppointment/);
  assert.doesNotMatch(ownership, /RECRUIT_AI_V2_EXECUTION_ENABLED\s*=\s*['"]true['"]/);
  assert.doesNotMatch(ownership, /calendar/i);
});

test("O pilot authorization gate intact", () => {
  const {
    assertConversationsCenterPilotAccess
  } = require("../core/conversationsCenter/conversationsCenterAccess");
  assert.throws(
    () =>
      assertConversationsCenterPilotAccess({
        userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        organizationId: TEAM_VISION
      }),
    (error) => error.code === "CONVERSATIONS_CENTER_USER_FORBIDDEN"
  );
});

test("derive helpers: closed outcome + scheduled milestone", () => {
  const {
    resolveInboxLifecycle,
    INBOX_LIFECYCLE
  } = require("../core/conversationsCenter/conversationsCenterLifecycle");
  const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

  assert.equal(
    resolveInboxLifecycle({
      prospect: { phone: "+1", current_step: "QUALIFICATION" },
      persisted: { workflowOwnership: OWNERSHIP.ATLAS }
    }).lifecycle,
    INBOX_LIFECYCLE.ACTIVE
  );

  assert.equal(
    resolveInboxLifecycle({
      prospect: { phone: "+1", current_step: "INTERVIEW_SCHEDULED" },
      persisted: {
        workflowOwnership: OWNERSHIP.ATLAS,
        canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED
      }
    }).lifecycle,
    INBOX_LIFECYCLE.SCHEDULED
  );
});

/**
 * PRE-MERGE invariant checks against canonical scheduling projection fields
 * consumed by conversationsCenterLifecycle (no atlas_appointments join).
 *
 * Successful schedule paths (appointmentApplicationService.createAppointment /
 * missionExecutionApplicationService.executeScheduleInterview) write:
 *   prospect.current_step = "CONFIRMED"
 *   workflow.canonicalMilestone = INTERVIEW_SCHEDULED (via advanceProspectWorkflow)
 */
test("invariant: CONFIRMED + INTERVIEW_SCHEDULED → SCHEDULED / excluded from Active", async () => {
  await withTempStores(async () => {
    const {
      savePersistedWorkflowState
    } = require("../core/workflowStateStore");
    const {
      buildConversationsCenterReadModel
    } = require("../core/conversationsCenter/conversationsCenterReadModel");
    const {
      resolveInboxLifecycle,
      INBOX_LIFECYCLE
    } = require("../core/conversationsCenter/conversationsCenterLifecycle");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865551050";
    await savePersistedWorkflowState(phone, {
      workflowOwnership: OWNERSHIP.WAITING_EVENT,
      canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED
    });

    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone, current_step: "CONFIRMED" },
        persisted: {
          canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
          workflowOwnership: OWNERSHIP.WAITING_EVENT
        }
      }).lifecycle,
      INBOX_LIFECYCLE.SCHEDULED
    );

    // current_step alone (CONFIRMED) is sufficient — matches createAppointment projection.
    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone, current_step: "CONFIRMED" },
        persisted: { canonicalMilestone: null, workflowOwnership: OWNERSHIP.ATLAS }
      }).lifecycle,
      INBOX_LIFECYCLE.SCHEDULED
    );

    const active = await buildConversationsCenterReadModel({
      organizationId: TEAM_VISION,
      filter: "active",
      prospects: [prospect({ phone, name: "Booked", current_step: "CONFIRMED" })]
    });
    assert.equal(active.items.length, 0);
  });
});

test("invariant: appointment_confirm_deferred (execution OFF) remains ACTIVE", () => {
  const {
    resolveInboxLifecycle,
    INBOX_LIFECYCLE
  } = require("../core/conversationsCenter/conversationsCenterLifecycle");
  const { OWNERSHIP, MILESTONES } = require("../core/workflowConstants");

  // Deferred confirm has proposed slot in V2 context only — prospect step not CONFIRMED,
  // milestone not INTERVIEW_SCHEDULED, no soft close.
  const lifecycle = resolveInboxLifecycle({
    prospect: {
      phone: "+17865551051",
      current_step: "QUALIFICATION",
      appointment_status: null
    },
    persisted: {
      workflowOwnership: OWNERSHIP.ATLAS,
      canonicalMilestone: MILESTONES.QUALIFICATION || null,
      lastOfferMade: undefined
    }
  });
  assert.equal(lifecycle.lifecycle, INBOX_LIFECYCLE.ACTIVE);
});

test("invariant: TEST outranks SCHEDULED projection", () => {
  const {
    resolveInboxLifecycle,
    INBOX_LIFECYCLE
  } = require("../core/conversationsCenter/conversationsCenterLifecycle");
  const { MILESTONES } = require("../core/workflowConstants");

  assert.equal(
    resolveInboxLifecycle({
      prospect: {
        phone: "+17865551052",
        current_step: "CONFIRMED",
        source: "TEST"
      },
      persisted: { canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED }
    }).lifecycle,
    INBOX_LIFECYCLE.TEST
  );

  assert.equal(
    resolveInboxLifecycle({
      prospect: { phone: "+17865551053", current_step: "CONFIRMED" },
      persisted: {
        canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
        inboxMarkedTestAt: "2026-08-10T00:00:00.000Z"
      }
    }).lifecycle,
    INBOX_LIFECYCLE.TEST
  );
});

/**
 * Cancel / rollback projection (PR #103 write-side demotion):
 * cancelAppointment resets current_step=SCHEDULE and demotes
 * INTERVIEW_SCHEDULED / INTERVIEW_DUE → INTERVIEW_READY.
 * Conversations Center derives SCHEDULED only from durable schedule claims;
 * post-cancel INTERVIEW_READY + SCHEDULE must derive ACTIVE (no appointment join).
 */
test(
  "cancelled / rolled-back interview (SCHEDULE + INTERVIEW_READY) derives ACTIVE",
  () => {
    const {
      resolveInboxLifecycle,
      INBOX_LIFECYCLE
    } = require("../core/conversationsCenter/conversationsCenterLifecycle");
    const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone: "+17865551054", current_step: "SCHEDULE" },
        persisted: {
          canonicalMilestone: MILESTONES.INTERVIEW_READY,
          workflowOwnership: OWNERSHIP.WAITING_EVENT
        }
      }).lifecycle,
      INBOX_LIFECYCLE.ACTIVE
    );

    // Rollback inherits the same cancelAppointment demotion path.
    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone: "+17865551055", current_step: "SCHEDULE" },
        persisted: {
          canonicalMilestone: MILESTONES.INTERVIEW_READY,
          workflowOwnership: OWNERSHIP.ATLAS
        }
      }).lifecycle,
      INBOX_LIFECYCLE.ACTIVE
    );
  }
);
