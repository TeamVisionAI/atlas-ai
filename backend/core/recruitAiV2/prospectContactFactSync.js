/**
 * Recruit AI v2 — explicit contact fact extraction + prospect persistence.
 * Email: explicit syntactic match only (never inferred).
 */

const { normalizeEmail, validateEmailFormat } = require("../emailNormalization");
const { mergeNotesWithQualificationCapture, parseQualificationCapture, markCapturedFields } = require("../qualificationCaptureState");
const { FACT_SYNC_DIAGNOSTICS } = require("./factCertainty");

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function extractExplicitEmailFromText(text) {
  const match = String(text || "").match(EMAIL_PATTERN);
  if (!match) {
    return null;
  }
  const normalized = normalizeEmail(match[0]);
  return validateEmailFormat(normalized) ? normalized : null;
}

function buildEmailNotesPatch(prospect, email) {
  const captureState = markCapturedFields(parseQualificationCapture(prospect?.notes), {
    email: true
  });
  const baseNotes = mergeNotesWithQualificationCapture(prospect?.notes, captureState);
  const token = `EMAIL:${email}`;
  if (String(baseNotes || "").includes(token)) {
    return {};
  }
  const notes = baseNotes ? `${baseNotes} | ${token}` : token;
  return { notes };
}

/**
 * Persist explicit prospect-supplied email to canonical prospect columns + notes marker.
 */
async function synchronizeExplicitEmailFromInbound({
  messageText = "",
  prospect = null,
  organizationId = null,
  updateProspectFn = null
} = {}) {
  const email = extractExplicitEmailFromText(messageText);
  if (!email || !prospect?.phone || typeof updateProspectFn !== "function") {
    return {
      ok: false,
      attempted: false,
      diagnostics: email ? [FACT_SYNC_DIAGNOSTICS.SYNC_FAILED] : []
    };
  }

  const existing = normalizeEmail(prospect.email);
  if (existing && existing === email) {
    return { ok: true, attempted: false, email, diagnostics: [FACT_SYNC_DIAGNOSTICS.PERSISTED] };
  }
  if (existing && existing !== email) {
    return {
      ok: false,
      attempted: false,
      email,
      diagnostics: [FACT_SYNC_DIAGNOSTICS.OVERWRITE_BLOCKED]
    };
  }

  const patch = {
    email,
    ...buildEmailNotesPatch(prospect, email)
  };

  try {
    await updateProspectFn(prospect.phone, patch);
    return {
      ok: true,
      attempted: true,
      email,
      patch,
      diagnostics: [FACT_SYNC_DIAGNOSTICS.EXTRACTED, FACT_SYNC_DIAGNOSTICS.PERSISTED]
    };
  } catch (error) {
    return {
      ok: false,
      attempted: true,
      email,
      error,
      diagnostics: [FACT_SYNC_DIAGNOSTICS.EXTRACTED, FACT_SYNC_DIAGNOSTICS.SYNC_FAILED]
    };
  }
}

module.exports = {
  extractExplicitEmailFromText,
  synchronizeExplicitEmailFromInbound,
  buildEmailNotesPatch
};
