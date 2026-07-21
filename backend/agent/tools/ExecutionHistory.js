/**
 * Journey #5 Increment 3 — Persist tool execution audit trail.
 */

const fs = require("fs");
const path = require("path");

const STORE_FILE = path.join(__dirname, "../../data/toolExecutionHistory.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { executions: [] };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { executions: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

/**
 * @param {Object} entry
 * @returns {Object}
 */
async function saveExecution(entry) {
  const store = readStore();
  const record = {
    id: entry.id || crypto.randomUUID(),
    request: entry.request,
    result: entry.result,
    status: entry.result?.status || "failure",
    durationMs: entry.result?.executionTimeMs || 0,
    timestamp: entry.timestamp || new Date().toISOString()
  };

  store.executions.unshift(record);
  store.executions = store.executions.slice(0, 500);
  writeStore(store);
  return record;
}

async function listExecutions(filter = {}) {
  let executions = readStore().executions;

  if (filter.conversationId) {
    executions = executions.filter(
      (entry) => entry.request?.conversationId === filter.conversationId
    );
  }

  if (filter.correlationId) {
    executions = executions.filter(
      (entry) => entry.request?.correlationId === filter.correlationId
    );
  }

  return executions;
}

function clearHistory() {
  writeStore({ executions: [] });
}

module.exports = {
  saveExecution,
  listExecutions,
  clearHistory
};
