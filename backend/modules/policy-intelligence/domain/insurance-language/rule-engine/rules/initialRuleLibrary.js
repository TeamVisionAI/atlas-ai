/**
 * Initial deterministic Policy Intelligence rule library (Sprint 3).
 * PI-001 … PI-010 — no OCR, no AI, no LLM decisions.
 */

const { ATLAS_TERMS } = require("../../insuranceVocabulary");
const { RULE_CATEGORIES } = require("../ruleCategories");
const { createRuleFinding, defineRule } = require("../createRuleFinding");

function hasText(value) {
  return Boolean(value && String(value).trim());
}

function isVolatilityControlledIndex(index) {
  const name = String(index?.name || index || "").toLowerCase();
  return (
    name.includes("volatility") ||
    name.includes("vol control") ||
    name.includes("vol-control") ||
    name.includes("volctrl") ||
    name.includes("buffered") ||
    name.includes("risk control") ||
    name.includes("volatility control")
  );
}

function isIndexedCrediting(facts) {
  const productType = String(facts.productType || facts.product || "").toLowerCase();
  if (
    productType.includes("indexed") ||
    productType === String(ATLAS_TERMS.INDEXED_UNIVERSAL_LIFE).toLowerCase() ||
    productType.includes("iul")
  ) {
    return true;
  }

  return Array.isArray(facts.indexes) && facts.indexes.length > 0;
}

function isFlexiblePremium(facts) {
  const mode = String(facts.paymentMode || facts.premium?.frequency || "").toLowerCase();
  if (mode.includes("flex") || mode.includes("variable") || mode.includes("planned")) {
    return true;
  }

  const productType = String(facts.productType || facts.product || "").toLowerCase();
  return (
    productType.includes("universal") ||
    productType.includes("iul") ||
    productType.includes("vul")
  );
}

const PI_001 = defineRule({
  id: "PI-001",
  name: "Carrier Identified",
  category: RULE_CATEGORIES.POLICY_DESIGN,
  severity: "Info",
  inputs: ["carrier"],
  finding: "Carrier Identified",
  recommendation: null,
  explanation: "A carrier value is present on the immutable Insurance Facts.",
  evaluate(facts) {
    const triggered = hasText(facts.carrier);
    if (!triggered) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-001",
        name: "Carrier Identified",
        category: RULE_CATEGORIES.POLICY_DESIGN,
        severity: "Info",
        finding: "Carrier Identified",
        explanation: "A carrier value is present on the immutable Insurance Facts.",
        evidence: { carrier: facts.carrier },
        factRefs: ["carrier"]
      })
    };
  }
});

const PI_002 = defineRule({
  id: "PI-002",
  name: "Product Identified",
  category: RULE_CATEGORIES.POLICY_DESIGN,
  severity: "Info",
  inputs: ["product", "productType"],
  finding: "Product Identified",
  recommendation: null,
  explanation: "A product or product type is present on the immutable Insurance Facts.",
  evaluate(facts) {
    const triggered = hasText(facts.product) || hasText(facts.productType);
    if (!triggered) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-002",
        name: "Product Identified",
        category: RULE_CATEGORIES.POLICY_DESIGN,
        severity: "Info",
        finding: "Product Identified",
        explanation: "A product or product type is present on the immutable Insurance Facts.",
        evidence: {
          product: facts.product,
          productType: facts.productType
        },
        factRefs: ["product", "productType"]
      })
    };
  }
});

const PI_003 = defineRule({
  id: "PI-003",
  name: "Increasing Death Benefit Detected",
  category: RULE_CATEGORIES.POLICY_DESIGN,
  severity: "Info",
  inputs: ["deathBenefitOption"],
  finding: "Increasing Death Benefit Detected",
  recommendation: "Request In-force Illustration",
  explanation: "Death benefit option maps to Increasing Death Benefit (Option B).",
  evaluate(facts) {
    const triggered = facts.deathBenefitOption === ATLAS_TERMS.INCREASING_DEATH_BENEFIT;
    if (!triggered) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-003",
        name: "Increasing Death Benefit Detected",
        category: RULE_CATEGORIES.POLICY_DESIGN,
        severity: "Info",
        finding: "Increasing Death Benefit Detected",
        recommendation: "Request In-force Illustration",
        explanation: "Death benefit option maps to Increasing Death Benefit (Option B).",
        evidence: { deathBenefitOption: facts.deathBenefitOption },
        factRefs: ["deathBenefitOption"]
      })
    };
  }
});

