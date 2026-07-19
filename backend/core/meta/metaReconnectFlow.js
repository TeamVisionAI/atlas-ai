/**
 * Sprint 6.2+ — Reconnect flow (not implemented).
 *
 * TODO(reconnect-flow):
 * 1. Detect unhealthy/expired tokens via metaConnectionHealthService on a schedule.
 * 2. Mark connection status as "reconnect_required" without deleting WABA metadata.
 * 3. Surface reconnect CTA on /settings/whatsapp when health !== healthy.
 * 4. Re-launch Embedded Signup (featureType: whatsapp_business_app_onboarding) to refresh token.
 * 5. Exchange new authorization code and rotate encrypted token in repository.
 * 6. Re-subscribe WABA to Atlas app and verify webhook delivery.
 * 7. Emit workflow event ConnectionReauthorized (future) for audit trail.
 *
 * Do not implement automatic reconnect in Sprint 6.1 — manual retry via Connect screen only.
 */

const RECONNECT_FLOW_STATUS = Object.freeze({
  NOT_IMPLEMENTED: "not_implemented",
  PLANNED_SPRINT: "6.2+"
});

function getReconnectFlowPlan() {
  return {
    status: RECONNECT_FLOW_STATUS.NOT_IMPLEMENTED,
    plannedSprint: RECONNECT_FLOW_STATUS.PLANNED_SPRINT,
    manualPath: "/settings/whatsapp",
    steps: [
      "User opens Connect WhatsApp screen",
      "User clicks Connect WhatsApp Business again",
      "Embedded Signup completes and exchange rotates token"
    ]
  };
}

module.exports = {
  RECONNECT_FLOW_STATUS,
  getReconnectFlowPlan
};
