/**
 * Journey #5 Increment 4 — Session and summary persistence.
 */

const fs = require("fs");
const path = require("path");
const { CONVERSATION_STATUS } = require("./ConversationState");

const STORE_FILE = path.join(__dirname, "../../data/conversationSessions.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { sessions: {}, summaries: [] };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { sessions: {}, summaries: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function normalizeSession(record) {
  return {
    conversationId: record.conversationId,
    prospectId: record.prospectId,
    organizationId: record.organizationId || null,
    workflowName: record.workflowName,
    currentStep: record.currentStep || null,
    currentObjective: record.currentObjective || null,
    collectedFacts: record.collectedFacts || {},
    pendingQuestions: Array.isArray(record.pendingQuestions) ? record.pendingQuestions : [],
    completedActions: Array.isArray(record.completedActions) ? record.completedActions : [],
    toolExecutions: Array.isArray(record.toolExecutions) ? record.toolExecutions : [],
    status: record.status || CONVERSATION_STATUS.STARTED,
    outcome: record.outcome || null,
    escalations: Array.isArray(record.escalations) ? record.escalations : [],
    openTasks: Array.isArray(record.openTasks) ? record.openTasks : [],
    lastActivityAt: record.lastActivityAt || new Date().toISOString(),
    startedAt: record.startedAt || new Date().toISOString(),
    completedAt: record.completedAt || null,
    closedAt: record.closedAt || null
  };
}

async function getSession(conversationId) {
  const session = readStore().sessions[conversationId];
  return session ? normalizeSession(session) : null;
}

async function findActiveSessionByProspect(prospectId, organizationId = null) {
  const sessions = Object.values(readStore().sessions);

  return (
    sessions
      .map(normalizeSession)
      .find(
        (entry) =>
          entry.prospectId === prospectId &&
          (organizationId ? entry.organizationId === organizationId : true) &&
          entry.status !== CONVERSATION_STATUS.CLOSED
      ) || null
  );
}

async function saveSession(session) {
  const store = readStore();
  store.sessions[session.conversationId] = normalizeSession(session);
  writeStore(store);
  return store.sessions[session.conversationId];
}

async function saveSummary(summary) {
  const store = readStore();
  store.summaries.unshift({
    id: summary.id || crypto.randomUUID(),
    ...summary,
    summaryTimestamp: summary.summaryTimestamp || new Date().toISOString()
  });
  store.summaries = store.summaries.slice(0, 200);
  writeStore(store);
  return store.summaries[0];
}

async function getSummary(conversationId) {
  return readStore().summaries.find((entry) => entry.conversationId === conversationId) || null;
}

async function listSummaries(conversationId) {
  return readStore().summaries.filter((entry) => entry.conversationId === conversationId);
}

function clearStore() {
  writeStore({ sessions: {}, summaries: [] });
}

module.exports = {
  getSession,
  findActiveSessionByProspect,
  saveSession,
  saveSummary,
  getSummary,
  listSummaries,
  clearStore
};
