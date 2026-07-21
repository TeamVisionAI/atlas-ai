/**
 * Release 1.4 — Live operational state container.
 */

function createEmptyMissionState(organizationId) {
  return {
    organizationId,
    updatedAt: new Date().toISOString(),
    activeConversations: {},
    waitingCustomers: [],
    runningWorkflows: {},
    appointmentsToday: 0,
    meetingsToday: {
      scheduled: 0,
      running: 0,
      completed: 0
    },
    pendingFollowUps: 0,
    licensingPipeline: {
      started: 0,
      completed: 0
    },
    orientationPipeline: {
      completed: 0
    },
    fastStartProgress: {
      completed: 0
    },
    packageActivity: {},
    organizationActivity: {
      lastEventAt: null,
      lastEventType: null
    },
    connectorStatus: {},
    agentStatus: {
      available: true,
      lastActivityAt: null
    },
    packages: [],
    activeUsers: [],
    pendingTasks: 0,
    workflowFailures: 0,
    responseSamples: [],
    eventTimestamps: []
  };
}

function touchState(state, eventType) {
  state.updatedAt = new Date().toISOString();
  state.organizationActivity = {
    lastEventAt: state.updatedAt,
    lastEventType: eventType
  };
  state.eventTimestamps.unshift(state.updatedAt);
  state.eventTimestamps = state.eventTimestamps.slice(0, 120);
  return state;
}

function upsertConversation(state, conversationId, patch = {}) {
  state.activeConversations[conversationId] = {
    ...(state.activeConversations[conversationId] || {}),
    conversationId,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  if (patch.waiting) {
    if (!state.waitingCustomers.includes(conversationId)) {
      state.waitingCustomers.push(conversationId);
    }
  } else {
    state.waitingCustomers = state.waitingCustomers.filter((id) => id !== conversationId);
  }

  return state.activeConversations[conversationId];
}

function closeConversation(state, conversationId) {
  delete state.activeConversations[conversationId];
  state.waitingCustomers = state.waitingCustomers.filter((id) => id !== conversationId);
}

function upsertWorkflow(state, workflowId, patch = {}) {
  state.runningWorkflows[workflowId] = {
    ...(state.runningWorkflows[workflowId] || {}),
    workflowId,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  return state.runningWorkflows[workflowId];
}

function completeWorkflow(state, workflowId) {
  delete state.runningWorkflows[workflowId];
}

function setConnectorStatus(state, connectorId, status) {
  state.connectorStatus[connectorId] = {
    connectorId,
    ...status,
    updatedAt: new Date().toISOString()
  };
}

function trackPackageActivity(state, packageId, eventName) {
  if (!state.packageActivity[packageId]) {
    state.packageActivity[packageId] = { events: 0, lastEvent: null };
  }

  state.packageActivity[packageId].events += 1;
  state.packageActivity[packageId].lastEvent = eventName;
}

function recordResponseSample(state, latencyMs) {
  state.responseSamples.unshift(latencyMs);
  state.responseSamples = state.responseSamples.slice(0, 100);
}

module.exports = {
  createEmptyMissionState,
  touchState,
  upsertConversation,
  closeConversation,
  upsertWorkflow,
  completeWorkflow,
  setConnectorStatus,
  trackPackageActivity,
  recordResponseSample
};
