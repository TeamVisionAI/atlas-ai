/**
 * Sprint 13.1 — Validation gates and state transition rules for recruiting workflow.
 */

const { RecruitingState } = require("./RecruitingStates");

const ValidationGate = Object.freeze({
  LOCATION: "location",
  WORK_AUTHORIZATION: "workAuthorization",
  CONTACT_INFORMATION: "contactInformation",
  INTERVIEW_TYPE: "interviewType",
  INTERVIEW_SCHEDULE: "interviewSchedule"
});

/**
 * @param {Object} collectedData
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateLocation(collectedData = {}) {
  const missing = [];

  if (!collectedData.city) {
    missing.push("city");
  }

  if (!collectedData.state) {
    missing.push("state");
  }

  return { valid: missing.length === 0, missing, gate: ValidationGate.LOCATION };
}

/**
 * @param {Object} collectedData
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateWorkAuthorization(collectedData = {}) {
  const missing = [];

  if (
    collectedData.authorizedToWork === null ||
    collectedData.authorizedToWork === undefined
  ) {
    missing.push("authorizedToWork");
  }

  return {
    valid: missing.length === 0,
    missing,
    gate: ValidationGate.WORK_AUTHORIZATION
  };
}

/**
 * @param {Object} collectedData
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateContactInformation(collectedData = {}) {
  const missing = [];

  if (!collectedData.name) {
    missing.push("name");
  }

  if (!collectedData.phone) {
    missing.push("phone");
  }

  if (!collectedData.email) {
    missing.push("email");
  }

  return {
    valid: missing.length === 0,
    missing,
    gate: ValidationGate.CONTACT_INFORMATION
  };
}

/**
 * @param {Object} collectedData
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateInterviewType(collectedData = {}) {
  const missing = [];

  if (!collectedData.interviewType) {
    missing.push("interviewType");
  }

  return {
    valid: missing.length === 0,
    missing,
    gate: ValidationGate.INTERVIEW_TYPE
  };
}

/**
 * @param {Object} collectedData
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateInterviewSchedule(collectedData = {}) {
  const missing = [];

  if (!collectedData.interviewType) {
    missing.push("interviewType");
  }

  if (!collectedData.preferredDate) {
    missing.push("preferredDate");
  }

  if (!collectedData.preferredTime) {
    missing.push("preferredTime");
  }

  return {
    valid: missing.length === 0,
    missing,
    gate: ValidationGate.INTERVIEW_SCHEDULE
  };
}

/**
 * @param {string} currentState
 * @returns {Function|null}
 */
function getValidatorForState(currentState) {
  switch (currentState) {
    case RecruitingState.GREETING:
      return validateLocation;
    case RecruitingState.LOCATION_COLLECTED:
      return validateWorkAuthorization;
    case RecruitingState.OPPORTUNITY_EXPLAINED:
      return validateContactInformation;
    case RecruitingState.CONTACT_INFORMATION_COLLECTED:
      return validateInterviewType;
    case RecruitingState.INTERVIEW_TYPE_SELECTED:
      return validateInterviewSchedule;
    default:
      return null;
  }
}

/**
 * @param {string} currentState
 * @returns {string|null}
 */
function getNextState(currentState) {
  switch (currentState) {
    case RecruitingState.NEW_LEAD:
      return RecruitingState.GREETING;
    case RecruitingState.GREETING:
      return RecruitingState.LOCATION_COLLECTED;
    case RecruitingState.LOCATION_COLLECTED:
      return RecruitingState.WORK_AUTHORIZATION_VERIFIED;
    case RecruitingState.WORK_AUTHORIZATION_VERIFIED:
      return RecruitingState.OPPORTUNITY_EXPLAINED;
    case RecruitingState.OPPORTUNITY_EXPLAINED:
      return RecruitingState.CONTACT_INFORMATION_COLLECTED;
    case RecruitingState.CONTACT_INFORMATION_COLLECTED:
      return RecruitingState.INTERVIEW_TYPE_SELECTED;
    case RecruitingState.INTERVIEW_TYPE_SELECTED:
      return RecruitingState.INTERVIEW_SCHEDULED;
    case RecruitingState.INTERVIEW_SCHEDULED:
      return RecruitingState.REMINDER_SEQUENCE;
    case RecruitingState.REMINDER_SEQUENCE:
      return RecruitingState.INTERVIEW_COMPLETED;
    default:
      return null;
  }
}

/**
 * @param {string} state
 * @returns {boolean}
 */
function isTerminalState(state) {
  return state === RecruitingState.INTERVIEW_COMPLETED;
}

/**
 * @param {string} state
 * @returns {boolean}
 */
function isAutoAdvanceState(state) {
  return (
    state === RecruitingState.NEW_LEAD ||
    state === RecruitingState.WORK_AUTHORIZATION_VERIFIED ||
    state === RecruitingState.INTERVIEW_SCHEDULED ||
    state === RecruitingState.REMINDER_SEQUENCE
  );
}

module.exports = {
  ValidationGate,
  validateLocation,
  validateWorkAuthorization,
  validateContactInformation,
  validateInterviewType,
  validateInterviewSchedule,
  getValidatorForState,
  getNextState,
  isTerminalState,
  isAutoAdvanceState
};
