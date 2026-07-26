/**
 * W-006 — Mission Control conversation outcome + prospect knowledge enrichment.
 * Reuses human advancement, information model, and workflow event patterns.
 */

const { findProspect, updateProspect } = require("../services/supabaseService");
const { logConversation } = require("../services/logService");
const {
  buildProfileFromProspect,
  getMissingFields
} = require("./informationModel");
const { extractInformation } = require("./informationExtractor");
const { COMMUNICATION_LANGUAGES } = require("./quickCaptureConstants");
const {
  normalizePreferredLanguage,
  resolveProspectPreferredLanguage,
  formatPreferredLanguageLabel,
  syncProspectLanguageFields
} = require("./prospectLanguage");
const { advanceProspectWorkflow } = require("./humanAdvancementEngine");
const { loadAgentState } = require("./agentActionState");
const { MILESTONES } = require("./workflowConstants");
const { isProductionProspect } = require("./productionProspectFilter");

const CONVERSATION_OUTCOMES = Object.freeze([
  "Information Collected",
  "Interested",
  "Needs Follow-up",
  "Appointment Scheduled",
  "Not Interested",
  "No Answer",
  "Left Voicemail"
]);

const AGENT_OUTCOME_TO_LABEL = Object.freeze({
  "Information Collected": "Information Collected",
  Interested: "Interested",
  "Needs More Time": "Needs Follow-up",
  "No Answer": "No Answer",
  "Left Voicemail": "Left Voicemail",
  "Appointment Scheduled": "Appointment Scheduled",
  "Not Interested": "Not Interested"
});

const RECORDED_AGENT_OUTCOMES = new Set(Object.keys(AGENT_OUTCOME_TO_LABEL));

const INTENT_LABELS = Object.freeze({
  GREETING: "Greeting",
  AVAILABLE: "Asked About Availability",
  WHAT_IS_THE_JOB: "Requested Information",
  COST: "Asked About Cost",
  SALARY: "Asked About Compensation",
  SCHEDULE: "Scheduling",
  UNKNOWN: "Unknown"
});

const FIELD_LABELS = Object.freeze({
  first_name: "First Name",
  last_name: "Last Name",
  email: "Email",
  city: "City",
  state: "State",
  occupation: "Occupation",
  preferred_language: "Preferred Language",
  work_authorization_status: "Work Authorization"
});

const EXPLICIT_FIELD_TO_PROFILE_KEY = Object.freeze({
  city: "city",
  state: "state",
  occupation: "occupation",
  email: "email",
  work_authorization_status: "authorization"
});

const WORKFLOW_REQUIREMENT_LABELS = Object.freeze({
  schedule: "Interview not scheduled",
  email: "Email required for Zoom interview",
  interviewType: "Interview type not confirmed"
});

const WORKFLOW_REQUIREMENT_FIELDS = new Set(["schedule", "email", "interviewType"]);

const PROSPECT_FACT_MISSING_FIELDS = new Set([
  "city",
  "state",
  "authorization",
  "occupation",
  "email"
]);

const MISSING_FIELD_TO_INPUT_KEY = Object.freeze({
  authorization: "work_authorization_status"
});

function sanitizeText(value) {
  const text = String(value || "").trim();
  return text || null;
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

  if (["no", "false", "not_authorized", "not authorized", "unauthorized"].includes(text)) {
    return false;
  }

  return null;
}

function formatWorkAuthorization(value) {
  if (value === true) {
    return "Authorized / Work Permit";
  }

  if (value === false) {
    return "Not Authorized";
  }

  return null;
}

function normalizeLanguage(value) {
  const preferred = normalizePreferredLanguage(value);

  if (preferred) {
    return preferred === "spanish" ? "es" : "en";
  }

  const normalized = String(value || "").trim().toLowerCase();
  return COMMUNICATION_LANGUAGES.includes(normalized) ? normalized : null;
}

function mapIntentLabel(intent) {
  return INTENT_LABELS[intent] || INTENT_LABELS.UNKNOWN;
}

