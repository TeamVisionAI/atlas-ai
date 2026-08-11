/**
 * BR-135 — Durable workflow_state survives restart; ephemeral file does not.
 * Production backend = database (fail closed). HUMAN silence uses durable load.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "11111111-1111-4111-8111-111111111111";

async function withBackend(backend, run, extras = {}) {
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const previousFile = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const previousKey = process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY;
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.ATLAS_WORKFLOW_STATE_BACKEND = backend;
  if (extras.memoryKey) {
    process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY = extras.memoryKey;
  }
  if (extras.nodeEnv !== undefined) {
    process.env.NODE_ENV = extras.nodeEnv;
  }

  let tempDir = null;
  if (backend === "file") {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-br135-"));
    process.env.ATLAS_WORKFLOW_STATE_FILE = path.join(
      tempDir,
      "workflowState.json"
    );
    fs.writeFileSync(process.env.ATLAS_WORKFLOW_STATE_FILE, "{}");
  }

  try {
    const store = require("../core/workflowStateStore");
    if (backend === "memory") {
      store.clearMemoryWorkflowStateStore();
    }
    return await run(store);
  } finally {
    if (previousBackend === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_BACKEND = previousBackend;
    }
    if (previousFile === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_FILE;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_FILE = previousFile;
    }
    if (previousKey === undefined) {
      delete process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY;
    } else {
      process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY = previousKey;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

test("file wipe simulates Railway ephemeral loss (TEST disappears)", async () => {
  await withBackend("file", async (store) => {
    const {
      markConversationAsTest
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const phone = "+17865559101";

    await markConversationAsTest(phone);
    assert.ok(
      (await store.loadPersistedWorkflowState(phone)).inboxMarkedTestAt
    );

    // Redeploy wipe of ephemeral volume.
    fs.writeFileSync(process.env.ATLAS_WORKFLOW_STATE_FILE, "{}");

    const afterWipe = await store.loadPersistedWorkflowState(phone);
    assert.equal(afterWipe.inboxMarkedTestAt, null);
  });
});

test("database backend survives process-memory clear (restart simulation)", async () => {
  await withBackend("database", async (store) => {
    const phone = "+17865559102";
    const prospectId = "prospect-br135-test";
    let row = {
      id: prospectId,
      phone,
      organization_id: TEAM_VISION,
      workflow_state: {}
    };

    const findById = async (id, orgId) =>
      id === prospectId && orgId === TEAM_VISION ? { ...row } : null;

    const scope = {
      organizationId: TEAM_VISION,
      prospectId,
      findProspectByIdFn: findById,
      supabaseClient: {
        from() {
          return {
            update(payload) {
              row = {
                ...row,
                workflow_state: payload.workflow_state
              };
              return {
                eq() {
                  return this;
                },
                select() {
                  return this;
                },
                async maybeSingle() {
                  return { data: { ...row }, error: null };
                }
              };
            }
          };
        }
      }
    };

    const {
      markConversationAsTest,
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");

    await markConversationAsTest(phone, scope);
    await takeOverConversation(phone, scope);

    // Memory process map clear must not affect database SoR.
    store.clearMemoryWorkflowStateStore();

    const afterRestart = await store.loadPersistedWorkflowState(phone, scope);
    assert.ok(afterRestart.inboxMarkedTestAt, "TEST mark must survive restart");
    assert.equal(afterRestart.manualAgentOwnership, true);
    assert.equal(afterRestart.workflowOwnership, "AGENT");
    assert.ok(row.workflow_state.inboxMarkedTestAt);
  });
});

test("HUMAN takeover silences automated reply after durable load", async () => {
  await withBackend("memory", async (store) => {
    store.clearMemoryWorkflowStateStore();
    const {
      takeOverConversation
    } = require("../core/conversationsCenter/conversationsCenterOwnershipService");
    const {
      shouldDeliverAutomatedReply
    } = require("../core/communicationHub");

    const phone = "+17865559103";
    const prospect = {
      id: "p-human",
      organization_id: TEAM_VISION,
      phone,
      current_step: "QUALIFICATION"
    };

    await takeOverConversation(phone, { backend: "memory" });
    assert.equal(await shouldDeliverAutomatedReply(prospect), false);
    assert.equal(
      (await store.loadPersistedWorkflowState(phone, { backend: "memory" }))
        .manualAgentOwnership,
      true
    );
  }, { memoryKey: "br135-human" });
});

test("org mismatch fails closed on durable write", async () => {
  await withBackend("database", async (store) => {
    const phone = "+17865559104";
    let threw = null;
    try {
      await store.savePersistedWorkflowState(
        phone,
        { inboxMarkedTestAt: new Date().toISOString() },
        {
          organizationId: TEAM_VISION,
          prospectId: "p-mismatch",
          findProspectByIdFn: async () => ({
            id: "p-mismatch",
            phone,
            organization_id: OTHER_ORG,
            workflow_state: {}
          })
        }
      );
    } catch (error) {
      threw = error;
    }
    assert.ok(threw);
    assert.equal(threw.code, "WORKFLOW_STATE_ORG_MISMATCH");
  });
});

test("unrelated patch preserves durable HUMAN + TEST fields", async () => {
  await withBackend("memory", async (store) => {
    store.clearMemoryWorkflowStateStore();
    const phone = "+17865559105";
    const opts = { backend: "memory" };

    await store.savePersistedWorkflowState(
      phone,
      {
        inboxMarkedTestAt: "2026-08-10T12:00:00.000Z",
        workflowOwnership: "AGENT",
        manualAgentOwnership: true,
        needsHumanAttention: false,
        handoffReason: "take_over",
        humanTakenOverAt: "2026-08-10T12:01:00.000Z"
      },
      opts
    );

    await store.savePersistedWorkflowState(
      phone,
      {
        canonicalMilestone: "QUALIFICATION",
        stalledAt: null
      },
      opts
    );

    const after = await store.loadPersistedWorkflowState(phone, opts);
    assert.equal(after.inboxMarkedTestAt, "2026-08-10T12:00:00.000Z");
    assert.equal(after.manualAgentOwnership, true);
    assert.equal(after.workflowOwnership, "AGENT");
    assert.equal(after.handoffReason, "take_over");
  }, { memoryKey: "br135-preserve" });
});

test("file backend forbidden in production", async () => {
  await withBackend(
    "file",
    async (store) => {
      assert.throws(
        () => store.resolveWorkflowStateBackend(process.env),
        (err) => err && err.code === "WORKFLOW_STATE_EPHEMERAL_FORBIDDEN"
      );
    },
    { nodeEnv: "production" }
  );
});

test("execution remains OFF", () => {
  const {
    isExecutionEnabled
  } = require("../core/recruitAiV2/sideEffectAuthorizer");
  assert.equal(isExecutionEnabled(process.env), false);
});
