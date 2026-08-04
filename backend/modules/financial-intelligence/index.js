/**
 * Financial Intelligence module entry — RC3 Phase A.
 * Invest-the-Difference Strategy Evaluation foundation.
 * Implements BR-062+ / BR-066. Does not mutate Policy Intelligence.
 */

const {
  MODULE_ID,
  MODULE_VERSION,
  EVALUATION_STATUSES,
  PREMIUM_SOURCES,
  RISK_PROFILES,
  SECTION_TITLE,
  CURRENCY_TOLERANCE
} = require("./domain/constants");
const {
  buildCurrentIulSnapshot,
  normalizeToMonthlyPremium
} = require("./domain/adapters/currentIulSnapshotAdapter");
const {
  buildInvestTheDifferenceEvaluation
} = require("./domain/engines/investTheDifferenceEngine");
const { calculateMonthlyFutureValue } = require("./domain/projections/monthlyFutureValue");
const {
  PROJECTION_SCENARIOS,
  listProjectionScenarios
} = require("./domain/projections/projectionAssumptions");
const { getFundCatalog } = require("./domain/config/fundFamilyConfig");
const {
  resolveStrategyEvaluationStatus
} = require("./domain/models/strategyEvaluationStatus");

function createFinancialIntelligenceModule(deps = {}) {
  const {
    StrategyEvaluationRepository
  } = require("./infrastructure/StrategyEvaluationRepository");
  const { StrategyEvaluationService } = require("./application/StrategyEvaluationService");
  const createFinancialIntelligenceRoutes = require("./api/financialIntelligence.routes");

  const repository = deps.repository || new StrategyEvaluationRepository();
  const service = deps.service || new StrategyEvaluationService({ repository, ...deps });

  return {
    moduleId: MODULE_ID,
    repository,
    service,
    routes: createFinancialIntelligenceRoutes({ service, repository })
  };
}

module.exports = {
  createFinancialIntelligenceModule,
  get createFinancialIntelligenceRoutes() {
    return require("./api/financialIntelligence.routes");
  },
  get StrategyEvaluationService() {
    return require("./application/StrategyEvaluationService").StrategyEvaluationService;
  },
  get StrategyEvaluationRepository() {
    return require("./infrastructure/StrategyEvaluationRepository").StrategyEvaluationRepository;
  },
  MODULE_ID,
  MODULE_VERSION,
  EVALUATION_STATUSES,
  PREMIUM_SOURCES,
  RISK_PROFILES,
  SECTION_TITLE,
  CURRENCY_TOLERANCE,
  buildCurrentIulSnapshot,
  normalizeToMonthlyPremium,
  buildInvestTheDifferenceEvaluation,
  calculateMonthlyFutureValue,
  PROJECTION_SCENARIOS,
  listProjectionScenarios,
  getFundCatalog,
  resolveStrategyEvaluationStatus
};
