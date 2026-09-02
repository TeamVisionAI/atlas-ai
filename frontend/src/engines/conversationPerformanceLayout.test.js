import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(
  path.join(__dirname, "../pages/ExecutiveDashboard.css"),
  "utf8"
);
const chart = fs.readFileSync(
  path.join(__dirname, "../components/executive/v2/ExecutiveDashboardCharts.jsx"),
  "utf8"
);

test("K) Conversation Performance legend keeps a dedicated unclipped count column", () => {
  assert.match(css, /\.executive-v2__donut-wrap\s*\{[^}]*minmax\(0,\s*1fr\)/);
  assert.match(
    css,
    /\.executive-v2__donut-legend li\s*\{[^}]*grid-template-columns:\s*12px minmax\(0,\s*1fr\) min-content/
  );
  assert.match(css, /\.executive-v2__donut-legend-count[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /\.executive-v2__donut-legend-label[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.executive-v2__card--conversation[\s\S]*overflow:\s*visible/);
  assert.match(chart, /executive-v2__donut-legend-count/);
  assert.doesNotMatch(
    css,
    /\.executive-v2__donut-legend strong\s*\{[^}]*margin-left:\s*auto/
  );
});
