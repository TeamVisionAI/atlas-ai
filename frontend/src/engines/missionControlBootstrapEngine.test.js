import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  estimateSplashWaitMs,
  planMissionControlBootstrap,
  shouldHoldMissionControlSplash
} from "./missionControlBootstrapEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("deep-link bootstrap treats dashboard as deferred", () => {
  const plan = planMissionControlBootstrap({ deepLinkPhone: "+17865550185" });
  assert.equal(plan.mode, "deep_link");
  assert.deepEqual(plan.critical, ["getMissionControl", "getOrganizationSettings"]);
  assert.deepEqual(plan.deferred, ["getDashboard"]);
});

test("queue bootstrap still needs dashboard before a prospect pick", () => {
  const plan = planMissionControlBootstrap({});
  assert.equal(plan.mode, "queue");
  assert.ok(plan.critical.includes("getDashboard"));
});

test("splash clears as soon as workspace exists even if dashboard is still loading", () => {
  assert.equal(shouldHoldMissionControlSplash({ initialLoading: true, workspace: null }), true);
  assert.equal(
    shouldHoldMissionControlSplash({ initialLoading: true, workspace: { phone: "+1" } }),
    false
  );
  assert.equal(shouldHoldMissionControlSplash({ initialLoading: false, workspace: null }), false);
});

test("deep-link splash wait is max(MC, org settings), not plus dashboard", () => {
  const plan = planMissionControlBootstrap({ deepLinkPhone: "+17865550185" });
  const before = 8000 + 400;
  const after = estimateSplashWaitMs(plan, {
    getMissionControl: 400,
    getOrganizationSettings: 120,
    getDashboard: 8000
  });
  assert.equal(after, 400);
  assert.ok(after < before);
});

test("Mission Control page uses the splash helper and does not block on dashboard alone", () => {
  const page = fs.readFileSync(path.join(__dirname, "../pages/Dashboard.jsx"), "utf8");
  assert.match(page, /planMissionControlBootstrap/);
  assert.match(page, /shouldHoldMissionControlSplash/);
  assert.doesNotMatch(
    page,
    /if \(!dashboard\) \{\s*return <h2>🚀 \{translate\("missionControlLoading"\)\}/
  );
  assert.match(page, /if \(!workspace\) \{\s*return null;/);
  assert.doesNotMatch(page, /getToday|todayActionCenter|\/api\/today/);
});
