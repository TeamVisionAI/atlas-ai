/**
 * Release 1.2 — Organization user management models.
 */

const crypto = require("crypto");
const { getRole } = require("./OrganizationRoles");

function createUser(input = {}) {
  if (!input.name || !input.email) {
    throw new Error("Organization user requires name and email");
  }

  const role = getRole(input.role || "viewer");

  if (!role) {
    throw new Error(`Unknown role: ${input.role}`);
  }

  return {
    id: input.id || crypto.randomUUID(),
    name: input.name,
    email: input.email.toLowerCase(),
    role: role.id,
    officeId: input.officeId || null,
    language: input.language || null,
    status: input.status || "active",
    permissions: input.permissions || [...role.permissions],
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function addUser(users = [], userInput) {
  return [...users, createUser(userInput)];
}

function updateUser(users = [], userId, patch = {}) {
  return users.map((user) => (user.id === userId ? { ...user, ...patch } : user));
}

function findUserByEmail(users = [], email) {
  return users.find((user) => user.email === String(email || "").toLowerCase()) || null;
}

module.exports = {
  createUser,
  addUser,
  updateUser,
  findUserByEmail
};
