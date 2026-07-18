/**
 * Sprint 10.2 — Prospect Workspace + Activity Feed verification.
 * Run: node backend/dev/verifySprint10_2.js
 */

require("dotenv").config();

const express = require("express");
const { buildJourneyProgress } = require("../core/journeyProgressMapper");
const { buildProspectWorkspaceReadModel } = require("../core/prospectWorkspaceReadModel");
const {
  listProspectActivityFeed,
  mapEventTypeToActivityType
} = require("../core/prospectActivityFeedReadModel");
const {
  buildConversationLogCorrelationId,
  emitConversationLogEvent
} = require("../core/conversationEventBridge");
const {
  encodeActivityFeedCursor,
  decodeActivityFeedCursor,
  isActivityBeforeCursor
} = require("../core/activityFeedCursor");
const prospectWorkspaceRoutes = require("../routes/prospectWorkspace");
const { MILESTONES, EVENT_TYPES } = require("../core/workflowConstants");
const { getMissionControlWithActions } = require("../controllers/agentActionController");
const { runAllGoldenScenarios } = require("./goldenScenarios");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createWorkspaceApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/prospect-workspace", prospectWorkspaceRoutes);
  return app;
}

async function fetchWorkspace(app, phone, pathSuffix = "") {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/prospect-workspace/${encodeURIComponent(phone)}${pathSuffix}`
    );
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  } finally {
    server.close();
  }
}

function verifyActivityFeedUnitTests() {
  assert(
    buildConversationLogCorrelationId("abc-123") === "conversation_log:abc-123",
    "Correlation ID format"
  );

  assert(
    mapEventTypeToActivityType(EVENT_TYPES.MESSAGE_RECEIVED) === "message_inbound",
    "MessageReceived maps to message_inbound"
  );
  assert(
    mapEventTypeToActivityType(EVENT_TYPES.AGENT_NOTE_ADDED) === "note",
    "AgentNoteAdded maps to note"
  );

  const sampleItem = {
    id: "event:1",
    timestamp: "2026-07-18T12:00:00.000Z"
  };
  const cursor = encodeActivityFeedCursor(sampleItem);
  const decoded = decodeActivityFeedCursor(cursor);
  assert(decoded.t === sampleItem.timestamp && decoded.id === sampleItem.id, "Cursor round-trip");

  const older = { id: "event:0", timestamp: "2026-07-17T12:00:00.000Z" };
  assert(isActivityBeforeCursor(older, decoded), "Older item is before cursor");
  console.log("✓ Activity feed unit tests (cursor, mapping, correlation)");
}

async function main() {
  console.log("=== Sprint 10.2 Prospect Workspace + Activity Feed Verification ===\n");

  verifyActivityFeedUnitTests();

  const interviewJourney = buildJourneyProgress(MILESTONES.INTERVIEW_DUE);
  assert(interviewJourney.currentStepKey === "interview", "Interview milestone maps to interview step");
  assert(
    interviewJourney.steps.find((step) => step.key === "interview")?.state === "current",
    "Interview step is current"
  );
  assert(
    interviewJourney.steps.find((step) => step.key === "lead")?.state === "complete",
    "Prior steps complete"
  );
  console.log("✓ Journey Progress mapper");

  const closedJourney = buildJourneyProgress(MILESTONES.CLOSED);
  assert(closedJourney.terminalState === MILESTONES.CLOSED, "Terminal milestone captured");
  console.log("✓ Journey terminal state");

  const app = createWorkspaceApp();
  const simResponse = await fetchWorkspace(app, "sim-golden-01");
  assert(simResponse.status === 404, `Simulator phone rejected, got ${simResponse.status}`);
  console.log("✓ Simulator prospect excluded");

  let samplePhone = null;
  const mcLatest = await getMissionControlWithActions("latest");

  if (mcLatest?.prospect?.phone) {
    samplePhone = mcLatest.prospect.phone;
  }

  if (samplePhone) {
    const readModel = await buildProspectWorkspaceReadModel(samplePhone);
    assert(readModel?.prospect?.phone, "Workspace read model returns prospect");
    assert(readModel?.journey?.steps?.length === 6, "Journey has six steps");
    assert(Array.isArray(readModel.availableActions), "Available actions preserved");
    assert(readModel.atlasCoach === null, "Atlas Coach placeholder null");
    assert(Array.isArray(readModel.activityPreview), "Activity preview array present");
    console.log(`✓ Workspace read model (${samplePhone})`);

    const httpResponse = await fetchWorkspace(app, samplePhone);
    assert(httpResponse.status === 200, `Workspace GET expected 200, got ${httpResponse.status}`);
    assert(httpResponse.payload.prospect?.phone === samplePhone, "HTTP payload phone matches");
    assert(httpResponse.payload.journey?.currentStepKey, "HTTP payload includes journey");
    console.log("✓ Workspace HTTP route");

    const mc = await getMissionControlWithActions(samplePhone);
    assert(
      httpResponse.payload.workflow?.canonicalMilestone === mc.workflow?.canonicalMilestone,
      "Workspace milestone matches Mission Control"
    );
    assert(
      httpResponse.payload.availableActions?.length === mc.availableActions?.length,
      "Workspace actions match Mission Control"
    );
    console.log("✓ Mission Control parity");

    const patchServer = app.listen(0);
    const patchPort = patchServer.address().port;

    try {
      const patchResponse = await fetch(
        `http://127.0.0.1:${patchPort}/api/prospect-workspace/${encodeURIComponent(samplePhone)}/communication-language`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communication_language: "en" })
        }
      );
      assert(patchResponse.status === 200, `PATCH language expected 200, got ${patchResponse.status}`);
      const patchPayload = await patchResponse.json();
      assert(patchPayload.communication_language === "en", "PATCH returns updated language");

      await fetch(
        `http://127.0.0.1:${patchPort}/api/prospect-workspace/${encodeURIComponent(samplePhone)}/communication-language`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communication_language: "es" })
        }
      );
      console.log("✓ Communication language PATCH");
    } finally {
      patchServer.close();
    }

    console.log("\n--- Sprint 10.2b Activity Feed ---");

    const feed = await listProspectActivityFeed(samplePhone, { limit: 5 });
    assert(Array.isArray(feed.items), "Activity feed returns items array");
    assert(typeof feed.hasMore === "boolean", "Activity feed has hasMore flag");
    assert(feed.phone === samplePhone, "Activity feed phone matches");

    if (feed.items.length) {
      const first = feed.items[0];
      assert(first.id && first.activityType && first.timestamp, "Activity item shape valid");
    }
    console.log(`✓ Activity read model (${feed.items.length} preview items)`);

    const activityHttp = await fetchWorkspace(app, samplePhone, "/activity?limit=5");
    assert(activityHttp.status === 200, `Activity GET expected 200, got ${activityHttp.status}`);
    assert(Array.isArray(activityHttp.payload.items), "Activity HTTP returns items");
    assert(activityHttp.payload.generatedAt, "Activity HTTP includes generatedAt");
    console.log("✓ Activity HTTP route");

    const verifyLogId = `verify-10-2b-${Date.now()}`;
    const verifyLogRow = {
      id: verifyLogId,
      prospect_phone: samplePhone,
      direction: "outgoing",
      message: "[Agent note] Sprint 10.2b idempotency verification",
      intent: "AGENT_ACTION"
    };

    const firstEmit = await emitConversationLogEvent(verifyLogRow);
    assert(firstEmit.success, "First emitConversationLogEvent succeeds");

    const secondEmit = await emitConversationLogEvent(verifyLogRow);
    assert(secondEmit.success && secondEmit.skipped, "Second emit is idempotent (skipped)");

    if (firstEmit.event?.id && secondEmit.event?.id) {
      assert(firstEmit.event.id === secondEmit.event.id, "Idempotent emit returns same event");
    }
    console.log("✓ Conversation log dual-write idempotency");

    const feedAfterNote = await listProspectActivityFeed(samplePhone, {
      limit: 10,
      types: ["note"]
    });
    const linkedNote = feedAfterNote.items.find(
      (item) => item.payload?.conversationLogId === verifyLogId
    );
    assert(linkedNote, "Emitted note appears in activity feed");
    assert(linkedNote.activityType === "note", "Emitted item is activity type note");
    console.log("✓ Note event in federated feed");
  } else {
    console.log("⚠ Skipping live workspace tests — no production prospect available");
  }

  console.log("\n--- Sprint 10.1 regression ---");
  const { spawnSync } = require("child_process");
  const regression = spawnSync(process.execPath, ["backend/dev/verifySprint10_1.js"], {
    stdio: "inherit",
    env: process.env
  });
  assert(regression.status === 0, "Sprint 10.1 verification failed");
  console.log("✓ Sprint 10.1 regression passed");

  console.log("\n--- Golden Scenarios ---");
  const golden = await runAllGoldenScenarios();
  console.log(`Golden: ${golden.passed}/${golden.total} passed`);
  assert(golden.failed === 0, `${golden.failed} golden scenario(s) failed`);

  console.log("\n=== All Sprint 10.2 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
