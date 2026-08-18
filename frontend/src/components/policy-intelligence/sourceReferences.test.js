/**
 * Print-visible source reference formatting. Never invents page numbers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectPages,
  formatPagePhrase,
  formatSourceLine,
  buildSourceCatalog
} from "./sourceReferences.js";
import { VALUE_CLASSIFICATIONS } from "./classifiedValueDisplay.js";

describe("sourceReferences", () => {
  it("formats single pages, ranges, and gaps without inventing numbers", () => {
    assert.equal(formatPagePhrase([]), null);
    assert.equal(formatPagePhrase(null), null);
    assert.equal(formatPagePhrase([9]), "Page 9");
    assert.equal(formatPagePhrase([9, 10]), "Pages 9–10");
    assert.equal(formatPagePhrase([21, 22, 23, 24]), "Pages 21–24");
    assert.equal(formatPagePhrase([9, 11]), "Pages 9, 11");
    assert.equal(collectPages(0, -1, "12.5", null, "abc").length, 0);
    assert.deepEqual(collectPages({ sourcePage: 9 }, { sourcePages: [10, 9] }), [9, 10]);
  });

  it("uses exact / calculated / carrier phrasing only when pages exist", () => {
    assert.equal(
      formatSourceLine({ tableLabel: "Distributions Ledger", pages: [25, 26, 27, 28] }),
      "Source: Distributions Ledger — Pages 25–28"
    );
    assert.equal(
      formatSourceLine({ tableLabel: "Policy Illustration", pages: [24] }),
      "Source: Policy Illustration — Page 24"
    );
    assert.equal(
      formatSourceLine({ form: "8095FL", pages: [9, 10] }),
      "Source: Form 8095FL — Pages 9–10"
    );
    assert.equal(
      formatSourceLine({
        classification: VALUE_CLASSIFICATIONS.CALCULATED_FROM_EXPLICIT_TERMS,
        pages: [17]
      }),
      "Calculated from policy terms — see Page 17"
    );
    assert.equal(
      formatSourceLine({
        classification: VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED,
        pages: [6]
      }),
      "Carrier calculation required — methodology described on Page 6"
    );
    assert.equal(
      formatSourceLine({
        classification: VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED,
        pages: []
      }),
      null
    );
    assert.equal(formatSourceLine({ form: "8052FL" }), "Source: Form 8052FL");
  });

  it("builds a source catalog from stored BR-144 provenance only", () => {
    const catalog = buildSourceCatalog({
      illustrationSource: { label: "Current Illustrated Annual Values", pages: [21, 22, 23, 24] },
      distributionScenario: {
        sourceLabel: "Distributions Ledger",
        sourcePages: [25, 26, 27, 28]
      },
      economics: {
        policyCostCategories: [
          { label: "Surrender Charges", sourcePages: [17] }
        ],
        livingBenefitCards: [
          { rider: "Chronic Illness ABR", form: "8095FL", sourcePages: [9, 10] }
        ]
      }
    });
    assert.equal(catalog[0].text, "Current Illustrated Annual Values — Pages 21–24");
    assert.equal(catalog[1].text, "Distributions Ledger — Pages 25–28");
    assert.equal(catalog[2].text, "Surrender Charges — Page 17");
    assert.equal(catalog[3].text, "Chronic Illness ABR — Form 8095FL — Pages 9–10");
    assert.equal(catalog.every((item) => item.id >= 1), true);
  });
});
