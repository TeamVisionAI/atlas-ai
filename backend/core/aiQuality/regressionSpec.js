/**
 * BR-175 — copyable regression specification. Never writes source or tests.
 */

const { REGRESSION_STATUSES } = require("./constants");

function summarizeFacts(facts) {
  if (!facts || typeof facts !== "object") {
    return {};
  }
  return {
    city: facts.city || null,
    state: facts.state || null,
    workAuthorization: facts.workAuthorization ?? null,
    workAuthorizationStatus: facts.workAuthorizationStatus || null
  };
}

function buildRegressionCandidate({
  qualityCase,
  expectedBehavior = {},
  sourceBr = "BR-175",
  futureBr = null
} = {}) {
  const spec = {
    title: expectedBehavior.title || `${qualityCase?.signalType || "quality"} regression`,
    inputTurns: expectedBehavior.inputTurns || qualityCase?.inputTurns || [],
    priorKnownFacts: summarizeFacts(
      expectedBehavior.priorKnownFacts || qualityCase?.knownFactsBefore || {}
    ),
    expectedIntent: expectedBehavior.expectedIntent || null,
    expectedFacts: summarizeFacts(expectedBehavior.expectedFacts || {}),
    expectedNextAction: expectedBehavior.expectedNextAction || null,
    forbiddenBehavior: expectedBehavior.forbiddenBehavior || [],
    sourceBr,
    futureBr,
    signalType: qualityCase?.signalType || null,
    caseId: qualityCase?.id || null,
    organizationId: qualityCase?.organizationId || null,
    status: REGRESSION_STATUSES.PROPOSED,
    mutatesSourceCode: false,
    mutatesTests: false
  };

  const markdown = [
    `# AI Quality regression candidate`,
    ``,
    `- Case: \`${spec.caseId || "n/a"}\``,
    `- Signal: \`${spec.signalType || "n/a"}\``,
    `- Source BR: ${spec.sourceBr}`,
    futureBr ? `- Future BR: ${futureBr}` : null,
    `- Status: ${spec.status}`,
    ``,
    `## Prior known facts`,
    "```json",
    JSON.stringify(spec.priorKnownFacts, null, 2),
    "```",
    ``,
    `## Expected`,
    `- Intent: \`${spec.expectedIntent || "define"}\``,
    `- Next action: \`${spec.expectedNextAction || "define"}\``,
    `- Facts: \`${JSON.stringify(spec.expectedFacts)}\``,
    `- Forbidden: ${spec.forbiddenBehavior.length ? spec.forbiddenBehavior.join("; ") : "none listed"}`,
    ``,
    `## Input turns`,
    "```json",
    JSON.stringify(spec.inputTurns, null, 2),
    "```",
    ``,
    `Do not auto-edit source or tests. Implement a focused automated test from this spec.`
  ]
    .filter((line) => line != null)
    .join("\n");

  return { spec, markdown };
}

module.exports = {
  summarizeFacts,
  buildRegressionCandidate
};
