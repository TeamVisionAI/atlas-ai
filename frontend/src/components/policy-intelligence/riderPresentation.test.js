import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACCELERATED_PRINT_PAIRS,
  acceleratedPrintPairId,
  groupAcceleratedPrintPairs,
  isAcceleratedLivingBenefitRider
} from "./riderPresentation.js";

describe("riderPresentation", () => {
  it("treats illness / ABR riders as accelerated living benefits", () => {
    assert.equal(isAcceleratedLivingBenefitRider({ type: "Terminal Illness" }), true);
    assert.equal(isAcceleratedLivingBenefitRider({ rider: "Chronic Illness ABR", form: "8095FL" }), true);
    assert.equal(isAcceleratedLivingBenefitRider({ type: "Critical Injury", riderCategory: "living_benefit" }), true);
  });

  it("does not treat policy features as accelerated living benefits", () => {
    assert.equal(isAcceleratedLivingBenefitRider({ type: "Charitable Matching Gift" }), false);
    assert.equal(isAcceleratedLivingBenefitRider({ type: "Overloan Lapse Protection", riderCategory: "other" }), false);
    assert.equal(isAcceleratedLivingBenefitRider({ type: "Interest Crediting Strategies Rider" }), false);
    assert.equal(isAcceleratedLivingBenefitRider({ type: "Lifetime Income Benefit Rider" }), false);
    assert.equal(isAcceleratedLivingBenefitRider({ type: "Death Benefit Protection Rider" }), false);
  });

  it("groups accelerated riders into Safari print pairs without changing identity", () => {
    assert.equal(acceleratedPrintPairId({ rider: "Terminal Illness ABR" }), ACCELERATED_PRINT_PAIRS.TERMINAL_CHRONIC);
    assert.equal(acceleratedPrintPairId({ type: "Chronic Illness" }), ACCELERATED_PRINT_PAIRS.TERMINAL_CHRONIC);
    assert.equal(acceleratedPrintPairId({ rider: "Critical Illness" }), ACCELERATED_PRINT_PAIRS.CRITICAL_ILLNESS_INJURY);
    assert.equal(acceleratedPrintPairId({ type: "Critical Injury" }), ACCELERATED_PRINT_PAIRS.CRITICAL_ILLNESS_INJURY);
    assert.equal(acceleratedPrintPairId({ type: "Charitable Matching Gift" }), null);

    const pairs = groupAcceleratedPrintPairs([
      { rider: "Critical Injury ABR", form: "8054FL" },
      { rider: "Terminal Illness ABR", form: "8052FL" },
      { rider: "Critical Illness ABR", form: "8053FL" },
      { rider: "Chronic Illness ABR", form: "8095FL" }
    ]);
    assert.equal(pairs.length, 2);
    assert.equal(pairs[0].id, ACCELERATED_PRINT_PAIRS.TERMINAL_CHRONIC);
    assert.deepEqual(pairs[0].cards.map((card) => card.form), ["8052FL", "8095FL"]);
    assert.equal(pairs[1].id, ACCELERATED_PRINT_PAIRS.CRITICAL_ILLNESS_INJURY);
    assert.deepEqual(pairs[1].cards.map((card) => card.form), ["8053FL", "8054FL"]);
  });
});
