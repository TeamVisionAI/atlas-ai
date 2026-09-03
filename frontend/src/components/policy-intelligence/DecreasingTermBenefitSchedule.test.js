/**
 * Decreasing Term preview seed + UI source verification.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  deathBenefitAtYear,
  POLICY_INTELLIGENCE_DECREASING_TERM_PREVIEW_SEED
} from "../../data/policyIntelligenceDecreasingTermPreviewSeed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Decreasing Term Policy Intelligence UI fixtures", () => {
  it("verifies Leidy schedule amounts and decreasing-term labels in seed", () => {
    const seed = POLICY_INTELLIGENCE_DECREASING_TERM_PREVIEW_SEED;
    assert.equal(seed.policySnapshot.productType, "Decreasing Term");
    assert.equal(seed.policySnapshot.initialDeathBenefit, 290155);
    assert.equal(seed.policySnapshot.cashValue, 0);
    assert.equal(seed.policySnapshot.annualPremiumIfPaidAnnually, 1063.92);
    assert.equal(seed.policySnapshot.annualizedCurrentMode, 1200.12);
    assert.equal(deathBenefitAtYear(10), 257976);
    assert.equal(deathBenefitAtYear(20), 212585);
    assert.equal(deathBenefitAtYear(30), 148556);
    assert.equal(deathBenefitAtYear(40), 58237);
    assert.equal(deathBenefitAtYear(44), 24503);
    assert.equal(deathBenefitAtYear(45), 0);

    const findings = seed.findings.map((item) => item.finding);
    assert.ok(findings.includes("DEATH_BENEFIT_DECREASES_OVER_TIME"));
    assert.ok(findings.includes("NO_CASH_VALUE"));
    assert.ok(findings.includes("COVERAGE_EXPIRES_AT_AGE_70"));
    assert.ok(findings.includes("MONTHLY_PAYMENT_MODE_COSTS_MORE_THAN_ANNUAL_MODE"));
    assert.ok(findings.includes("SPOUSE_COVERAGE_ALSO_DECREASES"));
    assert.ok(seed.findings.every((item) => item.recommendation == null));
  });

  it("ClientPolicyReport wires DecreasingTermBenefitSchedule", () => {
    const source = readFileSync(
      path.join(__dirname, "ClientPolicyReport.jsx"),
      "utf8"
    );
    assert.match(source, /DecreasingTermBenefitSchedule/);
    assert.match(source, /Initial Death Benefit/);
    assert.match(source, /Annual premium if paid annually/);
    assert.match(source, /Current annualized cost based on monthly payment mode/);
  });

  it("DecreasingTermBenefitSchedule never claims level 45-year guarantee", () => {
    const source = readFileSync(
      path.join(__dirname, "DecreasingTermBenefitSchedule.jsx"),
      "utf8"
    );
    assert.match(source, /not a level face amount/i);
    assert.doesNotMatch(source, /guaranteed for 45 years/i);
  });

  it("terminal illness actuarial adjustment does not treat up to 100% as cash payout", () => {
    const seed = POLICY_INTELLIGENCE_DECREASING_TERM_PREVIEW_SEED;
    const card = seed.livingBenefitCards[0];
    assert.equal(card.limits.maxAccelerationPercent, 100);
    assert.equal(card.actuarialAdjustment.adjustmentType, "ACTUARIAL_ADJUSTMENT_FACTOR");
    assert.equal(card.actuarialAdjustment.displayLabel, "Actuarial Adjustment Factor");
    assert.equal(card.actuarialAdjustment.factorDisclosed, false);
    assert.equal(card.actuarialAdjustment.formulaDisclosed, false);
    assert.equal(card.actuarialAdjustment.administrativeCharge, 100);
    assert.equal(card.actuarialAdjustment.uiNote, "Factor/formula not disclosed in policy.");
    assert.equal(card.exactPayoutCalculable, false);
    assert.equal(card.exactPayout.value, null);
    assert.equal(card.carrierCalculationRequired, true);

    const riderUi = readFileSync(
      path.join(__dirname, "LivingBenefitRiderCards.jsx"),
      "utf8"
    );
    assert.match(riderUi, /pi-actuarial-adjustment/);
    assert.match(riderUi, /Factor\/formula not disclosed in policy/);
  });
});
