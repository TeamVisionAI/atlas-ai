/**
 * AES-256-GCM encryption for QR campaign public tokens (Campaign Manager Phase A).
 * Lookup remains SHA-256 hash only. Ciphertext is for authorized re-download / copy-link.
 *
 * Env: QR_CHANNEL_TOKEN_ENCRYPTION_KEY — 32-byte key as base64 or 64-char hex.
 * Never derive from JWT_SECRET / SUPABASE_SERVICE_ROLE_KEY.
 */

const crypto = require("crypto");

const ENV_KEY = "QR_CHANNEL_TOKEN_ENCRYPTION_KEY";
const VERSION_PREFIX = "v1.";

function resolveEncryptionKeyBuffer(env = process.env) {
  const raw = String(env[ENV_KEY] || "").trim();
  if (!raw) {
    return null;
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) {
      return buf;
    }
  } catch {
    // fall through
  }

  return null;
}

function isTokenEncryptionConfigured(env = process.env) {
  return Boolean(resolveEncryptionKeyBuffer(env));
}

/**
 * @returns {string} v1.<base64url(iv|tag|ciphertext)>
 */
function encryptPublicToken(plaintext, env = process.env) {
  const key = resolveEncryptionKeyBuffer(env);
  if (!key) {
    const err = new Error("QR_CHANNEL_TOKEN_ENCRYPTION_KEY missing or invalid");
    err.code = "ENCRYPTION_KEY_UNAVAILABLE";
    throw err;
  }

  const token = String(plaintext || "").trim();
  if (!token) {
    const err = new Error("Cannot encrypt empty token");
    err.code = "TOKEN_EMPTY";
    throw err;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]).toString("base64url");
  return `${VERSION_PREFIX}${packed}`;
}

function decryptPublicToken(encrypted, env = process.env) {
  const key = resolveEncryptionKeyBuffer(env);
  if (!key) {
    const err = new Error("QR_CHANNEL_TOKEN_ENCRYPTION_KEY missing or invalid");
    err.code = "ENCRYPTION_KEY_UNAVAILABLE";
    throw err;
  }

  const raw = String(encrypted || "").trim();
  if (!raw.startsWith(VERSION_PREFIX)) {
    const err = new Error("Unsupported encrypted token format");
    err.code = "ENCRYPTION_FORMAT_INVALID";
    throw err;
  }

  const packed = Buffer.from(raw.slice(VERSION_PREFIX.length), "base64url");
  if (packed.length < 12 + 16 + 1) {
    const err = new Error("Encrypted token payload too short");
    err.code = "ENCRYPTION_FORMAT_INVALID";
    throw err;
  }

  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString("utf8");
  return plaintext;
}

module.exports = {
  ENV_KEY,
  isTokenEncryptionConfigured,
  encryptPublicToken,
  decryptPublicToken,
  resolveEncryptionKeyBuffer
};