const PI_004 = defineRule({
  id: "PI-004",
  name: "Level Death Benefit Detected",
  category: RULE_CATEGORIES.POLICY_DESIGN,
  severity: "Info",
  inputs: ["deathBenefitOption"],
  finding: "Level Death Benefit Detected",
  recommendation: null,
  explanation: "Death benefit option maps to Level Death Benefit (Option A).",
  evaluate(facts) {
    const triggered = facts.deathBenefitOption === ATLAS_TERMS.LEVEL_DEATH_BENEFIT;
    if (!triggered) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-004",
        name: "Level Death Benefit Detected",
        category: RULE_CATEGORIES.POLICY_DESIGN,
        severity: "Info",
        finding: "Level Death Benefit Detected",
        explanation: "Death benefit option maps to Level Death Benefit (Option A).",
        evidence: { deathBenefitOption: facts.deathBenefitOption },
        factRefs: ["deathBenefitOption"]
      })
    };
  }
});

const PI_005 = defineRule({
  id: "PI-005",
  name: "High Illustration Dependency",
  category: RULE_CATEGORIES.SUSTAINABILITY,
  severity: "High",
  inputs: ["illustratedDuration", "guaranteedDuration", "illustratedRate", "guaranteedRate"],
  finding: "High Illustration Dependency",
  recommendation: "Perform lower-interest stress testing.",
  explanation: "Illustrated duration significantly exceeds guaranteed duration.",
  evaluate(facts, thresholds) {
    const illustratedDuration =
      facts.illustratedDuration == null ? null : Number(facts.illustratedDuration);
    const guaranteedDuration =
      facts.guaranteedDuration == null ? null : Number(facts.guaranteedDuration);
    const hasDurations =
      illustratedDuration != null &&
      guaranteedDuration != null &&
      Number.isFinite(illustratedDuration) &&
      Number.isFinite(guaranteedDuration);

    let triggered = false;
    let evidence = {};

    if (hasDurations) {
      const gap = illustratedDuration - guaranteedDuration;
      triggered = gap >= thresholds.illustrationDurationGapYears;
      evidence = {
        illustratedDuration,
        guaranteedDuration,
        gap,
        threshold: thresholds.illustrationDurationGapYears
      };
    } else {
      const illustratedRate =
        facts.illustratedRate == null ? null : Number(facts.illustratedRate);
      const guaranteedRate =
        facts.guaranteedRate == null ? null : Number(facts.guaranteedRate);
      if (
        illustratedRate != null &&
        guaranteedRate != null &&
        Number.isFinite(illustratedRate) &&
        Number.isFinite(guaranteedRate)
      ) {
        const gap = illustratedRate - guaranteedRate;
        triggered = gap >= thresholds.illustrationRateGapPoints;
        evidence = {
          illustratedRate,
          guaranteedRate,
          gap,
          threshold: thresholds.illustrationRateGapPoints,
          usedRateFallback: true
        };
      }
    }

    if (!triggered) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-005",
        name: "High Illustration Dependency",
        category: RULE_CATEGORIES.SUSTAINABILITY,
        severity: "High",
        finding: "High Illustration Dependency",
        recommendation: "Perform lower-interest stress testing.",
        explanation: "Illustrated duration significantly exceeds guaranteed duration.",
        evidence,
        factRefs: Object.keys(evidence).filter((key) =>
          [
            "illustratedDuration",
            "guaranteedDuration",
            "illustratedRate",
            "guaranteedRate"
          ].includes(key)
        )
      })
    };
  }
});

const PI_006 = defineRule({
  id: "PI-006",
  name: "Volatility-Controlled Index Detected",
  category: RULE_CATEGORIES.INDEX_STRATEGY,
  severity: "Medium",
  inputs: ["indexes"],
  finding: "Volatility-Controlled Index Detected",
  recommendation: "Stress Test at 5%",
  explanation: "One or more indexes appear to use volatility-control or buffered crediting.",
  evaluate(facts) {
    const matches = (facts.indexes || []).filter(isVolatilityControlledIndex);
    if (matches.length === 0) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-006",
        name: "Volatility-Controlled Index Detected",
        category: RULE_CATEGORIES.INDEX_STRATEGY,
        severity: "Medium",
        finding: "Volatility-Controlled Index Detected",
        recommendation: "Stress Test at 5%",
        explanation: "One or more indexes appear to use volatility-control or buffered crediting.",
        evidence: {
          indexes: matches.map((index) => index?.name || index)
        },
        factRefs: ["indexes"]
      })
    };
  }
});

const PI_007 = defineRule({
  id: "PI-007",
  name: "Multiple Riders Detected",
  category: RULE_CATEGORIES.COMPLEXITY,
  severity: "Medium",
  inputs: ["riders"],
  finding: "Multiple Riders Detected",
  recommendation: "Review Rider Necessity",
  explanation: "Policy includes multiple riders, increasing charge and complexity load.",
  evaluate(facts, thresholds) {
    const riderCount = (facts.riders || []).length;
    const triggered = riderCount >= thresholds.multipleRidersMinimum;
    if (!triggered) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-007",
        name: "Multiple Riders Detected",
        category: RULE_CATEGORIES.COMPLEXITY,
        severity: "Medium",
        finding: "Multiple Riders Detected",
        recommendation: "Review Rider Necessity",
        explanation: "Policy includes multiple riders, increasing charge and complexity load.",
        evidence: {
          riderCount,
          riderTypes: (facts.riders || []).map((rider) => rider.type).filter(Boolean),
          threshold: thresholds.multipleRidersMinimum
        },
        factRefs: ["riders"]
      })
    };
  }
});

