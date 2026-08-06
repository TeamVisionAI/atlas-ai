/**
 * Sprint 11.1 — Locate or create prospects for inbound WhatsApp leads.
 * Organization scoping: resolve via whatsappInboundOrganizationResolver (tenant-safe).
 */

const supabaseService = require("../services/supabaseService");
const quickCaptureEngine = require("../core/quickCaptureEngine");
const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("../core/phoneNormalizer");
const prospectNumberService = require("../services/prospectNumberService");
const eventEngine = require("./eventEngine");
const { savePersistedWorkflowState } = require("./workflowStateStore");
const { MILESTONES, OWNERSHIP } = require("./workflowConstants");
const {
  WHATSAPP_ENTRY_METHOD,
  WHATSAPP_SOURCE,
  REOPENED_INACTIVITY_MS
} = require("./whatsappConstants");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");
const recruitingWorkflowHooks = require("./recruitingWorkflowHooks");
const whatsappInboundOrganizationResolver = require("./whatsappInboundOrganizationResolver");
const {
  resolveNewLeadAssignment,
  buildNewLeadAttentionFields
} = require("./newLeadAssignmentEngine");

const { supabase } = supabaseService;
const { EVENT_TYPES } = eventEngine;
const { WhatsAppInboundOrganizationError } = whatsappInboundOrganizationResolver;

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
    message.includes("source") ||
    message.includes("organization_id") ||
    message.includes("assignment_status") ||
    message.includes("attention_status") ||
    message.includes("new_lead_received_at") ||
    message.includes("acknowledged_at") ||
    message.includes("escalation_level")
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

/**
 * @param {object} params
 * @param {string} params.storagePhone
 * @param {string|null} params.normalizedPhone
 * @param {string|null} params.name
 * @param {string|null} params.firstMessage
 * @param {string} params.organizationId
 */
