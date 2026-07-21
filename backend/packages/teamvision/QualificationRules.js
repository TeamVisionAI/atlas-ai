/**
 * Release 1.1 — Configurable candidate qualification rules.
 */

function normalizeFacts(facts = {}) {
  const normalized = {};

  for (const [key, entry] of Object.entries(facts)) {
    normalized[key] = entry?.value ?? entry;
  }

  return normalized;
}

function evaluateQualification(facts, configuration) {
  const values = normalizeFacts(facts);
  const rules = buildRules(configuration);
  const results = [];
  let qualified = true;

  for (const rule of rules) {
    const passed = rule.evaluate(values, configuration);
    results.push({
      id: rule.id,
      label: rule.label,
      passed,
      reason: rule.reason(values, configuration)
    });

    if (!passed && rule.blocking) {
      qualified = false;
    }
  }

  return {
    qualified,
    score: results.filter((entry) => entry.passed).length,
    totalRules: results.length,
    results
  };
}

function buildRules(configuration) {
  const policies = configuration.recruitingPolicies || {};

  return [
    {
      id: "work_authorization",
      label: "Work authorization",
      blocking: Boolean(policies.requireWorkAuthorization),
      evaluate: (values) => {
        if (!policies.requireWorkAuthorization) {
          return true;
        }

        const answer = String(values.authorizedToWork || "").toLowerCase();
        return ["yes", "authorized", "citizen", "green card", "si", "sí"].some((token) =>
          answer.includes(token)
        );
      },
      reason: () => "Work authorization required."
    },
    {
      id: "state_provided",
      label: "State provided",
      blocking: true,
      evaluate: (values) => Boolean(values.state),
      reason: () => "State is required for coverage evaluation."
    },
    {
      id: "interest_level",
      label: "Interest level",
      blocking: false,
      evaluate: (values) => Boolean(values.interestLevel),
      reason: () => "Interest level not recorded."
    },
    {
      id: "availability",
      label: "Availability",
      blocking: false,
      evaluate: (values) => Boolean(values.availability),
      reason: () => "Availability not recorded."
    },
    {
      id: "preferred_language",
      label: "Preferred language",
      blocking: false,
      evaluate: (values, config) => {
        if (!values.preferredLanguage) {
          return true;
        }

        return (config.languages || []).includes(String(values.preferredLanguage).toLowerCase());
      },
      reason: (values, config) =>
        `Language "${values.preferredLanguage}" is not supported. Supported: ${(config.languages || []).join(", ")}`
    }
  ];
}

function updateQualificationRules(configuration, ruleUpdates = []) {
  return {
    ...configuration,
    qualificationRuleOverrides: ruleUpdates
  };
}

module.exports = {
  evaluateQualification,
  buildRules,
  updateQualificationRules,
  normalizeFacts
};
