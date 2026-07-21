/**
 * Journey #1 — JSON session store fallback.
 */

const fs = require("fs");
const path = require("path");
const jsonAtlasUserRepository = require("./jsonAtlasUserRepository");

const STORE_FILE = path.join(__dirname, "../data/atlasSessions.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { sessions: [] };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { sessions: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

async function createSession({ userId, token, expiresAt }) {
  const store = readStore();
  store.sessions = store.sessions.filter((entry) => entry.user_id !== userId);
  store.sessions.push({
    id: crypto.randomUUID(),
    user_id: userId,
    token,
    expires_at: expiresAt,
    created_at: new Date().toISOString()
  });
  writeStore(store);

  return { token, expires_at: expiresAt };
}

async function findUserByToken(token) {
  const store = readStore();
  const session = store.sessions.find((entry) => entry.token === token);

  if (!session) {
    return null;
  }

  if (session.expires_at && Date.parse(session.expires_at) < Date.now()) {
    return null;
  }

  return jsonAtlasUserRepository.findById(session.user_id);
}

module.exports = {
  createSession,
  findUserByToken
};
