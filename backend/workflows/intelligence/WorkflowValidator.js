/**
 * Journey #5 Increment 2 — Validate collected data against workflow rules.
 */

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/;

function getFactValue(collectedFacts, fieldName) {
  const entry = collectedFacts[fieldName];
  if (!entry) {
    return null;
  }

  return typeof entry === "object" ? entry.value : entry;
}

function validateField(fieldName, value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { valid: false, reason: `${fieldName} is required.` };
  }

  if (fieldName === "email" && !EMAIL_PATTERN.test(String(value))) {
    return { valid: false, reason: "Email format is invalid." };
  }

  if (fieldName === "phone" && !PHONE_PATTERN.test(String(value))) {
    return { valid: false, reason: "Phone format is invalid." };
  }

  if (fieldName === "name" && String(value).trim().split(/\s+/).length < 2) {
    return { valid: false, reason: "Full name is required." };
  }

  return { valid: true, reason: null };
}

/**
 * @param {string[]} requiredFields
 * @param {Object} collectedFacts
 * @returns {{ valid: boolean, missingFields: string[], invalidFields: string[], reasons: string[] }}
 */
function validateStep(requiredFields, collectedFacts) {
  const missingFields = [];
  const invalidFields = [];
  const reasons = [];

  for (const field of requiredFields) {
    const value = getFactValue(collectedFacts, field);
    const result = validateField(field, value);

    if (!result.valid) {
      if (value === null || value === undefined || String(value).trim() === "") {
        missingFields.push(field);
      } else {
        invalidFields.push(field);
      }

      if (result.reason) {
        reasons.push(result.reason);
      }
    }
  }

  return {
    valid: missingFields.length === 0 && invalidFields.length === 0,
    missingFields,
    invalidFields,
    reasons
  };
}

/**
 * @param {Object} contract
 * @param {Object} collectedFacts
 * @returns {{ complete: boolean, completedSteps: string[], pendingSteps: string[] }}
 */
function validateWorkflowCompletion(contract, collectedFacts) {
  const completedSteps = [];
  const pendingSteps = [];

  for (const step of contract.steps) {
    const result = validateStep(step.requiredData || [], collectedFacts);

    if (result.valid) {
      completedSteps.push(step.id);
    } else {
      pendingSteps.push(step.id);
    }
  }

  return {
    complete: pendingSteps.length === 0,
    completedSteps,
    pendingSteps
  };
}

module.exports = {
  validateField,
  validateStep,
  validateWorkflowCompletion,
  getFactValue
};
