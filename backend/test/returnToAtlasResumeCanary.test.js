/**
 * Return to Atlas resume — canary regression (Linda Vargas day-part case).
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const {
  inferPendingQuestionFromHumanText,
  findUnresolvedProspectTurn,
  buildResumeNormalizedMessage,
  resumeConversationAfterReturnToAtlas
} = require("../core/conversationsCenter/returnToAtlasResumeService");
const {
  interpretInboundMessage,
  createConversationContext,
  INTENTS
} = require("../core/recruitAiV2");

const LINDA_HUMAN_QUESTION =
  "Super Linda, estamos realizando las entrevistas en nuestras oficinas en la 2500 NW 79th Ave Miami Florida, prefieres en la mañana o en la tarde?";

function clearWorkflowModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}workflowStateStore.js`)) {
      delete require.cache[key];
    }
  }
}

async function withTempWorkflowState(run) {
  const previousFile = process.env.ATLAS_WORKFLOW_STATE_FILE;
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const tempFile = path.join(
    os.tmpdir(),
    `atlas-resume-${process.pid}-${Date.now()}.json`
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

test("Linda canary: human mañana/tarde question infers ask_day_part", () => {
  assert.equal(inferPendingQuestionFromHumanText(LINDA_HUMAN_QUESTION), "ask_day_part");
});

test("Linda canary: native WhatsApp human outbound + Mañana inbound unresolved", () => {
  const logs = [
    {
      id: "h1",
      direction: "outgoing",
      pipeline: "SCHEDULED",
      intent: "HUMAN_WHATSAPP_BUSINESS_APP_REPLY",
      message: LINDA_HUMAN_QUESTION,
      created_at: "2026-03-10T15:00:00.000Z"
    },
    {
      id: "i1",
      direction: "incoming",
      message: "Mañana",
      created_at: "2026-03-10T15:01:00.000Z"
    }
  ];
  const unresolved = findUnresolvedProspectTurn(logs, "2026-03-10T14:00:00.000Z");
  assert.equal(unresolved.combinedText, "Mañana");
  assert.equal(unresolved.pendingQuestion, "ask_day_part");
});

test("Linda canary: Mañana interpreted as morning with ask_day_part context", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    conversation: {
      lastQuestionAsked: "ask_day_part",
      resumePendingQuestion: "ask_day_part",
      lastAtlasOutboundText: LINDA_HUMAN_QUESTION
    }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "Mañana" },
    context: ctx
  });
  assert.equal(interpretation.intent, INTENTS.PROVIDE_DAY_PART);
  assert.equal(interpretation.entities.dayPart, "morning");
});

test("resume normalized message includes non-empty text", () => {
  const normalized = buildResumeNormalizedMessage({
    phone: "+13055551234",
    combinedText: "Mañana",
    resumeKey: "return-to-atlas:abc"
  });
  assert.equal(normalized.text, "Mañana");
  assert.match(normalized.providerMessageId, /^resume:/);
});

test("resume: failed delivery does not mark idempotent key (retryable)", async () => {
  await withTempWorkflowState(async () => {
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const phone = "+13055559999";
    const logs = [
      {
        id: "h1",
        direction: "outgoing",
        pipeline: "HUMAN",
        intent: "HUMAN_COMPOSER_REPLY",
        message: LINDA_HUMAN_QUESTION,
        created_at: "2026-03-10T15:00:00.000Z"
      },
      {
        id: "i1",
        direction: "incoming",
        message: "Mañana",
        created_at: "2026-03-10T15:01:00.000Z"
      }
    ];

    const result = await resumeConversationAfterReturnToAtlas({
      phone,
      prospect: { phone, id: "p1", organization_id: "org1", name: "Linda" },
      organizationId: "org1",
      previousWorkflow: { humanTakenOverAt: "2026-03-10T14:00:00.000Z" },
      returnedToAtlasAt: "2026-03-10T15:02:00.000Z",
      dependencies: {
        logs,
        processNormalizedInboundMessage: async () => ({
          success: true,
          replied: false,
          reason: "REPLY_SUPPRESSED"
        })
      }
    });

    assert.equal(result.resumed, false);
    assert.equal(result.reason, "REPLY_SUPPRESSED");

    const persisted = await loadPersistedWorkflowState(phone, {
      organizationId: "org1",
      prospectId: "p1"
    });
    assert.equal(persisted.returnToAtlasResumeKey, null);
    assert.equal(persisted.returnToAtlasResumeLastError, "REPLY_SUPPRESSED");
  });
});

test("resume: successful reply marks idempotent key exactly once", async () => {
  await withTempWorkflowState(async () => {
    const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
    const phone = "+13055558888";
    const logs = [
      {
        id: "h1",
        direction: "outgoing",
        pipeline: "HUMAN",
        intent: "HUMAN_COMPOSER_REPLY",
        message: "¿Tienes permiso de trabajo?",
        created_at: "2026-03-10T15:00:00.000Z"
      },
      {
        id: "i1",
        direction: "incoming",
        message: "Sí",
        created_at: "2026-03-10T15:01:00.000Z"
      }
    ];

    let hubCalls = 0;
    const first = await resumeConversationAfterReturnToAtlas({
      phone,
      prospect: { phone, id: "p2", organization_id: "org1", name: "Test" },
      organizationId: "org1",
      previousWorkflow: { humanTakenOverAt: "2026-03-10T14:00:00.000Z" },
      returnedToAtlasAt: "2026-03-10T15:02:00.000Z",
      dependencies: {
        logs,
        processNormalizedInboundMessage: async (normalized) => {
          hubCalls += 1;
          assert.equal(normalized.text, "Sí");
          return { success: true, replied: true };
        }
      }
    });

    assert.equal(first.resumed, true);
    assert.equal(hubCalls, 1);

    const second = await resumeConversationAfterReturnToAtlas({
      phone,
      prospect: { phone, id: "p2", organization_id: "org1", name: "Test" },
      organizationId: "org1",
      previousWorkflow: { humanTakenOverAt: "2026-03-10T14:00:00.000Z" },
      returnedToAtlasAt: "2026-03-10T15:03:00.000Z",
      dependencies: {
        logs,
        processNormalizedInboundMessage: async () => {
          hubCalls += 1;
          return { success: true, replied: true };
        }
      }
    });

    assert.equal(second.reason, "ALREADY_RESUMED");
    assert.equal(hubCalls, 1);

    const persisted = await loadPersistedWorkflowState(phone, {
      organizationId: "org1",
      prospectId: "p2"
    });
    assert.match(persisted.returnToAtlasResumeKey, /^return-to-atlas:i1$/);
  });
});

test("resume: prior failed attempt with lastError remains retryable", async () => {
  await withTempWorkflowState(async () => {
    const {
      loadPersistedWorkflowState,
      savePersistedWorkflowState
    } = require("../core/workflowStateStore");
    const phone = "+13055556666";
    const logs = [
      {
        id: "h1",
        direction: "outgoing",
        pipeline: "HUMAN",
        intent: "HUMAN_COMPOSER_REPLY",
        message: LINDA_HUMAN_QUESTION,
        created_at: "2026-03-10T15:00:00.000Z"
      },
      {
        id: "i1",
        direction: "incoming",
        message: "Mañana",
        created_at: "2026-03-10T15:01:00.000Z"
      }
    ];

    await savePersistedWorkflowState(
      phone,
      {
        returnToAtlasResumeKey: "return-to-atlas:i1",
        returnToAtlasResumeLastError: "INVALID_NORMALIZED_MESSAGE"
      },
      { organizationId: "org1", prospectId: "p4" }
    );

    let hubCalls = 0;
    const result = await resumeConversationAfterReturnToAtlas({
      phone,
      prospect: { phone, id: "p4", organization_id: "org1", name: "Linda" },
      organizationId: "org1",
      previousWorkflow: { humanTakenOverAt: "2026-03-10T14:00:00.000Z" },
      returnedToAtlasAt: "2026-03-10T15:04:00.000Z",
      dependencies: {
        logs,
        processNormalizedInboundMessage: async (normalized) => {
          hubCalls += 1;
          assert.equal(normalized.text, "Mañana");
          return { success: true, replied: true };
        }
      }
    });

    assert.equal(result.resumed, true);
    assert.equal(hubCalls, 1);

    const persisted = await loadPersistedWorkflowState(phone, {
      organizationId: "org1",
      prospectId: "p4"
    });
    assert.equal(persisted.returnToAtlasResumeLastError, null);
  });
});

test("resume: no unresolved inbound produces no hub call", async () => {
  await withTempWorkflowState(async () => {
    let hubCalls = 0;
    const result = await resumeConversationAfterReturnToAtlas({
      phone: "+13055557777",
      prospect: { phone: "+13055557777", id: "p3", organization_id: "org1" },
      organizationId: "org1",
      previousWorkflow: { humanTakenOverAt: "2026-03-10T14:00:00.000Z" },
      dependencies: {
        logs: [
          {
            id: "h1",
            direction: "outgoing",
            pipeline: "HUMAN",
            intent: "HUMAN_COMPOSER_REPLY",
            message: "Hola",
            created_at: "2026-03-10T15:00:00.000Z"
          }
        ],
        processNormalizedInboundMessage: async () => {
          hubCalls += 1;
          return { success: true, replied: true };
        }
      }
    });
    assert.equal(result.reason, "NO_UNRESOLVED_INBOUND");
    assert.equal(hubCalls, 0);
  });
});
