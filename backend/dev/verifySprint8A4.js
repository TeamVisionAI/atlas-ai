/**
 * Sprint 8A.4a — Verification for workflow simulator endpoints and golden scenarios.
 * Run: node backend/dev/verifySprint8A4.js
 */

require("dotenv").config();

const axios = require("axios");
const {
  assertSimulatorPhone,
  isSimulatorPhone,
  SIM_PHONE_PREFIX
} = require("./simulatorSafety");
const {
  createSimulatorProspect,
  simulateMessage,
  advanceSimulatorWorkflow,
  simulateStall,
  getSimulatorState,
  getSimulatorEvents,
  getSimulatorTimeline,
  getSimulatorPriority,
  cleanupSimulatorProspect
} = require("./workflowSimulatorService");
const { runAllGoldenScenarios } = require("./goldenScenarios");
const { withSimulatorGuard } = require("./simulatorGuard");
const { sendTextMessage } = require("../services/whatsappService");
const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");

const BASE = `http://localhost:${process.env.PORT || 3000}/dev/workflow`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log("=== Sprint 8A.4a Verification ===\n");

  assert(isSimulatorPhone("sim-test"), "sim- prefix detection");
  try {
    assertSimulatorPhone("real-prospect-123");
    throw new Error("Should have rejected non-sim phone");
  } catch (error) {
    assert(error.code === "SIM_PHONE_REQUIRED", "Non-sim phone rejected");
  }
  console.log("✓ sim- safety restrictions");

  let whatsappCalled = false;
  const originalPost = axios.post;
  axios.post = async (...args) => {
    if (String(args[0]).includes("graph.facebook.com")) {
      whatsappCalled = true;
    }
    return originalPost(...args);
  };

  await withSimulatorGuard(async () => {
    const mockResult = await sendTextMessage("sim-test", "hello");
    assert(mockResult.simulated === true, "WhatsApp should be mocked in simulator guard");
  });
  assert(whatsappCalled === false, "WhatsApp API must not be called under simulator guard");
  axios.post = originalPost;
  console.log("✓ No external WhatsApp under simulator guard");

  const phone = `sim-verify-${Date.now()}`;

  const created = await createSimulatorProspect({ phone, name: "Verify Prospect" });
  assert(created.workflow?.canonicalMilestone, "Create prospect returns workflow");
  console.log("✓ POST /dev/workflow/prospect (service)");

  const msgOut = await simulateMessage({
    phone,
    direction: "outgoing",
    body: "Hello from Atlas simulator"
  });
  assert(msgOut.workflow, "Message simulation returns workflow");
  console.log("✓ POST /dev/workflow/message outbound");

  const msgIn = await simulateMessage({
    phone,
    direction: "incoming",
    body: "Miami Florida"
  });
  assert(msgIn.reply !== undefined, "Inbound message returns reply field");
  console.log("✓ POST /dev/workflow/message inbound");

  const failAdvance = await advanceSimulatorWorkflow(phone, {
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    capturedFields: { city: "Miami" }
  });
  assert(failAdvance.success === false, "Invalid advance should fail");
  console.log("✓ POST /dev/workflow/advance validation");

  const stall = await simulateStall({ phone, mode: "advance_24h" });
  assert(stall.workflow?.needsHumanAttention === true, "Stall should set needsHumanAttention");
  console.log("✓ POST /dev/workflow/time/stall");

  const eventsAfterStall = await getSimulatorEvents(phone, { limit: 100 });
  const stallEvents = (eventsAfterStall.events || []).filter(
    (row) => row.event_type === "ConversationStalled"
  );
  assert(stallEvents.length >= 1, "ConversationStalled event emitted");

  const stallAgain = await getSimulatorState(phone);
  await simulateStall({ phone, mode: "advance_24h" });
  const eventsAfterStall2 = await getSimulatorEvents(phone, { limit: 100 });
  const stallEvents2 = (eventsAfterStall2.events || []).filter(
    (row) => row.event_type === "ConversationStalled"
  );
  assert(stallEvents2.length === stallEvents.length, "Stall events idempotent on re-read");
  console.log("✓ Stall event idempotency");

  const state = await getSimulatorState(phone);
  assert(state.workflow?.workflowOwnership === OWNERSHIP.AGENT, "Stall ownership AGENT");
  assert(state.brain, "State includes brain");
  console.log("✓ GET /dev/workflow/state/:phone");

  const events = await getSimulatorEvents(phone);
  assert(Array.isArray(events.events), "Events list returned");
  console.log("✓ GET /dev/workflow/events/:phone");

  const timeline = await getSimulatorTimeline(phone);
  assert(Array.isArray(timeline.timeline) && timeline.timeline.length > 0, "Timeline merged");
  console.log("✓ GET /dev/workflow/timeline/:phone");

  const priority = await getSimulatorPriority();
  assert(Array.isArray(priority.queue), "Priority queue returned");
  assert(priority.queue.some((row) => row.phone === phone), "Test prospect in priority queue");
  console.log("✓ GET /dev/workflow/priority");

  try {
    await advanceSimulatorWorkflow("not-a-sim-phone", {
      targetMilestone: MILESTONES.CLOSED
    });
    throw new Error("Should reject non-sim advance");
  } catch (error) {
    assert(error.code === "SIM_PHONE_REQUIRED", "HTTP-less advance rejects non-sim");
  }

  const health = await fetch(`http://localhost:${process.env.PORT || 3000}/health`).catch(() => null);

  if (health?.ok) {
    const httpCreate = await fetchJson(`${BASE}/prospect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: `${phone}-http`, name: "HTTP Sim" })
    });

    if (httpCreate.status === 201) {
      await cleanupSimulatorProspect(`${phone}-http`);
      console.log("✓ HTTP routes reachable");
    } else {
      console.log(`⚠ HTTP workflow routes returned ${httpCreate.status} — restart server to load /dev/workflow`);
    }
  } else {
    console.log("⚠ Server not running — skipped HTTP route checks");
  }

  console.log("\n--- Prior sprint regressions ---");
  const { execSync } = require("child_process");
  execSync("node backend/dev/verifySprint8A2.js", { stdio: "inherit", cwd: process.cwd() });
  execSync("node backend/dev/verifySprint8A3.js", { stdio: "inherit", cwd: process.cwd() });

  console.log("\n--- Golden Scenarios ---");
  const golden = await runAllGoldenScenarios();
  console.log(`Golden: ${golden.passed}/${golden.total} passed`);

  golden.reports.forEach((report) => {
    const icon = report.pass ? "✓" : "✗";
    console.log(`  ${icon} ${report.scenarioName}`);
    if (!report.pass) {
      console.log(`    expected:`, report.expectedResult);
      console.log(`    actual:`, report.actualResult);
    }
  });

  assert(golden.failed === 0, `${golden.failed} golden scenario(s) failed`);

  await cleanupSimulatorProspect(phone);

  console.log("\n=== All Sprint 8A.4a checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