function resolveTargetMilestone(outcome, capturedFields = {}) {
  switch (outcome) {
    case "Not Interested":
      return MILESTONES.CLOSED;
    case "Needs Follow-up":
    case "No Answer":
    case "Left Voicemail":
      return MILESTONES.FOLLOW_UP;
    case "Appointment Scheduled":
      return capturedFields.interviewDateTime
        ? MILESTONES.INTERVIEW_SCHEDULED
        : MILESTONES.QUALIFICATION;
    case "Information Collected":
    case "Interested":
    default:
      return MILESTONES.QUALIFICATION;
  }
}

function mapOutcomeToAgentState(outcome) {
  switch (outcome) {
    case "Not Interested":
      return "Not Interested";
    case "Needs Follow-up":
      return "Needs More Time";
    case "No Answer":
      return "No Answer";
    case "Left Voicemail":
      return "Left Voicemail";
    case "Appointment Scheduled":
      return "Appointment Scheduled";
    case "Interested":
      return "Interested";
    case "Information Collected":
      return "Information Collected";
    default:
      return outcome;
  }
}

function buildInteractionNotes(outcome, changedFields = []) {
  const changedSummary =
    changedFields.length > 0 ? ` Updated: ${changedFields.join(", ")}.` : "";

  return `Conversation outcome recorded: ${outcome}.${changedSummary}`;
}

function getLatestInboundMessage(conversationMessages = []) {
  for (let index = conversationMessages.length - 1; index >= 0; index -= 1) {
    const message = conversationMessages[index];

    if (String(message?.direction || "").toLowerCase() === "incoming") {
      return message;
    }
  }

  return null;
}

function buildDraftFields(profile, latestMessageText) {
  if (!latestMessageText) {
    return {};
  }

  const extracted = extractInformation(latestMessageText, profile);
  const draft = {};

  if (extracted.city) {
    draft.city = extracted.city;
  }

  if (extracted.state) {
    draft.state = extracted.state;
  }

  if (extracted.occupation) {
    draft.occupation = extracted.occupation;
  }

  if (extracted.email) {
    draft.email = extracted.email;
  }

  if (extracted.authorization !== undefined && extracted.authorization !== null) {
    draft.work_authorization_status = extracted.authorization ? "work_permit" : "no";
  }

  return draft;
}

function buildKnowledgeGaps(prospect, profile, missingFields) {
  const gaps = [];

  if (!sanitizeText(prospect.first_name)) {
    gaps.push("first_name");
  }

  if (!sanitizeText(prospect.last_name)) {
    gaps.push("last_name");
  }

  if (!profile.email && missingFields.includes("email")) {
    gaps.push("email");
  }

  if (missingFields.includes("city")) {
    gaps.push("city");
  }

  if (missingFields.includes("state")) {
    gaps.push("state");
  }

  if (missingFields.includes("occupation")) {
    gaps.push("occupation");
  }

  if (profile.authorization === null || profile.authorization === undefined) {
    gaps.push("work_authorization_status");
  }

  return [...new Set(gaps)];
}

function buildWorkflowRequirements(profile, missingFields = []) {
  const requirements = [];

  for (const field of missingFields) {
    if (!WORKFLOW_REQUIREMENT_FIELDS.has(field)) {
      continue;
    }

    if (field === "schedule" && (profile.confirmed || profile.calendarEventId)) {
      continue;
    }

    requirements.push({
      key: field,
      label: WORKFLOW_REQUIREMENT_LABELS[field] || field
    });
  }

  return requirements;
}

function mapMissingFieldToInputKey(missingField) {
  return MISSING_FIELD_TO_INPUT_KEY[missingField] || missingField;
}

/**
 * Workflow-scoped recruiter inputs — derived from getMissingFields(), not full knowledgeGaps.
 */