async function insertWhatsAppProspectRow({
  storagePhone,
  normalizedPhone,
  name,
  firstMessage,
  organizationId
}) {
  if (!organizationId) {
    throw new WhatsAppInboundOrganizationError(
      "Refusing to create WhatsApp prospect without organization_id."
    );
  }

  const prospectNumber = await prospectNumberService.generateNextProspectNumber();
  const fullName = String(name || "Unknown").trim() || "Unknown";

  // Implements BR-080 — deterministic owner or durable Unassigned at create.
  const assignment = await resolveNewLeadAssignment({
    organizationId,
    source: WHATSAPP_SOURCE.FACEBOOK
  });
  const attentionFields = buildNewLeadAttentionFields(assignment);

  // Implements tenant scoping for WhatsApp inbound leads (org required).
  const insertRow = {
    phone: storagePhone,
    normalized_phone: normalizedPhone,
    name: fullName,
    first_name: fullName.split(" ")[0] || fullName,
    last_name: fullName.split(" ").slice(1).join(" ") || null,
    prospect_number: prospectNumber,
    organization_id: organizationId,
    current_step: "NEW",
    status: "NEW",
    language: "es",
    communication_language: "es",
    source: WHATSAPP_SOURCE.FACEBOOK,
    entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    preferred_communication_channel: "WHATSAPP",
    last_message: firstMessage || "",
    ...attentionFields
  };

  const { data, error } = await supabase.from("prospects").insert(insertRow).select().single();

  if (error && isMissingWhatsAppColumn(error)) {
    const { data: fallback, error: fallbackError } = await supabase
      .from("prospects")
      .insert({
        phone: storagePhone,
        name: fullName,
        organization_id: organizationId,
        owner_user_id: attentionFields.owner_user_id,
        current_step: "NEW",
        language: "es",
        last_message: firstMessage || "",
        notes: JSON.stringify({
          source: WHATSAPP_SOURCE.FACEBOOK,
          entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
          normalized_phone: normalizedPhone,
          prospect_number: prospectNumber,
          organization_id: organizationId,
          assignment_status: attentionFields.assignment_status,
          assignment_source: attentionFields.assignment_source,
          attention_status: attentionFields.attention_status,
          new_lead_received_at: attentionFields.new_lead_received_at
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

async function emitProspectLifecycleEvents(
  prospect,
  { created, reopened, correlationBase, organizationId }
) {
  if (created) {
    savePersistedWorkflowState(prospect.phone, {
      canonicalMilestone: MILESTONES.NEW_LEAD,
      workflowOwnership: OWNERSHIP.ATLAS,
      needsHumanAttention: false,
      manualAgentOwnership: false,
      doNotContact: false
    });

    await eventEngine.emit(EVENT_TYPES.PROSPECT_CREATED, {
      prospectPhone: prospect.phone,
      actor: "SYSTEM",
      milestoneAfter: MILESTONES.NEW_LEAD,
      ownershipAfter: OWNERSHIP.ATLAS,
      payload: {
        source: WHATSAPP_SOURCE.FACEBOOK,
        entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
        channel: "whatsapp",
        prospect_number: prospect.prospect_number || null,
        organization_id: organizationId || prospect.organization_id || null
      },
      correlationId: `${correlationBase}:prospect_created`
    });

    await eventEngine.emit(EVENT_TYPES.CONVERSATION_STARTED, {
      prospectPhone: prospect.phone,
      actor: "prospect",
      payload: {
        channel: "whatsapp",
        source: WHATSAPP_SOURCE.FACEBOOK,
        entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP
      },
      correlationId: `${correlationBase}:conversation_started`
    });

    logWhatsAppStage("prospect_created", {
      phone: prospect.phone,
      organizationId: organizationId || prospect.organization_id || null
    });

    await recruitingWorkflowHooks
      .onLegacyProspectCreated({
        prospect,
        source: WHATSAPP_SOURCE.FACEBOOK,
        organizationId: organizationId || prospect.organization_id || null
      })
      .catch((error) => {
        console.warn("[whatsappProspectResolver] core prospect bridge failed:", error.message);
      });

    return;
  }

  logWhatsAppStage("prospect_located", { phone: prospect.phone });

  if (reopened) {
    await eventEngine.emit(EVENT_TYPES.CONVERSATION_REOPENED, {
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
 * @returns {Promise<{ prospect: Object, created: boolean, storagePhone: string, organizationId: string|null }>}
 */
async function locateOrCreateWhatsAppProspect({
  phone,
  name,
  firstMessage,
  correlationBase,
  phoneNumberId = null,
  wabaId = null,
  organizationId: explicitOrganizationId = null
} = {}) {
  const normalizedPhone = normalizePhoneNumber(phone);
  const storagePhone = resolveStoragePhone(phone);

  const { organizationId, source: organizationSource } =
    await whatsappInboundOrganizationResolver.resolveWhatsAppInboundOrganizationId({
      phoneNumberId,
      wabaId,
      explicitOrganizationId
    });

  let prospect =
    (await quickCaptureEngine.findProspectByNormalizedPhone(normalizedPhone || phone)) ||
    (await supabaseService.findProspect(storagePhone)) ||
    (await supabaseService.findProspect(phone));

  const created = !prospect;

  if (created) {
    prospect = await insertWhatsAppProspectRow({
      storagePhone,
      normalizedPhone,
      name,
      firstMessage,
      organizationId
    });
  } else if (firstMessage) {
    const updates = {
      last_message: firstMessage,
      name: prospect.name || name || prospect.name
    };

    // Repair null-org rows on subsequent inbound when safe for the same tenant.
    if (!prospect.organization_id) {
      updates.organization_id = organizationId;
    }

    // BR-080 — never reassign a valid owner on duplicate/repeated inbound.
    await supabaseService.updateProspect(prospect.phone, updates);
    prospect = (await supabaseService.findProspect(prospect.phone)) || prospect;
  }

  const reopened = !created && shouldEmitConversationReopened(prospect);

  await emitProspectLifecycleEvents(prospect, {
    created,
    reopened,
    correlationBase,
    organizationId
  });

  logWhatsAppStage("inbound_organization_resolved", {
    organizationId,
    organizationSource,
    created
  });

  return {
    prospect,
    created,
    storagePhone: prospect.phone,
    organizationId
  };
}

module.exports = {
  locateOrCreateWhatsAppProspect,
  resolveStoragePhone,
  shouldEmitConversationReopened,
  insertWhatsAppProspectRow
};
