/**
 * Regression: after Not Interested save, MC must leave the closed prospect.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isTerminalMissionControlCloseResult,
  shouldSuppressOperationalMissionActions,
  resolvePostTerminalCloseQueueSelection
} from "./missionControlTerminalCloseNavigation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("A. Not Interested save result is terminal close", () => {
  assert.equal(
    isTerminalMissionControlCloseResult({
      success: true,
      outcome: "Not Interested",
      missionControl: {
        workflow: { canonicalMilestone: "CLOSED" },
        primaryMission: { missionType: "ReviewProspect" }
      }
    }),
    true
  );
});

test("C/D. closed prospect removed; next eligible selected", () => {
  const selection = resolvePostTerminalCloseQueueSelection({
    sortedQueue: [
      { phone: "+17865063586", name: "Flor Flor" },
      { phone: "+17865550001", name: "Next Eligible" },
      { phone: "+17865550002", name: "Third" }
    ],
    closedPhone: "+17865063586",
    priorIndex: 0
  });

  assert.equal(selection.empty, false);
  assert.equal(selection.eligibleQueue.some((row) => row.phone === "+17865063586"), false);
  assert.equal(selection.nextPhone, "+17865550001");
  assert.equal(selection.nextIndex, 0);
});

test("empty queue after close", () => {
  const selection = resolvePostTerminalCloseQueueSelection({
    sortedQueue: [{ phone: "+17865063586" }],
    closedPhone: "+17865063586",
    priorIndex: 0
  });

  assert.equal(selection.empty, true);
  assert.equal(selection.nextIndex, null);
});

test("E/F. CLOSED workspace suppresses operational missions", () => {
  assert.equal(
    shouldSuppressOperationalMissionActions({
      workflow: { canonicalMilestone: "CLOSED" },
      conversationOutcome: { recordedOutcome: { label: "Not Interested" } }
    }),
    true
  );

  assert.equal(
    shouldSuppressOperationalMissionActions({
      workflow: { canonicalMilestone: "QUALIFICATION" },
      conversationOutcome: { requiredInputs: [{ key: "city" }] }
    }),
    false
  );
});

test("B. Dashboard wires queue reload after conversation outcome terminal close", () => {
  const dashboardPath = path.resolve(__dirname, "../pages/Dashboard.jsx");
  const source = fs.readFileSync(dashboardPath, "utf8");

  assert.match(source, /isTerminalMissionControlCloseResult/);
  assert.match(source, /resolvePostTerminalCloseQueueSelection/);
  assert.match(source, /reloadMissionControlQueue/);
  assert.match(source, /shouldSuppressOperationalMissionActions/);
  assert.match(source, /handleConversationOutcomeSaved[\s\S]*advancePastTerminalClosedProspect/);
});
