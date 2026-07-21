/**
 * Journey #1 — Password hashing (Node crypto, no extra dependencies).
 */

const crypto = require("crypto");

const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !String(password)) {
    return false;
  }

  const [salt, hash] = String(storedHash).split(":");

  if (!salt || !hash) {
    return false;
  }

  const candidate = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword
};
