/**
 * Pure helpers for Recruit AI v2 Workflow Simulator UI diagnostics.
 * Keeps Operations Center rendering free of inline formatting logic.
 */

export function summarizeRecruitAiV2ScenarioReport(report) {
  if (!report || typeof report !== "object") {
    return {
      scenarioId: null,
      scenarioName: null,
      pass: false,
      totalAssertions: 0,
      passed: 0,
      failed: 0,
      finalContextStage: null,
      humanEscalation: false,
      sideEffectsDenied: true,
      turnCount: 0
    };
  }

  const summary = report.summary || {};
  const turns = Array.isArray(report.turns) ? report.turns : [];

  return {
    scenarioId: report.scenarioId || null,
    scenarioName: report.scenarioName || report.scenarioId || null,
    pass: Boolean(report.pass),
    totalAssertions: Number(summary.totalAssertions ?? turns.length) || 0,
    passed: Number(summary.passed ?? 0) || 0,
    failed: Number(summary.failed ?? 0) || 0,
    finalContextStage: summary.finalContextStage || null,
    humanEscalation: Boolean(summary.humanEscalation),
    sideEffectsDenied: summary.sideEffectsDenied !== false,
    turnCount: turns.length
  };
}

export function formatRecruitAiV2FactChanges(knownFactChanges) {
  if (!knownFactChanges || typeof knownFactChanges !== "object") {
    return "—";
  }
  const keys = Object.keys(knownFactChanges);
  if (!keys.length) {
    return "—";
  }
  return JSON.stringify(knownFactChanges);
}

/** Paths used by Operations Center Recruit AI v2 simulator panel. */
export const RECRUIT_AI_V2_SIMULATOR_PATHS = {
  list: "/simulator/recruit-ai-v2/scenarios",
  runAll: "/simulator/recruit-ai-v2/scenarios/run-all",
  runOne: (scenarioId) =>
    `/simulator/recruit-ai-v2/scenarios/${encodeURIComponent(scenarioId)}/run`,
  playgroundMeta: "/simulator/recruit-ai-v2/playground/meta",
  playgroundSessions: "/simulator/recruit-ai-v2/playground/sessions",
  playgroundSession: (sessionId) =>
    `/simulator/recruit-ai-v2/playground/sessions/${encodeURIComponent(sessionId)}`,
  playgroundTurn: (sessionId) =>
    `/simulator/recruit-ai-v2/playground/sessions/${encodeURIComponent(sessionId)}/turns`,
  playgroundReset: (sessionId) =>
    `/simulator/recruit-ai-v2/playground/sessions/${encodeURIComponent(sessionId)}/reset`,
  playgroundCandidate: (sessionId) =>
    `/simulator/recruit-ai-v2/playground/sessions/${encodeURIComponent(sessionId)}/regression-candidate`
};

export const PLAYGROUND_EXPECTATIONS = [
  "greeting",
  "partial_location",
  "qualification",
  "counteroffer",
  "clarification",
  "reschedule",
  "cancellation",
  "human_escalation",
  "language_switch"
];

export function formatPlaygroundDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") {
    return [];
  }
  return [
    ["detectedLanguage", diagnostics.detectedLanguage],
    ["preferredConversationLanguage", diagnostics.preferredConversationLanguage],
    ["interpretedIntent", diagnostics.interpretedIntent],
    ["confidence", diagnostics.confidence],
    ["currentStage", diagnostics.currentStage],
    ["clarificationRequired", diagnostics.clarificationRequired],
    ["appointmentState", diagnostics.appointmentState],
    ["pendingQuestion", diagnostics.pendingQuestion],
    ["decisionCode", diagnostics.decisionCode],
    ["proposedSideEffect", diagnostics.proposedSideEffect],
    ["authorizationResult", diagnostics.authorizationResult],
    ["humanEscalationState", diagnostics.humanEscalationState],
    ["elapsedMs", diagnostics.elapsedMs]
  ];
}
