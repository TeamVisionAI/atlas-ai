/**
 * Urgent appointment handoff — scheduling lead-time thresholds and statuses.
 * Applies to all appointment purposes/tenants; no recruiting-specific rules.
 */

const URGENT_LEAD_TIME_MS = 60 * 60 * 1000;
const ESCALATION_LEAD_TIME_MS = 5 * 60 * 1000;

const HANDOFF_STATUSES = Object.freeze({
  OPEN: "open",
  ACKNOWLEDGED: "acknowledged",
  ESCALATED: "escalated",
  EXPIRED: "expired",
  CANCELLED: "cancelled"
});

const DELIVERY_STATUSES = Object.freeze({
  PENDING: "pending",
  SENT: "sent",
  SKIPPED: "skipped",
  FAILED: "failed"
});

const AUDIT_ACTIONS = Object.freeze({
  CREATED: "urgent_appointment_handoff_created",
  PROSPECT_CONFIRMATION_SENT: "urgent_appointment_handoff_prospect_confirmation_sent",
  PROSPECT_CONFIRMATION_FAILED: "urgent_appointment_handoff_prospect_confirmation_failed",
  AGENT_WHATSAPP_SKIPPED: "urgent_appointment_handoff_agent_whatsapp_skipped",
  AGENT_WHATSAPP_SENT: "urgent_appointment_handoff_agent_whatsapp_sent",
  AGENT_WHATSAPP_FAILED: "urgent_appointment_handoff_agent_whatsapp_failed",
  ACKNOWLEDGED: "urgent_appointment_handoff_acknowledged",
  ESCALATED: "urgent_appointment_handoff_escalated",
  ESCALATION_SKIPPED: "urgent_appointment_handoff_escalation_skipped"
});

module.exports = {
  URGENT_LEAD_TIME_MS,
  ESCALATION_LEAD_TIME_MS,
  HANDOFF_STATUSES,
  DELIVERY_STATUSES,
  AUDIT_ACTIONS
};
