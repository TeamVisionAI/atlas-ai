/**
 * BR-168 — Classify a late-settled Recruit AI v2 processTurn result after
 * LIVE_AUTHORING_TIMEOUT. Recover only safe authored conversational replies.
 * Mutation ownership stays with BR-125 / BR-126.
 */

const { NEXT_ACTIONS, V2_EXECUTABLE_ACTIONS } = require("./constants");

const LATE_RESULT_REASONS = Object.freeze({
  SENDABLE: "LATE_RESULT_SENDABLE",
  UNRESOLVED: "LATE_RESULT_UNRESOLVED",
  FAILED: "LATE_RESULT_FAILED",
  CONFLICTED: "LATE_RESULT_CONFLICTED",
  UNSAFE_MUTATION: "LATE_RESULT_UNSAFE_MUTATION",
  EMPTY_OR_UNSAFE_REPLY: "LATE_RESULT_EMPTY_OR_UNSAFE_REPLY",
  PERSIST_FAILED: "LATE_RESULT_PERSIST_FAILED"
});

const EXECUTABLE_MUTATION_ACTIONS = new Set([
  ...Object.values(V2_EXECUTABLE_ACTIONS),
  NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT
]);

function resolveNextAction(v2Result = {}) {
  return (
    v2Result?.structuredDecision?.decision?.nextAction ||
    v2Result?.audit?.nextAction ||
    v2Result?.audit?.proposedAction ||
    null
  );
}

function isMutationOwnedTurn(v2Result = {}) {
  const nextAction = resolveNextAction(v2Result);
  if (nextAction && EXECUTABLE_MUTATION_ACTIONS.has(String(nextAction))) {
    return true;
  }

  const execution = v2Result.execution || {};
  if (execution.attempted) {
    return true;
  }
  if (execution.success && execution.appointmentId) {
    return true;
  }
  if (Array.isArray(execution.performed) && execution.performed.length > 0) {
    return true;
  }
  if (Array.isArray(execution.failed) && execution.failed.length > 0) {
    return true;
  }
  return false;
}

function persistOutcome(v2Result = {}) {
  const persist = v2Result.persistence || {};
  if (!persist.attempted || !persist.result) {
    return { attempted: Boolean(persist.attempted), ok: null, code: null };
  }
  return {
    attempted: true,
    ok: persist.result.ok === true,
    code: persist.result.code || null
  };
}

/**
 * @param {object|null} v2Result
 * @param {(result: object) => string} extractReplyText
 */
function classifyLateSettledV2Result(v2Result, extractReplyText) {
  if (!v2Result) {
    return {
      recoverable: false,
      reason: LATE_RESULT_REASONS.UNRESOLVED,
      replyText: null,
      nextAction: null
    };
  }

  const nextAction = resolveNextAction(v2Result);
  const persist = persistOutcome(v2Result);
  if (persist.attempted && persist.ok === false) {
    const conflicted = persist.code === "CONTEXT_VERSION_CONFLICT";
    return {
      recoverable: false,
      reason: conflicted
        ? LATE_RESULT_REASONS.CONFLICTED
        : LATE_RESULT_REASONS.PERSIST_FAILED,
      replyText: null,
      nextAction
    };
  }

  if (isMutationOwnedTurn(v2Result)) {
    return {
      recoverable: false,
      reason: LATE_RESULT_REASONS.UNSAFE_MUTATION,
      replyText: null,
      nextAction
    };
  }

  const replyText =
    typeof extractReplyText === "function" ? extractReplyText(v2Result) : "";
  if (!replyText) {
    return {
      recoverable: false,
      reason: LATE_RESULT_REASONS.EMPTY_OR_UNSAFE_REPLY,
      replyText: null,
      nextAction
    };
  }

  return {
    recoverable: true,
    reason: LATE_RESULT_REASONS.SENDABLE,
    replyText,
    nextAction
  };
}

module.exports = {
  LATE_RESULT_REASONS,
  EXECUTABLE_MUTATION_ACTIONS,
  resolveNextAction,
  isMutationOwnedTurn,
  classifyLateSettledV2Result
};
