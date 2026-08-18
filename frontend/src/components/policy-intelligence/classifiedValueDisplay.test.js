/**
 * Display helpers for BR-144 classified values.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatClassifiedValue,
  formatClassifiedTableCell,
  formatUsd,
  NOT_DISCLOSED,
  CARRIER_CALCULATION_LABEL,
  TABLE_UNAVAILABLE,
  VALUE_CLASSIFICATIONS
} from "./classifiedValueDisplay.js";

describe("classifiedValueDisplay", () => {
  it("never renders NOT_AVAILABLE as $0", () => {
    const formatted = formatClassifiedValue({
      value: null,
      classification: VALUE_CLASSIFICATIONS.NOT_AVAILABLE
    });
    assert.equal(formatted.text, NOT_DISCLOSED);
    assert.equal(formatted.value, null);
    assert.equal(formatted.text.includes("$0"), false);
    assert.equal(formatClassifiedTableCell({ value: null, classification: "NOT_AVAILABLE" }), TABLE_UNAVAILABLE);
    assert.equal(formatClassifiedTableCell({ value: 0, classification: "NOT_AVAILABLE" }), TABLE_UNAVAILABLE);
  });

  it("keeps an explicit sourced zero", () => {
    const formatted = formatClassifiedValue({
      value: 0,
      classification: VALUE_CLASSIFICATIONS.EXTRACTED_EXACT
    });
    assert.equal(formatted.value, 0);
    assert.ok(formatUsd(0).includes("0"));
    assert.equal(formatted.classification, "EXTRACTED_EXACT");
  });

  it("labels calculated-from-terms and carrier-required", () => {
    const calculated = formatClassifiedValue({
      value: 144,
      classification: VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS
    });
    assert.equal(calculated.caption, "Calculated from policy terms");
    assert.ok(calculated.text.includes("144"));

    const carrier = formatClassifiedValue({
      value: null,
      classification: VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED
    });
    assert.equal(carrier.text, CARRIER_CALCULATION_LABEL);
    assert.equal(carrier.value, null);
  });
});
