/**
 * Living-benefit / rider narrative capture.
 * Persists only values explicitly stated in the document. Does not calculate benefits.
 */

const RIDER_PATTERNS = Object.freeze([
  {
    type: "Terminal Illness",
    nameMatchers: [/terminal illness/i]
  },
  {
    type: "Chronic Illness",
    nameMatchers: [/chronic illness/i]
  },
  {
    type: "Critical Illness",
    nameMatchers: [/critical illness/i]
  },
  {
    type: "Critical Injury",
    nameMatchers: [/critical injury/i]
  },
  {
    type: "Living Benefit",
    nameMatchers: [/living benefit/i, /accelerated death benefit/i]
  }
]);

function firstNumber(text, pattern) {
  const match = String(text || "").match(pattern);
  if (!match) {
    return null;
  }
  const raw = match[1].replace(/,/g, "");
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function extractExplicitRiderFields(windowText) {
  const text = String(windowText || "");
  const maximumAccelerationPercent = firstNumber(text, /cannot exceed\s+(\d+(?:\.\d+)?)%\s+of the base policy/i)
    ?? firstNumber(text, /(\d+(?:\.\d+)?)%\s+of the (?:base policy|specified amount|death benefit)/i);
  const maximumDollarAmount = firstNumber(text, /shall not exceed\s+\$([0-9,]+)/i)
    ?? firstNumber(text, /not exceed\s+\$([0-9,]+)/i);
  const minimumDollarAmount = firstNumber(text, /at least\s+\$([0-9,]+)/i);
  const annualLimitPercent = firstNumber(text, /lesser of\s+(\d+(?:\.\d+)?)%\s+of the specified amount/i);
  const annualLimitDollars = firstNumber(text, /lesser of\s+\d+(?:\.\d+)?%\s+of the specified amount or\s+\$([0-9,]+)/i)
    ?? firstNumber(text, /\$([0-9,]+)\s+per event/i);
  const adminChargeCap = firstNumber(text, /administrative charge of up to\s+\$([0-9,]+)/i);
  const noUpfrontCharge = /no upfront charge/i.test(text);
  const discountMethodology = /reduction in the (?:specified amount|death benefit) will be more than one dollar for each dollar of benefit/i.test(text)
    ? "more_than_dollar_for_dollar_at_claim"
    : /discount/i.test(text)
      ? "stated_as_discount_at_claim"
      : null;

  let qualifyingTrigger = null;
  if (/diagnosed with any of the following/i.test(text)) {
    qualifyingTrigger = "diagnosed_conditions_as_described_in_rider";
  } else if (/terminal illness/i.test(text)) {
    qualifyingTrigger = "terminal_illness_as_described_in_rider";
  } else if (/chronic illness/i.test(text)) {
    qualifyingTrigger = "chronic_illness_as_described_in_rider";
  } else if (/critical injury/i.test(text)) {
    qualifyingTrigger = "critical_injury_as_described_in_rider";
  } else if (/critical illness/i.test(text)) {
    qualifyingTrigger = "critical_illness_as_described_in_rider";
  }

  return {
    qualifyingTrigger,
    maximumAccelerationPercent,
    maximumDollarAmount,
    minimumDollarAmount,
    annualLimitPercent,
    annualLimitDollars,
    monthlyLimit: null,
    riderCharges: adminChargeCap != null
      ? { administrativeChargeCap: adminChargeCap, chargedOnlyIfBenefitPaid: true }
      : noUpfrontCharge
        ? { upfrontCharge: 0, chargedAtClaim: true }
        : null,
    discountFactor: null,
    discountMethodology,
    amountOfDeathBenefitAccelerated: null,
    estimatedActualCashBenefit: null,
    remainingDeathBenefit: /remaining .+ must be/i.test(text) ? "policy_minimum_remaining_required" : null,
    effectOnCashValue: /specified amount and other policy values are reduced/i.test(text)
      ? "specified_amount_and_policy_values_reduced_at_claim"
      : null
  };
}

function windowAround(text, index, radius = 900) {
  const start = Math.max(0, index - 120);
  return text.slice(start, Math.min(text.length, index + radius));
}

function parseLivingBenefitRiders(pages = []) {
  const riders = [];
  const seen = new Set();

  for (const page of pages) {
    const text = String(page.text || "");
    for (const pattern of RIDER_PATTERNS) {
      for (const matcher of pattern.nameMatchers) {
        const match = matcher.exec(text);
        if (!match) {
          continue;
        }
        const key = `${pattern.type}:${page.page}`;
        if (seen.has(pattern.type)) {
          continue;
        }
        seen.add(pattern.type);
        const fields = extractExplicitRiderFields(windowAround(text, match.index));
        riders.push({
          type: pattern.type,
          name: pattern.type,
          sourcePage: page.page,
          sourceSnippet: "explicit_rider_narrative",
          calculated: false,
          ...fields
        });
      }
    }
  }

  return riders;
}

module.exports = {
  parseLivingBenefitRiders
};
