const constants = require("./constants");
const captureConfig = require("./captureConfig");
const signalDetector = require("./signalDetector");
const { buildEpisodeKey } = require("./episodeKey");
const { buildRegressionCandidate, summarizeFacts } = require("./regressionSpec");
const { captureFromSemanticShadow, compactInterpretation } = require("./captureService");
const { applyReviewAction, computeOverview } = require("./reviewService");
const { createMemoryStore } = require("./memoryStore");
const { syntheticCases, SYNTHETIC_ORG, OTHER_ORG } = require("./syntheticFixtures");
const { buildLearningProposal, stripHiddenReasoning, containsHiddenReasoning } = require("./learningProposal");
const { applyLearningAction } = require("./learningActions");
const { buildLearningReport } = require("./learningReport");
const { classifyRisk } = require("./riskPolicy");
const { buildImplementationProposal } = require("./implementationProposal");

module.exports = {
  ...constants,
  ...captureConfig,
  ...signalDetector,
  buildEpisodeKey,
  buildRegressionCandidate,
  summarizeFacts,
  captureFromSemanticShadow,
  compactInterpretation,
  applyReviewAction,
  computeOverview,
  createMemoryStore,
  syntheticCases,
  SYNTHETIC_ORG,
  OTHER_ORG,
  buildLearningProposal,
  stripHiddenReasoning,
  containsHiddenReasoning,
  applyLearningAction,
  buildLearningReport,
  classifyRisk,
  buildImplementationProposal
};
