/**
 * Recruit AI v2 — resolve prospect email for knownFacts hydration (BR-117).
 * Reuses canonical extractors; does not invent a second contact model.
 *
 * Email is invitation/attendee enrichment — not required for appointment booking.
 */

const { extractEmailFromNotes } = require("../informationModel");
const { normalizeEmail, validateEmailFormat } = require("../emailNormalization");

/**
 * Canonical email for a prospect, if any trusted structured/notes token exists.
 * Preference: prospect.email column → notes EMAIL: token.
 * Returns normalized address or null.
 */
function resolveCanonicalProspectEmail(prospect = {}) {
  const candidates = [
    prospect.email,
    prospect.secondary_email,
    extractEmailFromNotes(prospect.notes)
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const normalized = normalizeEmail(String(candidate));
    if (normalized && validateEmailFormat(normalized)) {
      return normalized;
    }
  }

  return null;
}

module.exports = {
  resolveCanonicalProspectEmail
};
