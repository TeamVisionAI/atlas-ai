/**
 * Sprint 9.0 — Agency Pulse scoring (Executive Dashboard MVP).
 *
 * FORMULA (evolvable — keep isolated here):
 *   score = clamp(0, 100, 100 - deductions + bonuses)
 *
 * Deductions (workflow-derived only):
 *   - Pending interview outcomes: 5 pts each, max 25
 *   - Stalled prospects:           3 pts each, max 15
 *   - Follow-up due backlog:       2 pts each, max 10
 *
 * Bonuses:
 *   - Interviews scheduled today:  2 pts each, max 10
 *   - Active pipeline (5+ non-closed): 5 pts (once)
 *
 * Inputs come from existing priority queue summaries — no new business rules.
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {Object} inputs
 * @param {number} inputs.pendingInterviewOutcomes
 * @param {number} inputs.stalledProspects
 * @param {number} inputs.followUpBacklog
 * @param {number} inputs.interviewsToday
 * @param {number} inputs.activeProspects
 */
function computeAgencyPulseScore(inputs = {}) {
  const pendingOutcomes = Number(inputs.pendingInterviewOutcomes) || 0;
  const stalled = Number(inputs.stalledProspects) || 0;
  const followUpBacklog = Number(inputs.followUpBacklog) || 0;
  const interviewsToday = Number(inputs.interviewsToday) || 0;
  const activeProspects = Number(inputs.activeProspects) || 0;

  const deductions =
    Math.min(25, pendingOutcomes * 5) +
    Math.min(15, stalled * 3) +
    Math.min(10, followUpBacklog * 2);

  const bonuses =
    Math.min(10, interviewsToday * 2) + (activeProspects >= 5 ? 5 : 0);

  const score = clamp(Math.round(100 - deductions + bonuses), 0, 100);

  return {
    score,
    maxScore: 100,
    label: "Agency Health",
    formulaVersion: "9.0-mvp",
    inputs: {
      pendingInterviewOutcomes: pendingOutcomes,
      stalledProspects: stalled,
      followUpBacklog,
      interviewsToday,
      activeProspects
    },
    breakdown: {
      base: 100,
      deductions,
      bonuses
    }
  };
}

module.exports = {
  computeAgencyPulseScore
};
