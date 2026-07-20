/**
 * Sprint 11.1 — Locate or create prospects for inbound WhatsApp leads.
 */

const { supabase, findProspect, updateProspect } = require("../services/supabaseService");
const { findProspectByNormalizedPhone } = require("../core/quickCaptureEngine");
const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("../core/phoneNormalizer");
const { generateNextProspectNumber } = require("../services/prospectNumberService");
const { emit, EVENT_TYPES } = require("./eventEngine");
const { savePersistedWorkflowState } = require("./workflowStateStore");
const { MILESTONES, OWNERSHIP } = require("./workflowConstants");
const {
  WHATSAPP_ENTRY_METHOD,
  WHATSAPP_SOURCE,
  REOPENED_INACTIVITY_MS
} = require("./whatsappConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

function resolveStoragePhone(rawPhone) {
  const normalized = normalizePhoneNumber(rawPhone);
  return formatPhoneForStorage(normalized) || String(rawPhone || "").trim();
}

function isMissingWhatsAppColumn(error) {
  const message = String(error?.message || "");

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("normalized_phone") ||
    message.includes("prospect_number") ||
    message.includes("entry_method") ||
    message.includes("source")
  );
}

function shouldEmitConversationReopened(prospect) {
  if (!prospect) {
    return false;
  }

  if (prospect.current_step === "CLOSED") {
    return true;
  }

  const updatedAt = Date.parse(prospect.updated_at || prospect.created_at || "");

  if (!Number.isNaN(updatedAt) && Date.now() - updatedAt > REOPENED_INACTIVITY_MS) {
    return true;
  }

  return false;
}

async function insertWhatsAppProspectRow(storagePhone, normalizedPhone, name, firstMessage) {
  const prospectNumber = await generateNextProspectNumber();
  const fullName = String(name || "Unknown").trim() || "Unknown";

  const insertRow = {
    phone: storagePhone,
    normalized_phone: normalizedPhone,
    name: fullName,
    first_name: fullName.split(" ")[0] || fullName,
    last_name: fullName.split(" ").slice(1).join(" ") || null,
    prospect_number: prospectNumber,
    current_step: "NEW",
    status: "NEW",
    language: "es",
    communication_language: "es",
    source: WHATSAPP_SOURCE.FACEBOOK,
    entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    preferred_communication_channel: "WHATSAPP",
    last_message: firstMessage || ""
  };

  const { data, error } = await supabase.from("prospects").insert(insertRow).select().single();

  if (error && isMissingWhatsAppColumn(error)) {
    const { data: fallback, error: fallbackError } = await supabase
      .from("prospects")
      .insert({
        phone: storagePhone,
        name: fullName,
        current_step: "NEW",
        language: "es",
        last_message: firstMessage || "",
        notes: JSON.stringify({
          source: WHATSAPP_SOURCE.FACEBOOK,
          entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
          normalized_phone: normalizedPhone,
          prospect_number: prospectNumber
        })
      })
      .select()
      .single();

    if (fallbackError) {
      throw fallbackError;
    }

    return fallback;
  }

  if (error) {
    throw error;
  }

  return data;
}

async function emitProspectLifecycleEvents(prospect, { created, reopened, correlationBase }) {
  if (created) {
    savePersistedWorkflowState(prospect.phone, {
      canonicalMilestone: MILESTONES.NEW_LEAD,
      workflowOwnership: OWNERSHIP.ATLAS,
      needsHumanAttention: false,
      manualAgentOwnership: false,
      doNotContact: false
    });

    await emit(EVENT_TYPES.PROSPECT_CREATED, {
      prospectPhone: prospect.phone,
      actor: "SYSTEM",
      milestoneAfter: MILESTONES.NEW_LEAD,
      ownershipAfter: OWNERSHIP.ATLAS,
      payload: {
        source: WHATSAPP_SOURCE.FACEBOOK,
        entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
        channel: "whatsapp",
        prospect_number: prospect.prospect_number || null
      },
      correlationId: `${correlationBase}:prospect_created`
    });

    await emit(EVENT_TYPES.CONVERSATION_STARTED, {
      prospectPhone: prospect.phone,
      actor: "prospect",
      payload: {
        channel: "whatsapp",
        source: WHATSAPP_SOURCE.FACEBOOK,
        entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP
      },
      correlationId: `${correlationBase}:conversation_started`
    });

    logWhatsAppStage("prospect_created", { phone: prospect.phone });
    return;
  }

  logWhatsAppStage("prospect_located", { phone: prospect.phone });

  if (reopened) {
    await emit(EVENT_TYPES.CONVERSATION_REOPENED, {
      prospectPhone: prospect.phone,
      actor: "prospect",
      payload: {
        channel: "whatsapp",
        source: WHATSAPP_SOURCE.FACEBOOK
      },
      correlationId: `${correlationBase}:conversation_reopened`
    });

    logWhatsAppStage("conversation_reopened", { phone: prospect.phone });
  }
}

/**
 * @returns {Promise<{ prospect: Object, created: boolean, storagePhone: string }>}
 */
async function locateOrCreateWhatsAppProspect({ phone, name, firstMessage, correlationBase }) {
  const normalizedPhone = normalizePhoneNumber(phone);
  const storagePhone = resolveStoragePhone(phone);

  let prospect =
    (await findProspectByNormalizedPhone(normalizedPhone || phone)) ||
    (await findProspect(storagePhone)) ||
    (await findProspect(phone));

  const created = !prospect;

  if (created) {
    prospect = await insertWhatsAppProspectRow(
      storagePhone,
      normalizedPhone,
      name,
      firstMessage
    );
  } else if (firstMessage) {
    await updateProspect(prospect.phone, {
      last_message: firstMessage,
      name: prospect.name || name || prospect.name
    });
    prospect = (await findProspect(prospect.phone)) || prospect;
  }

  const reopened = !created && shouldEmitConversationReopened(prospect);

  await emitProspectLifecycleEvents(prospect, {
    created,
    reopened,
    correlationBase
  });

  return {
    prospect,
    created,
    storagePhone: prospect.phone
  };
}

module.exports = {
  locateOrCreateWhatsAppProspect,
  resolveStoragePhone,
  shouldEmitConversationReopened
};
