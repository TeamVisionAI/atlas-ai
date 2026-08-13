/**
 * Sprint 10.2 / 10.1.1 — Prospect profile reads and updates from workspace.
 * Implements BR-038 — Prospect Workspace is the canonical profile maintenance surface.
 */

const { findProspect, updateProspect } = require("../services/supabaseService");
const { COMMUNICATION_LANGUAGES } = require("./quickCaptureConstants");
const { isProductionProspect } = require("./productionProspectFilter");
const { extractEmailFromNotes } = require("./informationModel");
const {
  normalizePreferredLanguage,
  resolveProspectPreferredLanguage,
  syncProspectLanguageFields
} = require("./prospectLanguage");

const UI_INTERVIEW_TYPE_TO_BACKEND = Object.freeze({
  office: "In Person",
  zoom: "Zoom",
  public_location: "Public Location"
});

const BACKEND_INTERVIEW_TYPE_TO_UI = Object.freeze({
  "in person": "office",
  zoom: "zoom",
  "public location": "public_location"
});

function sanitizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function mapBackendInterviewTypeToUi(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return BACKEND_INTERVIEW_TYPE_TO_UI[normalized] || "";
}

function mapUiInterviewTypeToBackend(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (UI_INTERVIEW_TYPE_TO_BACKEND[normalized]) {
    return UI_INTERVIEW_TYPE_TO_BACKEND[normalized];
  }

  if (normalized.includes("zoom") || normalized.includes("virtual")) {
    return "Zoom";
  }

  if (normalized.includes("public")) {
    return "Public Location";
  }

  if (normalized.includes("office") || normalized.includes("person")) {
    return "In Person";
  }

  return sanitizeText(value);
}

function normalizeWorkAuthorization(value) {
  if (value === true || value === false) {
    return value;
  }

  const text = String(value || "")
    .trim()
    .toLowerCase();

  if (!text) {
    return null;
  }

  if (["yes", "true", "authorized", "work_permit", "work permit", "citizen", "green card"].includes(text)) {
    return true;
  }

  if (["no", "false", "not authorized", "not_authorized", "unauthorized"].includes(text)) {
    return false;
  }

  return null;
}

function mapWorkAuthorizationToForm(prospect = {}) {
  if (prospect.work_authorized === true) {
    return "work_permit";
  }

  if (prospect.work_authorized === false) {
    return "no";
  }

  return "";
}

function extractInternalNotes(notes) {
  let remainder = String(notes || "");
  remainder = remainder.replace(/\|?EMAIL:[^|]*/gi, "");
  remainder = remainder.replace(/\|?QUAL_CAPTURE:{[\s\S]*?}(?:\||$)/, "");
  remainder = remainder.replace(/\|?SCHEDULING:{[\s\S]*?}(?:\||$)/, "");
  remainder = remainder.replace(/\|?DAY_PART:[^|]*/gi, "");
  return remainder.replace(/^\|+|\|+$/g, "").replace(/\|+/g, " ").trim();
}

function extractStructuredNoteSegments(notes) {
  const source = String(notes || "");
  return {
    qualCapture: source.match(/\|?QUAL_CAPTURE:{[\s\S]*?}(?:\||$)/)?.[0]?.replace(/\|$/, "") || null,
    scheduling: source.match(/\|?SCHEDULING:{[\s\S]*?}(?:\||$)/)?.[0]?.replace(/\|$/, "") || null,
    dayPart: source.match(/\|?DAY_PART:[^|]*/i)?.[0]?.replace(/\|$/, "") || null,
    email: source.match(/\|?EMAIL:([^|]+)/i)?.[1]?.trim() || null
  };
}

function rebuildProspectNotes(existingNotes, { email, internalNotes }) {
  const structured = extractStructuredNoteSegments(existingNotes);
  const parts = [];

  if (structured.qualCapture) {
    parts.push(structured.qualCapture);
  }

  if (structured.scheduling) {
    parts.push(structured.scheduling);
  }

  if (structured.dayPart) {
    parts.push(structured.dayPart);
  }

  const nextEmail = email !== undefined ? sanitizeText(email) : structured.email;

  if (nextEmail) {
    parts.push(`EMAIL:${nextEmail}`);
  }

  const nextInternal =
    internalNotes !== undefined ? sanitizeText(internalNotes) : extractInternalNotes(existingNotes);

  if (nextInternal) {
    parts.push(nextInternal);
  }

  return parts.length ? parts.join("|") : null;
}

function buildProspectEditorProfile(prospect) {
  if (!prospect) {
    return null;
  }

  return {
    first_name: prospect.first_name || "",
    last_name: prospect.last_name || "",
    phone: prospect.phone || "",
    email: extractEmailFromNotes(prospect.notes) || "",
    preferred_language: resolveProspectPreferredLanguage(prospect),
    city: prospect.city || "",
    state: prospect.state || "",
    work_authorization_status: mapWorkAuthorizationToForm(prospect),
    source: prospect.source || "",
    interview_type: mapBackendInterviewTypeToUi(prospect.interview_type),
    internal_notes: extractInternalNotes(prospect.notes)
  };
}

