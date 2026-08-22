/**
 * BR-147 — Exact-boundary intake token extraction and stripping.
 */

const { INTAKE_CODE_PATTERN } = require("./constants");

function extractCampaignIntakeToken(messageBody) {
  const text = String(messageBody || "");
  const match = text.match(INTAKE_CODE_PATTERN);
  if (!match) {
    return null;
  }
  return String(match[1]).toUpperCase();
}

function stripCampaignIntakeToken(messageBody, token = null) {
  const text = String(messageBody || "");
  const resolved = token
    ? String(token).toUpperCase()
    : extractCampaignIntakeToken(text);
  if (!resolved) {
    return text.trim();
  }
  const pattern = new RegExp(
    `\\s*${resolved.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
    "gi"
  );
  return text.replace(pattern, " ").replace(/\s+/g, " ").trim();
}

module.exports = {
  extractCampaignIntakeToken,
  stripCampaignIntakeToken
};
