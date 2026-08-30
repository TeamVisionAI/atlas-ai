/**
 * BR-184 — Today page wiring. Source scans only.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Today page fetches on entry/scope/filter/mutation/focus and never polls", () => {
  const page = fs.readFileSync(path.join(here, "TodayPage.jsx"), "utf8");
  assert.match(page, /getToday\(\{ scope: activeScope, filter: activeFilter \}\)/);
  assert.match(page, /loadToday/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /60000/);
  assert.doesNotMatch(page, /setInterval/);
  assert.match(page, /todayCaughtUp/);
  assert.match(page, /completeFollowUp/);
  assert.match(page, /todayFilterAll/);
  assert.match(page, /todayCountOverdue/);
  assert.match(page, /todayCountDueToday/);
  assert.doesNotMatch(page, /markAgentNotificationRead/);
});

test("Today stays routed and labeled, with a lightweight dashboard link", () => {
  const app = fs.readFileSync(path.join(here, "../App.jsx"), "utf8");
  const nav = fs.readFileSync(path.join(here, "../config/workspaceExperience.js"), "utf8");
  const translations = fs.readFileSync(path.join(here, "../i18n/translations.js"), "utf8");
  const dashboard = fs.readFileSync(path.join(here, "MyDashboard.jsx"), "utf8");

  assert.match(app, /path="today" element=\{<TodayPage/);
  assert.match(nav, /id: "today"/);
  assert.match(nav, /"today",\s*"appointments"/);
  assert.match(translations, /navToday: "Today"/);
  assert.match(translations, /todayScopeMine: "My"/);
  assert.match(translations, /todayScopeTeam: "Team"/);
  assert.match(translations, /todayCaughtUp: "You’re caught up for today\."/);
  assert.match(dashboard, /appPath\("today"\)/);
  assert.match(dashboard, /myDashboardOpenToday/);
});
