import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Executive Dashboard v2 uses progressive hook instead of blocking Promise.all gate", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../pages/ExecutiveDashboard.jsx"),
    "utf8"
  );

  assert.match(source, /useExecutiveDashboardV2Data/);
  assert.doesNotMatch(source, /Promise\.all\(\[[\s\S]*getDashboard/);
  assert.match(source, /executive-dashboard--v2/);
});

test("operational surfaces refetch when Support Mode tenant changes", () => {
  const missionControl = fs.readFileSync(
    path.join(__dirname, "../pages/Dashboard.jsx"),
    "utf8"
  );
  const prospectCenter = fs.readFileSync(
    path.join(__dirname, "../pages/ProspectCenter.jsx"),
    "utf8"
  );

  assert.match(missionControl, /supportMode\?\.organizationId/);
  assert.match(prospectCenter, /supportMode\?\.organizationId/);

  const conversations = fs.readFileSync(
    path.join(__dirname, "../pages/ConversationsPage.jsx"),
    "utf8"
  );
  assert.match(conversations, /supportMode\?\.organizationId/);
  assert.match(conversations, /clearConversationsCaches/);
  assert.match(conversations, /tenantCacheKey/);
});

test("Executive Dashboard v2 progressive hook phases requests", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../hooks/useExecutiveDashboardV2Data.js"),
    "utf8"
  );

  assert.match(source, /getExecutiveDashboard/);
  assert.match(source, /getAlphaMorningBrief/);
  assert.match(source, /getDashboard/);
  assert.match(source, /AbortController/);
  assert.match(source, /setPhase\(2\)/);
  assert.match(source, /supportMode\?\.organizationId/);
});

test("Executive Dashboard route remains executive-dashboard with BR-149 gate", () => {
  const workspaceSource = fs.readFileSync(
    path.join(__dirname, "../config/workspaceExperience.js"),
    "utf8"
  );

  assert.match(
    workspaceSource,
    /"executive-dashboard":\s*\{[\s\S]*?permission:\s*PERMISSIONS\.DASHBOARD_EXECUTIVE/
  );
});

test("Executive Dashboard v2 charts tolerate empty series", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../components/executive/v2/ExecutiveDashboardCharts.jsx"),
    "utf8"
  );

  assert.match(source, /if \(!series\.length\)/);
  assert.match(source, /if \(!safeTotal\)/);
});

test("Executive Dashboard v2 hook exposes bounded metrics loading states", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../hooks/useExecutiveDashboardV2Data.js"),
    "utf8"
  );

  assert.match(source, /EXECUTIVE_LOAD_TIMEOUT_MS/);
  assert.match(source, /metricsLoading/);
  assert.match(source, /metricsUnavailable/);
  assert.match(source, /reload/);
});

test("Executive Dashboard v2 never keeps KPI skeleton after unavailable metrics", () => {
  const cards = fs.readFileSync(
    path.join(__dirname, "../components/executive/v2/ExecutiveDashboardCards.jsx"),
    "utf8"
  );
  const page = fs.readFileSync(path.join(__dirname, "../pages/ExecutiveDashboard.jsx"), "utf8");

  assert.doesNotMatch(cards, /if \(!cards\.length\) \{\s*return <KpiSkeletonRow/);
  assert.match(cards, /SectionUnavailable/);
  assert.match(page, /metricsUnavailable/);
  assert.match(page, /unavailable=\{metricsUnavailable\}/);
});

test("Executive Dashboard v2 visual polish uses wider layout and funnel visualization", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../pages/ExecutiveDashboard.css"),
    "utf8"
  );
  const sections = fs.readFileSync(
    path.join(__dirname, "../components/executive/v2/ExecutiveDashboardSections.jsx"),
    "utf8"
  );

  assert.match(css, /--exec-v2-max:\s*1620px/);
  assert.match(css, /executive-v2__funnel-viz/);
  assert.match(css, /height:\s*260px/);
  assert.match(sections, /executive-v2__funnel-viz/);
  assert.match(sections, /data-tone=/);
});

test("Executive Dashboard v2 trend chart renders data point dots", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../components/executive/v2/ExecutiveDashboardCharts.jsx"),
    "utf8"
  );

  assert.match(source, /executive-v2__chart-dot/);
  assert.match(source, /height = 260/);
});
