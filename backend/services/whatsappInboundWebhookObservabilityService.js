/**
 * Capture and query sanitized inbound WhatsApp webhook observability snapshots.
 * Diagnostics only — does not affect BR-142 eligibility or Recruit AI behavior.
 */

const { logWhatsAppStage } = require("../core/whatsappStructuredLogger");
const {
  extractInboundMessageSnapshots
} = require("../core/whatsappInboundWebhookObservability/extractInboundMessageSnapshots");
const {
  resolveRetentionDays,
  isObservabilityEnabled
} = require("../core/whatsappInboundWebhookObservability/config");
const repository = require("../repositories/whatsappInboundWebhookObservabilityRepository");
const {
  resolveWhatsAppInboundOrganizationId
} = require("../core/whatsappInboundOrganizationResolver");

async function resolveOrganizationForSnapshot(snapshot, dependencies = {}) {
  const resolveOrg =
    dependencies.resolveWhatsAppInboundOrganizationId ||
    resolveWhatsAppInboundOrganizationId;

  try {
    const routed = await resolveOrg({
      phoneNumberId: snapshot.phoneNumberId || null,
      wabaId: snapshot.wabaId || null,
      connectionRepository: dependencies.connectionRepository
    });
    return routed?.organizationId || null;
  } catch {
    return null;
  }
}

/**
 * Persist snapshots extracted from raw Meta webhook body (pre-normalization).
 * Fail-soft: never interrupts webhook processing.
 */
async function captureInboundWebhookObservability(body, dependencies = {}) {
  if (!isObservabilityEnabled(dependencies.env)) {
    return { captured: 0, skipped: true, reason: "DISABLED" };
  }

  const snapshots = extractInboundMessageSnapshots(body);
  if (!snapshots.length) {
    return { captured: 0, skipped: true, reason: "NO_MESSAGES" };
  }

  const repo = dependencies.repository || repository;
  let captured = 0;

  for (const snapshot of snapshots) {
    try {
      const organizationId = await resolveOrganizationForSnapshot(snapshot, dependencies);
      const receivedAt = snapshot.messageTimestamp
        ? new Date(Number(snapshot.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();

      const result = await repo.insertSnapshot(
        {
          organization_id: organizationId,
          prospect_phone: snapshot.prospectPhone,
          provider_message_id: snapshot.providerMessageId,
          waba_id: snapshot.wabaId,
          phone_number_id: snapshot.phoneNumberId,
          display_phone_number: snapshot.displayPhoneNumber,
          message_type: snapshot.messageType,
          message_from: snapshot.messageFrom,
          message_timestamp: snapshot.messageTimestamp,
          has_referral: snapshot.hasReferral,
          has_ctwa_clid: snapshot.hasCtwaClid,
          referral_source_type: snapshot.referralSourceType,
          payload: snapshot.payload,
          received_at: receivedAt
        },
        dependencies.client
      );

      if (result.ok) {
        captured += 1;
      } else if (result.reason !== "DUPLICATE_PROVIDER_MESSAGE") {
        logWhatsAppStage("inbound_webhook_observability_capture_failed", {
          level: "warn",
          providerMessageId: snapshot.providerMessageId,
          reason: result.reason
        });
      }
    } catch (error) {
      logWhatsAppStage("inbound_webhook_observability_capture_failed", {
        level: "warn",
        providerMessageId: snapshot.providerMessageId,
        error: error.message
      });
    }
  }

  if (dependencies.purgeOnCapture !== false) {
    try {
      await purgeExpiredInboundWebhookObservability(dependencies);
    } catch {
      // Retention must never block capture.
    }
  }

  return { captured, skipped: false, total: snapshots.length };
}

/**
 * Link observability row after pipeline resolves prospect/conversation context.
 */
async function linkInboundWebhookObservability(
  {
    providerMessageId,
    organizationId = null,
    prospectId = null,
    conversationLogId = null,
    ownerUserId = null,
    prospectPhone = null
  },
  dependencies = {}
) {
  if (!isObservabilityEnabled(dependencies.env)) {
    return { ok: false, reason: "DISABLED" };
  }

  const repo = dependencies.repository || repository;
  return repo.linkSnapshot(
    providerMessageId,
    {
      organization_id: organizationId,
      prospect_id: prospectId,
      conversation_log_id: conversationLogId,
      owner_user_id: ownerUserId,
      prospect_phone: prospectPhone
    },
    dependencies.client
  );
}

async function findInboundWebhookObservability(filters = {}, dependencies = {}) {
  const repo = dependencies.repository || repository;
  return repo.searchSnapshots(filters, dependencies.client);
}

async function purgeExpiredInboundWebhookObservability(dependencies = {}) {
  const days = resolveRetentionDays(dependencies.env);
  if (days <= 0) {
    return { deleted: 0, skipped: true, reason: "RETENTION_DISABLED" };
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const repo = dependencies.repository || repository;
  return repo.purgeOlderThan(cutoff, dependencies.client);
}

module.exports = {
  captureInboundWebhookObservability,
  linkInboundWebhookObservability,
  findInboundWebhookObservability,
  purgeExpiredInboundWebhookObservability,
  resolveOrganizationForSnapshot
};
