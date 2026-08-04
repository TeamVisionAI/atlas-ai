/**
 * Strategy evaluation status readiness (RC3).
 * Arithmetic alone does not mark READY.
 */

const { EVALUATION_STATUSES, PREMIUM_SOURCES, RISK_PROFILES } = require("../constants");

const REPLACEMENT_WARNINGS = Object.freeze([
  "Do not cancel or surrender the existing policy before new coverage is approved, issued, accepted, paid, and confirmed in force.",
  "The proposed term coverage may be declined, rated, delayed, or modified through underwriting.",
  "Replacement forms and procedures may be required.",
  "Existing surrender charges, loans, tax consequences, riders, guarantees, contestability periods, and other policy differences must be reviewed.",
  "Term insurance does not build cash value and expires after the selected term.",
  "Mutual funds fluctuate and may lose value.",
  "Investment returns are not guaranteed."
]);

/**
 * Resolve status + warnings from evaluation inputs.
 * Risk-profile absence blocks scenario emphasis, not necessarily viewing an unranked illustration.
 */
function resolveStrategyEvaluationStatus({
  snapshotOk,
  missingPolicyFields = [],
  termQuote = null,
  investmentHorizonYears = null,
  riskProfile = RISK_PROFILES.NOT_COMPLETED,
  replacementAcknowledged = false,
  hasOverride = false,
  forceClientDiscussion = false
} = {}) {
  const missingDataWarnings = [];
  const statusFlags = {
    canEmphasizeInvestmentScenario: false,
    canViewEducationalIllustration: false
  };

  if (!snapshotOk || missingPolicyFields.length) {
    missingDataWarnings.push(
      "Upload or confirm the current IUL statement: monthly premium and death benefit are required."
    );
    return finalize(
      EVALUATION_STATUSES.DRAFT_MISSING_POLICY_DATA,
      missingDataWarnings,
      statusFlags
    );
  }

  if (!termQuote || termQuote.isMissing || termQuote.monthlyPremium == null) {
    missingDataWarnings.push(
      "Obtain an official Primerica term quote or enter a representative-confirmed premium."
    );
    return finalize(
      EVALUATION_STATUSES.DRAFT_TERM_QUOTE_REQUIRED,
      missingDataWarnings,
      statusFlags
    );
  }

  if (
    !termQuote.longestAvailableTermConfirmed ||
    termQuote.premiumSource === PREMIUM_SOURCES.PRELIMINARY_ESTIMATE
  ) {
    missingDataWarnings.push(
      "The representative must confirm the longest available Primerica term and official premium."
    );
    if (termQuote.premiumSource === PREMIUM_SOURCES.PRELIMINARY_ESTIMATE) {
      missingDataWarnings.push(
        "Displayed term premium is a preliminary estimate — not an official premium."
      );
    }
    statusFlags.canViewEducationalIllustration = true;
    return finalize(
      EVALUATION_STATUSES.DRAFT_TERM_CONFIRMATION_REQUIRED,
      missingDataWarnings,
      statusFlags
    );
  }

  if (investmentHorizonYears == null || Number(investmentHorizonYears) <= 0) {
    missingDataWarnings.push(
      "Confirm the investment time horizon before emphasizing a projected result."
    );
    statusFlags.canViewEducationalIllustration = true;
    return finalize(
      EVALUATION_STATUSES.DRAFT_INVESTMENT_HORIZON_REQUIRED,
      missingDataWarnings,
      statusFlags
    );
  }

  statusFlags.canViewEducationalIllustration = true;

  if (!replacementAcknowledged) {
    missingDataWarnings.push(
      "Complete replacement review acknowledgements before client discussion."
    );
    return finalize(
      EVALUATION_STATUSES.DRAFT_REPLACEMENT_REVIEW_REQUIRED,
      missingDataWarnings,
      { ...statusFlags, canEmphasizeInvestmentScenario: false }
    );
  }

  const riskCompleted =
    riskProfile &&
    riskProfile !== RISK_PROFILES.NOT_COMPLETED &&
    Object.values(RISK_PROFILES).includes(riskProfile);

  if (!riskCompleted) {
    missingDataWarnings.push(
      "Complete the client risk-profile process before emphasizing an investment scenario."
    );
    // Unranked educational illustration may still be viewed.
    if (forceClientDiscussion) {
      return finalize(EVALUATION_STATUSES.CLIENT_DISCUSSION_VERSION, missingDataWarnings, {
        ...statusFlags,
        canEmphasizeInvestmentScenario: false
      });
    }
    if (hasOverride) {
      return finalize(EVALUATION_STATUSES.REPRESENTATIVE_ADJUSTED, missingDataWarnings, {
        ...statusFlags,
        canEmphasizeInvestmentScenario: false
      });
    }
    return finalize(EVALUATION_STATUSES.DRAFT_RISK_PROFILE_REQUIRED, missingDataWarnings, {
      ...statusFlags,
      canEmphasizeInvestmentScenario: false
    });
  }

  statusFlags.canEmphasizeInvestmentScenario = true;

  if (forceClientDiscussion) {
    return finalize(EVALUATION_STATUSES.CLIENT_DISCUSSION_VERSION, missingDataWarnings, statusFlags);
  }
  if (hasOverride) {
    return finalize(EVALUATION_STATUSES.REPRESENTATIVE_ADJUSTED, missingDataWarnings, statusFlags);
  }
  return finalize(
    EVALUATION_STATUSES.READY_FOR_REPRESENTATIVE_REVIEW,
    missingDataWarnings,
    statusFlags
  );
}

function finalize(status, missingDataWarnings, statusFlags) {
  return Object.freeze({
    status,
    missingDataWarnings: Object.freeze([...missingDataWarnings]),
    replacementWarnings: REPLACEMENT_WARNINGS,
    ...statusFlags
  });
}

module.exports = {
  resolveStrategyEvaluationStatus,
  REPLACEMENT_WARNINGS,
  EVALUATION_STATUSES
};
