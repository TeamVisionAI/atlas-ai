/**
 * Journey #5 Increment 2 — Recommend workflow progress. No execution.
 */

const {
  validateStep,
  validateWorkflowCompletion,
  getFactValue
} = require("./WorkflowValidator");

function findStep(contract, stepId) {
  return contract.steps.find((step) => step.id === stepId) || null;
}

function computeCompletionPercent(contract, completedSteps) {
  if (!contract.steps.length) {
    return 0;
  }

  return Math.round((completedSteps.length / contract.steps.length) * 100);
}

function resolveCurrentStep(contract, collectedFacts, existingState = null) {
  const completion = validateWorkflowCompletion(contract, collectedFacts);

  if (completion.complete) {
    const lastStep = contract.steps[contract.steps.length - 1];
    return lastStep.id;
  }

  if (existingState?.currentStep) {
    const current = findStep(contract, existingState.currentStep);
    const currentValidation = validateStep(current?.requiredData || [], collectedFacts);

    if (current && !currentValidation.valid) {
      return existingState.currentStep;
    }
  }

  for (const step of contract.steps) {
    const result = validateStep(step.requiredData || [], collectedFacts);

    if (!result.valid) {
      return step.id;
    }
  }

  return contract.steps[0]?.id || null;
}

/**
 * @param {Object} context
 * @param {Object} memoryView
 * @param {Object} contract
 * @param {Object|null} existingState
 * @returns {Object}
 */
function navigate(context, memoryView, contract, existingState = null) {
  const collectedFacts = memoryView.collectedFacts || {};
  const completion = validateWorkflowCompletion(contract, collectedFacts);
  const currentStepId = resolveCurrentStep(contract, collectedFacts, existingState);
  const currentStep = findStep(contract, currentStepId);
  const currentValidation = validateStep(currentStep?.requiredData || [], collectedFacts);
  const nextStepId = completion.complete ? null : currentStep?.nextStep || null;
  const nextStep = nextStepId ? findStep(contract, nextStepId) : null;
  const completionPercent = computeCompletionPercent(contract, completion.completedSteps);
  const isComplete = completion.complete;
  const blocked = Boolean(existingState?.blocked);
  const blockingReason = existingState?.blockingReason || null;

  let recommendedAction = "Continue workflow intake.";

  if (isComplete) {
    recommendedAction = "Workflow complete. Future increment may invoke tools.";
  } else if (currentValidation.missingFields.length > 0) {
    recommendedAction = `Ask for ${currentValidation.missingFields[0]}.`;
  } else if (currentValidation.invalidFields.length > 0) {
    recommendedAction = `Clarify ${currentValidation.invalidFields[0]}.`;
  }

  return {
    workflowName: contract.name,
    currentStep: currentStepId,
    currentStepName: currentStep?.name || null,
    nextStep: nextStepId,
    nextStepName: nextStep?.name || null,
    completedSteps: completion.completedSteps,
    pendingSteps: completion.pendingSteps,
    missingInformation: currentValidation.missingFields,
    allMissingInformation: contract.requiredData.filter(
      (field) => !getFactValue(collectedFacts, field)
    ),
    blocked,
    blockingReason,
    completionPercent,
    currentObjective: isComplete
      ? contract.objective
      : currentStep?.objective || contract.objective,
    recommendedAction,
    isComplete,
    workflowConfidence: isComplete
      ? "high"
      : currentValidation.missingFields.length === 1
        ? "high"
        : "medium"
  };
}

/**
 * @param {Object} contract
 * @param {Object} navigation
 * @param {Object|null} previousState
 * @returns {Object}
 */
function buildNextState(conversationId, contract, navigation, previousState = null) {
  return {
    conversationId,
    workflowName: contract.name,
    currentStep: navigation.currentStep,
    completedSteps: navigation.completedSteps,
    pendingSteps: navigation.pendingSteps,
    missingInformation: navigation.missingInformation,
    blocked: navigation.blocked,
    blockingReason: navigation.blockingReason,
    completionPercent: navigation.completionPercent,
    currentObjective: navigation.currentObjective,
    updatedAt: new Date().toISOString(),
    previousStep: previousState?.currentStep || null
  };
}

module.exports = {
  navigate,
  buildNextState,
  computeCompletionPercent,
  resolveCurrentStep
};