function buildRequiredInputs(prospect, profile, missingFields = []) {
  const inputs = [];

  for (const missingField of missingFields) {
    if (WORKFLOW_REQUIREMENT_FIELDS.has(missingField)) {
      continue;
    }

    if (!PROSPECT_FACT_MISSING_FIELDS.has(missingField)) {
      continue;
    }

    const key = mapMissingFieldToInputKey(missingField);

    if (!FIELD_LABELS[key]) {
      continue;
    }

    inputs.push({
      key,
      label: FIELD_LABELS[key],
      source: "workflow_stage"
    });
  }

  if (
    !missingFields.includes("schedule") &&
    !sanitizeText(prospect.first_name) &&
    !inputs.some((row) => row.key === "first_name")
  ) {
    inputs.push({
      key: "first_name",
      label: FIELD_LABELS.first_name,
      source: "identity_gap"
    });
  }

  if (
    !missingFields.includes("schedule") &&
    !sanitizeText(prospect.last_name) &&
    !inputs.some((row) => row.key === "last_name")
  ) {
    inputs.push({
      key: "last_name",
      label: FIELD_LABELS.last_name,
      source: "identity_gap"
    });
  }

  return inputs;
}

function resolveExplicitProfileFields(rawFields = {}) {
  return Object.keys(rawFields)
    .map((key) => EXPLICIT_FIELD_TO_PROFILE_KEY[key])
    .filter(Boolean);
}

function buildKnownInformation(prospect, profile, brain, latestMessageText, entryMethod) {
  const known = [];
  const preferredLanguage = resolveProspectPreferredLanguage(prospect);

  known.push({
    key: "preferred_language",
    label: FIELD_LABELS.preferred_language,
    value: formatPreferredLanguageLabel(preferredLanguage),
    source:
      prospect.preferred_language ||
      prospect.communication_language ||
      prospect.language
        ? "stored"
        : "stored"
  });

  const authorizationLabel = formatWorkAuthorization(profile.authorization);

  if (authorizationLabel) {
    known.push({
      key: "work_authorization_status",
      label: FIELD_LABELS.work_authorization_status,
      value: authorizationLabel,
      source: prospect.work_authorized === null || prospect.work_authorized === undefined
        ? "ai_detected"
        : "stored"
    });
  }

  if (brain?.intent && brain.intent !== "UNKNOWN") {
    known.push({
      key: "intent",
      label: "Intent",
      value: mapIntentLabel(brain.intent),
      source: latestMessageText ? "ai_detected" : "stored"
    });
  }

  if (sanitizeText(prospect.first_name)) {
    known.push({
      key: "first_name",
      label: FIELD_LABELS.first_name,
      value: prospect.first_name,
      source: entryMethod === "QUICK_CAPTURE" ? "quick_capture" : "stored"
    });
  }

  if (sanitizeText(prospect.last_name)) {
    known.push({
      key: "last_name",
      label: FIELD_LABELS.last_name,
      value: prospect.last_name,
      source: entryMethod === "QUICK_CAPTURE" ? "quick_capture" : "stored"
    });
  }

  if (profile.city) {
    known.push({
      key: "city",
      label: FIELD_LABELS.city,
      value: profile.city,
      source: "stored"
    });
  }

  if (profile.state) {
    known.push({
      key: "state",
      label: FIELD_LABELS.state,
      value: profile.state,
      source: "stored"
    });
  }

  if (profile.occupation) {
    known.push({
      key: "occupation",
      label: FIELD_LABELS.occupation,
      value: profile.occupation,
      source: "stored"
    });
  }

  if (profile.email) {
    known.push({
      key: "email",
      label: FIELD_LABELS.email,
      value: profile.email,
      source: "stored"
    });
  }

  return known;
}

function resolveRecordedConversationOutcome(prospect) {
  const agentOutcome = sanitizeText(loadAgentState(prospect.phone)?.outcome);

  if (!agentOutcome || !RECORDED_AGENT_OUTCOMES.has(agentOutcome)) {
    return null;
  }

  return {
    key: agentOutcome,
    label: AGENT_OUTCOME_TO_LABEL[agentOutcome] || agentOutcome
  };
}

