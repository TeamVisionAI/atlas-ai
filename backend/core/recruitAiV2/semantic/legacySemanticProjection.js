/**
 * BR-174 — project the deterministic interpreter result onto SemanticInterpretation
 * so shadow mode can compare apples-to-apples.
 */

const { createEmptySemanticInterpretation } = require("./semanticInterpretationSchema");

function projectLegacyInterpretation(interpretation = {}, context = {}) {
  const entities = interpretation.entities || {};
  const intent = String(interpretation.intent || "unknown");

  let schedulingIntent = "none";
  if (intent === "reschedule_request" || entities.rescheduleRequested) {
    schedulingIntent = "reschedule";
  } else if (intent === "cancel_request") {
    schedulingIntent = "cancel";
  } else if (intent === "schedule_confirm") {
    schedulingIntent = "confirm";
  } else if (
    intent === "provide_time" ||
    intent === "provide_date" ||
    intent === "provide_day_part"
  ) {
    schedulingIntent = "propose";
  }

  const objections = [];
  if (intent === "ssn_privacy_objection" || entities.ssnPrivacyObjection) {
    objections.push({ kind: "ssn_privacy", detail: "ssn_refused" });
  }
  if (intent === "sales_objection") {
    objections.push({ kind: "sales", detail: entities.salesObjectionKind || null });
  }
  if (intent === "insurance_question") {
    objections.push({ kind: "insurance_condition", detail: "insurance_faq" });
  }

  return createEmptySemanticInterpretation({
    intent,
    language: interpretation.preferredLanguage || interpretation.messageLanguage || "unknown",
    confidence: interpretation.confidence,
    facts: {
      city: entities.city || null,
      state: entities.state || null,
      cityCanonical: entities.city || null,
      workAuthorization:
        entities.workAuthorization === true || entities.workAuthorization === false
          ? entities.workAuthorization
          : null,
      workAuthorizationStatus: entities.workAuthorizationStatus || null,
      email: entities.email || null,
      name: entities.name || null,
      employmentPreference: entities.employmentPreference || null,
      financialLicenseStatus: entities.financialLicenseStatus || null
    },
    entities: {
      completeness: entities.completeness || null,
      proposedState: entities.proposedState || null,
      lastQuestionAsked: context?.conversation?.lastQuestionAsked || null
    },
    corrections:
      intent === "correct_location" || entities.correction
        ? [{ field: "location", from: null, to: entities.city || entities.state || null }]
        : [],
    objections,
    schedulingIntent,
    requestedDate: entities.requestedDate || null,
    requestedTime: entities.requestedTime || null,
    requestedDayPart: entities.dayPart || entities.preferredDayPart || null,
    meetingPreference: entities.appointmentType || null,
    needsClarification: Boolean(entities.requiresClarification),
    clarificationReason: entities.requiresClarification ? intent : null,
    safety: {
      ssnPrivacy: Boolean(entities.ssnPrivacyObjection || intent === "ssn_privacy_objection"),
      optOut: intent === "opt_out_request",
      humanRequired: Boolean(interpretation.shouldEscalate)
    }
  });
}

module.exports = {
  projectLegacyInterpretation
};
