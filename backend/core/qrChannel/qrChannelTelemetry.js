/**
 * QR Channel Phase 1 telemetry (BR-133 subset).
 * Observational only — never throws into callers; never contains raw phone.
 */

const EVENTS = Object.freeze({
  SCAN_RECEIVED: "qr.scan.received",
  SCAN_RESOLVED: "qr.scan.resolved",
  SCAN_INVALID: "qr.scan.invalid",
  SCAN_INACTIVE: "qr.scan.inactive",
  PHONE_BIND_SUCCEEDED: "qr.phone_bind.succeeded",
  PHONE_BIND_FAILED: "qr.phone_bind.failed",
  REDIRECT_WHATSAPP: "qr.redirect.whatsapp",
  ATTRIBUTION_ATTACHED: "qr.whatsapp.attribution_attached",
  ATTRIBUTION_MISSED: "qr.whatsapp.attribution_missed",
  SCAN_CONSUMED: "qr.whatsapp.scan_consumed",
  CAMPAIGN_CREATED: "qr.campaign.created",
  CAMPAIGN_ACTIVATED: "qr.campaign.activated",
  CAMPAIGN_DEACTIVATED: "qr.campaign.deactivated",
  CAMPAIGN_QR_DOWNLOADED: "qr.campaign.qr_downloaded",
  CAMPAIGN_PUBLIC_URL_ACCESSED: "qr.campaign.public_url_accessed"
});

function emitQrEvent(eventName, fields = {}) {
  try {
    const payload = {
      component: "qr_channel",
      event: eventName,
      stage: eventName,
      at: new Date().toISOString()
    };
    if (fields.organizationId) payload.organizationId = fields.organizationId;
    if (fields.campaignId) payload.campaignId = fields.campaignId;
    if (fields.correlationId) payload.correlationId = fields.correlationId;
    if (fields.source) payload.source = fields.source;
    if (fields.outcome) payload.outcome = fields.outcome;
    if (fields.reasonCode) payload.reasonCode = fields.reasonCode;
    if (fields.campaignKey) payload.campaignKey = fields.campaignKey;
    if (fields.scanId) payload.scanId = fields.scanId;
    if (fields.phoneTail) payload.phoneTail = fields.phoneTail;
    if (fields.conversationGoal) payload.conversationGoal = fields.conversationGoal;
    console.log(JSON.stringify(payload));
  } catch {
    // best-effort
  }
}

module.exports = {
  EVENTS,
  emitQrEvent
};
