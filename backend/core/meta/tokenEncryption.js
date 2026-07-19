/**
 * Sprint 6.1 — Token encryption abstraction for Meta access tokens at rest.
 *
 * Production: set META_TOKEN_ENCRYPTION_KEY (32+ byte secret or 64-char hex).
 * Development: falls back to key derived from META_APP_SECRET when encryption key is unset.
 */

const crypto = require("crypto");

const ENCRYPTION_VERSION = "v1";
const PLAIN_PREFIX = `plain:${ENCRYPTION_VERSION}:`;

function resolveEncryptionKey() {
  const explicitKey = process.env.META_TOKEN_ENCRYPTION_KEY;

  if (explicitKey) {
    if (/^[0-9a-fA-F]{64}$/.test(explicitKey)) {
      return Buffer.from(explicitKey, "hex");
    }

    return crypto.createHash("sha256").update(explicitKey).digest();
  }

  const appSecret = process.env.META_APP_SECRET;

  if (appSecret) {
    return crypto.createHash("sha256").update(`atlas-dev:${appSecret}`).digest();
  }

  return null;
}

function createTokenEncryption(options = {}) {
  const key = options.key || resolveEncryptionKey();
  let warnedPlaintext = false;

  function warnPlaintextOnce() {
    if (!warnedPlaintext) {
      warnedPlaintext = true;
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          component: "meta_onboarding",
          stage: "token_encryption_plaintext_fallback",
          level: "warn",
          message:
            "META_TOKEN_ENCRYPTION_KEY not set — using plaintext token storage fallback (development only)."
        })
      );
    }
  }

  function encrypt(plaintext) {
    if (!plaintext) {
      return null;
    }

    if (!key) {
      warnPlaintextOnce();
      return `${PLAIN_PREFIX}${plaintext}`;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      "enc",
      ENCRYPTION_VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url")
    ].join(":");
  }

  function decrypt(storedValue) {
    if (!storedValue) {
      return null;
    }

    if (String(storedValue).startsWith(PLAIN_PREFIX)) {
      return String(storedValue).slice(PLAIN_PREFIX.length);
    }

    if (!String(storedValue).startsWith(`enc:${ENCRYPTION_VERSION}:`)) {
      throw new Error("Unsupported encrypted token format.");
    }

    if (!key) {
      throw new Error("Encrypted token present but META_TOKEN_ENCRYPTION_KEY is not configured.");
    }

    const [, , ivEncoded, tagEncoded, dataEncoded] = String(storedValue).split(":");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivEncoded, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataEncoded, "base64url")),
      decipher.final()
    ]);

    return decrypted.toString("utf8");
  }

  function isEncrypted(storedValue) {
    return Boolean(storedValue && String(storedValue).startsWith(`enc:${ENCRYPTION_VERSION}:`));
  }

  return {
    encrypt,
    decrypt,
    isEncrypted,
    hasEncryptionKey: Boolean(key)
  };
}

module.exports = {
  createTokenEncryption,
  ENCRYPTION_VERSION
};
