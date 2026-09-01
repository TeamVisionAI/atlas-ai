export const AI_QUALITY_TABS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "disagreements", label: "Disagreements" },
  { id: "attention", label: "Attention Cases" },
  { id: "regressions", label: "Regression Library" },
  { id: "learning", label: "Learning & Improvements" },
  { id: "cost", label: "Cost & Latency" }
]);

export const LEARNING_ACTIONS = Object.freeze([
  { id: "generate_proposal", label: "Generate Proposal" },
  { id: "approve_regression", label: "Approve Regression" },
  { id: "reject_proposal", label: "Reject Proposal" },
  { id: "request_revision", label: "Request Revision" },
  { id: "authorize_implementation", label: "Authorize Implementation" }
]);

export const LEARNING_FOLLOW_UP_ACTIONS = Object.freeze([
  { id: "propose_implementation", label: "Propose Implementation" },
  { id: "reject_implementation", label: "Reject Implementation" },
  { id: "mark_implemented", label: "Mark implemented" },
  { id: "mark_verified", label: "Mark verified" },
  { id: "reopen", label: "Reopen" }
]);

export const REVIEW_ACTIONS = Object.freeze([
  { id: "mark_semantic_correct", label: "Mark semantic correct" },
  { id: "mark_legacy_correct", label: "Mark legacy correct" },
  { id: "both_wrong", label: "Both wrong" },
  { id: "define_expected_behavior", label: "Define expected behavior" },
  { id: "create_regression_candidate", label: "Create regression candidate" },
  { id: "ignore", label: "Ignore" }
]);

export function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return `${Math.round(n * 1000) / 10}%`;
}

export function formatUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return `$${n.toFixed(4)}`;
}

export function casesForTab(cases, tab) {
  const rows = Array.isArray(cases) ? cases : [];
  if (tab === "disagreements") {
    return rows.filter(
      (row) =>
        String(row.signalType || "").includes("DISAGREEMENT") ||
        row.signalType === "SEMANTIC_OBJECTION_MISSED"
    );
  }
  if (tab === "attention") {
    return rows.filter(
      (row) =>
        !String(row.signalType || "").startsWith("SEMANTIC_") ||
        row.signalType === "SEMANTIC_OBJECTION_MISSED"
    );
  }
  if (tab === "regressions") {
    return rows.filter((row) => row.status === "REGRESSION_CANDIDATE");
  }
  return rows;
}

export function doesNotExposeChainOfThought(payload) {
  const text = JSON.stringify(payload || {});
  return !/chainOfThought|chain_of_thought|hiddenReasoning/i.test(text);
}
