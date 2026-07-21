/**
 * Journey #5 Increment 1 — Agent persistence (JSON file).
 */

const fs = require("fs");
const path = require("path");

const STORE_FILE = path.join(__dirname, "../data/agentStore.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return {
        conversations: [],
        memories: {},
        decisions: [],
        responses: []
      };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {
      conversations: [],
      memories: {},
      decisions: [],
      responses: []
    };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function normalizeConversation(record) {
  return {
    id: record.id,
    organizationId: record.organizationId || null,
    prospectId: record.prospectId || null,
    prospectName: record.prospectName || "Prospect",
    channel: record.channel || "unknown",
    ownership: record.ownership || "ATLAS",
    workflowSnapshot: record.workflowSnapshot || null,
    organizationSnapshot: record.organizationSnapshot || null,
    meetingStateSnapshot: record.meetingStateSnapshot || null,
    language: record.language || "en",
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString()
  };
}

function defaultMemory(conversationId) {
  return {
    conversationId,
    history: [],
    collectedFacts: {},
    summary: "",
    pendingTasks: [],
    completedTasks: [],
    preferences: {},
    sentiment: "neutral",
    confidence: "medium"
  };
}

function normalizeMemory(record) {
  return {
    conversationId: record.conversationId,
    history: Array.isArray(record.history) ? record.history : [],
    collectedFacts: record.collectedFacts || {},
    summary: record.summary || "",
    pendingTasks: Array.isArray(record.pendingTasks) ? record.pendingTasks : [],
    completedTasks: Array.isArray(record.completedTasks) ? record.completedTasks : [],
    preferences: record.preferences || {},
    sentiment: record.sentiment || "neutral",
    confidence: record.confidence || "medium"
  };
}

async function getConversation(conversationId) {
  const store = readStore();
  const conversation = store.conversations.find((entry) => entry.id === conversationId);
  return conversation ? normalizeConversation(conversation) : null;
}

async function findConversationByProspect(prospectId, organizationId = null) {
  const store = readStore();
  const conversation = store.conversations.find(
    (entry) =>
      entry.prospectId === prospectId &&
      (organizationId ? entry.organizationId === organizationId : true)
  );
  return conversation ? normalizeConversation(conversation) : null;
}

async function saveConversation(conversation) {
  const store = readStore();
  const normalized = normalizeConversation({
    ...conversation,
    updatedAt: new Date().toISOString()
  });
  const index = store.conversations.findIndex((entry) => entry.id === normalized.id);

  if (index === -1) {
    store.conversations.push(normalized);
  } else {
    store.conversations[index] = normalized;
  }

  writeStore(store);
  return normalized;
}

async function getMemory(conversationId) {
  const store = readStore();
  const memory = store.memories[conversationId];
  return memory ? normalizeMemory(memory) : defaultMemory(conversationId);
}

async function saveMemory(conversationId, memory) {
  const store = readStore();
  store.memories[conversationId] = normalizeMemory({
    ...defaultMemory(conversationId),
    ...memory,
    conversationId
  });
  writeStore(store);
  return store.memories[conversationId];
}

async function appendMessage(conversationId, message) {
  const memory = await getMemory(conversationId);
  memory.history.push({
    id: message.id || crypto.randomUUID(),
    role: message.role,
    text: message.text,
    timestamp: message.timestamp || new Date().toISOString(),
    messageId: message.messageId || null
  });
  memory.history = memory.history.slice(-100);
  return saveMemory(conversationId, memory);
}

async function saveDecision(decision) {
  const store = readStore();
  store.decisions.push(decision);
  store.decisions = store.decisions.slice(-500);
  writeStore(store);
  return decision;
}

async function saveResponse(response) {
  const store = readStore();
  store.responses.push(response);
  store.responses = store.responses.slice(-500);
  writeStore(store);
  return response;
}

async function listDecisions(conversationId) {
  return readStore().decisions.filter((entry) => entry.conversationId === conversationId);
}

async function listResponses(conversationId) {
  return readStore().responses.filter((entry) => entry.conversationId === conversationId);
}

function clearStore() {
  writeStore({
    conversations: [],
    memories: {},
    decisions: [],
    responses: []
  });
}

module.exports = {
  getConversation,
  findConversationByProspect,
  saveConversation,
  getMemory,
  saveMemory,
  appendMessage,
  saveDecision,
  saveResponse,
  listDecisions,
  listResponses,
  clearStore,
  defaultMemory
};
