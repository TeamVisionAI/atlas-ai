/**
 * Sprint 10.1 — Quick Capture prospect creation engine.
 * Manual/in-person prospects only. Reuses workflow event + state patterns.
 */

const {
  supabase,
  findProspectByNormalizedPhoneInOrganization
} = require("../services/supabaseService");
const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("../core/phoneNormalizer");
const {
  ENTRY_METHOD,
  DEFAULT_SOURCE,
  MANUAL_SOURCES,
  PREFERRED_LANGUAGES,
  DEFAULT_PREFERRED_LANGUAGE,
  DEFAULT_STATUS,
  AUTOMATED_ENTRY_METHODS,
  AUTOMATED_SOURCES,
  DEFAULT_PREFERRED_COMMUNICATION_CHANNEL
} = require("../core/quickCaptureConstants");
const {
  normalizePreferredLanguage,
  syncProspectLanguageFields,
  formatPreferredLanguageLabel
} = require("../core/prospectLanguage");
const { generateNextProspectNumber } = require("../services/prospectNumberService");
const { emit, EVENT_TYPES } = require("./eventEngine");
const { savePersistedWorkflowState } = require("./workflowStateStore");
const { MILESTONES, OWNERSHIP } = require("./workflowConstants");
const { buildQuickCaptureGuidance } = require("./quickCaptureRecommendationEngine");
const { findProspectInOrganization } = require("../services/supabaseService");

function buildValidationErrors(fields) {
  return {
    error: "VALIDATION_ERROR",
    message: "Invalid Quick Capture payload.",
    fields
  };
}

function sanitizeName(value) {
  return String(value || "").trim();
}

function validateQuickCapturePayload(body = {}) {
  const fields = {};
  const firstName = sanitizeName(body.first_name);
  const lastName = sanitizeName(body.last_name);
  const phone = sanitizeName(body.phone);
  const preferredLanguageRaw =
    body.preferred_language ?? body.preferredLanguage ?? body.communication_language;
  const preferredLanguage = normalizePreferredLanguage(preferredLanguageRaw);
  const manualSource = sanitizeName(body.source || body.manual_source).toUpperCase();
  const requestedEntryMethod = sanitizeName(body.entry_method).toUpperCase();

  if (!firstName) {
    fields.first_name = "Required";
  }

  if (!lastName) {
    fields.last_name = "Required";
  }

  if (!phone) {
    fields.phone = "Required";
  }

  if (!preferredLanguage) {
    fields.preferred_language = "Required";
  } else if (!PREFERRED_LANGUAGES.includes(preferredLanguage)) {
    fields.preferred_language = "Must be english or spanish";
  }

  if (requestedEntryMethod && AUTOMATED_ENTRY_METHODS.includes(requestedEntryMethod)) {
    fields.entry_method = "Automated entry methods are not allowed for Quick Capture";
  }

  if (manualSource && AUTOMATED_SOURCES.includes(manualSource)) {
    fields.source = "Automated sources are not allowed for Quick Capture";
  }

  const normalizedPhone = normalizePhoneNumber(phone);

  if (phone && !normalizedPhone) {
    fields.phone = "Invalid phone number";
  }

  let source = DEFAULT_SOURCE;

  if (manualSource) {
    if (!Object.values(MANUAL_SOURCES).includes(manualSource)) {
      fields.source = "Unsupported manual source";
    } else {
      source = manualSource;
    }
  }

  if (Object.keys(fields).length > 0) {
    return { valid: false, errors: buildValidationErrors(fields) };
  }

  return {
    valid: true,
    data: {
      firstName,
      lastName,
      phone: formatPhoneForStorage(normalizedPhone),
      normalizedPhone,
      preferredLanguage,
      languageFields: syncProspectLanguageFields(preferredLanguage),
      source,
      entryMethod: ENTRY_METHOD.QUICK_CAPTURE,
      status: DEFAULT_STATUS,
      preferredCommunicationChannel: DEFAULT_PREFERRED_COMMUNICATION_CHANNEL
    }
  };
}

async function findProspectByNormalizedPhone(normalizedPhone, organizationId) {
  if (!organizationId) {
    return null;
  }

  return findProspectByNormalizedPhoneInOrganization(normalizedPhone, organizationId);
}

function buildPersistedLanguageFields(languageFields, { includePreferredColumn = true } = {}) {
  const row = {
    communication_language: languageFields.communication_language,
    language: languageFields.language
  };

  if (includePreferredColumn) {
    row.preferred_language = languageFields.preferred_language;
  }

  return row;
}

