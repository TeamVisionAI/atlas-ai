/**
 * Pure Mission Action → inline form resolution (no service imports).
 * Keeps Close — Not Interested / qualification / scheduling form wiring testable.
 */

export const INLINE_FORM_TYPES = Object.freeze({
  SCHEDULING: "scheduling",
  INTERVIEW_OUTCOME: "interview_outcome",
  QUALIFICATION: "qualification",
  CLOSE_NOT_INTERESTED: "close_not_interested"
});

const SCHEDULING_ACTIONS = new Set(["schedule", "reschedule"]);

const INTERVIEW_OUTCOME_ACTIONS = new Set([
  "enter_interview_outcome",
  "record_outcome",
  "record-outcome",
  "record_interview_outcome"
]);

const INTERVIEW_OUTCOME_MISSION_TYPES = new Set([
  "EnterInterviewOutcome",
  "UpdateOutcome"
]);

/** Canonical action id → inline form type (source of truth for Mission Action Center). */
export const INLINE_FORM_BY_ACTION_ID = Object.freeze({
  schedule: INLINE_FORM_TYPES.SCHEDULING,
  reschedule: INLINE_FORM_TYPES.SCHEDULING,
  enter_interview_outcome: INLINE_FORM_TYPES.INTERVIEW_OUTCOME,
  qualification: INLINE_FORM_TYPES.QUALIFICATION,
  close_not_interested: INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED,
  // Aliases that must never fall through to the diagnostic panel.
  "close-not-interested": INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED,
  not_interested: INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED
});

export function normalizeMissionActionId(actionId, mission = null) {
  const normalized = String(actionId || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!normalized) {
    return "";
  }

  if (
    INTERVIEW_OUTCOME_ACTIONS.has(normalized) ||
    normalized.includes("interview_outcome") ||
    // Exact "record_outcome" token only — do not match unrelated "*_outcome*" ids.
    normalized === "record_outcome" ||
    normalized.endsWith("_record_outcome") ||
    normalized.startsWith("record_outcome_")
  ) {
    return "enter_interview_outcome";
  }

  if (
    mission?.missionType &&
    INTERVIEW_OUTCOME_MISSION_TYPES.has(mission.missionType) &&
    normalizeMissionActionId(mission?.primaryAction?.id) === normalized &&
    normalized !== "close_not_interested" &&
    normalized !== "qualification" &&
    normalized !== "schedule" &&
    normalized !== "reschedule"
  ) {
    return "enter_interview_outcome";
  }

  return normalized;
}

/**
 * Resolves an action id to an inline form type, or null when none applies.
 * Always compares against normalized ids (fixes raw-id return mismatch).
 */
export function resolvesToInlineForm(actionId, mission = null) {
  const normalizedId = normalizeMissionActionId(actionId, mission);

  if (!normalizedId) {
    return null;
  }

  if (INLINE_FORM_BY_ACTION_ID[normalizedId]) {
    return INLINE_FORM_BY_ACTION_ID[normalizedId];
  }

  if (SCHEDULING_ACTIONS.has(normalizedId)) {
    return INLINE_FORM_TYPES.SCHEDULING;
  }

  if (
    mission?.missionType === "CompleteQualification" &&
    normalizedId === normalizeMissionActionId(mission?.primaryAction?.id) &&
    normalizedId !== "whatsapp" &&
    normalizedId !== "notes" &&
    normalizedId !== "call" &&
    normalizedId !== "close_not_interested"
  ) {
    return INLINE_FORM_TYPES.QUALIFICATION;
  }

  return null;
}

export function isCloseNotInterestedForm(formType) {
  return formType === INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED;
}

export function isRenderableInlineFormType(formType) {
  return Object.values(INLINE_FORM_TYPES).includes(formType);
}
