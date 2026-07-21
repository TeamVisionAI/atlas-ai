/**
 * Release 1.1 — Configurable presentation outcomes.
 */

const DEFAULT_OUTCOMES = Object.freeze({
  joined: {
    id: "joined",
    label: "Joined",
    nextWorkflow: "licensing",
    nextReminder: null,
    escalate: false,
    notes: "Candidate accepted the opportunity.",
    recommendation: "Start licensing workflow."
  },
  thinking: {
    id: "thinking",
    label: "Thinking",
    nextWorkflow: "followup",
    nextReminder: "after_presentation",
    escalate: false,
    notes: "Candidate needs time to decide.",
    recommendation: "Schedule follow-up in 48 hours."
  },
  no_money: {
    id: "no_money",
    label: "No Money",
    nextWorkflow: "followup",
    nextReminder: "after_presentation",
    escalate: false,
    notes: "Financial concern raised.",
    recommendation: "Share licensing cost options."
  },
  needs_spouse: {
    id: "needs_spouse",
    label: "Needs Spouse",
    nextWorkflow: "followup",
    nextReminder: "after_presentation",
    escalate: false,
    notes: "Decision requires spouse input.",
    recommendation: "Offer joint follow-up call."
  },
  not_interested: {
    id: "not_interested",
    label: "Not Interested",
    nextWorkflow: null,
    nextReminder: null,
    escalate: false,
    notes: "Candidate declined.",
    recommendation: "Close recruiting workflow."
  },
  no_show: {
    id: "no_show",
    label: "No Show",
    nextWorkflow: "followup",
    nextReminder: "after_no_show",
    escalate: true,
    notes: "Candidate missed presentation.",
    recommendation: "Attempt reschedule."
  },
  call_back_later: {
    id: "call_back_later",
    label: "Call Back Later",
    nextWorkflow: "followup",
    nextReminder: "after_inactivity",
    escalate: false,
    notes: "Candidate requested callback.",
    recommendation: "Schedule callback."
  },
  wrong_timing: {
    id: "wrong_timing",
    label: "Wrong Timing",
    nextWorkflow: "followup",
    nextReminder: "after_inactivity",
    escalate: false,
    notes: "Timing not right now.",
    recommendation: "Long-term nurture sequence."
  }
});

function resolveOutcomes(configuration = {}) {
  return {
    ...DEFAULT_OUTCOMES,
    ...(configuration.presentationOutcomes || {})
  };
}

function applyPresentationOutcome(outcomeId, configuration = {}) {
  const outcomes = resolveOutcomes(configuration);
  const outcome = outcomes[outcomeId];

  if (!outcome) {
    throw new Error(`Unknown presentation outcome: ${outcomeId}`);
  }

  return {
    ...outcome,
    appliedAt: new Date().toISOString()
  };
}

module.exports = {
  DEFAULT_OUTCOMES,
  resolveOutcomes,
  applyPresentationOutcome
};
