/**
 * Soft Conversations Center inbox flags must survive unrelated workflowState writes.
 * Mark TEST / ARCHIVE / CLOSE → ownership/stall/system-style patches → still excluded.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function withTempWorkflowFile(run) {
  const previousEnv = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const tempFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "atlas-wf-soft-")),
    "workflowState.json"
  );
  fs.writeFileSync(tempFile, "{}");
  process.env.ATLAS_WORKFLOW_STATE_FILE = tempFile;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "file";

  try {
    return await run(tempFile);
  } finally {
    if (previousEnv === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_FILE = previousEnv;
    }
    if (previousBackend === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_BACKEND = previousBackend;
    }
    try {
      fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

test("A–E mark TEST → unrelated ownership write → reload still TEST", async () => {
  await withTempWorkflowFile(async () => {
    const {
      savePersistedWorkflowState,
      loadPersistedWorkflowState
    } = require("../core/workflowStateStore");
    const {
      markConversationAsTest,
      takeOverConversation,
      returnConversationToAtlas
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      resolveInboxLifecycle,
      INBOX_LIFECYCLE
    } = require("../core/conversationsCenter/conversationsCenterLifecycle");
    const { OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865559001";
    await markConversationAsTest(phone);

    assert.ok((await loadPersistedWorkflowState(phone)).inboxMarkedTestAt);
    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone, current_step: "QUALIFICATION" },
        persisted: await loadPersistedWorkflowState(phone)
      }).lifecycle,
      INBOX_LIFECYCLE.TEST
    );

    // Unrelated workflowState updates (stall / attention / ownership).
    await savePersistedWorkflowState(phone, {
      needsHumanAttention: true,
      workflowOwnership: OWNERSHIP.AGENT,
      manualAgentOwnership: true,
      handoffReason: "stall",
      handoffAt: new Date().toISOString(),
      stalledAt: new Date().toISOString(),
      stallEpisodeKey: "episode-1"
    });
    await takeOverConversation(phone);
    await returnConversationToAtlas(phone);
    await savePersistedWorkflowState(phone, {
      canonicalMilestone: "QUALIFICATION",
      workflowOwnership: OWNERSHIP.ATLAS,
      needsHumanAttention: false
    });
    // Undefined in patch must not wipe soft flags.
    await savePersistedWorkflowState(phone, {
      workflowOwnership: OWNERSHIP.ATLAS,
      inboxMarkedTestAt: undefined,
      inboxClosedAt: undefined,
      inboxArchivedAt: undefined
    });

    const after = await loadPersistedWorkflowState(phone);
    assert.ok(after.inboxMarkedTestAt, "inboxMarkedTestAt must survive");
    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone, current_step: "QUALIFICATION", source: "whatsapp" },
        persisted: after
      }).lifecycle,
      INBOX_LIFECYCLE.TEST
    );
  });
});

test("ARCHIVED survives stall + system-style workflow writes", async () => {
  await withTempWorkflowFile(async () => {
    const {
      savePersistedWorkflowState,
      loadPersistedWorkflowState
    } = require("../core/workflowStateStore");
    const {
      archiveConversation,
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      resolveInboxLifecycle,
      INBOX_LIFECYCLE
    } = require("../core/conversationsCenter/conversationsCenterLifecycle");
    const { OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865559002";
    await archiveConversation(phone);
    await takeOverConversation(phone);
    await savePersistedWorkflowState(phone, {
      needsHumanAttention: true,
      workflowOwnership: OWNERSHIP.AGENT,
      handoffReason: "WorkflowOwnershipChanged"
    });

    const after = await loadPersistedWorkflowState(phone);
    assert.ok(after.inboxArchivedAt);
    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone, current_step: "QUALIFICATION" },
        persisted: after
      }).lifecycle,
      INBOX_LIFECYCLE.ARCHIVED
    );
  });
});

test("CLOSED survives TAKE OVER / RETURN TO ATLAS", async () => {
  await withTempWorkflowFile(async () => {
    const {
      loadPersistedWorkflowState,
      savePersistedWorkflowState
    } = require("../core/workflowStateStore");
    const {
      closeConversation,
      takeOverConversation,
      returnConversationToAtlas
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      resolveInboxLifecycle,
      INBOX_LIFECYCLE,
      isActiveInboxLifecycle
    } = require("../core/conversationsCenter/conversationsCenterLifecycle");

    const phone = "+17865559003";
    await closeConversation(phone, "NOT_INTERESTED");
    await takeOverConversation(phone);
    await returnConversationToAtlas(phone);

    const afterClose = await loadPersistedWorkflowState(phone);
    assert.ok(afterClose.inboxClosedAt);
    assert.equal(afterClose.inboxCloseReason, "NOT_INTERESTED");
    // closeConversation also stamps inboxArchivedAt → ARCHIVED bucket (still not Active).
    const closedLifecycle = resolveInboxLifecycle({
      prospect: { phone, current_step: "QUALIFICATION" },
      persisted: afterClose
    }).lifecycle;
    assert.equal(closedLifecycle, INBOX_LIFECYCLE.ARCHIVED);
    assert.equal(isActiveInboxLifecycle(closedLifecycle), false);

    // Soft CLOSED-only mark (no archive stamp) also survives ownership churn.
    const phone2 = "+17865559033";
    await savePersistedWorkflowState(phone2, {
      inboxClosedAt: "2026-08-10T12:00:00.000Z",
      inboxCloseReason: "NOT_INTERESTED",
      inboxArchivedAt: null
    });
    await takeOverConversation(phone2);
    await returnConversationToAtlas(phone2);
    await savePersistedWorkflowState(phone2, { needsHumanAttention: true });

    const afterSoftClose = await loadPersistedWorkflowState(phone2);
    assert.ok(afterSoftClose.inboxClosedAt);
    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone: phone2, current_step: "QUALIFICATION" },
        persisted: afterSoftClose
      }).lifecycle,
      INBOX_LIFECYCLE.CLOSED
    );
  });
});

test("Restore explicitly clears soft flags; unrelated writes cannot", async () => {
  await withTempWorkflowFile(async () => {
    const {
      savePersistedWorkflowState,
      loadPersistedWorkflowState,
      SOFT_INBOX_FIELDS,
      sanitizeWorkflowPatch,
      preserveSoftInboxFields
    } = require("../core/workflowStateStore");
    const {
      markConversationAsTest,
      restoreConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      resolveInboxLifecycle,
      INBOX_LIFECYCLE
    } = require("../core/conversationsCenter/conversationsCenterLifecycle");

    const phone = "+17865559004";
    await markConversationAsTest(phone);
    await restoreConversation(phone);

    const restored = await loadPersistedWorkflowState(phone);
    assert.equal(restored.inboxMarkedTestAt, null);
    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone, current_step: "QUALIFICATION", source: "whatsapp" },
        persisted: restored
      }).lifecycle,
      INBOX_LIFECYCLE.ACTIVE
    );

    assert.deepEqual(SOFT_INBOX_FIELDS, [
      "inboxArchivedAt",
      "inboxClosedAt",
      "inboxCloseReason",
      "inboxMarkedTestAt"
    ]);

    const clean = sanitizeWorkflowPatch({
      workflowOwnership: "ATLAS",
      inboxMarkedTestAt: undefined
    });
    assert.equal(Object.prototype.hasOwnProperty.call(clean, "inboxMarkedTestAt"), false);

    const preserved = preserveSoftInboxFields(
      { inboxMarkedTestAt: "2026-08-10T00:00:00.000Z" },
      clean,
      { ...clean, inboxMarkedTestAt: null }
    );
    assert.equal(preserved.inboxMarkedTestAt, "2026-08-10T00:00:00.000Z");

    // Explicit null in Restore-shaped patch clears.
    const cleared = preserveSoftInboxFields(
      { inboxMarkedTestAt: "2026-08-10T00:00:00.000Z" },
      { inboxMarkedTestAt: null },
      { inboxMarkedTestAt: null }
    );
    assert.equal(cleared.inboxMarkedTestAt, null);

    await savePersistedWorkflowState(phone, { needsHumanAttention: false });
    assert.equal((await loadPersistedWorkflowState(phone)).inboxMarkedTestAt, null);
  });
});

test("Concurrent-style re-read keeps TEST when second writer omits soft fields", async () => {
  await withTempWorkflowFile(async () => {
    const {
      savePersistedWorkflowState,
      loadPersistedWorkflowState
    } = require("../core/workflowStateStore");
    const { markConversationAsTest } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      resolveInboxLifecycle,
      INBOX_LIFECYCLE
    } = require("../core/conversationsCenter/conversationsCenterLifecycle");
    const { OWNERSHIP } = require("../core/workflowConstants");

    const phone = "+17865559005";
    await markConversationAsTest(phone);
    const markedAt = (await loadPersistedWorkflowState(phone)).inboxMarkedTestAt;

    // Simulate ownership writer that never mentions soft fields.
    await savePersistedWorkflowState(phone, {
      workflowOwnership: OWNERSHIP.WAITING_EVENT,
      needsHumanAttention: false,
      canonicalMilestone: "INTERVIEW_READY"
    });

    const after = await loadPersistedWorkflowState(phone);
    assert.equal(after.inboxMarkedTestAt, markedAt);
    assert.equal(
      resolveInboxLifecycle({
        prospect: { phone },
        persisted: after
      }).lifecycle,
      INBOX_LIFECYCLE.TEST
    );
  });
});

test("execution remains OFF", () => {
  const {
    isExecutionEnabled
  } = require("../core/recruitAiV2/sideEffectAuthorizer");
  assert.equal(isExecutionEnabled(process.env), false);
});
