/**
 * BR-163 — Move stale WhatsApp threads out of Active after the customer-care window.
 * Window source is the latest qualifying prospect inbound (BR-075), never receipts,
 * reactions, diagnostics, ownership changes, or Atlas outbound.
 */

const {
  evaluateCustomerCareWindowFromInboundAt
} = require("../whatsappCustomerCareWindowMath");
const { isProspectInbound, logTimestampMs } = require("./conversationsUnreadEngine");
const { INBOX_CLOSE_REASONS } = require("./conversationsCenterLifecycle");
const {
  savePersistedWorkflowState,
  loadPersistedWorkflowState
} = require("../workflowStateStore");

const WINDOW_ARCHIVE_REASON = INBOX_CLOSE_REASONS.WINDOW_EXPIRED;

function latestQualifyingInboundAt(logs = []) {
  let latestMs = null;

  for (const row of logs) {
    if (!isProspectInbound(row)) {
      continue;
    }
    const ms = logTimestampMs(row);
    if (ms == null) {
      continue;
    }
    if (latestMs == null || ms > latestMs) {
      latestMs = ms;
    }
  }

  return latestMs == null ? null : new Date(latestMs).toISOString();
}

function evaluateWindowFromLogs(logs = [], now = new Date()) {
  return evaluateCustomerCareWindowFromInboundAt({
    latestInboundAt: latestQualifyingInboundAt(logs),
    now
  });
}

function isOperatorClosed(persisted = {}) {
  return Boolean(persisted.inboxClosedAt || persisted.inboxMarkedTestAt);
}

function isWindowExpiredArchive(persisted = {}) {
  return (
    Boolean(persisted.inboxWindowExpiredAt) ||
    String(persisted.inboxCloseReason || "") === WINDOW_ARCHIVE_REASON
  );
}

function shouldDeriveWindowExpiredArchive({ persisted = {}, customerCareWindow = null } = {}) {
  if (isOperatorClosed(persisted) || persisted.inboxArchivedAt) {
    return false;
  }
  if (!customerCareWindow || customerCareWindow.open) {
    return false;
  }
  return customerCareWindow.reason === "WINDOW_EXPIRED";
}

function shouldPersistWindowExpiredArchive({ persisted = {}, customerCareWindow = null } = {}) {
  return shouldDeriveWindowExpiredArchive({ persisted, customerCareWindow });
}

function shouldReactivateOnInbound(persisted = {}) {
  if (isOperatorClosed(persisted)) {
    return false;
  }
  return Boolean(persisted.inboxArchivedAt);
}

async function persistWindowExpiredArchive({
  phone,
  organizationId = null,
  prospectId = null,
  now = new Date()
} = {}) {
  const orgId = String(organizationId || "").trim();
  if (!phone || !orgId) {
    const error = new Error("organization_id is required to archive a conversation window");
    error.statusCode = 403;
    error.code = "CONVERSATION_WINDOW_ORG_REQUIRED";
    throw error;
  }

  const stamped = new Date(now).toISOString();
  return savePersistedWorkflowState(
    phone,
    {
      inboxArchivedAt: stamped,
      inboxWindowExpiredAt: stamped,
      inboxCloseReason: WINDOW_ARCHIVE_REASON
    },
    { organizationId: orgId, prospectId: prospectId || null }
  );
}

async function reactivateWindowExpiredConversation({
  phone,
  organizationId = null,
  prospectId = null
} = {}) {
  const orgId = String(organizationId || "").trim();
  if (!phone || !orgId) {
    return { reactivated: false, reason: "ORGANIZATION_REQUIRED" };
  }

  const previous = await loadPersistedWorkflowState(phone, {
    organizationId: orgId,
    prospectId: prospectId || null
  });

  if (!shouldReactivateOnInbound(previous)) {
    return { reactivated: false, reason: "NOT_WINDOW_ARCHIVED", previous };
  }

  const next = await savePersistedWorkflowState(
    phone,
    {
      inboxArchivedAt: null,
      inboxWindowExpiredAt: null,
      inboxCloseReason: previous.inboxCloseReason === WINDOW_ARCHIVE_REASON
        ? null
        : previous.inboxCloseReason || null
    },
    { organizationId: orgId, prospectId: prospectId || null }
  );

  return { reactivated: true, reason: "INBOUND_REACTIVATED", previous, next };
}

module.exports = {
  WINDOW_ARCHIVE_REASON,
  latestQualifyingInboundAt,
  evaluateWindowFromLogs,
  shouldDeriveWindowExpiredArchive,
  shouldPersistWindowExpiredArchive,
  shouldReactivateOnInbound,
  persistWindowExpiredArchive,
  reactivateWindowExpiredConversation
};
