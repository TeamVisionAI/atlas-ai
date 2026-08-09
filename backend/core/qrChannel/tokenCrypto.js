/**
 * Opaque QR campaign token crypto (BR-128).
 * Store SHA-256 hex only. Never persist plaintext.
 */

const crypto = require("crypto");

function generatePublicToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashPublicToken(token) {
  const normalized = String(token || "").trim();
  if (!normalized) {
    return null;
  }
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

function tokenPrefix(token, length = 8) {
  const t = String(token || "");
  return t.slice(0, Math.min(length, t.length));
}

function isPlausiblePublicToken(token) {
  const t = String(token || "").trim();
  // base64url of 32 bytes ≈ 43 chars; allow 20–64
  return /^[A-Za-z0-9_-]{20,64}$/.test(t);
}

function createBindMac(scanId, expiresAtIso, secret) {
  const key = String(secret || "").trim();
  if (!key) {
    throw new Error("QR_CHANNEL_BIND_SECRET unavailable");
  }
  return crypto
    .createHmac("sha256", key)
    .update(`${scanId}.${expiresAtIso}`)
    .digest("hex");
}

function verifyBindMac(scanId, expiresAtIso, mac, secret) {
  try {
    const expected = createBindMac(scanId, expiresAtIso, secret);
    const a = Buffer.from(String(mac || ""), "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function resolveBindSecret(env = process.env) {
  return (
    String(env.QR_CHANNEL_BIND_SECRET || "").trim() ||
    String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim() ||
    String(env.JWT_SECRET || "").trim() ||
    "atlas-qr-channel-dev-only"
  );
}

module.exports = {
  generatePublicToken,
  hashPublicToken,
  tokenPrefix,
  isPlausiblePublicToken,
  createBindMac,
  verifyBindMac,
  resolveBindSecret
};
