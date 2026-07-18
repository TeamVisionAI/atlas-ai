/**
 * Sprint 10.2a — Prospect Workspace verification.
 * Run: node backend/dev/verifySprint10_2.js
 */

require("dotenv").config();

const express = require("express");
const { buildJourneyProgress } = require("../core/journeyProgressMapper");
const { buildProspectWorkspaceReadModel } = require("../core/prospectWorkspaceReadModel");
const prospectWorkspaceRoutes = require("../routes/prospectWorkspace");
const { MILESTONES } = require("../core/workflowConstants");
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

async function fetchWorkspace(app, phone) {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/prospect-workspace/${encodeURIComponent(phone)}`
    );
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  } finally {
    server.close();
  }
}

async function main() {
  console.log("=== Sprint 10.2a Prospect Workspace Verification ===\n");

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

  console.log("\n=== All Sprint 10.2a checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
