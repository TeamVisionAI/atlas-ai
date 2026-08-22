/**
 * BR-147 — Human-readable, non-trivial intake code generation.
 */

const crypto = require("crypto");
const { INTAKE_CODE_PURPOSE, PURPOSE_PREFIX } = require("./constants");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSuffix(length = 4) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

function normalizePurpose(purpose) {
  const token = String(purpose || "")
    .trim()
    .toUpperCase();
  if (Object.values(INTAKE_CODE_PURPOSE).includes(token)) {
    return token;
  }
  return INTAKE_CODE_PURPOSE.OTHER;
}

function buildIntakeCode({ purpose, createdAt = new Date() } = {}) {
  const resolvedPurpose = normalizePurpose(purpose);
  const prefix = PURPOSE_PREFIX[resolvedPurpose] || PURPOSE_PREFIX[INTAKE_CODE_PURPOSE.OTHER];
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(createdAt.getUTCDate()).padStart(2, "0");
  return `${prefix}-${month}${day}-${randomSuffix(4)}`;
}

function buildPrefilledMessage(code, language = null) {
  const lang = String(language || "")
    .trim()
    .toLowerCase();
  if (lang === "es" || lang === "spanish" || lang === "español") {
    return `¡Hola! Quiero más información. ${code}`;
  }
  return `Hello! Can I get more info on this? ${code}`;
}

module.exports = {
  buildIntakeCode,
  buildPrefilledMessage,
  normalizePurpose,
  randomSuffix
};