function buildConversationOutcomeReadModel({
  prospect,
  brain,
  conversationMessages = []
}) {
  if (!prospect) {
    return null;
  }

  const profile = buildProfileFromProspect(prospect);
  const missingFields = getMissingFields(profile);
  const latestInbound = getLatestInboundMessage(conversationMessages);
  const latestMessageText = latestInbound?.text || prospect.last_message || "";
  const draft = buildDraftFields(profile, latestMessageText);
  const knowledgeGaps = buildKnowledgeGaps(prospect, profile, missingFields).map((key) => ({
    key,
    label: FIELD_LABELS[key] || key
  }));
  const workflowRequirements = buildWorkflowRequirements(profile, missingFields);
  const requiredInputs = buildRequiredInputs(prospect, profile, missingFields);
  const recordedOutcome = resolveRecordedConversationOutcome(prospect);
  const knownInformation = buildKnownInformation(
    prospect,
    profile,
    brain,
    latestMessageText,
    prospect.entry_method
  );

  return {
    outcomes: [...CONVERSATION_OUTCOMES],
    knownInformation,
    knowledgeGaps,
    requiredInputs,
    workflowRequirements,
    recordedOutcome,
    canRecordOutcome: requiredInputs.length === 0 && !recordedOutcome,
    draft,
    fields: {
      first_name: prospect.first_name || "",
      last_name: prospect.last_name || "",
      email: profile.email || "",
      city: profile.city || "",
      state: profile.state || "",
      occupation: profile.occupation || "",
      preferred_language: resolveProspectPreferredLanguage(prospect),
      work_authorization_status:
        profile.authorization === true
          ? "work_permit"
          : profile.authorization === false
            ? "no"
            : ""
    }
  };
}

function normalizeSubmittedFields(rawFields = {}, prospect) {
  const fields = {};
  const errors = {};

  if (rawFields.first_name !== undefined) {
    fields.first_name = sanitizeText(rawFields.first_name);
  }

  if (rawFields.last_name !== undefined) {
    fields.last_name = sanitizeText(rawFields.last_name);
  }

  if (rawFields.email !== undefined) {
    const email = sanitizeText(rawFields.email);

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Invalid email address";
    } else {
      fields.email = email;
    }
  }

  if (rawFields.city !== undefined) {
    fields.city = sanitizeText(rawFields.city);
  }

  if (rawFields.state !== undefined) {
    const state = sanitizeText(rawFields.state);
    fields.state = state ? state.toUpperCase().slice(0, 2) : null;
  }

  if (rawFields.occupation !== undefined) {
    fields.occupation = sanitizeText(rawFields.occupation);
  }

  if (rawFields.preferred_language !== undefined) {
    const language = normalizePreferredLanguage(rawFields.preferred_language);

    if (rawFields.preferred_language && !language) {
      errors.preferred_language = "Must be english or spanish";
    } else if (language) {
      fields.preferred_language = language;
    }
  }

  if (rawFields.work_authorization_status !== undefined) {
    const authorization = normalizeWorkAuthorization(rawFields.work_authorization_status);

    if (rawFields.work_authorization_status && authorization === null) {
      errors.work_authorization_status = "Unsupported work authorization value";
    } else if (authorization !== null) {
      fields.work_authorization_status = authorization;
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "VALIDATION_ERROR",
        message: "Invalid conversation outcome fields.",
        fields: errors
      }
    };
  }

  return { ok: true, fields };
}

function buildRequiredInformationNotes(changedKeys = []) {
  if (!changedKeys.length) {
    return "Required information updated.";
  }

  return `Required information updated: ${changedKeys.join(", ")}.`;
}

function fieldKeysToLabels(keys = []) {
  return keys.map((key) => FIELD_LABELS[key] || key);
}