function normalizeProfileInput(input = {}) {
  const fields = {};
  const errors = {};

  if (input.first_name !== undefined) {
    fields.first_name = sanitizeText(input.first_name);
  }

  if (input.last_name !== undefined) {
    fields.last_name = sanitizeText(input.last_name);
  }

  if (input.displayName !== undefined || input.display_name !== undefined || input.name !== undefined) {
    fields.displayName = sanitizeText(input.displayName ?? input.display_name ?? input.name);
  }

  if (input.email !== undefined) {
    const email = sanitizeText(input.email);

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Invalid email address";
    } else {
      fields.email = email || "";
    }
  }

  if (input.preferred_language !== undefined) {
    const language = normalizePreferredLanguage(input.preferred_language);

    if (input.preferred_language && !language) {
      errors.preferred_language = "Must be english or spanish";
    } else if (language) {
      fields.preferred_language = language;
    }
  }

  if (input.city !== undefined) {
    fields.city = sanitizeText(input.city);
  }

  if (input.state !== undefined) {
    const state = sanitizeText(input.state);
    fields.state = state ? state.toUpperCase().slice(0, 2) : "";
  }

  if (input.work_authorization_status !== undefined) {
    const authorization = normalizeWorkAuthorization(input.work_authorization_status);

    if (input.work_authorization_status && authorization === null) {
      errors.work_authorization_status = "Unsupported work authorization value";
    } else if (authorization !== null) {
      fields.work_authorization_status = authorization;
    } else {
      fields.work_authorization_status = null;
    }
  }

  if (input.source !== undefined) {
    fields.source = sanitizeText(input.source);
  }

  if (input.interview_type !== undefined) {
    const interviewType = mapUiInterviewTypeToBackend(input.interview_type);

    if (input.interview_type && !interviewType) {
      errors.interview_type = "Unsupported interview type";
    } else if (interviewType) {
      fields.interview_type = interviewType;
    } else {
      fields.interview_type = "";
    }
  }

  if (input.internal_notes !== undefined) {
    fields.internal_notes = sanitizeText(input.internal_notes) || "";
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message: "Invalid prospect profile fields.",
        fields: errors
      }
    };
  }

  return { ok: true, fields };
}

function isMissingCommunicationLanguageColumn(error) {
  if (!error) {
    return false;
  }

  const message = String(error.message || "");

  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("communication_language") ||
    message.includes("schema cache")
  );
}

async function updateProspectCommunicationLanguage(phone, communicationLanguage) {
  if (!isProductionProspect(phone)) {
    return {
      ok: false,
      status: 404,
      body: { error: "NOT_FOUND", message: "Prospect not found." }
    };
  }

  const normalized = String(communicationLanguage || "").trim().toLowerCase();

  if (!COMMUNICATION_LANGUAGES.includes(normalized)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message: "communication_language must be es or en.",
        fields: { communication_language: "Must be es or en" }
      }
    };
  }

  const prospect = await findProspect(phone);

  if (!prospect) {
    return {
      ok: false,
      status: 404,
      body: { error: "NOT_FOUND", message: "Prospect not found." }
    };
  }

  // Operator-selected communication language is authoritative — sync preferred_language too.
  const { syncProspectLanguageFields } = require("./prospectLanguage");
  const languageFields = syncProspectLanguageFields(normalized);

  const updated = await updateProspect(phone, languageFields).catch(async (error) => {
    if (!isMissingCommunicationLanguageColumn(error)) {
      throw error;
    }

    return updateProspect(phone, {
      preferred_language: languageFields.preferred_language,
      language: languageFields.language
    });
  });

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      communication_language: updated.communication_language || normalized,
      preferred_language: updated.preferred_language || languageFields.preferred_language
    }
  };
}

async function updateProspectWorkspaceProfile(phone, input = {}) {
  if (!isProductionProspect(phone)) {
    return {
      ok: false,
      status: 404,
      body: { error: "NOT_FOUND", message: "Prospect not found." }
    };
  }

  const prospect = await findProspect(phone);

  if (!prospect) {
    return {
      ok: false,
      status: 404,
      body: { error: "NOT_FOUND", message: "Prospect not found." }
    };
  }

  const normalized = normalizeProfileInput(input);

  if (!normalized.ok) {
    return {
      ok: false,
      status: normalized.status,
      body: normalized.body
    };
  }

  const { fields } = normalized;
  const updates = {};

  if (fields.first_name !== undefined) {
    updates.first_name = fields.first_name;
  }

  if (fields.last_name !== undefined) {
    updates.last_name = fields.last_name;
  }

  if (fields.displayName !== undefined) {
    updates.name = fields.displayName;
  } else if (fields.first_name !== undefined || fields.last_name !== undefined) {
    const firstName = fields.first_name ?? prospect.first_name ?? "";
    const lastName = fields.last_name ?? prospect.last_name ?? "";
    const composed = [firstName, lastName].filter(Boolean).join(" ").trim();

    if (composed) {
      updates.name = composed;
    }
  }

  if (fields.preferred_language) {
    Object.assign(updates, syncProspectLanguageFields(fields.preferred_language));
  }

  if (fields.city !== undefined) {
    updates.city = fields.city || null;
  }

  if (fields.state !== undefined) {
    updates.state = fields.state || null;
  }

  if (fields.work_authorization_status !== undefined) {
    updates.work_authorized = fields.work_authorization_status;
  }

  if (fields.source !== undefined) {
    updates.source = fields.source || null;
  }

  if (fields.interview_type !== undefined) {
    updates.interview_type = fields.interview_type || null;
  }

  if (fields.email !== undefined || fields.internal_notes !== undefined) {
    updates.notes = rebuildProspectNotes(prospect.notes, {
      email: fields.email,
      internalNotes: fields.internal_notes
    });
  }

  if (!Object.keys(updates).length) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message: "No supported profile fields were provided."
      }
    };
  }

  const updated = await updateProspect(phone, updates);

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      profile: buildProspectEditorProfile(updated)
    }
  };
}

module.exports = {
  buildProspectEditorProfile,
  updateProspectCommunicationLanguage,
  updateProspectWorkspaceProfile
};
