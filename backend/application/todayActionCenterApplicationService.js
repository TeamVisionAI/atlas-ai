/**
 * BR-180 — Today / Action Center aggregation.
 * Read model only. Reuses existing operational sources; does not persist new work.
 */

const {
  RELATIVE_PERIODS,
  getOrganizationDateWindow,
  loadOrganizationTimezone,
  isTimestampInWindow
} = require("../core/organizationDateWindow");
const { resolveAppointmentViewFilters } = require("../core/appointmentListQuery");
const { FOLLOW_UP_VIEW_STATUSES } = require("../core/followUps");
const { FOLLOW_UP_FILTERS } = require("../core/followUpsQueueEngine");
const followUpApplicationService = require("./followUpApplicationService");
const agentNotificationService = require("../services/agentNotificationService");
const { filterProspectsForAuthContext } = require("../security/authorizationService");
const {
  TODAY_SCOPES,
  NOTIFICATION_LIMIT,
  emptyToday
} = require("../core/today/todayConstants");
const {
  ownerIdOfProspect,
  ownerIdOfAppointment,
  matchesOwnerFilter,
  isRealNeedsAttention,
  isActionableNewLead,
  presentNeedsAttention,
  presentAppointment,
  presentFollowUpItem,
  presentNewLead,
  presentNotification,
  compareTodayItems
} = require("../core/today/todayPresentation");

let sourcesOverride = null;

function setSourcesForTests(sources) {
  if (sources == null || (typeof sources === "object" && !Object.keys(sources).length)) {
    sourcesOverride = null;
    return;
  }
  sourcesOverride = { ...(sourcesOverride || {}), ...sources };
}

function resolveSources(sources = {}) {
  return { ...(sourcesOverride || {}), ...sources };
}

async function defaultLoadProspects(organizationId) {
  try {
    const { loadProductionProspects } = require("../core/executiveDashboardReadModel");
    return await loadProductionProspects(organizationId);
  } catch {
    return [];
  }
}

async function defaultLoadAppointments({ organizationId, reference }) {
  try {
    const { listPersistedAppointments } = require("../services/appointmentListService");
    const viewFilters = resolveAppointmentViewFilters("today", reference, { organizationId });
    const result = await listPersistedAppointments(
      {
        organizationId,
        from: viewFilters.from,
        to: viewFilters.to,
        status: viewFilters.status
      },
      { reference }
    );
    return result.items || [];
  } catch {
    return [];
  }
}

function filterOwned(items, ownerIdOf, ownerFilter) {
  return (items || []).filter((item) => matchesOwnerFilter(ownerIdOf(item), ownerFilter));
}

function isFollowUpDueOrOverdue(item) {
  return (
    item.status === FOLLOW_UP_VIEW_STATUSES.OVERDUE ||
    item.status === FOLLOW_UP_VIEW_STATUSES.DUE_TODAY
  );
}

function isFollowUpActionable(item) {
  return (
    isFollowUpDueOrOverdue(item) || item.status === FOLLOW_UP_VIEW_STATUSES.NEEDS_DATE
  );
}

