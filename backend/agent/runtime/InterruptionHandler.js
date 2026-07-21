/**
 * Journey #5 Increment 4 — Interruption handling and response resume phrasing.
 */

const { DECISION_TYPE } = require("../DecisionRecord");
const { getFieldLabel } = require("../../workflows/intelligence/WorkflowContracts");

const INTERRUPTION_PATTERNS = [
  {
    pattern: /\b(what is the job|tell me about the job|what do you do|what is the role)\b/i,
    answer: (orgName) =>
      `${orgName} helps people explore new career opportunities.`
  },
  {
    pattern: /\b(how much|salary|pay|compensation)\b/i,
    answer: () =>
      "Compensation details are shared during the interview process."
  }
];

function detectInterruption(text) {
  for (const entry of INTERRUPTION_PATTERNS) {
    if (entry.pattern.test(text || "")) {
      return entry;
    }
  }

  return null;
}

function buildResumePhrase(navigation, workflowObjective) {
  const nextField = navigation?.missingInformation?.[0];

  if (!nextField) {
    return null;
  }

  const label = getFieldLabel(nextField);
  const objective = workflowObjective || "your appointment";

  if (nextField === "email") {
    return `We were scheduling ${objective}. May I have your email address?`;
  }

  return `We were scheduling ${objective}. May I have your ${label}?`;
}

/**
 * @param {string} responseText
 * @param {Object} turnContext
 * @returns {string}
 */
function enhanceResponseForInterruption(responseText, turnContext) {
  const { decision, context, navigation, workflow } = turnContext;

  if (decision.decisionType !== DECISION_TYPE.ANSWER) {
    return responseText;
  }

  const inboundText = context.inboundMessage?.text || "";
  const orgName = context.organization?.name || "our team";
  const interruption = detectInterruption(inboundText);
  const resume = buildResumePhrase(navigation, workflow?.objective);

  if (!navigation?.missingInformation?.length) {
    return responseText;
  }

  if (interruption) {
    const answer = interruption.answer(orgName);
    return resume ? `${answer} ${resume}` : answer;
  }

  if (resume && !responseText.toLowerCase().includes("may i have")) {
    return `${responseText} ${resume}`;
  }

  return responseText;
}

module.exports = {
  detectInterruption,
  buildResumePhrase,
  enhanceResponseForInterruption
};