function isMissingQuickCaptureColumn(error) {
  if (!error) {
    return false;
  }

  const message = String(error.message || "");

  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("communication_language") ||
    message.includes("preferred_language") ||
    message.includes("normalized_phone") ||
    message.includes("prospect_number") ||
    message.includes("entry_method") ||
    message.includes("preferred_communication_channel")
  );
}

function buildLegacyNotes(data, atlasUser) {
  return [
    "QUICK_CAPTURE",
    JSON.stringify({
      preferred_language: data.preferredLanguage,
      communication_language: data.languageFields.communication_language,
      source: data.source,
      entry_method: data.entryMethod,
      owner_user_id: atlasUser.id,
      created_by_user_id: atlasUser.id,
      normalized_phone: data.normalizedPhone,
      first_name: data.firstName,
      last_name: data.lastName,
      preferred_communication_channel: DEFAULT_PREFERRED_COMMUNICATION_CHANNEL
    })
  ].join(":");
}

function buildProspectSummary(prospect, overrides = {}) {
  const preferredLanguage =
    prospect.preferred_language ||
    overrides.preferred_language ||
    normalizePreferredLanguage(prospect.communication_language || prospect.language) ||
    DEFAULT_PREFERRED_LANGUAGE;

  return {
    id: prospect.id || null,
    phone: prospect.phone,
    prospect_number: prospect.prospect_number || overrides.prospect_number || null,
    first_name: prospect.first_name || overrides.first_name || null,
    last_name: prospect.last_name || overrides.last_name || null,
    name: prospect.name || null,
    status: prospect.status || prospect.current_step || overrides.status || null,
    preferred_language: preferredLanguage,
    preferred_language_label: formatPreferredLanguageLabel(preferredLanguage),
    communication_language:
      prospect.communication_language ||
      overrides.communication_language ||
      syncProspectLanguageFields(preferredLanguage).communication_language,
    source: prospect.source || overrides.source || null,
    entry_method: prospect.entry_method || overrides.entry_method || null,
    preferred_communication_channel:
      prospect.preferred_communication_channel ||
      overrides.preferred_communication_channel ||
      DEFAULT_PREFERRED_COMMUNICATION_CHANNEL,
    owner_user_id: prospect.owner_user_id || overrides.owner_user_id || null,
    created_by_user_id: prospect.created_by_user_id || overrides.created_by_user_id || null
  };
}

function resolveQuickCaptureOrganizationId(atlasUser) {
  const organizationId = atlasUser?.organization_id || atlasUser?.organizationId || null;

  if (!organizationId) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "MISSING_ORGANIZATION_ID",
        message:
          "Authenticated Atlas user has no organization_id. Prospect cannot be created."
      }
    };
  }

  return {
    ok: true,
    organizationId
  };
}

