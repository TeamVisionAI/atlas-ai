/**
 * BR-184 — Today / Action Center presentation.
 * Aggregation/presentation only. Canonical source records remain SoT.
 */

const {
  isFirstResponseSlaSatisfied,
  isFirstResponseSlaReason,
  needsManualAcknowledge
} = require("../newLeadAttentionEngine");
const { isOperationalProspectRecord } = require("../prospectPromotionEligibility");
const { FOLLOW_UP_VIEW_STATUSES } = require("../followUps");
const { EVENT_TYPES, TAKEOVER_REQUEST_REASONS } = require("../agentNotifications/constants");
const {
  DISPLAY_PRIORITY,
  TODAY_FILTERS,
  TODAY_KINDS,
  TODAY_PRIORITIES,
  APPOINTMENT_SOON_MS
} = require("./todayConstants");

function ownerIdOfProspect(prospect = {}) {
  return prospect.owner_user_id || prospect.ownerUserId || null;
}

function ownerIdOfAppointment(appointment = {}) {
  return (
    appointment.agentId ||
    appointment.ownerUserId ||
    appointment.metadata?.ownerUserId ||
    null
  );
}

function matchesOwnerFilter(ownerId, ownerFilter = {}) {
  if (!ownerFilter.ownerUserIds) {
    return true;
  }
  if (!ownerId) {
    return false;
  }
  return ownerFilter.ownerUserIds.map(String).includes(String(ownerId));
}

/**
 * Durable CRM attention / inbound clock. Independent of BR-159 pipeline membership.
 * Implements BR-180 — persisted human_required / new inbound must reach Today.
 */
function hasTodayAttentionSignal(prospect = {}) {
  const attention = String(prospect.attention_status || prospect.attentionStatus || "").toLowerCase();
  if (attention === "human_required" || attention === "new") {
    return true;
  }
  if (prospect.needs_human_attention === true || prospect.needsHumanAttention === true) {
    return true;
  }
  return Boolean(prospect.new_lead_received_at || prospect.newLeadReceivedAt);
}

function isTodayProspectCandidate(prospect = {}) {
  if (!prospect) {
    return false;
  }
  if (hasTodayAttentionSignal(prospect)) {
    return true;
  }
  return isOperationalProspectRecord(prospect);
}

function isHealedBr080Stale(prospect = {}) {
  const reason = prospect.human_attention_reason || prospect.humanAttentionReason;
  if (isFirstResponseSlaSatisfied(prospect) && isFirstResponseSlaReason(reason)) {
    return true;
  }
  const flagged =
    prospect.needs_human_attention === true || prospect.needsHumanAttention === true;
  if (flagged && isFirstResponseSlaSatisfied(prospect) && (!reason || isFirstResponseSlaReason(reason))) {
    return true;
  }
  return false;
}

function isHumanTakeoverReason(reason) {
  const normalized = String(reason || "").trim();
  return TAKEOVER_REQUEST_REASONS.includes(normalized);
}

function isRealNeedsAttention(prospect = {}) {
  if (isHealedBr080Stale(prospect)) {
    return false;
  }
  const attention = String(prospect.attention_status || "").toLowerCase();
  const flagged =
    prospect.needs_human_attention === true || prospect.needsHumanAttention === true;
  if (attention === "human_required") {
    return !isFirstResponseSlaSatisfied(prospect);
  }
  if (flagged) {
    return !isFirstResponseSlaSatisfied(prospect);
  }
  return false;
}

function isActionableNewLead(prospect = {}) {
  if (!needsManualAcknowledge(prospect)) {
    return false;
  }
  const attention = String(prospect.attention_status || prospect.attentionStatus || "").toLowerCase();
  if (attention === "human_required") {
    return false;
  }
  if (attention === "new") {
    return true;
  }
  if (!attention) {
    return Boolean(prospect.new_lead_received_at || prospect.newLeadReceivedAt);
  }
  return false;
}

function formatFriendlyTime(iso, timeZone, locale = "en-US") {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timeZone || "America/New_York",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat(locale, {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(ms));
  }
}

