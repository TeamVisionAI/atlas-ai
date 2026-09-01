/**
 * BR-207 — Sidebar information architecture / collapsible navigation groups.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { appPath } from "../config/appRoutes.js";
import {
  RECOMMENDED_RECRUITS_PATH,
  SIDEBAR_GROUP_ORDER,
  SIDEBAR_NAV_GROUPS,
  SIDEBAR_NAV_GROUPS_STORAGE_KEY,
  buildSidebarNavModel,
  collectSidebarHrefs,
  expandActiveSidebarGroup,
  isGroupActive,
  pathMatchesNavItem,
  readSidebarGroupState,
  resolveActiveGroupId,
  toggleSidebarGroupState,
  writeSidebarGroupState
} from "./sidebarNavigation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    data
  };
}

function item(id, end) {
  return { path: appPath(id), labelKey: `nav-${id}`, end };
}

const RVP_ITEMS = [
  item("executive-dashboard", true),
  item("team-dashboard", true),
  item("quick-capture"),
  item("mission-control"),
  item("prospect-center"),
  item("conversations"),
  item("today"),
  item("appointments"),
  item("follow-ups"),
  item("clients"),
  item("production"),
  item("service"),
  item("knowledge"),
  item("policy-intelligence"),
  item("policy-reviews"),
  item("recruiting"),
  item("analytics"),
  item("settings"),
  item("admin/users")
];

const ADMIN_ITEMS = RVP_ITEMS.filter((entry) => entry.path !== appPath("recruiting")).concat([
  item("operations-center"),
  item("platform/tenants")
]);

const RECRUITER_ITEMS = [
  item("team-dashboard", true),
  item("my-dashboard", true),
  item("quick-capture"),
  item("mission-control"),
  item("prospect-center"),
  item("conversations"),
  item("today"),
  item("appointments"),
  item("follow-ups"),
  item("clients"),
  item("production"),
  item("service"),
  item("knowledge"),
  item("policy-intelligence"),
  item("policy-reviews"),
  item("settings")
];

function modelFor(items) {
  return buildSidebarNavModel(items);
}

function groupById(model, id) {
  return model.groups.find((group) => group.id === id) || null;
}

test("A) group headers render for permitted operational sections", () => {
  const model = modelFor(RVP_ITEMS);
  assert.deepEqual(
    model.groups.map((group) => group.id),
    SIDEBAR_GROUP_ORDER
  );
  assert.deepEqual(
    model.groups.map((group) => group.labelKey),
    [
      "navGroupPipeline",
      "navGroupPeopleOutcomes",
      "navGroupIntelligence",
      "navGroupGrowth"
    ]
  );
});

test("B) Pipeline expands and collapses independently", () => {
  const collapsed = toggleSidebarGroupState({ pipeline: true }, SIDEBAR_NAV_GROUPS.PIPELINE);
  assert.equal(collapsed.pipeline, false);
  const expanded = toggleSidebarGroupState(collapsed, SIDEBAR_NAV_GROUPS.PIPELINE);
  assert.equal(expanded.pipeline, true);
  assert.equal(expanded.peopleOutcomes, true);
});

test("C) People & Outcomes expands and collapses independently", () => {
  const next = toggleSidebarGroupState({}, SIDEBAR_NAV_GROUPS.PEOPLE_OUTCOMES);
  assert.equal(next.peopleOutcomes, false);
  assert.equal(toggleSidebarGroupState(next, SIDEBAR_NAV_GROUPS.PEOPLE_OUTCOMES).peopleOutcomes, true);
});

test("D) Intelligence expands and collapses independently", () => {
  const next = toggleSidebarGroupState({ intelligence: true }, SIDEBAR_NAV_GROUPS.INTELLIGENCE);
  assert.equal(next.intelligence, false);
});

test("E) Growth expands and collapses independently", () => {
  const next = toggleSidebarGroupState({ growth: true }, SIDEBAR_NAV_GROUPS.GROWTH);
  assert.equal(next.growth, false);
});

test("F) active route auto-expands its parent group", () => {
  const model = modelFor(RVP_ITEMS);
  const collapsed = {
    pipeline: false,
    peopleOutcomes: false,
    intelligence: false,
    growth: false
  };

  assert.equal(
    expandActiveSidebarGroup(collapsed, appPath("conversations"), model).pipeline,
    true
  );
  assert.equal(
    expandActiveSidebarGroup(collapsed, appPath("production"), model).peopleOutcomes,
    true
  );
  assert.equal(
    expandActiveSidebarGroup(collapsed, appPath("policy-intelligence"), model).intelligence,
    true
  );
  assert.equal(
    expandActiveSidebarGroup(collapsed, appPath("recruiting"), model).growth,
    true
  );
});

test("G) active child remains highlighted via path match", () => {
  assert.equal(pathMatchesNavItem(appPath("production"), appPath("production")), true);
  assert.equal(pathMatchesNavItem(appPath("clients"), `${appPath("clients")}/abc`), true);
  assert.equal(pathMatchesNavItem(appPath("clients"), appPath("production")), false);

  const model = modelFor(RVP_ITEMS);
  const people = groupById(model, SIDEBAR_NAV_GROUPS.PEOPLE_OUTCOMES);
  assert.equal(isGroupActive(people, appPath("production")), true);
  assert.equal(resolveActiveGroupId(appPath("conversations"), model), SIDEBAR_NAV_GROUPS.PIPELINE);
  assert.equal(resolveActiveGroupId(appPath("policy-intelligence"), model), SIDEBAR_NAV_GROUPS.INTELLIGENCE);
});

test("H) collapse preference persists in local storage", () => {
  const storage = memoryStorage();
  writeSidebarGroupState({ pipeline: false, intelligence: true }, storage);
  const restored = readSidebarGroupState(storage);
  assert.equal(restored.pipeline, false);
  assert.equal(restored.intelligence, true);
  assert.equal(restored.peopleOutcomes, true);
  assert.match(storage.data[SIDEBAR_NAV_GROUPS_STORAGE_KEY], /"pipeline":false/);
});

test("I) groups with zero permitted children are hidden", () => {
  const admin = modelFor(ADMIN_ITEMS);
  assert.equal(groupById(admin, SIDEBAR_NAV_GROUPS.GROWTH), null);

  const peopleOnly = buildSidebarNavModel([
    { path: appPath("clients"), labelKey: "navClients" },
    { path: appPath("service"), labelKey: "navService" }
  ]);
  assert.deepEqual(
    peopleOnly.groups.map((group) => group.id),
    [SIDEBAR_NAV_GROUPS.PEOPLE_OUTCOMES]
  );
  assert.deepEqual(
    peopleOnly.groups[0].children.map((item) => item.path),
    [appPath("clients"), appPath("service")]
  );
});

test("J) existing role-based nav visibility remains unchanged", () => {
  const workspace = fs.readFileSync(path.join(__dirname, "../config/workspaceExperience.js"), "utf8");
  assert.match(workspace, /executiveDashboard:[\s\S]*permission:\s*PERMISSIONS\.DASHBOARD_EXECUTIVE/);
  assert.match(workspace, /teamDashboard:[\s\S]*permission:\s*PERMISSIONS\.DASHBOARD_TEAM/);
  assert.match(workspace, /recruiting:[\s\S]*permission:\s*PERMISSIONS\.PROSPECT_ASSIGN/);
  assert.match(workspace, /knowledge:[\s\S]*permission:\s*PERMISSIONS\.KNOWLEDGE_READ/);
  assert.match(workspace, /policyIntelligence:[\s\S]*permission:\s*PERMISSIONS\.POLICY_READ/);
  assert.match(workspace, /canSeeNavItem/);

  for (const items of [RVP_ITEMS, ADMIN_ITEMS, RECRUITER_ITEMS]) {
    const model = buildSidebarNavModel(items);
    assert.deepEqual(collectSidebarHrefs(model).sort(), items.map((entry) => entry.path).sort());
  }
});

test("K) all existing route hrefs remain unchanged", () => {
  const items = RVP_ITEMS;
  const hrefs = new Set(items.map((entry) => entry.path));
  assert.ok(hrefs.has(appPath("executive-dashboard")));
  assert.ok(hrefs.has(appPath("team-dashboard")));
  assert.ok(hrefs.has(appPath("quick-capture")));
  assert.ok(hrefs.has(appPath("mission-control")));
  assert.ok(hrefs.has(appPath("prospect-center")));
  assert.ok(hrefs.has(appPath("conversations")));
  assert.ok(hrefs.has(appPath("today")));
  assert.ok(hrefs.has(appPath("appointments")));
  assert.ok(hrefs.has(appPath("follow-ups")));
  assert.ok(hrefs.has(appPath("clients")));
  assert.ok(hrefs.has(appPath("production")));
  assert.ok(hrefs.has(appPath("service")));
  assert.ok(hrefs.has(appPath("knowledge")));
  assert.ok(hrefs.has(appPath("policy-intelligence")));
  assert.ok(hrefs.has(appPath("policy-reviews")));
  assert.ok(hrefs.has(appPath("recruiting")));
  assert.ok(hrefs.has(appPath("settings")));
  assert.equal(hrefs.has(RECOMMENDED_RECRUITS_PATH), false);
});

test("L) no duplicate nav items after grouping", () => {
  const model = modelFor(RVP_ITEMS);
  const hrefs = collectSidebarHrefs(model);
  assert.equal(hrefs.length, new Set(hrefs).size);

  const withDupes = buildSidebarNavModel([
    { path: appPath("clients"), labelKey: "navClients" },
    { path: appPath("clients"), labelKey: "navClients" }
  ]);
  assert.equal(collectSidebarHrefs(withDupes).length, 1);
});

test("M) sidebar keeps an independent scroll region and does not invent Recruits", () => {
  const layout = fs.readFileSync(path.join(__dirname, "../layouts/MainLayout.jsx"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../layouts/MainLayout.css"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../App.jsx"), "utf8");

  assert.match(layout, /buildSidebarNavModel/);
  assert.match(layout, /atlas-layout__nav-group/);
  assert.match(layout, /aria-expanded/);
  assert.doesNotMatch(layout, /appPath\("recruits"\)/);
  assert.doesNotMatch(app, /path="recruits"/);

  assert.match(css, /\.atlas-layout__nav\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.atlas-layout__sidebar\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.atlas-layout__sidebar-footer\s*\{[\s\S]*flex-shrink:\s*0/);
  assert.match(css, /--atlas-sidebar-width:\s*250px/);
});

test("BR-207 exact grouped structure for RVP", () => {
  const model = modelFor(RVP_ITEMS);
  assert.deepEqual(
    model.topLevel.map((item) => item.path),
    [appPath("executive-dashboard"), appPath("team-dashboard"), appPath("quick-capture")]
  );
  assert.deepEqual(
    groupById(model, SIDEBAR_NAV_GROUPS.PIPELINE).children.map((item) => item.path),
    [
      appPath("mission-control"),
      appPath("prospect-center"),
      appPath("conversations"),
      appPath("today"),
      appPath("appointments"),
      appPath("follow-ups")
    ]
  );
  assert.deepEqual(
    groupById(model, SIDEBAR_NAV_GROUPS.PEOPLE_OUTCOMES).children.map((item) => item.path),
    [appPath("clients"), appPath("production"), appPath("service")]
  );
  assert.deepEqual(
    groupById(model, SIDEBAR_NAV_GROUPS.INTELLIGENCE).children.map((item) => item.path),
    [appPath("knowledge"), appPath("policy-intelligence"), appPath("policy-reviews")]
  );
  assert.deepEqual(
    groupById(model, SIDEBAR_NAV_GROUPS.GROWTH).children.map((item) => item.path),
    [appPath("recruiting")]
  );
  assert.ok(model.trailing.some((item) => item.path === appPath("settings")));
});
