/**
 * Canonical frontend-safe FI evaluation contract (RC3 Phase B).
 * UI must render this representation; it must not reconstruct business math.
 */

const { EVALUATION_STATUSES, SECTION_TITLE } = require("../domain/constants");

function buildFrontendContract(dto) {
  if (!dto) {
    return null;
  }

  const payload = dto.evaluation || {};
  const calc = payload.calculations || {};
  const isCurrentVersion = dto.status !== EVALUATION_STATUSES.SUPERSEDED;

  return Object.freeze({
    id: dto.id,
    version: dto.version,
    isCurrentVersion,
    evaluationFamilyId: dto.evaluationFamilyId,
    reviewId: dto.reviewId,
    sourceFactVersion: dto.sourceFactVersion,
    sectionTitle: dto.sectionTitle || payload.sectionTitle || SECTION_TITLE,
    status: dto.status,
    strategyKey: dto.strategyKey || "invest_the_difference",

    currentIulSnapshot: dto.currentIulSnapshot || payload.snapshot || null,
    currentIulMonthlyPremium:
      dto.currentIulMonthlyPremium ?? calc.currentIulMonthlyPremium ?? null,
    currentIulDeathBenefit:
      dto.currentIulDeathBenefit ?? calc.currentIulDeathBenefit ?? null,

    termQuote: dto.termQuote || payload.termQuote || null,
    proposedTermDeathBenefit:
      dto.proposedTermDeathBenefit ?? calc.proposedTermDeathBenefit ?? null,
    proposedTermDuration: dto.proposedTermDuration ?? null,
    proposedTermMonthlyPremium:
      dto.proposedTermMonthlyPremium ?? calc.proposedTermMonthlyPremium ?? null,
    premiumSource: dto.premiumSource || "MISSING",
    quoteConfirmationStatus: dto.quoteConfirmationStatus || null,
    eligibilityConfirmationStatus: dto.eligibilityConfirmationStatus || null,
    sameDeathBenefit:
      calc.sameDeathBenefit != null
        ? Boolean(calc.sameDeathBenefit)
        : dto.proposedTermDeathBenefit == null ||
          dto.proposedTermDeathBenefit === dto.currentIulDeathBenefit,

    totalProposedMonthlyOutlay:
      dto.totalProposedMonthlyOutlay ?? calc.totalProposedMonthlyOutlay ?? null,
    unboundedPremiumDifference:
      dto.unboundedPremiumDifference ?? calc.unboundedPremiumDifference ?? null,
    monthlyInvestmentDifference:
      dto.monthlyInvestmentDifference ?? calc.monthlyInvestmentDifference ?? null,
    proposedMutualFundContribution:
      calc.proposedMutualFundContribution ??
      dto.monthlyInvestmentDifference ??
      null,
    outlayValidation: calc.validation || null,

    investmentHorizon: dto.investmentHorizon || payload.investmentHorizon || null,
    projectionAssumptions: dto.projectionAssumptions || null,
    projectionOutputs: dto.projectionOutputs || payload.projections || null,

    riskProfile: dto.riskProfile || "NOT_COMPLETED",
    scenarioEmphasis: Object.freeze({
      canEmphasizeInvestmentScenario: Boolean(payload.canEmphasizeInvestmentScenario),
      canViewEducationalIllustration: Boolean(payload.canViewEducationalIllustration),
      highlightedScenarioId: payload.highlightedScenarioId || null,
      highlightedScenarioLabel: payload.highlightedScenarioLabel || null
    }),

    comparisonTable: payload.comparisonTable || null,
    talkingPoints: payload.talkingPoints || [],
    disclaimers: payload.disclaimers || [],

    missingDataWarnings: dto.missingDataWarnings || payload.missingDataWarnings || [],
    replacementWarnings: dto.replacementWarnings || payload.replacementWarnings || [],
    replacementAcknowledged: Boolean(dto.replacementAcknowledged),

    representativeOverride: dto.representativeOverride || null,
    overrideReason: dto.overrideReason || null,

    supersededBy: dto.supersededBy || null,
    createdBy: dto.createdBy || null,
    updatedBy: dto.updatedBy || null,
    createdAt: dto.createdAt || null,
    updatedAt: dto.updatedAt || null,

    metadata: Object.freeze({
      ...(dto.metadata || {}),
      calculationAuthority: "backend",
      frontendMayRecalculate: false,
      br066: true
    })
  });
}

module.exports = {
  buildFrontendContract
};
