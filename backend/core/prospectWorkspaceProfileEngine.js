/**
 * Sprint 10.2 / 10.1.1 — Prospect profile updates from workspace.
 */

const { findProspect, updateProspect } = require("../services/supabaseService");
const { COMMUNICATION_LANGUAGES } = require("./quickCaptureConstants");
const { isProductionProspect } = require("./productionProspectFilter");

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

  const updated = await updateProspect(phone, {
    communication_language: normalized,
    language: normalized
  }).catch(async (error) => {
    if (!isMissingCommunicationLanguageColumn(error)) {
      throw error;
    }

    return updateProspect(phone, { language: normalized });
  });

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      communication_language: updated.communication_language || normalized
    }
  };
}

module.exports = {
  updateProspectCommunicationLanguage
};
