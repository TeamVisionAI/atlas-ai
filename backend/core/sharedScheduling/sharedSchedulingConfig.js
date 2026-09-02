/**
 * ATLAS_SHARED_SCHEDULING_V2 — workflow appointment configuration.
 * Single scheduling core; workflows supply config, not duplicate engines.
 */

"use strict";

const {
  APPOINTMENT_PURPOSES,
  MEETING_TYPES,
  VIRTUAL_PROVIDERS
} = require("../configuration/appointmentDomain");
const { IUL_REVIEW_MEETING_TYPE } = require("../iulWorkflowConstants");

const WORKFLOW_TYPES = Object.freeze({
  RECRUITING_INTERVIEW: "RECRUITING_INTERVIEW",
  IUL_POLICY_REVIEW: "IUL_POLICY_REVIEW"
});

const WORKFLOW_SCHEDULING_CONFIGS = Object.freeze({
  [WORKFLOW_TYPES.RECRUITING_INTERVIEW]: Object.freeze({
    workflowType: WORKFLOW_TYPES.RECRUITING_INTERVIEW,
    appointmentType: APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    purpose: APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    durationMinutes: null,
    defaultMeetingMode: MEETING_TYPES.VIRTUAL,
    defaultVirtualProvider: VIRTUAL_PROVIDERS.ZOOM,
    allowedMeetingModes: [
      MEETING_TYPES.VIRTUAL,
      MEETING_TYPES.IN_PERSON,
      MEETING_TYPES.VIRTUAL
    ],
    schedulingCopyNamespace: "recruiting_interview"
  }),
  [WORKFLOW_TYPES.IUL_POLICY_REVIEW]: Object.freeze({
    workflowType: WORKFLOW_TYPES.IUL_POLICY_REVIEW,
    appointmentType: APPOINTMENT_PURPOSES.POLICY_REVIEW,
    purpose: APPOINTMENT_PURPOSES.POLICY_REVIEW,
    durationMinutes: null,
    defaultMeetingMode: IUL_REVIEW_MEETING_TYPE.ZOOM,
    defaultVirtualProvider: VIRTUAL_PROVIDERS.ZOOM,
    allowedMeetingModes: [IUL_REVIEW_MEETING_TYPE.ZOOM, IUL_REVIEW_MEETING_TYPE.IN_PERSON],
    schedulingCopyNamespace: "iul_policy_review"
  })
});

function normalizeWorkflowKey(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  if (raw.includes("POLICY") && raw.includes("REVIEW")) {
    return WORKFLOW_TYPES.IUL_POLICY_REVIEW;
  }
  if (raw.includes("IUL")) {
    return WORKFLOW_TYPES.IUL_POLICY_REVIEW;
  }
  if (raw.includes("RECRUIT") || raw.includes("INTERVIEW")) {
    return WORKFLOW_TYPES.RECRUITING_INTERVIEW;
  }
  return null;
}

function resolveWorkflowTypeFromContext(context = {}) {
  const goal = String(context.conversationGoal || "").toLowerCase();
  if (goal === "policy_review" || goal === "iul_policy_review") {
    return WORKFLOW_TYPES.IUL_POLICY_REVIEW;
  }
  const purpose = String(
    context.appointmentPurpose ||
      context.appointment?.purpose ||
      context.knownFacts?.appointmentPurpose ||
      ""
  ).toLowerCase();
  if (purpose === APPOINTMENT_PURPOSES.POLICY_REVIEW) {
    return WORKFLOW_TYPES.IUL_POLICY_REVIEW;
  }
  return WORKFLOW_TYPES.RECRUITING_INTERVIEW;
}

function resolveSchedulingConfig(context = {}, options = {}) {
  const explicit =
    normalizeWorkflowKey(options.workflowType) ||
    normalizeWorkflowKey(options.schedulingConfigKey) ||
    null;
  const workflowType = explicit || resolveWorkflowTypeFromContext(context);
  const base =
    WORKFLOW_SCHEDULING_CONFIGS[workflowType] ||
    WORKFLOW_SCHEDULING_CONFIGS[WORKFLOW_TYPES.RECRUITING_INTERVIEW];
  const durationMinutes =
    options.durationMinutes ||
    context.appointment?.durationMinutes ||
    context.knownFacts?.appointmentDurationMinutes ||
    base.durationMinutes ||
    null;
  return {
    ...base,
    durationMinutes,
    timezone: options.timezone || context.timezone || null
  };
}

module.exports = {
  WORKFLOW_TYPES,
  WORKFLOW_SCHEDULING_CONFIGS,
  normalizeWorkflowKey,
  resolveWorkflowTypeFromContext,
  resolveSchedulingConfig
};
