/**
 * Checkpoint chart plots stored BR-144 values only: null stays missing, 0 stays 0.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";
import { VALUE_CLASSIFICATIONS } from "./classifiedValueDisplay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../../..");

function classified(value, classification) {
  return { value, classification, invented: false, interpolated: false };
}

describe("PolicyValuesCheckpointChart", () => {
  it("plots stored checkpoints without filling missing years or coercing null to zero", async () => {
    const server = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "error"
    });

    try {
      const mod = await server.ssrLoadModule(
        "/src/components/policy-intelligence/PolicyValuesCheckpointChart.jsx"
      );
      const Chart = mod.default;
      const knownCheckpointValue = mod.knownCheckpointValue;

      assert.equal(knownCheckpointValue(classified(0, VALUE_CLASSIFICATIONS.EXTRACTED_EXACT)), 0);
      assert.equal(knownCheckpointValue(classified(null, VALUE_CLASSIFICATIONS.EXTRACTED_EXACT)), null);
      assert.equal(knownCheckpointValue(classified(0, VALUE_CLASSIFICATIONS.NOT_AVAILABLE)), null);
      assert.equal(
        knownCheckpointValue(classified(null, VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED)),
        null
      );

      const html = renderToString(
        React.createElement(Chart, {
          sourceLine: "Source: Policy Illustration — Pages 22–23",
          checkpoints: [
            {
              usedYear: 1,
              attainedAge: 36,
              accountValue: classified(1422, "EXTRACTED_EXACT"),
              cashSurrenderValue: classified(0, "EXTRACTED_EXACT"),
              deathBenefit: classified(100000, "EXTRACTED_EXACT")
            },
            {
              usedYear: 10,
              attainedAge: 45,
              accountValue: classified(15710, "EXTRACTED_EXACT"),
              cashSurrenderValue: classified(14370, "EXTRACTED_EXACT"),
              deathBenefit: classified(100000, "EXTRACTED_EXACT")
            },
            {
              usedYear: 20,
              attainedAge: 55,
              accountValue: classified(null, "NOT_AVAILABLE"),
              cashSurrenderValue: classified(null, "NOT_AVAILABLE"),
              deathBenefit: classified(100000, "EXTRACTED_EXACT")
            },
            {
              usedYear: 86,
              attainedAge: 121,
              accountValue: classified(2500000, "EXTRACTED_EXACT"),
              cashSurrenderValue: classified(2480000, "EXTRACTED_EXACT"),
              deathBenefit: classified(2500000, "EXTRACTED_EXACT")
            }
          ]
        })
      );

      assert.match(html, /Policy values over time/);
      assert.match(html, /Policy year/);
      assert.match(html, /Accumulated Value/);
      assert.match(html, /Cash Surrender Value/);
      assert.match(html, /Death Benefit/);
      assert.match(html, /Yr 1 · 36/);
      assert.match(html, /Source: Policy Illustration — Pages 22–23/);
      assert.match(html, /data-testid="pi-values-chart-summary"/);
      assert.match(html, /data-testid="pi-values-chart-summary-1"/);
      assert.match(html, /data-testid="pi-values-chart-summary-86"/);
      assert.match(html, /data-testid="pi-values-chart-summary-1-accountValue"[^>]*>\$1,422/);
      assert.match(html, /data-testid="pi-values-chart-summary-1-cashSurrenderValue"[^>]*>\$0/);
      assert.match(html, /stroke-width="3.2"/);
      assert.match(html, /data-series="accountValue"[^>]*data-year="1"[^>]*data-value="1422"/);
      assert.match(html, /data-series="cashSurrenderValue"[^>]*data-year="1"[^>]*data-value="0"/);
      assert.equal(html.includes('data-series="accountValue" data-year="20"'), false);
      assert.equal(/data-year="2(?!\d)"/.test(html), false);
      assert.equal(/data-year="5(?!\d)"/.test(html), false);
      assert.equal(/data-series="accountValue"[^>]*data-value="0"/.test(html), false);
    } finally {
      await server.close();
    }
  });

  it("adds a debt series only from explicit accumulatedLoan values", async () => {
    const server = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "error"
    });

    try {
      const mod = await server.ssrLoadModule(
        "/src/components/policy-intelligence/PolicyValuesCheckpointChart.jsx"
      );
      const Chart = mod.default;
      const series = mod.policyValuesSeriesFor({
        distribution: true,
        checkpoints: [
          {
            usedYear: 32,
            accumulatedLoan: classified(18280, "EXTRACTED_EXACT")
          },
          {
            usedYear: 86,
            accumulatedLoan: classified(6889734, "EXTRACTED_EXACT")
          }
        ]
      });
      assert.equal(series.some((item) => item.key === "accumulatedLoan"), true);

      const withoutDebt = mod.policyValuesSeriesFor({
        distribution: true,
        checkpoints: [
          {
            usedYear: 32,
            accumulatedLoan: classified(null, "NOT_AVAILABLE")
          },
          {
            usedYear: 86,
            accumulatedLoan: classified(null, "NOT_AVAILABLE")
          }
        ]
      });
      assert.equal(withoutDebt.some((item) => item.key === "accumulatedLoan"), false);

      const html = renderToString(
        React.createElement(Chart, {
          series,
          sourceLine: "Source: Distributions Ledger — Pages 25–28",
          checkpoints: [
            {
              usedYear: 32,
              attainedAge: 66,
              accountValue: classified(213397, "EXTRACTED_EXACT"),
              cashSurrenderValue: classified(195117, "EXTRACTED_EXACT"),
              deathBenefit: classified(475814, "EXTRACTED_EXACT"),
              accumulatedLoan: classified(18280, "EXTRACTED_EXACT")
            },
            {
              usedYear: 86,
              attainedAge: 120,
              accountValue: classified(8760818, "EXTRACTED_EXACT"),
              cashSurrenderValue: classified(1871085, "EXTRACTED_EXACT"),
              deathBenefit: classified(1871085, "EXTRACTED_EXACT"),
              accumulatedLoan: classified(6889734, "EXTRACTED_EXACT")
            }
          ]
        })
      );

      assert.match(html, /Accumulated Loan \/ Policy Debt/);
      assert.match(html, /Net Death Benefit/);
      assert.match(html, /data-series="accumulatedLoan"[^>]*data-year="32"[^>]*data-value="18280"/);
      assert.match(html, /data-series="accumulatedLoan"[^>]*data-year="86"[^>]*data-value="6889734"/);
      assert.match(html, /Source: Distributions Ledger — Pages 25–28/);
      assert.equal(html.includes("Math.pow"), false);
      assert.equal(/data-year="33"/.test(html), false);
    } finally {
      await server.close();
    }
  });
});