async function getToday({
  organizationId,
  authContext,
  scope,
  reference,
  sources
} = {}) {
  const now = reference instanceof Date ? reference : new Date(reference || Date.now());
  const resolved = resolveSources(sources);
  const timeZoneResolution = loadOrganizationTimezone(organizationId, resolved.timezoneDeps || {});
  const todayWindow = getOrganizationDateWindow({
    organizationId,
    relativePeriod: RELATIVE_PERIODS.TODAY,
    reference: now,
    timeZoneResolution
  });
  const ownerFilter = followUpApplicationService.resolveOwnerFilter({ authContext, scope });
  const teamAvailable = followUpApplicationService.canViewTeamFollowUps(authContext);

  const loadProspects = resolved.loadProspects || defaultLoadProspects;
  const loadAppointments = resolved.loadAppointments || defaultLoadAppointments;
  const listFollowUps = resolved.listFollowUps || followUpApplicationService.listFollowUps;
  const listNotifications =
    resolved.listNotifications || agentNotificationService.listMyNotifications;

  const authForProspects = {
    ...authContext,
    organizationId: organizationId || authContext?.organizationId || null
  };

  const [prospectsRaw, appointmentsRaw, followUpsPayload, notificationsRaw] = await Promise.all([
    loadProspects(organizationId),
    loadAppointments({ organizationId, reference: now }),
    listFollowUps({
      organizationId,
      authContext,
      filter: FOLLOW_UP_FILTERS.ALL,
      scope: ownerFilter.scope,
      reference: now,
      includeLegacy: true
    }),
    listNotifications({
      organizationId,
      userId: authContext?.userId,
      limit: NOTIFICATION_LIMIT
    })
  ]);

  const orgProspects = (prospectsRaw || []).filter(
    (prospect) =>
      String(prospect.organization_id || prospect.organizationId || "") === String(organizationId)
  );
  const visibleProspects = filterOwned(
    filterProspectsForAuthContext(authForProspects, orgProspects),
    ownerIdOfProspect,
    ownerFilter
  );

  const orgAppointments = (appointmentsRaw || []).filter(
    (appointment) => String(appointment.organizationId || "") === String(organizationId)
  );
  const visibleAppointments = filterOwned(orgAppointments, ownerIdOfAppointment, ownerFilter).filter(
    (appointment) => isTimestampInWindow(appointment.startDateTime, todayWindow)
  );

  const needsAttention = visibleProspects
    .filter(isRealNeedsAttention)
    .map((prospect) => presentNeedsAttention(prospect))
    .sort(compareTodayItems);

  const needsAttentionKeys = new Set(
    needsAttention.map((item) => item.entityId || item.phone).filter(Boolean)
  );

  const appointmentsToday = visibleAppointments
    .map((appointment) =>
      presentAppointment(appointment, {
        timeZone: timeZoneResolution.timeZone,
        reference: now
      })
    )
    .sort((left, right) => {
      const priority = compareTodayItems(left, right);
      if (priority !== 0) {
        return priority;
      }
      return String(left.whenLabel || "").localeCompare(String(right.whenLabel || ""));
    });

  const followUps = (followUpsPayload.items || [])
    .filter(isFollowUpActionable)
    .map((item) => presentFollowUpItem(item, { timeZone: timeZoneResolution.timeZone }))
    .sort(compareTodayItems);

  const newLeads = visibleProspects
    .filter(isActionableNewLead)
    .filter((prospect) => {
      const key = prospect.id || prospect.phone;
      return !key || !needsAttentionKeys.has(key);
    })
    .map((prospect) => presentNewLead(prospect))
    .sort(compareTodayItems);

  const notifications = (notificationsRaw || [])
    .filter((item) => !item.readAt && !item.dismissedAt)
    .slice(0, NOTIFICATION_LIMIT)
    .map(presentNotification);

  const counts = {
    needsAttention: needsAttention.length,
    appointmentsToday: appointmentsToday.length,
    followUpsDueOverdue: followUps.filter((item) => isFollowUpDueOrOverdue(item)).length,
    newActionable: newLeads.length
  };

  const caughtUp =
    needsAttention.length +
      appointmentsToday.length +
      followUps.length +
      newLeads.length +
      notifications.length ===
    0;

  return emptyToday({
    generatedAt: new Date().toISOString(),
    controlPlane: false,
    organizationId,
    scope: ownerFilter.scope,
    teamAvailable,
    timeZone: timeZoneResolution.timeZone,
    today: String(todayWindow.localStart || "").slice(0, 10),
    caughtUp,
    counts,
    sections: {
      needsAttention,
      appointmentsToday,
      followUps,
      newLeads,
      notifications
    }
  });
}

module.exports = {
  setSourcesForTests,
  getToday,
  TODAY_SCOPES
};
