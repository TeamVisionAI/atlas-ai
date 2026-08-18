/**
 * Checkpoint table layout only — wrapped headers, no value/DTO changes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../../..");

function classified(value, classification) {
  return { value, classification, invented: false, interpolated: false };
}

const checkpoints = [
  {
    requestedYear: 1,
    usedYear: 1,
    fallback: false,
    attainedAge: 35,
    premium: classified(2991.53, "EXTRACTED_EXACT"),
    costOfInsurance: classified(null, "NOT_AVAILABLE"),
    otherKnownCharges: classified(null, "NOT_AVAILABLE"),
    surrenderCharge: classified(null, "NOT_AVAILABLE"),
    accountValue: classified(1921, "EXTRACTED_EXACT"),
    cashSurrenderValue: classified(0, "EXTRACTED_EXACT"),
    deathBenefit: classified(294921, "EXTRACTED_EXACT")
  }
];

describe("PolicyValuesCheckpoints layout", () => {
  it("wraps long headers, keeps all columns and exact values, and does not force desktop scroll", async () => {
    const css = readFileSync(path.join(__dirname, "ClientPolicyReport.css"), "utf8");
    const jsx = readFileSync(path.join(__dirname, "PolicyValuesCheckpoints.jsx"), "utf8");

    assert.ok(jsx.includes("pi-checkpoint-table__head-line"));
    assert.ok(jsx.includes("Cost of"));
    assert.ok(jsx.includes("Insurance"));
    assert.ok(jsx.includes("Other Known"));
    assert.ok(jsx.includes("Cash Surrender"));
    assert.equal(jsx.includes("Math.pow"), false);

    const wrapRule = css.match(/\.pi-checkpoint-wrap\s*\{([\s\S]*?)\}/);
    assert.ok(wrapRule, "expected default .pi-checkpoint-wrap rule");
    assert.match(wrapRule[1], /overflow-x:\s*visible/);
    assert.equal(/overflow-x:\s*auto/.test(wrapRule[1]), false);

    assert.match(css, /table-layout:\s*fixed/);
    assert.match(css, /\.pi-checkpoint-table th[\s\S]*white-space:\s*normal/);
    assert.match(
      css,
      /@media print[\s\S]*\.pi-checkpoint-table[\s\S]*width:\s*100%\s*!important/
    );
    assert.match(
      css,
      /@media print[\s\S]*\.pi-checkpoint-wrap[\s\S]*overflow:\s*visible\s*!important/
    );
    assert.match(
      css,
      /@media \(max-width: 720px\)[\s\S]*\.pi-checkpoint-wrap[\s\S]*overflow-x:\s*auto/
    );

    const server = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "error"
    });

    try {
      const mod = await server.ssrLoadModule(
        "/src/components/policy-intelligence/PolicyValuesCheckpoints.jsx"
      );
      const html = renderToString(
        React.createElement(mod.default, {
          checkpoints,
          sourceLine: "Source: Current Illustrated Annual Values — Pages 21–24"
        })
      );

      assert.match(html, /pi-checkpoint-table__head-line/);
      assert.match(html, /Cost of/);
      assert.match(html, /Insurance/);
      assert.match(html, /Other Known/);
      assert.match(html, /Charges/);
      assert.match(html, /Surrender/);
      assert.match(html, /Accumulated/);
      assert.match(html, /Cash Surrender/);
      assert.match(html, /Death/);
      assert.match(html, /Benefit/);
      assert.match(html, /Policy Year/);
      assert.match(html, /Attained Age/);
      assert.match(html, /Annual Premium/);
      assert.match(html, /pi-checkpoint-h-year/);
      assert.match(html, /pi-checkpoint-h-db/);
      assert.match(html, /\$2,991\.53/);
      assert.match(html, /\$1,921/);
      assert.match(html, /\$0/);
      assert.match(html, /\$294,921/);
      assert.match(html, /data-testid="pi-checkpoint-av"/);
      assert.match(html, /data-testid="pi-checkpoint-csv"/);
      assert.match(html, /pi-source-line/);
      assert.match(html, /Source: Current Illustrated Annual Values — Pages 21–24/);
      assert.equal(html.includes("data-year=\"2\""), false);

      assert.equal(html.includes("<caption"), false);
      const noteIdx = html.indexOf("pi-checkpoint-table__note");
      const tableIdx = html.indexOf("<table");
      const theadIdx = html.indexOf("<thead");
      const tbodyIdx = html.indexOf("<tbody");
      assert.ok(noteIdx > 0 && tableIdx > noteIdx, "explanatory note must sit above the table");
      assert.ok(theadIdx > tableIdx && tbodyIdx > theadIdx, "thead must precede tbody inside the table");
      const noteChunk = html.slice(noteIdx, tableIdx);
      assert.equal(noteChunk.includes("<th"), false);
      assert.equal(noteChunk.includes("<td"), false);
      assert.match(html, /<p[^>]*pi-checkpoint-table__note/);
      assert.match(html, /Sourced checkpoint values/);
      assert.match(html, /data-testid="pi-checkpoint-h-year"/);
      assert.match(html, /data-testid="pi-checkpoint-h-age"/);
      assert.match(html, /data-testid="pi-checkpoint-h-premium"/);
      assert.match(html, /data-testid="pi-checkpoint-h-coi"/);
      assert.match(html, /data-testid="pi-checkpoint-h-other"/);
      assert.match(html, /data-testid="pi-checkpoint-h-surrender"/);
      assert.match(html, /data-testid="pi-checkpoint-h-av"/);
      assert.match(html, /data-testid="pi-checkpoint-h-csv"/);
      assert.match(html, /data-testid="pi-checkpoint-h-db"/);

      const noteRules = [...css.matchAll(/\.pi-checkpoint-table__note[^{]*\{([^}]+)\}/g)];
      assert.ok(noteRules.length > 0, "expected note CSS");
      for (const match of noteRules) {
        assert.equal(/display:\s*(flex|grid)/.test(match[1]), false, "note must not be a flex/grid column");
      }
      assert.match(css, /\.pi-checkpoint-table thead[\s\S]{0,120}page-break-after:\s*avoid/);
      assert.match(css, /tbody tr:first-child[\s\S]{0,80}page-break-before:\s*avoid/);
      assert.equal(
        /\.pi-checkpoint-table thead[\s\S]{0,80}break-before:\s*page/.test(css),
        false
      );
      assert.equal(
        /\.pi-checkpoint-table\s*\{[^}]*break-inside:\s*avoid/.test(css),
        false
      );
    } finally {
      await server.close();
    }
  });

  it("switches to a distribution-aware table only when that variant is requested", async () => {
    const jsx = readFileSync(path.join(__dirname, "PolicyValuesCheckpoints.jsx"), "utf8");
    assert.ok(jsx.includes("pi-checkpoint-table--distribution"));
    assert.ok(jsx.includes("Accumulated Loan"));
    assert.ok(jsx.includes("Annual"));
    assert.ok(jsx.includes("Income"));
    assert.equal(jsx.includes("Math.pow"), false);
    assert.equal(/accountValue\s*-/.test(jsx), false);

    const server = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "error"
    });

    try {
      const mod = await server.ssrLoadModule(
        "/src/components/policy-intelligence/PolicyValuesCheckpoints.jsx"
      );
      const distributionHtml = renderToString(
        React.createElement(mod.default, {
          variant: "distribution",
          sourceLine: "Source: Distributions Ledger — Pages 25–28",
          checkpoints: [
            {
              requestedYear: 32,
              usedYear: 32,
              fallback: false,
              attainedAge: 66,
              annualPremium: classified(0, "EXTRACTED_EXACT"),
              income: classified(17265, "EXTRACTED_EXACT"),
              plannedLoan: classified(17265, "EXTRACTED_EXACT"),
              accumulatedLoan: classified(18280, "EXTRACTED_EXACT"),
              accountValue: classified(213397, "EXTRACTED_EXACT"),
              cashSurrenderValue: classified(195117, "EXTRACTED_EXACT"),
              deathBenefit: classified(475814, "EXTRACTED_EXACT"),
              sourcePage: 26
            },
            {
              requestedYear: 86,
              usedYear: 86,
              fallback: false,
              attainedAge: 120,
              annualPremium: classified(0, "EXTRACTED_EXACT"),
              income: classified(17265, "EXTRACTED_EXACT"),
              plannedLoan: classified(377676, "EXTRACTED_EXACT"),
              accumulatedLoan: classified(6889734, "EXTRACTED_EXACT"),
              accountValue: classified(8760818, "EXTRACTED_EXACT"),
              cashSurrenderValue: classified(1871085, "EXTRACTED_EXACT"),
              deathBenefit: classified(1871085, "EXTRACTED_EXACT"),
              sourcePage: 28
            }
          ]
        })
      );

      assert.match(distributionHtml, /pi-checkpoint-table--distribution/);
      assert.match(distributionHtml, /data-testid="pi-checkpoint-h-income"/);
      assert.match(distributionHtml, /data-testid="pi-checkpoint-h-debt"/);
      assert.equal(distributionHtml.includes('data-testid="pi-checkpoint-h-coi"'), false);
      assert.match(distributionHtml, /\$17,265/);
      assert.match(distributionHtml, /\$6,889,734/);
      assert.match(distributionHtml, /Source: Distributions Ledger — Pages 25–28/);
      const noteIdx = distributionHtml.indexOf("pi-checkpoint-table__note");
      const tableIdx = distributionHtml.indexOf("<table");
      const theadIdx = distributionHtml.indexOf("<thead");
      const tbodyIdx = distributionHtml.indexOf("<tbody");
      assert.ok(noteIdx > 0 && tableIdx > noteIdx, "distribution note stays above the table");
      assert.ok(theadIdx > tableIdx && tbodyIdx > theadIdx, "distribution thead precedes tbody");
    } finally {
      await server.close();
    }
  });
});