function formatFriendlyDate(value, timeZone, locale = "en-US") {
  if (!value) {
    return null;
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00.000Z` : value;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return String(value);
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timeZone || "America/New_York",
      month: "short",
      day: "numeric"
    }).format(new Date(ms));
  } catch {
    return String(value);
  }
}

function parseSortMs(value) {
  if (value == null || value === "") {
    return Number.POSITIVE_INFINITY;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const ms = Date.parse(`${value}T12:00:00.000Z`);
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function prospectHref(prospect = {}) {
  if (prospect.phone) {
    return `/app/prospect-workspace/${encodeURIComponent(prospect.phone)}`;
  }
  if (prospect.id) {
    return `/app/conversations?prospectId=${encodeURIComponent(prospect.id)}`;
  }
  return "/app/conversations";
}

function appointmentHref(appointment = {}) {
  if (!appointment.id) {
    return "/app/appointments";
  }
  return `/app/appointments?appointmentId=${encodeURIComponent(appointment.id)}`;
}

function followUpHref(item = {}) {
  if (item.entityType === "client" && item.entityId) {
    return `/app/clients/${encodeURIComponent(item.entityId)}`;
  }
  if (item.entityType === "appointment" && (item.appointmentId || item.entityId)) {
    return `/app/appointments?appointmentId=${encodeURIComponent(item.appointmentId || item.entityId)}`;
  }
  if (item.phone) {
    return `/app/prospect-workspace/${encodeURIComponent(item.phone)}`;
  }
  if (item.entityType === "prospect" && item.entityId) {
    return `/app/conversations?prospectId=${encodeURIComponent(item.entityId)}`;
  }
  return "/app/follow-ups";
}

function notificationHref(item = {}) {
  return item.actionUrl || item.action_url || "/app/conversations";
}

function appointmentPerson(appointment = {}) {
  return (
    appointment.prospectName ||
    appointment.metadata?.prospectName ||
    appointment.metadata?.agendaContactName ||
    appointment.prospectPhone ||
    appointment.metadata?.agendaContactPhone ||
    "Appointment"
  );
}

function appointmentType(appointment = {}) {
  return appointment.purpose || appointment.meetingType || "appointment";
}

function withPresentation(item) {
  const openPath = item.openPath || item.href || null;
  return {
    personName: item.personName || item.title || null,
    owner: item.owner || (item.ownerName || item.ownerId
      ? { id: item.ownerId || null, name: item.ownerName || null }
      : null),
    dueAt: item.dueAt || null,
    priority: item.priority || TODAY_PRIORITIES.DUE_TODAY,
    sourceKind: item.sourceKind || item.kind,
    openPath,
    href: openPath,
    createdAt: item.createdAt || null,
    ...item,
    openPath,
    href: openPath
  };
}

function presentNeedsAttention(prospect, { ownerName = null } = {}) {
  const reason = prospect.human_attention_reason || prospect.humanAttentionReason || "needs_attention";
  const takeover = isHumanTakeoverReason(reason);
  const personName = prospect.name || prospect.phone || "Needs attention";
  const openPath = prospectHref(prospect);
  return withPresentation({
    id: `${takeover ? "takeover" : "na"}:${prospect.id || prospect.phone}`,
    kind: takeover ? TODAY_KINDS.HUMAN_TAKEOVER : TODAY_KINDS.NEEDS_ATTENTION,
    displayPriority: DISPLAY_PRIORITY.NEEDS_ATTENTION,
    priority: TODAY_PRIORITIES.NEEDS_ATTENTION,
    title: personName,
    personName,
    subtitle: reason,
    whenLabel: null,
    status: prospect.attention_status || "human_required",
    ownerId: ownerIdOfProspect(prospect),
    ownerName,
    openPath,
    entityType: "prospect",
    entityId: prospect.id || null,
    phone: prospect.phone || null,
    actions: ["open", "open-conversation"],
    sourceKind: takeover ? "human_takeover" : "conversation",
    source: null,
    createdAt: prospect.created_at || prospect.createdAt || prospect.new_lead_received_at || null
  });
}

function presentAppointment(appointment, { timeZone, reference, ownerName = null } = {}) {
  const startMs = Date.parse(appointment.startDateTime);
  const refMs = reference instanceof Date ? reference.getTime() : Date.parse(reference || Date.now());
  const soon = Number.isFinite(startMs) && startMs - refMs >= 0 && startMs - refMs <= APPOINTMENT_SOON_MS;
  const personName = appointmentPerson(appointment);
  const openPath = appointmentHref(appointment);
  return withPresentation({
    id: `appt:${appointment.id}`,
    kind: TODAY_KINDS.APPOINTMENT,
    displayPriority: soon ? DISPLAY_PRIORITY.DUE_TODAY : DISPLAY_PRIORITY.UPCOMING_TODAY,
    priority: soon ? TODAY_PRIORITIES.DUE_TODAY : TODAY_PRIORITIES.UPCOMING_TODAY,
    title: personName,
    personName,
    subtitle: appointmentType(appointment),
    whenLabel: formatFriendlyTime(appointment.startDateTime, timeZone),
    dueAt: appointment.startDateTime || null,
    status: appointment.status || "scheduled",
    ownerId: ownerIdOfAppointment(appointment),
    ownerName: ownerName || appointment.agentName || null,
    openPath,
    entityType: appointment.agendaContactId && !appointment.prospectId ? "client_appointment" : "appointment",
    entityId: appointment.id || null,
    phone: appointment.prospectPhone || null,
    actions: ["open", "open-appointment", "reschedule", "cancel"],
    sourceKind: "appointment",
    source: {
      appointmentId: appointment.id,
      purpose: appointment.purpose || null,
      meetingType: appointment.meetingType || null
    },
    createdAt: appointment.createdAt || appointment.created_at || appointment.startDateTime || null
  });
}

function datedObligationPriority(status) {
  if (status === FOLLOW_UP_VIEW_STATUSES.OVERDUE) {
    return { displayPriority: DISPLAY_PRIORITY.OVERDUE, priority: TODAY_PRIORITIES.OVERDUE };
  }
  return { displayPriority: DISPLAY_PRIORITY.DUE_TODAY, priority: TODAY_PRIORITIES.DUE_TODAY };
}

function presentDocumentRequestItem(item, { timeZone } = {}) {
  const ranked = datedObligationPriority(item.status);
  const personName = item.name || item.title || "Document request";
  const openPath = item.href || (item.entityId ? `/app/clients/${item.entityId}` : "/app/clients");
  return withPresentation({
    id: `docreq:${item.id}`,
    kind: TODAY_KINDS.DOCUMENT_REQUEST,
    displayPriority: ranked.displayPriority,
    priority: ranked.priority,
    title: item.title || personName,
    personName,
    subtitle: item.name && item.name !== item.title ? item.name : item.source?.documentType || null,
    whenLabel: formatFriendlyDate(item.dueDate, timeZone) || item.dueDate || null,
    dueAt: item.dueDate || null,
    status: item.status,
    ownerId: item.ownerUserId || null,
    ownerName: item.ownerName || null,
    openPath,
    entityType: "document_request",
    entityId: item.id,
    phone: null,
    actions: ["open", "open-document-request", "open-client"],
    sourceKind: "document_request",
    source: item.source || item,
    createdAt: item.createdAt || item.created_at || null
  });
}

function presentServiceCaseItem(item, { timeZone } = {}) {
  if (item.status === FOLLOW_UP_VIEW_STATUSES.NEEDS_DATE) {
    return null;
  }
  const ranked = datedObligationPriority(item.status);
  const personName = item.name || item.title || "Service case";
  const openPath = item.href || (item.entityId ? `/app/clients/${item.entityId}` : "/app/service");
  return withPresentation({
    id: `svc:${item.id}`,
    kind: TODAY_KINDS.SERVICE_CASE,
    displayPriority: ranked.displayPriority,
    priority: ranked.priority,
    title: item.title || personName,
    personName,
    subtitle: item.name && item.name !== item.title ? item.name : item.source?.serviceType || null,
    whenLabel: formatFriendlyDate(item.dueDate, timeZone) || item.dueDate || null,
    dueAt: item.dueDate || null,
    status: item.status,
    ownerId: item.ownerUserId || null,
    ownerName: item.ownerName || null,
    openPath,
    entityType: "service_case",
    entityId: item.id,
    phone: null,
    actions: ["open", "open-client"],
    sourceKind: "service_case",
    source: item.source || item,
    createdAt: item.createdAt || item.created_at || null
  });
}

function presentFollowUpItem(item, { timeZone } = {}) {
  const ranked = datedObligationPriority(item.status);
  const personName = item.name || item.title || "Follow-up";
  const whenLabel = item.dueTime
    ? formatFriendlyTime(item.dueAt, timeZone) || item.dueTime
    : formatFriendlyDate(item.dueDate, timeZone) || item.dueDate || null;
  const openPath = followUpHref(item);
  return withPresentation({
    id: `fu:${item.id}`,
    kind: TODAY_KINDS.FOLLOW_UP,
    displayPriority: ranked.displayPriority,
    priority: ranked.priority,
    title: item.title || personName,
    personName,
    subtitle: item.followUpReason || item.title || null,
    whenLabel,
    dueAt: item.dueAt || item.dueDate || null,
    status: item.status,
    ownerId: item.representativeId || item.ownerUserId || null,
    ownerName: item.representativeName || null,
    openPath,
    entityType: item.entityType || "prospect",
    entityId: item.entityId || null,
    phone: item.phone || null,
    actions: item.source === "legacy" ? ["open", "set-date"] : ["open", "complete", "reschedule", "cancel"],
    sourceKind: "follow_up",
    source: item,
    createdAt: item.createdAt || item.created_at || null
  });
}

function presentNewLead(prospect, { ownerName = null } = {}) {
  const personName = prospect.name || prospect.phone || "New conversation";
  const openPath = prospectHref(prospect);
  return withPresentation({
    id: `lead:${prospect.id || prospect.phone}`,
    kind: TODAY_KINDS.NEW_LEAD,
    displayPriority: DISPLAY_PRIORITY.NEEDS_ATTENTION,
    priority: TODAY_PRIORITIES.NEEDS_ATTENTION,
    title: personName,
    personName,
    subtitle: "unanswered",
    whenLabel: null,
    status: prospect.attention_status || "new",
    ownerId: ownerIdOfProspect(prospect),
    ownerName,
    openPath,
    entityType: "prospect",
    entityId: prospect.id || null,
    phone: prospect.phone || null,
    actions: ["open", "open-conversation"],
    sourceKind: "conversation",
    source: null,
    createdAt: prospect.new_lead_received_at || prospect.created_at || prospect.createdAt || null
  });
}

function presentHumanTakeoverNotification(item) {
  const personName = item.title || "Human takeover";
  const openPath = notificationHref(item);
  return withPresentation({
    id: `takeover-nt:${item.id}`,
    kind: TODAY_KINDS.HUMAN_TAKEOVER,
    displayPriority: DISPLAY_PRIORITY.NEEDS_ATTENTION,
    priority: TODAY_PRIORITIES.NEEDS_ATTENTION,
    title: personName,
    personName,
    subtitle: item.eventType || "HUMAN_TAKEOVER_REQUESTED",
    whenLabel: null,
    status: "human_required",
    ownerId: item.ownerUserId || item.recipientUserId || null,
    ownerName: null,
    openPath,
    entityType: item.entityType || "prospect",
    entityId: item.entityId || null,
    phone: null,
    actions: ["open", "open-conversation"],
    sourceKind: "human_takeover",
    source: {
      notificationId: item.id,
      eventType: item.eventType || EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED
    },
    createdAt: item.createdAt || item.created_at || null
  });
}

function collectDedupKeys(item = {}) {
  const keys = new Set();
  if (item.id) {
    keys.add(`id:${item.id}`);
  }
  if (item.kind && item.entityId) {
    keys.add(`kind:${item.kind}:${item.entityId}`);
  }
  if (item.source?.appointmentId) {
    keys.add(`appointment:${item.source.appointmentId}`);
  }
  if (item.kind === TODAY_KINDS.APPOINTMENT && (item.entityId || item.source?.appointmentId)) {
    keys.add(`appointment:${item.entityId || item.source.appointmentId}`);
  }
  if (item.kind === TODAY_KINDS.FOLLOW_UP && item.source?.id) {
    keys.add(`follow_up:${item.source.id}`);
  }
  if (item.kind === TODAY_KINDS.DOCUMENT_REQUEST && (item.entityId || item.source?.id)) {
    keys.add(`document_request:${item.entityId || item.source.id}`);
  }
  if (item.kind === TODAY_KINDS.SERVICE_CASE && (item.entityId || item.source?.id)) {
    keys.add(`service_case:${item.entityId || item.source.id}`);
  }
  if (
    (item.kind === TODAY_KINDS.NEEDS_ATTENTION ||
      item.kind === TODAY_KINDS.HUMAN_TAKEOVER ||
      item.kind === TODAY_KINDS.NEW_LEAD) &&
    (item.entityId || item.phone)
  ) {
    keys.add(`conversation:${item.entityId || item.phone}`);
  }
  return keys;
}

function notificationDedupKeys(notification = {}) {
  const keys = new Set();
  const entityType = String(notification.entityType || notification.entity_type || "").toLowerCase();
  const entityId = notification.entityId || notification.entity_id || null;
  if (!entityId) {
    return keys;
  }
  if (entityType === "follow_up") {
    keys.add(`follow_up:${entityId}`);
  } else if (entityType === "appointment") {
    keys.add(`appointment:${entityId}`);
  } else if (entityType === "document_request") {
    keys.add(`document_request:${entityId}`);
  } else if (entityType === "service_case") {
    keys.add(`service_case:${entityId}`);
  } else {
    keys.add(`conversation:${entityId}`);
  }
  return keys;
}

function isDuplicateAgainst(item, seenKeys) {
  for (const key of collectDedupKeys(item)) {
    if (seenKeys.has(key)) {
      return true;
    }
  }
  return false;
}

function dedupeTodayItems(items = []) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (!item || isDuplicateAgainst(item, seen)) {
      continue;
    }
    for (const key of collectDedupKeys(item)) {
      seen.add(key);
    }
    unique.push(item);
  }
  return unique;
}

function compareTodayItems(left, right) {
  const priority = (left.displayPriority || 99) - (right.displayPriority || 99);
  if (priority !== 0) {
    return priority;
  }
  const due = parseSortMs(left.dueAt) - parseSortMs(right.dueAt);
  if (due !== 0) {
    return due;
  }
  const created = parseSortMs(left.createdAt) - parseSortMs(right.createdAt);
  if (created !== 0) {
    return created;
  }
  return String(left.id || left.title || "").localeCompare(String(right.id || right.title || ""));
}

function matchesTodayFilter(item, filter) {
  const resolved = filter || TODAY_FILTERS.ALL;
  if (resolved === TODAY_FILTERS.ALL) {
    return true;
  }
  if (resolved === TODAY_FILTERS.OVERDUE) {
    return item.priority === TODAY_PRIORITIES.OVERDUE;
  }
  if (resolved === TODAY_FILTERS.NEEDS_ATTENTION) {
    return (
      item.kind === TODAY_KINDS.NEEDS_ATTENTION ||
      item.kind === TODAY_KINDS.HUMAN_TAKEOVER ||
      item.kind === TODAY_KINDS.NEW_LEAD
    );
  }
  if (resolved === TODAY_FILTERS.DUE_TODAY) {
    return item.priority === TODAY_PRIORITIES.DUE_TODAY && item.kind !== TODAY_KINDS.APPOINTMENT;
  }
  if (resolved === TODAY_FILTERS.APPOINTMENTS) {
    return item.kind === TODAY_KINDS.APPOINTMENT;
  }
  if (resolved === TODAY_FILTERS.FOLLOW_UPS) {
    return item.kind === TODAY_KINDS.FOLLOW_UP || item.kind === TODAY_KINDS.SERVICE_CASE;
  }
  if (resolved === TODAY_FILTERS.DOCUMENTS) {
    return item.kind === TODAY_KINDS.DOCUMENT_REQUEST;
  }
  return true;
}

function isDistinctTakeoverNotification(notification = {}) {
  return (
    String(notification.eventType || notification.event_type || "") === EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED &&
    !notification.readAt &&
    !notification.dismissedAt
  );
}

module.exports = {
  ownerIdOfProspect,
  ownerIdOfAppointment,
  matchesOwnerFilter,
  hasTodayAttentionSignal,
  isTodayProspectCandidate,
  isHealedBr080Stale,
  isHumanTakeoverReason,
  isRealNeedsAttention,
  isActionableNewLead,
  formatFriendlyTime,
  formatFriendlyDate,
  prospectHref,
  appointmentHref,
  followUpHref,
  notificationHref,
  presentNeedsAttention,
  presentAppointment,
  presentFollowUpItem,
  presentServiceCaseItem,
  presentDocumentRequestItem,
  presentNewLead,
  presentHumanTakeoverNotification,
  collectDedupKeys,
  notificationDedupKeys,
  dedupeTodayItems,
  compareTodayItems,
  matchesTodayFilter,
  isDistinctTakeoverNotification
};
