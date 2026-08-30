/**
 * BR-180 — Today / Action Center presentation.
 * Aggregation only. Does not persist workflow, follow-up, or notification state.
 */

const {
  isFirstResponseSlaSatisfied,
  isFirstResponseSlaReason,
  needsManualAcknowledge
} = require("../newLeadAttentionEngine");
const { isOperationalProspectRecord } = require("../prospectPromotionEligibility");
const { FOLLOW_UP_VIEW_STATUSES } = require("../followUps");
const {
  DISPLAY_PRIORITY,
  TODAY_KINDS,
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
  return item.actionUrl || item.action_url || "/app/notifications";
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

function presentNeedsAttention(prospect, { ownerName = null } = {}) {
  const reason = prospect.human_attention_reason || prospect.humanAttentionReason || "needs_attention";
  return {
    id: `na:${prospect.id || prospect.phone}`,
    kind: TODAY_KINDS.NEEDS_ATTENTION,
    displayPriority: DISPLAY_PRIORITY.NEEDS_ATTENTION,
    title: prospect.name || prospect.phone || "Needs attention",
    subtitle: reason,
    whenLabel: null,
    status: prospect.attention_status || "human_required",
    ownerName,
    href: prospectHref(prospect),
    entityType: "prospect",
    entityId: prospect.id || null,
    phone: prospect.phone || null,
    actions: ["open"],
    source: null
  };
}

function presentAppointment(appointment, { timeZone, reference, ownerName = null } = {}) {
  const startMs = Date.parse(appointment.startDateTime);
  const refMs = reference instanceof Date ? reference.getTime() : Date.parse(reference || Date.now());
  const soon = Number.isFinite(startMs) && startMs - refMs >= 0 && startMs - refMs <= APPOINTMENT_SOON_MS;
  return {
    id: `appt:${appointment.id}`,
    kind: TODAY_KINDS.APPOINTMENT,
    displayPriority: soon ? DISPLAY_PRIORITY.APPOINTMENT_SOON : DISPLAY_PRIORITY.APPOINTMENT_TODAY,
    title: appointmentPerson(appointment),
    subtitle: appointmentType(appointment),
    whenLabel: formatFriendlyTime(appointment.startDateTime, timeZone),
    status: appointment.status || "scheduled",
    ownerName: ownerName || appointment.agentName || null,
    href: appointmentHref(appointment),
    entityType: appointment.agendaContactId && !appointment.prospectId ? "client_appointment" : "appointment",
    entityId: appointment.id || null,
    phone: appointment.prospectPhone || null,
    actions: ["open", "reschedule", "cancel", "outcome"],
    source: {
      appointmentId: appointment.id,
      purpose: appointment.purpose || null,
      meetingType: appointment.meetingType || null
    }
  };
}

function followUpPriority(status) {
  if (status === FOLLOW_UP_VIEW_STATUSES.OVERDUE) {
    return DISPLAY_PRIORITY.FOLLOW_UP_OVERDUE;
  }
  if (status === FOLLOW_UP_VIEW_STATUSES.DUE_TODAY) {
    return DISPLAY_PRIORITY.FOLLOW_UP_DUE_TODAY;
  }
  return DISPLAY_PRIORITY.FOLLOW_UP_NEEDS_DATE;
}

function presentServiceCaseItem(item) {
  return {
    id: `svc:${item.id}`,
    kind: TODAY_KINDS.SERVICE_CASE,
    displayPriority: followUpPriority(item.status),
    title: item.title || item.name || "Service case",
    subtitle: item.name && item.name !== item.title ? item.name : item.source?.serviceType || null,
    whenLabel: item.dueDate || null,
    status: item.status,
    ownerName: item.ownerName || null,
    href: item.href || (item.entityId ? `/app/clients/${item.entityId}` : "/app/service"),
    entityType: "service_case",
    entityId: item.id,
    phone: null,
    actions: ["open"],
    source: item.source || item
  };
}

function presentFollowUpItem(item, { timeZone } = {}) {
  const whenLabel = item.dueTime
    ? formatFriendlyTime(item.dueAt, timeZone) || item.dueTime
    : item.dueDate || null;
  return {
    id: `fu:${item.id}`,
    kind: TODAY_KINDS.FOLLOW_UP,
    displayPriority: followUpPriority(item.status),
    title: item.name || item.title || "Follow-up",
    subtitle: item.followUpReason || item.title || null,
    whenLabel,
    status: item.status,
    ownerName: item.representativeName || null,
    href: followUpHref(item),
    entityType: item.entityType || "prospect",
    entityId: item.entityId || null,
    phone: item.phone || null,
    actions: item.source === "legacy" ? ["open", "set-date"] : ["open", "complete", "reschedule", "cancel"],
    source: item
  };
}

function presentNewLead(prospect, { ownerName = null } = {}) {
  return {
    id: `lead:${prospect.id || prospect.phone}`,
    kind: TODAY_KINDS.NEW_LEAD,
    displayPriority: DISPLAY_PRIORITY.NEW_LEAD,
    title: prospect.name || prospect.phone || "New conversation",
    subtitle: "new_actionable",
    whenLabel: null,
    status: prospect.attention_status || "new",
    ownerName,
    href: prospectHref(prospect),
    entityType: "prospect",
    entityId: prospect.id || null,
    phone: prospect.phone || null,
    actions: ["open"],
    source: null
  };
}

function presentNotification(item) {
  return {
    id: `nt:${item.id}`,
    kind: TODAY_KINDS.NOTIFICATION,
    displayPriority: DISPLAY_PRIORITY.NOTIFICATION,
    title: item.title || "Notification",
    subtitle: item.body || item.eventType || null,
    whenLabel: null,
    status: item.readAt ? "read" : "unread",
    ownerName: null,
    href: notificationHref(item),
    entityType: item.entityType || null,
    entityId: item.entityId || null,
    phone: null,
    actions: ["open"],
    source: {
      notificationId: item.id,
      eventType: item.eventType || null
    }
  };
}

function compareTodayItems(left, right) {
  const priority = (left.displayPriority || 99) - (right.displayPriority || 99);
  if (priority !== 0) {
    return priority;
  }
  return String(left.title || "").localeCompare(String(right.title || ""));
}

module.exports = {
  ownerIdOfProspect,
  ownerIdOfAppointment,
  matchesOwnerFilter,
  hasTodayAttentionSignal,
  isTodayProspectCandidate,
  isHealedBr080Stale,
  isRealNeedsAttention,
  isActionableNewLead,
  formatFriendlyTime,
  prospectHref,
  appointmentHref,
  followUpHref,
  notificationHref,
  presentNeedsAttention,
  presentAppointment,
  presentFollowUpItem,
  presentServiceCaseItem,
  presentNewLead,
  presentNotification,
  compareTodayItems
};
