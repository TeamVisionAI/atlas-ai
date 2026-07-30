/**
 * Milestone 4 — Recruiter Brief (formerly Atlas Brief).
 * Actionable coaching for recruiters only — no workflow enums or internal field names.
 */

const { isFollowUpDue } = require("./agentActionEngine");

const MAX_ITEMS = 5;

const BLOCKED_LINE_PATTERNS = [
  /^[a-z][a-z0-9_]*$/i,
  /^[A-Z][A-Z0-9_]{2,}$/,
  /next field:/i,
  /^remaining:/i,
  /scheduling in progress\s*\(/i,
  /capturestate/i,
  /\bdaypart\b/i,
  /waiting_event/i,
  /interview_result_pending/i,
  /^prospect from /i,
  /^lead:/i,
  /^interview not scheduled$/i,
  /^interview confirmed$/i,
  /^ready for agent handoff$/i,
  /^scheduled:/i,
  /^new prospect in queue$/i,
  /^awaiting prospect reply\.?$/i
];

const FIELD_COACHING = Object.freeze({
  dayPart:
    "Before scheduling the next meeting, ask whether mornings, afternoons, or evenings work best.",
  preferredPeriod:
    "Before scheduling the next meeting, ask whether mornings, afternoons, or evenings work best.",
  city: "Confirm which city the prospect is in before moving forward.",
  state: "Confirm the prospect's state before moving forward.",
  authorization: "Clarify work authorization status before scheduling an interview.",
  occupation: "Ask about the prospect's current occupation to complete qualification.",
  interviewType: "Confirm whether the prospect prefers a virtual or in-person interview.",
  interview_type: "Confirm whether the prospect prefers a virtual or in-person interview.",
  schedule: "Offer specific interview times — the prospect is ready to schedule.",
  name: "Capture the prospect's name for the calendar invite.",
  email: "Collect an email address if one is needed for the meeting invite.",
  first_name: "Capture the prospect's first name.",
  last_name: "Capture the prospect's last name.",
  work_authorization_status: "Clarify work authorization status before scheduling an interview."
});

const MISSION_TYPE_COACHING = Object.freeze({
  EnterInterviewOutcome:
    "The interview has already taken place. Choose the outcome that best matches what happened: Recruited, Needs More Time, No Show, or Not Interested.",
  ScheduleInterview:
    "Prospect is qualified and ready to schedule — offer specific interview times.",
  FollowUp: "Follow-up date has arrived — contact the prospect today.",
  CompleteQualification: null,
  ContactProspect: "Reach out to the prospect and keep the conversation moving forward.",
  RecruitProspect: "Prospect was recruited — schedule orientation to keep momentum.",
  BeginOnboarding: "Orientation is scheduled — prepare onboarding materials for after the session.",
  ReviewProspect: "Review notes and history before deciding the next step."
});

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

  if (BLOCKED_LINE_PATTERNS.some((pattern) => pattern.test(value))) {
    return true;
  }

  if (/missing required information:/i.test(value) && /\b(daypart|day_part|preferredperiod)\b/i.test(value)) {
    return true;
  }

  return false;
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

function resolveFieldCoaching(fieldKey) {
  if (!fieldKey) {
    return null;
  }

  return FIELD_COACHING[fieldKey] || null;
}

function buildFieldCoaching({ brain, conversationOutcome }) {
  const lines = [];
  const seenFields = new Set();

  function appendField(fieldKey) {
    if (!fieldKey || seenFields.has(fieldKey)) {
      return;
    }

    const coaching = resolveFieldCoaching(fieldKey);

    if (coaching) {
      seenFields.add(fieldKey);
      lines.push(coaching);
    }
  }

  appendField(brain?.nextField);

  const requiredKeys = new Set(
    (conversationOutcome?.requiredInputs || []).map((input) => input?.key).filter(Boolean)
  );
  const hasRequiredInputs = requiredKeys.size > 0;

  for (const field of brain?.missingFields || []) {
    if (hasRequiredInputs && !requiredKeys.has(field)) {
      continue;
    }

    appendField(field);
  }

  for (const input of conversationOutcome?.requiredInputs || []) {
    appendField(input?.key);

    if (input?.label && !input?.key) {
      lines.push(`Still needed before advancing: ${input.label}.`);
    }
  }

  return lines;
}

function sanitizeMissionReason(reason, { brain, conversationOutcome }) {
  const value = String(reason || "").trim();

  if (!value || isBlockedLine(value)) {
    return null;
  }

  if (/missing required information:/i.test(value)) {
    const fieldCoaching = buildFieldCoaching({ brain, conversationOutcome });

    if (fieldCoaching.length) {
      return fieldCoaching[0];
    }
  }

  if (/\b(daypart|day_part|preferredperiod|capturestate)\b/i.test(value)) {
    return null;
  }

  return value;
}

function resolveMissionCoaching(primaryMission, context) {
  if (!primaryMission) {
    return null;
  }

  const typeCoaching = MISSION_TYPE_COACHING[primaryMission.missionType];

  if (typeCoaching) {
    return typeCoaching;
  }

  return sanitizeMissionReason(primaryMission.reason, context);
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
  const context = { brain, conversationOutcome };

  addItem(items, seen, resolveMissionCoaching(primaryMission, context));

  if (primaryMission?.missionType === "CompleteQualification") {
    for (const line of buildFieldCoaching(context)) {
      addItem(items, seen, line);
    }
  } else if (!primaryMission || primaryMission.missionType === "ReviewProspect") {
    for (const line of buildFieldCoaching(context)) {
      addItem(items, seen, line);
    }
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

  return {
    items: items.slice(0, MAX_ITEMS),
    hasGuidance: items.length > 0
  };
}

module.exports = {
  buildRecruiterBrief,
  isBlockedLine,
  FIELD_COACHING
};
