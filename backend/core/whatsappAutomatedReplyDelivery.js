/**
 * Automated WhatsApp reply delivery semantics (first reply / recovery).
 * Graph API accept is not delivery — Meta lifecycle failure must fail closed.
 */

const { supabase } = require("../services/supabaseService");
const { resolveStoragePhone } = require("./whatsappProspectResolver");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

const AUTOMATED_REPLY_INTENTS = new Set([
  "CONVERSATION_ENGINE_REPLY",
  "FACEBOOK_LEAD_WELCOME"
]);

const DELIVERED_META_STATUSES = new Set(["sent", "delivered", "read"]);

let outboundDeliveriesQueryOverride = null;

function setOutboundDeliveriesQueryForTests(override) {
  outboundDeliveriesQueryOverride = typeof override === "function" ? override : null;
}

function isAutomatedReplyIntent(intent) {
  return AUTOMATED_REPLY_INTENTS.has(String(intent || "").trim());
}

function conversationDeliveredReply(conversation) {
  if (!conversation?.replied) {
    return false;
  }
  if (!conversation.delivery || typeof conversation.delivery !== "object") {
    return false;
  }
  if (conversation.delivery.success !== true) {
    return false;
  }
  const metaStatus = String(
    conversation.delivery.metaDeliveryStatus ||
      conversation.delivery.meta_delivery_status ||
      ""
  )
    .trim()
    .toLowerCase();
  if (metaStatus === "failed") {
    return false;
  }
  return true;
}

async function queryOutboundDeliveries(phone, organizationId) {
  if (outboundDeliveriesQueryOverride) {
    return outboundDeliveriesQueryOverride(phone, organizationId);
  }
  const storagePhone = resolveStoragePhone(phone);
  if (!storagePhone) {
    return [];
  }

  let query = supabase
    .from("whatsapp_outbound_deliveries")
    .select("id, status, intent, meta_delivery_status, provider_message_id, created_at")
    .eq("prospect_phone", storagePhone)
    .in("status", ["sent_freeform", "sent_template"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

async function prospectHasDeliveredAutomatedOutbound(phone, organizationId) {
  try {
    const rows = await queryOutboundDeliveries(phone, organizationId);
    return rows.some((row) => {
      if (!isAutomatedReplyIntent(row.intent)) {
        return false;
      }
      const meta = String(row.meta_delivery_status || "").trim().toLowerCase();
      if (!meta) {
        // Graph accepted; lifecycle pending — treat as in-flight, not retry spam.
        return true;
      }
      return DELIVERED_META_STATUSES.has(meta);
    });
  } catch (error) {
    logWhatsAppStage("automated_outbound_delivery_lookup_failed", {
      level: "warn",
      phone,
      error: error.message
    });
    return true;
  }
}

async function prospectHasFailedAutomatedOutboundOnly(phone, organizationId) {
  try {
    const rows = await queryOutboundDeliveries(phone, organizationId).then((all) =>
      all.filter((row) => isAutomatedReplyIntent(row.intent))
    );
    if (!rows.length) {
      return false;
    }
    const hasDelivered = rows.some((row) => {
      const meta = String(row.meta_delivery_status || "").trim().toLowerCase();
      return !meta || DELIVERED_META_STATUSES.has(meta);
    });
    if (hasDelivered) {
      return false;
    }
    return rows.some(
      (row) => String(row.meta_delivery_status || "").trim().toLowerCase() === "failed"
    );
  } catch (error) {
    logWhatsAppStage("automated_outbound_failure_lookup_failed", {
      level: "warn",
      phone,
      error: error.message
    });
    return false;
  }
}

async function handleAutomatedOutboundMetaFailure({ deliveryRow, statusEvent } = {}) {
  if (!deliveryRow || !isAutomatedReplyIntent(deliveryRow.intent)) {
    return { handled: false };
  }

  const metaStatus = String(
    deliveryRow.meta_delivery_status || statusEvent?.status || ""
  )
    .trim()
    .toLowerCase();
  if (metaStatus !== "failed") {
    return { handled: false };
  }

  const phone = deliveryRow.prospect_phone;
  const organizationId = deliveryRow.organization_id || null;
  if (!phone) {
    return { handled: false };
  }

  logWhatsAppStage("automated_outbound_meta_delivery_failed", {
    phone,
    organizationId,
    providerMessageId: deliveryRow.provider_message_id || statusEvent?.providerMessageId || null,
    failureCode: deliveryRow.failure_code || statusEvent?.failureCode || null,
    failureReason: deliveryRow.failure_reason || statusEvent?.failureReason || null,
    intent: deliveryRow.intent || null
  });

  try {
    const { findProspectInOrganization } = require("../services/supabaseService");
    const { markHumanAttentionRequired } = require("./newLeadAttentionEngine");
    const prospect = await findProspectInOrganization(phone, organizationId);
    if (prospect) {
      await markHumanAttentionRequired(
        prospect,
        deliveryRow.failure_reason ||
          statusEvent?.failureReason ||
          "whatsapp_meta_delivery_failed"
      );
    }
  } catch (error) {
    logWhatsAppStage("automated_outbound_meta_failure_attention_failed", {
      level: "warn",
      phone,
      error: error.message
    });
  }

  return { handled: true };
}

module.exports = {
  AUTOMATED_REPLY_INTENTS,
  DELIVERED_META_STATUSES,
  isAutomatedReplyIntent,
  conversationDeliveredReply,
  queryOutboundDeliveries,
  prospectHasDeliveredAutomatedOutbound,
  prospectHasFailedAutomatedOutboundOnly,
  handleAutomatedOutboundMetaFailure,
  setOutboundDeliveriesQueryForTests
};
