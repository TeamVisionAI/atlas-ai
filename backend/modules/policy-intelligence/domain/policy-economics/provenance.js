/**
 * Source provenance for policy-cost and rider fields (BR-144).
 */

const crypto = require("crypto");

const DEFAULT_EXTRACTOR_ID = "policy-economics-v1";

function hashSource(text) {
  const body = String(text || "").trim();
  if (!body) {
    return null;
  }
  return crypto.createHash("sha256").update(body).digest("hex");
}

function snippetFrom(text, maxLength = 180) {
  const body = String(text || "").replace(/\s+/g, " ").trim();
  if (!body) {
    return null;
  }
  return body.length <= maxLength ? body : `${body.slice(0, maxLength - 1)}…`;
}

function createProvenance({
  sourcePage = null,
  section = null,
  table = null,
  formNumber = null,
  formVersion = null,
  sourceSnippet = null,
  sourceText = null,
  adapterKey = null,
  extractorId = DEFAULT_EXTRACTOR_ID,
  classification = null,
  nullReason = null
} = {}) {
  const snippet = sourceSnippet || snippetFrom(sourceText);
  return Object.freeze({
    sourcePage: sourcePage == null ? null : Number(sourcePage),
    section: section || null,
    table: table || null,
    formNumber: formNumber || null,
    formVersion: formVersion || null,
    sourceSnippet: snippet,
    sourceHash: hashSource(sourceText || snippet),
    adapterKey: adapterKey || null,
    extractorId: extractorId || DEFAULT_EXTRACTOR_ID,
    classification: classification || null,
    nullReason: nullReason || null,
    invented: false,
    interpolated: false
  });
}

module.exports = {
  DEFAULT_EXTRACTOR_ID,
  hashSource,
  snippetFrom,
  createProvenance
};
