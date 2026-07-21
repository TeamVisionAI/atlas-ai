/**
 * Journey #1 — JSON file user store (development fallback when Supabase tables are unavailable).
 */

const fs = require("fs");
const path = require("path");

const STORE_FILE = path.join(__dirname, "../data/atlasUsers.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { users: [] };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { users: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function normalizeUser(record) {
  return {
    id: record.id,
    email: record.email,
    first_name: record.first_name || null,
    last_name: record.last_name || null,
    display_name: record.display_name || record.email,
    password_hash: record.password_hash || null,
    auth_provider: record.auth_provider || "email",
    created_at: record.created_at || new Date().toISOString()
  };
}

async function findByEmail(email) {
  const store = readStore();
  const user = store.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase());
  return user ? normalizeUser(user) : null;
}

async function findById(userId) {
  const store = readStore();
  const user = store.users.find((entry) => entry.id === userId);
  return user ? normalizeUser(user) : null;
}

async function createUser(record) {
  const store = readStore();
  const user = normalizeUser({
    ...record,
    created_at: new Date().toISOString()
  });

  store.users.push(user);
  writeStore(store);
  return user;
}

module.exports = {
  findByEmail,
  findById,
  createUser
};
