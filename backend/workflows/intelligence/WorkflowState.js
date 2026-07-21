/**
 * Journey #5 Increment 2 — Agent workflow state persistence.
 */

const fs = require("fs");
const path = require("path");
const { GENERIC_INTAKE_WORKFLOW } = require("./WorkflowContracts");

const STORE_FILE = path.join(__dirname, "../../data/agentWorkflowState.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { states: {} };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { states: {} };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function createInitialState(conversationId, workflowName, contract) {
  const pendingSteps = contract.steps.map((step) => step.id);

  return {
    conversationId,
    workflowName,
    currentStep: contract.steps[0]?.id || null,
    completedSteps: [],
    pendingSteps,
    missingInformation: contract.steps[0]?.requiredData || [],
    blocked: false,
    blockingReason: null,
    completionPercent: 0,
    currentObjective: contract.steps[0]?.objective || contract.objective,
    updatedAt: new Date().toISOString()
  };
}

function normalizeState(record) {
  return {
    conversationId: record.conversationId,
    workflowName: record.workflowName,
    currentStep: record.currentStep,
    completedSteps: Array.isArray(record.completedSteps) ? record.completedSteps : [],
    pendingSteps: Array.isArray(record.pendingSteps) ? record.pendingSteps : [],
    missingInformation: Array.isArray(record.missingInformation)
      ? record.missingInformation
      : [],
    blocked: Boolean(record.blocked),
    blockingReason: record.blockingReason || null,
    completionPercent: record.completionPercent || 0,
    currentObjective: record.currentObjective || null,
    updatedAt: record.updatedAt || new Date().toISOString()
  };
}

async function getState(conversationId) {
  const state = readStore().states[conversationId];
  return state ? normalizeState(state) : null;
}

async function saveState(state) {
  const store = readStore();
  store.states[state.conversationId] = normalizeState({
    ...state,
    updatedAt: new Date().toISOString()
  });
  writeStore(store);
  return store.states[state.conversationId];
}

async function getOrCreateState(conversationId, workflowName, contract) {
  const existing = await getState(conversationId);

  if (existing && existing.workflowName === workflowName) {
    return existing;
  }

  const initial = createInitialState(conversationId, workflowName, contract);
  return saveState(initial);
}

function clearStore() {
  writeStore({ states: {} });
}

module.exports = {
  createInitialState,
  getState,
  saveState,
  getOrCreateState,
  clearStore,
  GENERIC_INTAKE_WORKFLOW
};