async function createQuickCaptureProspect(payload, atlasUser) {
  const validation = validateQuickCapturePayload(payload);

  if (!validation.valid) {
    return {
      ok: false,
      status: 400,
      body: validation.errors
    };
  }

  const organizationResolution = resolveQuickCaptureOrganizationId(atlasUser);

  if (!organizationResolution.ok) {
    return organizationResolution;
  }

  const { organizationId } = organizationResolution;
  const { data } = validation;
  const existing = await findProspectByNormalizedPhone(data.normalizedPhone, organizationId);

  if (existing) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "DUPLICATE_PROSPECT",
        message: "A prospect with this phone number already exists.",
        prospect: buildProspectSummary(existing)
      }
    };
  }

  const prospectNumber = await generateNextProspectNumber();
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const userId = atlasUser.id;

  // Implements BR-080 — creator ownership when eligible; else RVP/default/unassigned.
  const {
    resolveNewLeadAssignment,
    buildNewLeadAttentionFields
  } = require("./newLeadAssignmentEngine");
  const assignment = await resolveNewLeadAssignment({
    organizationId,
    source: data.source,
    createdByUserId: userId,
    preferCreator: true
  });
  const attentionFields = buildNewLeadAttentionFields(assignment);

  const insertRow = {
    phone: data.phone,
    normalized_phone: data.normalizedPhone,
    name: fullName,
    first_name: data.firstName,
    last_name: data.lastName,
    ...buildPersistedLanguageFields(data.languageFields),
    entry_method: data.entryMethod,
    source: data.source,
    owner_user_id: attentionFields.owner_user_id || userId,
    created_by_user_id: userId,
    organization_id: organizationId,
    status: data.status,
    current_step: data.status,
    prospect_number: prospectNumber,
    preferred_communication_channel: data.preferredCommunicationChannel,
    last_message: "",
    assignment_status: attentionFields.assignment_status,
    assignment_source: attentionFields.assignment_source,
    attention_status: attentionFields.attention_status,
    new_lead_received_at: attentionFields.new_lead_received_at,
    escalation_level: 0
  };

  const { data: created, error } = await supabase
    .from("prospects")
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      const duplicate = await findProspectByNormalizedPhone(data.normalizedPhone, organizationId);
      return {
        ok: false,
        status: 409,
        body: {
          error: "DUPLICATE_PROSPECT",
          message: "A prospect with this phone number already exists.",
          prospect: buildProspectSummary(duplicate || { phone: data.phone }, {
            owner_user_id: atlasUser.id,
            created_by_user_id: atlasUser.id
          })
        }
      };
    }

    if (isMissingQuickCaptureColumn(error)) {
      const fallbackRow = {
        phone: data.phone,
        name: fullName,
        first_name: data.firstName,
        last_name: data.lastName,
        current_step: data.status,
        status: data.status,
        ...buildPersistedLanguageFields(data.languageFields, { includePreferredColumn: false }),
        entry_method: data.entryMethod,
        source: data.source,
        owner_user_id: userId,
        created_by_user_id: userId,
        organization_id: organizationId,
        preferred_communication_channel: data.preferredCommunicationChannel,
        last_message: "",
        notes: buildLegacyNotes(data, atlasUser)
      };

      const { data: fallbackCreated, error: fallbackError } = await supabase
        .from("prospects")
        .insert(fallbackRow)
        .select()
        .single();

      if (fallbackError) {
        throw fallbackError;
      }

      return finalizeQuickCaptureProspect(fallbackCreated, {
        data,
        atlasUser,
        prospectNumber: null,
        summaryOverrides: {
          first_name: data.firstName,
          last_name: data.lastName,
          preferred_language: data.preferredLanguage,
          communication_language: data.languageFields.communication_language,
          source: data.source,
          entry_method: data.entryMethod,
          preferred_communication_channel: data.preferredCommunicationChannel,
          owner_user_id: atlasUser.id,
          created_by_user_id: atlasUser.id,
          status: data.status
        }
      });
    }

    throw error;
  }

  return finalizeQuickCaptureProspect(created, {
    data,
    atlasUser,
    prospectNumber
  });
}

async function finalizeQuickCaptureProspect(prospect, context) {
  const { data, atlasUser, prospectNumber, summaryOverrides = {} } = context;

  const organizationId = prospect.organization_id || atlasUser.organization_id || atlasUser.organizationId;
  const persisted = organizationId
    ? await findProspectInOrganization(prospect.phone, organizationId)
    : prospect;

  await savePersistedWorkflowState(
    prospect.phone,
    {
      canonicalMilestone: MILESTONES.NEW_LEAD,
      workflowOwnership: OWNERSHIP.ATLAS,
      needsHumanAttention: false,
      manualAgentOwnership: false,
      doNotContact: false
    },
    {
      organizationId: prospect.organization_id || organizationId || null,
      prospectId: prospect.id || null
    }
  );

  await emit(EVENT_TYPES.PROSPECT_CREATED, {
    prospectPhone: prospect.phone,
    actor: "AGENT",
    milestoneAfter: MILESTONES.NEW_LEAD,
    ownershipAfter: OWNERSHIP.ATLAS,
    payload: {
      source: data.source,
      entry_method: data.entryMethod,
      prospect_number: prospectNumber,
      communication_language: data.languageFields.communication_language,
      created_by_user_id: atlasUser.id,
      owner_user_id: atlasUser.id,
      preferred_communication_channel: data.preferredCommunicationChannel,
      capture_channel: "quick_capture"
    },
    correlationId: `quick-capture:${prospect.phone}`
  });

  const summary = buildProspectSummary(prospect, summaryOverrides);
  const guidance = await buildQuickCaptureGuidance(prospect);

  return {
    ok: true,
    status: 201,
    body: {
      success: true,
      prospect: summary,
      recommendedAction: guidance.recommendedAction,
      estimatedMinutes: guidance.estimatedMinutes
    }
  };
}

module.exports = {
  validateQuickCapturePayload,
  createQuickCaptureProspect,
  resolveQuickCaptureOrganizationId,
  findProspectByNormalizedPhone,
  buildProspectSummary
};