async function saveRequiredInformation(phone, body = {}) {
  if (!isProductionProspect(phone)) {
    return {
      success: false,
      status: 404,
      error: "PROSPECT_NOT_FOUND",
      message: "Prospect not found."
    };
  }

  const prospect = await findProspect(phone);

  if (!prospect) {
    return {
      success: false,
      status: 404,
      error: "PROSPECT_NOT_FOUND",
      message: "Prospect not found."
    };
  }

  const profile = buildProfileFromProspect(prospect);
  const missingFields = getMissingFields(profile);
  const requiredInputs = buildRequiredInputs(prospect, profile, missingFields);
  const allowedKeys = new Set(requiredInputs.map((row) => row.key));

  if (!allowedKeys.size) {
    return {
      success: false,
      status: 400,
      error: "NO_REQUIRED_INPUTS",
      message: "No required information is pending for this prospect."
    };
  }

  const rawFields = body.fields || {};
  const submittedKeys = Object.keys(rawFields).filter(
    (key) => rawFields[key] !== undefined && rawFields[key] !== ""
  );

  if (!submittedKeys.length) {
    return {
      success: false,
      status: 400,
      error: "VALIDATION_ERROR",
      message: "At least one required information field must be provided."
    };
  }

  const invalidKeys = submittedKeys.filter((key) => !allowedKeys.has(key));

  if (invalidKeys.length) {
    return {
      success: false,
      status: 400,
      error: "VALIDATION_ERROR",
      message: "One or more submitted fields are not currently required.",
      fields: Object.fromEntries(invalidKeys.map((key) => [key, "Not a required input"]))
    };
  }

  const filteredRaw = Object.fromEntries(
    submittedKeys.map((key) => [key, rawFields[key]])
  );
  const normalized = normalizeSubmittedFields(filteredRaw, prospect);

  if (!normalized.ok) {
    return {
      success: false,
      status: normalized.status,
      error: normalized.body.error,
      message: normalized.body.message,
      fields: normalized.body.fields
    };
  }

  const { fields } = normalized;
  const identityChanges = await persistIdentityAndLanguageFields(prospect, fields);
  const capturedFields = {
    city: fields.city,
    state: fields.state,
    occupation: fields.occupation,
    email: fields.email,
    authorization: fields.work_authorization_status
  };

  Object.keys(capturedFields).forEach((key) => {
    if (capturedFields[key] === undefined) {
      delete capturedFields[key];
    }
  });

  const changedKeys = [
    ...identityChanges.changed,
    ...Object.keys(filteredRaw).filter((key) => !identityChanges.changed.includes(key))
  ];
  const explicitProfileFields = resolveExplicitProfileFields(fields);
  const interactionNotes = buildRequiredInformationNotes(fieldKeysToLabels(changedKeys));

  const advanceResult = await advanceProspectWorkflow(phone, {
    targetMilestone: MILESTONES.QUALIFICATION,
    capturedFields,
    explicitProfileFields,
    interactionNotes,
    interactionType: "phone"
  });

  if (!advanceResult.success) {
    return advanceResult;
  }

  const updatedProspect = await findProspect(phone);

  await logConversation({
    phone,
    name: updatedProspect?.name || prospect.name,
    direction: "outgoing",
    message: `[Required Information Updated] ${interactionNotes}`,
    intent: "REQUIRED_INFORMATION",
    pipeline: "AGENT",
    currentStep: updatedProspect?.current_step || prospect.current_step,
    language:
      updatedProspect?.language ||
      updatedProspect?.communication_language ||
      prospect.language ||
      "en",
    city: updatedProspect?.city || prospect.city,
    state: updatedProspect?.state || prospect.state
  });

  return {
    success: true,
    status: 200,
    changedFields: changedKeys,
    prospect: updatedProspect,
    workflow: advanceResult.workflow,
    events: advanceResult.eventsEmitted || []
  };
}

async function persistIdentityAndLanguageFields(prospect, fields) {
  const updates = {};
  const changed = [];

  if (fields.first_name !== undefined) {
    updates.first_name = fields.first_name;
    changed.push("first_name");
  }

  if (fields.last_name !== undefined) {
    updates.last_name = fields.last_name;
    changed.push("last_name");
  }

  if (fields.first_name !== undefined || fields.last_name !== undefined) {
    const firstName = fields.first_name ?? prospect.first_name ?? "";
    const lastName = fields.last_name ?? prospect.last_name ?? "";
    const composed = [firstName, lastName].filter(Boolean).join(" ").trim();

    if (composed) {
      updates.name = composed;
      changed.push("name");
    }
  }

  if (fields.preferred_language) {
    const synced = syncProspectLanguageFields(fields.preferred_language);
    const existingPreferred = resolveProspectPreferredLanguage(prospect);

    if (synced.preferred_language !== existingPreferred) {
      Object.assign(updates, synced);
      changed.push("preferred_language");
    }
  }

  if (Object.keys(updates).length === 0) {
    return { changed };
  }

  await updateProspect(prospect.phone, updates);
  return { changed };
}

