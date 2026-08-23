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