const PI_008 = defineRule({
  id: "PI-008",
  name: "Indexed Crediting Strategy Detected",
  category: RULE_CATEGORIES.INDEX_STRATEGY,
  severity: "Info",
  inputs: ["productType", "product", "indexes"],
  finding: "Indexed Crediting Strategy Detected",
  recommendation: "Request In-force Illustration",
  explanation: "Product type or index roster indicates indexed crediting.",
  evaluate(facts) {
    const triggered = isIndexedCrediting(facts);
    if (!triggered) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-008",
        name: "Indexed Crediting Strategy Detected",
        category: RULE_CATEGORIES.INDEX_STRATEGY,
        severity: "Info",
        finding: "Indexed Crediting Strategy Detected",
        recommendation: "Request In-force Illustration",
        explanation: "Product type or index roster indicates indexed crediting.",
        evidence: {
          productType: facts.productType,
          product: facts.product,
          indexCount: (facts.indexes || []).length
        },
        factRefs: ["productType", "product", "indexes"]
      })
    };
  }
});

const PI_009 = defineRule({
  id: "PI-009",
  name: "Flexible Premium Structure Detected",
  category: RULE_CATEGORIES.POLICY_DESIGN,
  severity: "Info",
  inputs: ["paymentMode", "premium", "productType"],
  finding: "Flexible Premium Structure Detected",
  recommendation: "Compare Alternative Funding",
  explanation: "Payment mode or product design indicates flexible premium funding.",
  evaluate(facts) {
    const triggered = isFlexiblePremium(facts);
    if (!triggered) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-009",
        name: "Flexible Premium Structure Detected",
        category: RULE_CATEGORIES.POLICY_DESIGN,
        severity: "Info",
        finding: "Flexible Premium Structure Detected",
        recommendation: "Compare Alternative Funding",
        explanation: "Payment mode or product design indicates flexible premium funding.",
        evidence: {
          paymentMode: facts.paymentMode,
          premiumFrequency: facts.premium?.frequency || null,
          productType: facts.productType
        },
        factRefs: ["paymentMode", "premium", "productType"]
      })
    };
  }
});

const PI_010 = defineRule({
  id: "PI-010",
  name: "Required Insurance Facts Missing",
  category: RULE_CATEGORIES.POLICY_HEALTH,
  severity: "High",
  inputs: ["carrier", "productType", "issueAge", "gender", "riskClassification", "faceAmount", "premium"],
  finding: "Required Insurance Facts Missing",
  recommendation: "Request In-force Illustration",
  explanation: "One or more required Insurance Facts are missing from the extract.",
  evaluate(facts, thresholds) {
    const missing = [];

    for (const key of thresholds.requiredInsuranceFactKeys) {
      if (key === "premium") {
        if (facts.premium?.amount == null) {
          missing.push("premium.amount");
        }
        continue;
      }

      if (facts[key] == null || facts[key] === "") {
        missing.push(key);
      }
    }

    if (missing.length === 0) {
      return { triggered: false, finding: null };
    }

    return {
      triggered: true,
      finding: createRuleFinding({
        ruleId: "PI-010",
        name: "Required Insurance Facts Missing",
        category: RULE_CATEGORIES.POLICY_HEALTH,
        severity: "High",
        finding: "Required Insurance Facts Missing",
        recommendation: "Request In-force Illustration",
        explanation: "One or more required Insurance Facts are missing from the extract.",
        evidence: {
          missing,
          required: [...thresholds.requiredInsuranceFactKeys]
        },
        factRefs: missing.map((key) => key.replace(".amount", ""))
      })
    };
  }
});

const INITIAL_RULE_LIBRARY = Object.freeze([
  PI_001,
  PI_002,
  PI_003,
  PI_004,
  PI_005,
  PI_006,
  PI_007,
  PI_008,
  PI_009,
  PI_010
]);

function getRuleById(ruleId) {
  return INITIAL_RULE_LIBRARY.find((rule) => rule.id === ruleId) || null;
}

module.exports = {
  INITIAL_RULE_LIBRARY,
  getRuleById,
  PI_001,
  PI_002,
  PI_003,
  PI_004,
  PI_005,
  PI_006,
  PI_007,
  PI_008,
  PI_009,
  PI_010
};
