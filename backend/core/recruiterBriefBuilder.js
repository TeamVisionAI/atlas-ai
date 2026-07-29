/**
 * Milestone 4 — Recruiter Brief (formerly Atlas Brief).
 * Actionable coaching for recruiters only — no workflow enums or internal field names.
 */

const { isFollowUpDue } = require("./agentActionEngine");

const MAX_ITEMS = 5;

const BLOCKED_LINE_PATTERNS = [
  /^[A-Z][A-Z0-9_]{2,}$/,
  /next field:/i,
  /^remaining:/i,
  /scheduling in progress\s*\(/i,
  /capturestate/i,
  /daypart/i,
  /waiting_event/i,
  /interview_result_pending/i,
  /^prospect from /i,
  /^lead:/i,
  /^interview not scheduled$/i,
  /^interview confirmed$/i,
  /^ready for agent handoff$/i
];

const INTENT_COACHING = Object.freeze({
  NOT_INTERESTED: "Prospect may have lost interest — acknowledge concerns and clarify next steps.",
  CONFUSED: "Prospect seems unsure — explain the opportunity in simple terms.",
  WHAT_IS_THE_JOB: "Prospect asked about the role — be ready to explain the opportunity clearly.",
  AVAILABLE: "Prospect asked about availability — confirm timing works for both of you."
});

function isBlockedLine(text) {
  const value = String(text || "").trim();

  if (!value) {
    return true;
  }

  return BLOCKED_LINE_PATTERNS.some((pattern) => pattern.test(value));
}

function addItem(items, seen, text) {
  const normalized = String(text || "").trim();

  if (!normalized || isBlockedLine(normalized)) {
    return;
  }

  const key = normalized.toLowerCase();

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  items.push(normalized);
}

function formatFollowUpReminder(agentState) {
  if (!agentState?.followUpDate) {
    return null;
  }

  const timeSuffix = agentState.followUpTime ? ` at ${agentState.followUpTime}` : "";
  return `Follow up with the prospect on ${agentState.followUpDate}${timeSuffix}.`;
}

function buildStallGuidance(workflow) {
  if (!workflow?.stall?.isStalled) {
    return null;
  }

  return (
    workflow.stall.reason ||
    "Prospect has not replied recently — a personal follow-up could help."
  );
}

function buildHandoffGuidance(brain) {
  if (!brain?.handoffRequired) {
    return null;
  }

  return "This conversation may need a recruiter to step in and assist directly.";
}

function buildConversationInsight(conversationMessages = []) {
  const lastInbound = [...conversationMessages]
    .reverse()
    .find((entry) => String(entry.direction || "").toLowerCase() === "incoming");

  if (!lastInbound?.text) {
    const lastOutbound = [...conversationMessages]
      .reverse()
      .find((entry) => String(entry.direction || "").toLowerCase() === "outgoing");

    if (lastOutbound) {
      return "Prospect has not replied yet — consider a warm follow-up message.";
    }

    return null;
  }

  const preview = lastInbound.text.trim().slice(0, 140);
  return `Prospect recently said: "${preview}${lastInbound.text.trim().length > preview.length ? "…" : ""}"`;
}

function buildIntentGuidance(brain) {
  const intent = brain?.intent;

  if (!intent || intent === "UNKNOWN" || intent === "GREETING") {
    return null;
  }

  return INTENT_COACHING[intent] || null;
}

function buildMissingInformationGuidance(conversationOutcome) {
  const lines = [];

  for (const input of conversationOutcome?.requiredInputs || []) {
    if (input?.label) {
      lines.push(`Still needed before advancing: ${input.label}.`);
    }
  }

  return lines;
}

function buildOnboardingGuidance(agentState) {
  if (agentState?.outcome !== "Recruited") {
    return null;
  }

  if (agentState.onboardingUnlocked) {
    return "Onboarding is ready — guide the prospect through the next onboarding steps.";
  }

  if (agentState.orientationScheduled) {
    return "Orientation is scheduled — prepare onboarding materials for after the session.";
  }

  return "Prospect was recruited — schedule orientation to keep momentum.";
}

/**
 * @param {Object} params
 * @param {Object|null} [params.primaryMission]
 * @param {Object|null} [params.conversationOutcome]
 * @param {Array} [params.conversationMessages]
 * @param {Object} [params.agentState]
 * @param {Object} [params.workflow]
 * @param {Object} [params.brain]
 * @returns {{ items: string[], hasGuidance: boolean }}
 */
function buildRecruiterBrief({
  primaryMission = null,
  conversationOutcome = null,
  conversationMessages = [],
  agentState = {},
  workflow = {},
  brain = {}
}) {
  const items = [];
  const seen = new Set();

  if (primaryMission?.reason) {
    addItem(items, seen, primaryMission.reason);
  } else if (primaryMission?.description) {
    addItem(items, seen, primaryMission.description);
  }

  for (const line of buildMissingInformationGuidance(conversationOutcome)) {
    addItem(items, seen, line);
  }

  if (isFollowUpDue(agentState)) {
    addItem(items, seen, "Follow-up date has arrived — contact the prospect today.");
  } else if (agentState?.followUpDate) {
    addItem(items, seen, formatFollowUpReminder(agentState));
  }

  addItem(items, seen, buildOnboardingGuidance(agentState));
  addItem(items, seen, buildStallGuidance(workflow));
  addItem(items, seen, buildHandoffGuidance(brain));
  addItem(items, seen, buildIntentGuidance(brain));
  addItem(items, seen, buildConversationInsight(conversationMessages));

  if (primaryMission?.title && !primaryMission?.reason) {
    addItem(items, seen, `Recommended next step: ${primaryMission.title}.`);
  }

  return {
    items: items.slice(0, MAX_ITEMS),
    hasGuidance: items.length > 0
  };
}

module.exports = {
  buildRecruiterBrief,
  isBlockedLine
};