async function saveConversationOutcome(phone, body = {}) {
  if (!isProductionProspect(phone)) {
    return {
      success: false,
      status: 404,
      error: "PROSPECT_NOT_FOUND",
      message: "Prospect not found."
    };
  }

  const outcome = sanitizeText(body.outcome);

  if (!outcome || !CONVERSATION_OUTCOMES.includes(outcome)) {
    return {
      success: false,
      status: 400,
      error: "VALIDATION_ERROR",
      message: "A valid conversation outcome is required."
    };
  }

  const prospect = await findProspect(phone);

  if (!prospect) {
    return {
      success: false,
      status: 404,
      error: "PROSPECT_NOT_FOUND",
      message: "Prospect not found."
    };
  }

  const normalized =
    body.fields && Object.keys(body.fields).length
      ? normalizeSubmittedFields(body.fields, prospect)
      : { ok: true, fields: {} };

  if (!normalized.ok) {
    return {
      success: false,
      status: normalized.status,
      error: normalized.body.error,
      message: normalized.body.message,
      fields: normalized.body.fields
    };
  }

  const { fields } = normalized;
  const hasQualificationFields = Object.keys(fields).some(
    (key) => fields[key] !== undefined && fields[key] !== null && fields[key] !== ""
  );

  let identityChanges = { changed: [] };

  if (hasQualificationFields) {
    identityChanges = await persistIdentityAndLanguageFields(prospect, fields);
  }

  const capturedFields = {
    outcome: mapOutcomeToAgentState(outcome),
    interactionNotes: sanitizeText(body.interactionNotes)
  };

  if (hasQualificationFields) {
    Object.assign(capturedFields, {
      city: fields.city,
      state: fields.state,
      occupation: fields.occupation,
      email: fields.email,
      authorization: fields.work_authorization_status
    });
  }

  if (
    outcome === "Needs Follow-up" ||
    outcome === "No Answer" ||
    outcome === "Left Voicemail"
  ) {
    capturedFields.followUpDate =
      sanitizeText(body.followUpDate) || new Date().toISOString().slice(0, 10);
  }

  if (body.interviewDateTime) {
    capturedFields.interviewDateTime = sanitizeText(body.interviewDateTime);
  }

  Object.keys(capturedFields).forEach((key) => {
    if (capturedFields[key] === undefined) {
      delete capturedFields[key];
    }
  });

  const targetMilestone = resolveTargetMilestone(outcome, capturedFields);
  const interactionNotes =
    capturedFields.interactionNotes ||
    buildInteractionNotes(
      outcome,
      hasQualificationFields
        ? [
            ...identityChanges.changed,
            ...Object.keys(fields).filter((key) => fields[key] !== undefined && fields[key] !== "")
          ]
        : []
    );
  const explicitProfileFields = hasQualificationFields
    ? resolveExplicitProfileFields(fields)
    : [];

  const advanceResult = await advanceProspectWorkflow(phone, {
    targetMilestone,
    capturedFields,
    explicitProfileFields,
    interactionNotes,
    interactionType: "phone"
  });

  if (!advanceResult.success) {
    return advanceResult;
  }

  const updatedProspect = await findProspect(phone);

  await logConversation({
    phone,
    name: updatedProspect?.name || prospect.name,
    direction: "outgoing",
    message: `[Conversation outcome] ${outcome}${interactionNotes ? ` — ${interactionNotes}` : ""}`,
    intent: "CONVERSATION_OUTCOME",
    pipeline: "AGENT",
    currentStep: updatedProspect?.current_step || prospect.current_step,
    language:
      updatedProspect?.language ||
      updatedProspect?.communication_language ||
      prospect.language ||
      "en",
    city: updatedProspect?.city || fields.city || prospect.city,
    state: updatedProspect?.state || fields.state || prospect.state
  });

  return {
    success: true,
    status: 200,
    outcome,
    prospect: updatedProspect,
    workflow: advanceResult.workflow,
    events: advanceResult.eventsEmitted || []
  };
}

module.exports = {
  CONVERSATION_OUTCOMES,
  buildConversationOutcomeReadModel,
  buildKnowledgeGaps,
  buildRequiredInputs,
  buildWorkflowRequirements,
  resolveExplicitProfileFields,
  saveRequiredInformation,
  saveConversationOutcome
};
