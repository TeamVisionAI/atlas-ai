import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAcceleratedLivingBenefitRider } from "./riderPresentation.js";

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
});
