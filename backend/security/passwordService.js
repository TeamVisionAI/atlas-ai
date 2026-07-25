/**
 * LC1 / Sprint 16.9 — Password hashing (scrypt + bcrypt).
 */

const crypto = require("crypto");
const bcrypt = require("bcrypt");

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

const KEY_LENGTH = 64;
const BCRYPT_ROUNDS = 12;

function hashPassword(plainText, { algorithm = "bcrypt" } = {}) {
  const password = String(plainText || "");

  if (password.length < 8) {
    const error = new Error("Password must be at least 8 characters.");
    error.statusCode = 400;
    throw error;
  }

  if (algorithm === "scrypt") {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS).toString("hex");
    return `scrypt$${salt}$${derived}`;
  }

  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function verifyPassword(plainText, storedHash) {
  if (!storedHash || !plainText) {
    return false;
  }

  const hash = String(storedHash);

  if (hash.startsWith("scrypt$")) {
    const parts = hash.split("$");

    if (parts.length !== 3) {
      return false;
    }

    const [, salt, expectedHex] = parts;
    const derived = crypto.scryptSync(String(plainText), salt, KEY_LENGTH, SCRYPT_PARAMS);
    const expected = Buffer.from(expectedHex, "hex");

    if (expected.length !== derived.length) {
      return false;
    }

    return crypto.timingSafeEqual(expected, derived);
  }

  return bcrypt.compareSync(String(plainText), hash);
}

module.exports = {
  hashPassword,
  verifyPassword
};
