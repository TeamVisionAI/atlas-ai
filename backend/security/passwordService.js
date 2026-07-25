/**
 * LC1 — Password hashing (Node crypto scrypt).
 */

const crypto = require("crypto");

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

const KEY_LENGTH = 64;

function hashPassword(plainText) {
  const password = String(plainText || "");

  if (password.length < 8) {
    const error = new Error("Password must be at least 8 characters.");
    error.statusCode = 400;
    throw error;
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS).toString("hex");

  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(plainText, storedHash) {
  if (!storedHash || !plainText) {
    return false;
  }

  const parts = String(storedHash).split("$");

  if (parts.length !== 3 || parts[0] !== "scrypt") {
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

module.exports = {
  hashPassword,
  verifyPassword
};
