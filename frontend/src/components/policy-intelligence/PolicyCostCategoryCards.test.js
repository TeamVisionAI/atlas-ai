/**
 * Display-layer cost notes only — BR-144 metadata is not rewritten.
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

describe("PolicyCostCategoryCards client notes", () => {
  it("polishes carrier-determined and surrender-period notes without mutating source notes", async () => {
    const jsx = readFileSync(path.join(__dirname, "PolicyCostCategoryCards.jsx"), "utf8");
    assert.ok(jsx.includes("formatCostClientNote"));
    assert.ok(jsx.includes("Carrier-determined; dollar amount not disclosed."));
    assert.ok(jsx.includes("Surrender period:"));
    assert.equal(jsx.includes("category.notes ="), false);

    const server = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "error"
    });

    try {
      const mod = await server.ssrLoadModule(
        "/src/components/policy-intelligence/PolicyCostCategoryCards.jsx"
      );
      assert.equal(
        mod.formatCostClientNote("named_company_determined"),
        "Carrier-determined; dollar amount not disclosed."
      );
      assert.equal(mod.formatCostClientNote("declining_term_years_10"), "Surrender period: 10 years");
      assert.equal(mod.formatCostClientNote("named company determined"), "Carrier-determined; dollar amount not disclosed.");

      const html = renderToString(
        React.createElement(mod.default, {
          categories: [
            {
              id: "cost_of_insurance",
              number: 2,
              label: "Cost of Insurance / Monthly COI",
              display: classified(null, "NOT_AVAILABLE"),
              notes: "named_company_determined"
            },
            {
              id: "surrender_charges",
              number: 7,
              label: "Surrender Charges",
              display: classified(null, "NOT_AVAILABLE"),
              notes: "declining_term_years_10",
              scheduleLength: 10
            }
          ]
        })
      );
      assert.match(html, /Carrier-determined; dollar amount not disclosed\./);
      assert.match(html, /Surrender period: 10 years/);
      assert.equal(html.includes("named company determined"), false);
      assert.equal(html.includes("declining term years 10"), false);
      assert.equal(html.includes("10-year schedule sourced"), false);

      const nationwideSurrender = renderToString(
        React.createElement(mod.default, {
          categories: [
            {
              id: "surrender_charges",
              number: 7,
              label: "Surrender Charges",
              display: classified(2680, "EXTRACTED_EXACT"),
              scheduleLength: 11,
              separateFromCsv: true
            }
          ]
        })
      );
      assert.match(nationwideSurrender, /11-year schedule sourced/);
      assert.equal(nationwideSurrender.includes("Surrender period:"), false);
      assert.match(nationwideSurrender, /\$2,680/);
    } finally {
      await server.close();
    }
  });
});
