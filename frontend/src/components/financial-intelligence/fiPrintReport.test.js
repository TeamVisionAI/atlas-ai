/**
 * Static regression tests for FI discussion-scenario print layout.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const printCss = readFileSync(join(__dirname, "fiPrintReport.css"), "utf8");
const sectionCss = readFileSync(join(__dirname, "DiscussionScenariosSection.css"), "utf8");
const sectionJsx = readFileSync(join(__dirname, "DiscussionScenariosSection.jsx"), "utf8");
const panelJsx = readFileSync(join(__dirname, "FinancialIntelligencePanel.jsx"), "utf8");
const packageJson = readFileSync(join(__dirname, "../../../package.json"), "utf8");

describe("FI print layout contract", () => {
  it("does not treat the whole FI report as an unbreakable print box", () => {
    const ruleMatch = sectionCss.match(/\.fi-discussion-scenarios\s*\{([\s\S]*?)\}/);
    assert.ok(ruleMatch, "expected .fi-discussion-scenarios rule");
    assert.equal(/break-inside\s*:\s*avoid/.test(ruleMatch[1]), false);
    assert.ok(printCss.includes("break-inside: auto !important"));
    assert.ok(printCss.includes("page-break-before: auto !important"));
    assert.equal(/^\s*break-before\s*:\s*page\s*;/m.test(printCss), false);
    assert.equal(/^\s*break-before\s*:\s*page\s*;/m.test(sectionCss), false);
  });

  it("hides application chrome and FI controls with print-specific selectors", () => {
    for (const selector of [
      ".atlas-layout__sidebar",
      ".atlas-layout__header",
      ".workspace-dashboard__header",
      ".policy-intelligence__tabs",
      ".policy-intelligence__select-label",
      ".workspace-dashboard__panel-head",
      ".fi-panel__forms",
      ".fi-panel__button",
      ".fi-panel__history",
      ".fi-panel__meta-bar",
      ".policy-intelligence__print",
      ".pi-client-report-toolbar",
      ".fi-print-hide"
    ]) {
      assert.ok(printCss.includes(selector), `missing hide rule for ${selector}`);
    }
  });

  it("does not hide FI report sections in print CSS", () => {
    for (const keep of [
      ".fi-discussion-scenarios__projection-grid",
      ".fi-discussion-scenarios__safeguards",
      ".fi-discussion-scenarios__missing",
      ".fi-discussion-scenarios__disclaimers",
      ".fi-projection",
      ".pi-client-report",
      ".fi-print-root"
    ]) {
      const hideRule = new RegExp(
        `${keep.replace(/\./g, "\\.")}[^{\\n]*,?[\\s\\S]{0,80}display:\\s*none`,
        "m"
      );
      assert.equal(hideRule.test(printCss), false, `must not hide ${keep}`);
    }
  });

  it("unlocks overflow and fixed viewport heights for print", () => {
    assert.ok(printCss.includes("overflow: visible !important"));
    assert.ok(printCss.includes("height: auto !important"));
    assert.ok(printCss.includes("max-height: none !important"));
    assert.ok(printCss.includes("transform: none !important"));
  });

  it("uses a dedicated printable wrapper and print meta", () => {
    assert.ok(sectionJsx.includes('className="fi-print-root"'));
    assert.ok(sectionJsx.includes("fi-print-meta"));
    assert.ok(sectionJsx.includes("fi-projection-assumptions"));
    assert.ok(sectionJsx.includes("fi-disclaimers"));
    assert.ok(sectionJsx.includes("localizeFiStatus"));
    assert.ok(sectionJsx.includes("fiRegisteredRepHandoff"));
    assert.ok(panelJsx.includes("fiPrintReport.css"));
  });

  it("does not hide PI source lines, charts, or page numbers in print CSS", () => {
    const piCss = readFileSync(join(__dirname, "../policy-intelligence/ClientPolicyReport.css"), "utf8");
    assert.ok(piCss.includes("@page"));
    assert.ok(piCss.includes("counter(page)"));
    assert.ok(piCss.includes(".pi-source-line"));
    assert.ok(piCss.includes("display: block !important"));
    assert.equal(/pi-source-line[^{]*\{[^}]*display:\s*none/m.test(piCss), false);
    assert.equal(/pi-values-chart[^{]*\{[^}]*display:\s*none/m.test(printCss), false);
    assert.ok(printCss.includes(".pi-client-report-toolbar"));
    assert.ok(printCss.includes(".policy-intelligence__print"));
  });

  it("does not add a PDF-generation dependency", () => {
    assert.equal(packageJson.includes("jspdf"), false);
    assert.equal(packageJson.includes("pdfkit"), false);
    assert.equal(packageJson.includes("html2pdf"), false);
    assert.equal(packageJson.includes("@react-pdf"), false);
  });
});
