/**
 * Release 1.1 — Reusable objection definitions (business knowledge only).
 */

const OBJECTIONS = Object.freeze([
  {
    id: "need_to_think",
    patterns: [/need to think/i, /think about it/i],
    suggestedResponse:
      "Of course. This is an important decision. What questions can I answer to help you decide?",
    nextQuestion: "What would help you feel confident moving forward?",
    workflowImpact: "pause_scheduling",
    escalate: false
  },
  {
    id: "no_time",
    patterns: [/don't have time/i, /no time/i, /too busy/i],
    suggestedResponse:
      "I understand schedules are tight. We can explore flexible options that fit your availability.",
    nextQuestion: "Would mornings, evenings, or weekends work better for you?",
    workflowImpact: "collect_availability",
    escalate: false
  },
  {
    id: "no_money",
    patterns: [/don't have money/i, /no money/i, /can't afford/i],
    suggestedResponse:
      "Thank you for sharing that. Licensing costs and payment options are discussed during the interview process.",
    nextQuestion: "Would you like to learn about the licensing path and options?",
    workflowImpact: "continue_qualification",
    escalate: false
  },
  {
    id: "ask_spouse",
    patterns: [/ask my spouse/i, /talk to my (wife|husband|partner)/i, /need to ask/i],
    suggestedResponse:
      "Absolutely. Important decisions are often made together. We can schedule a follow-up when you are ready.",
    nextQuestion: "Would a joint call be helpful?",
    workflowImpact: "schedule_followup",
    escalate: false
  },
  {
    id: "what_is_job",
    patterns: [/what is the job/i, /what do you do/i, /tell me about the (job|role|opportunity)/i],
    suggestedResponse:
      "We help people explore new career opportunities in financial services with training and support.",
    nextQuestion: "May I continue with your interview scheduling?",
    workflowImpact: "resume_workflow",
    escalate: false
  }
]);

function matchObjection(text) {
  const input = String(text || "");

  for (const objection of OBJECTIONS) {
    if (objection.patterns.some((pattern) => pattern.test(input))) {
      return objection;
    }
  }

  return null;
}

function listObjections() {
  return OBJECTIONS.map(({ id, suggestedResponse, workflowImpact, escalate }) => ({
    id,
    suggestedResponse,
    workflowImpact,
    escalate
  }));
}

module.exports = {
  OBJECTIONS,
  matchObjection,
  listObjections
};
