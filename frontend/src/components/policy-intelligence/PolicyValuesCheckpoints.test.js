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
    } finally {
      await server.close();
    }
  });
});
