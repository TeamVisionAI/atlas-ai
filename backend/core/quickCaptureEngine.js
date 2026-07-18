/**
 * Sprint 10.1 — Quick Capture prospect creation engine.
 * Manual/in-person prospects only. Reuses workflow event + state patterns.
 */

const {
  supabase,
  findProspect
} = require("../services/supabaseService");
const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("../core/phoneNormalizer");
const {
  ENTRY_METHOD,
  DEFAULT_SOURCE,
  MANUAL_SOURCES,
  COMMUNICATION_LANGUAGES,
  DEFAULT_STATUS,
  AUTOMATED_ENTRY_METHODS,
  AUTOMATED_SOURCES,
  DEFAULT_PREFERRED_COMMUNICATION_CHANNEL
} = require("../core/quickCaptureConstants");
const { generateNextProspectNumber } = require("../services/prospectNumberService");
const { emit, EVENT_TYPES } = require("./eventEngine");
const { savePersistedWorkflowState } = require("./workflowStateStore");
const { MILESTONES, OWNERSHIP } = require("./workflowConstants");

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
  const communicationLanguage = sanitizeName(body.communication_language).toLowerCase() || "es";
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

  if (!COMMUNICATION_LANGUAGES.includes(communicationLanguage)) {
    fields.communication_language = "Must be es or en";
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
      communicationLanguage,
      source,
      entryMethod: ENTRY_METHOD.QUICK_CAPTURE,
      status: DEFAULT_STATUS,
      preferredCommunicationChannel: DEFAULT_PREFERRED_COMMUNICATION_CHANNEL
    }
  };
}

async function findProspectByNormalizedPhone(normalizedPhone) {
  const { data: byNormalized, error: normalizedError } = await supabase
    .from("prospects")
    .select("*")
    .eq("normalized_phone", normalizedPhone)
    .maybeSingle();

  if (normalizedError && normalizedError.code !== "42703") {
    throw normalizedError;
  }

  if (byNormalized) {
    return byNormalized;
  }

  const storagePhone = formatPhoneForStorage(normalizedPhone);
  const legacy = await findProspect(storagePhone);

  if (legacy) {
    return legacy;
  }

  const { data: legacyDigits, error: legacyError } = await supabase
    .from("prospects")
    .select("*")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (legacyError) {
    throw legacyError;
  }

  return legacyDigits;
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
      communication_language: data.communicationLanguage,
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
  return {
    id: prospect.id || null,
    phone: prospect.phone,
    prospect_number: prospect.prospect_number || overrides.prospect_number || null,
    first_name: prospect.first_name || overrides.first_name || null,
    last_name: prospect.last_name || overrides.last_name || null,
    name: prospect.name || null,
    status: prospect.status || prospect.current_step || overrides.status || null,
    communication_language:
      prospect.communication_language ||
      prospect.language ||
      overrides.communication_language ||
      null,
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

async function createQuickCaptureProspect(payload, atlasUser) {
  const validation = validateQuickCapturePayload(payload);

  if (!validation.valid) {
    return {
      ok: false,
      status: 400,
      body: validation.errors
    };
  }

  const { data } = validation;
  const existing = await findProspectByNormalizedPhone(data.normalizedPhone);

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

  const insertRow = {
    phone: data.phone,
    normalized_phone: data.normalizedPhone,
    name: fullName,
    first_name: data.firstName,
    last_name: data.lastName,
    communication_language: data.communicationLanguage,
    language: data.communicationLanguage,
    entry_method: data.entryMethod,
    source: data.source,
    owner_user_id: userId,
    created_by_user_id: userId,
    status: data.status,
    current_step: data.status,
    prospect_number: prospectNumber,
    preferred_communication_channel: data.preferredCommunicationChannel,
    last_message: ""
  };

  const { data: created, error } = await supabase
    .from("prospects")
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      const duplicate = await findProspectByNormalizedPhone(data.normalizedPhone);
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
        current_step: data.status,
        language: data.communicationLanguage,
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
          communication_language: data.communicationLanguage,
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

  savePersistedWorkflowState(prospect.phone, {
    canonicalMilestone: MILESTONES.NEW_LEAD,
    workflowOwnership: OWNERSHIP.ATLAS,
    needsHumanAttention: false,
    manualAgentOwnership: false,
    doNotContact: false
  });

  await emit(EVENT_TYPES.PROSPECT_CREATED, {
    prospectPhone: prospect.phone,
    actor: "AGENT",
    milestoneAfter: MILESTONES.NEW_LEAD,
    ownershipAfter: OWNERSHIP.ATLAS,
    payload: {
      source: data.source,
      entry_method: data.entryMethod,
      prospect_number: prospectNumber,
      communication_language: data.communicationLanguage,
      created_by_user_id: atlasUser.id,
      owner_user_id: atlasUser.id,
      preferred_communication_channel: data.preferredCommunicationChannel,
      capture_channel: "quick_capture"
    },
    correlationId: `quick-capture:${prospect.phone}`
  });

  const summary = buildProspectSummary(prospect, summaryOverrides);

  return {
    ok: true,
    status: 201,
    body: {
      success: true,
      prospect: summary
    }
  };
}

module.exports = {
  validateQuickCapturePayload,
  createQuickCaptureProspect,
  findProspectByNormalizedPhone,
  buildProspectSummary
};
