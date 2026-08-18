/**
 * Rider print pairing and in-card source/footer — presentation only.
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

describe("LivingBenefitRiderCards print pairing", () => {
  it("pairs accelerated riders, keeps source/footer inside each card, and leaves other riders intact", async () => {
    const css = readFileSync(path.join(__dirname, "ClientPolicyReport.css"), "utf8");
    assert.match(css, /\.pi-rider-print-pair\s*\{[\s\S]*?display:\s*contents/);
    assert.match(css, /@media print[\s\S]*\.pi-rider-print-pair[\s\S]{0,160}display:\s*table\s*!important/);
    assert.match(css, /@media print[\s\S]*\.pi-rider-print-pair[\s\S]{0,240}page-break-inside:\s*avoid/);
    assert.match(css, /@media print[\s\S]*\.pi-rider-card[\s\S]{0,160}page-break-inside:\s*avoid/);
    assert.match(css, /@media print[\s\S]*\.pi-rider-grid--other[\s\S]{0,80}display:\s*block\s*!important/);

    const server = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "error"
    });

    try {
      const mod = await server.ssrLoadModule(
        "/src/components/policy-intelligence/LivingBenefitRiderCards.jsx"
      );
      const html = renderToString(
        React.createElement(mod.default, {
          cards: [
            {
              rider: "Terminal Illness ABR",
              form: "8052FL",
              carrierCalculationRequired: true,
              exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
              remainingDeathBenefitEffect: "remaining_death_benefit_reduced_as_described",
              sourcePages: [9]
            },
            {
              rider: "Chronic Illness ABR",
              form: "8095FL",
              carrierCalculationRequired: true,
              exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
              sourcePages: [9]
            },
            {
              rider: "Critical Illness ABR",
              form: "8053FL",
              carrierCalculationRequired: true,
              exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
              sourcePages: [9]
            },
            {
              rider: "Critical Injury ABR",
              form: "8054FL",
              carrierCalculationRequired: true,
              exactPayout: classified(null, "CARRIER_CALCULATION_REQUIRED"),
              sourcePages: [9]
            },
            {
              rider: "Charitable Matching Gift",
              type: "Charitable Matching Gift",
              form: "20186FL",
              riderCategory: "other",
              sourcePages: [5]
            }
          ]
        })
      );

      assert.match(html, /data-testid="pi-rider-print-pair-terminal-chronic"/);
      assert.match(html, /data-testid="pi-rider-print-pair-critical-illness-injury"/);
      assert.match(html, /data-count="2"/);
      const terminalPair = html.slice(
        html.indexOf('data-testid="pi-rider-print-pair-terminal-chronic"'),
        html.indexOf('data-testid="pi-rider-print-pair-critical-illness-injury"')
      );
      assert.match(terminalPair, /Terminal Illness ABR/);
      assert.match(terminalPair, /Chronic Illness ABR/);
      assert.equal(terminalPair.includes("Critical Illness"), false);
      const criticalPair = html.slice(
        html.indexOf('data-testid="pi-rider-print-pair-critical-illness-injury"'),
        html.indexOf('data-testid="pi-rider-group-other"')
      );
      assert.match(criticalPair, /Critical Illness ABR/);
      assert.match(criticalPair, /Critical Injury ABR/);
      assert.equal(criticalPair.includes("Charitable Matching Gift"), false);

      const terminalCard = html.slice(html.indexOf("pi-rider-card-8052FL"));
      const terminalArticle = terminalCard.slice(0, terminalCard.indexOf("</article>") + 10);
      assert.match(terminalArticle, /pi-rider-card__tail/);
      assert.match(terminalArticle, /data-testid="pi-rider-carrier-calc"/);
      assert.match(terminalArticle, /Carrier calculation required — methodology described on Page 9/);
      assert.match(terminalArticle, /remaining death benefit reduced as described/);
      assert.match(terminalArticle, /data-testid="pi-rider-source"/);
      assert.equal(terminalArticle.includes("</div></article>") || terminalArticle.includes("pi-rider-card__tail"), true);

      const otherGroup = html.slice(html.indexOf('data-testid="pi-rider-group-other"'));
      assert.match(otherGroup, /Charitable Matching Gift/);
      assert.match(otherGroup, /pi-rider-grid--other/);
      assert.equal(otherGroup.includes("pi-rider-print-pair"), false);
    } finally {
      await server.close();
    }
  });
});
