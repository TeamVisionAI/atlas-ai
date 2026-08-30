/**
 * BR-184 — Today / Action Center aggregation.
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
  TODAY_FILTERS,
  TODAY_KINDS,
  TODAY_PRIORITIES,
  NOTIFICATION_LIMIT,
  emptyToday,
  normalizeTodayFilter
} = require("../core/today/todayConstants");
const {
  ownerIdOfProspect,
  ownerIdOfAppointment,
  matchesOwnerFilter,
  isTodayProspectCandidate,
  isRealNeedsAttention,
  isActionableNewLead,
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
  const { loadProductionProspects } = require("../core/executiveDashboardReadModel");
  // Implements BR-184 — load persisted org prospects, then classify attention.
  // Do not require BR-159 operational-pipeline membership before NA / New.
  // Still exclude simulators and BR-136 TEST/CANARY/QA via the shared loader.
  return loadProductionProspects(organizationId, {
    includeNonOperationalContacts: true
  });
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

function isDatedTodayObligation(item) {
  return isFollowUpDueOrOverdue(item);
}

async function defaultListServiceCases(options) {
  if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) {
    return { items: [] };
  }
  const clientServiceApplicationService = require("./clientServiceApplicationService");
  return clientServiceApplicationService.listServiceCases(options);
}

async function defaultListDocumentRequests(options) {
  if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) {
    return { items: [] };
  }
  const clientDocumentsApplicationService = require("./clientDocumentsApplicationService");
  return clientDocumentsApplicationService.listDocumentRequests(options);
}

function buildCounts(items) {
  const overdue = items.filter((item) => item.priority === TODAY_PRIORITIES.OVERDUE);
  const needsAttention = items.filter(
    (item) =>
      item.kind === TODAY_KINDS.NEEDS_ATTENTION ||
      item.kind === TODAY_KINDS.HUMAN_TAKEOVER ||
      item.kind === TODAY_KINDS.NEW_LEAD
  );
  const dueToday = items.filter(
    (item) => item.priority === TODAY_PRIORITIES.DUE_TODAY && item.kind !== TODAY_KINDS.APPOINTMENT
  );
  const appointmentsToday = items.filter((item) => item.kind === TODAY_KINDS.APPOINTMENT);
  const followUpLike = items.filter(
    (item) =>
      item.kind === TODAY_KINDS.FOLLOW_UP ||
      item.kind === TODAY_KINDS.SERVICE_CASE ||
      item.kind === TODAY_KINDS.DOCUMENT_REQUEST
  );
  return {
    overdue: overdue.length,
    needsAttention: needsAttention.length,
    dueToday: dueToday.length,
    appointmentsToday: appointmentsToday.length,
    followUpsDueOverdue: followUpLike.filter(isFollowUpDueOrOverdue).length,
    newActionable: items.filter((item) => item.kind === TODAY_KINDS.NEW_LEAD).length
  };
}

function buildSections(items) {
  return {
    needsAttention: items.filter(
      (item) => item.kind === TODAY_KINDS.NEEDS_ATTENTION || item.kind === TODAY_KINDS.HUMAN_TAKEOVER
    ),
    appointmentsToday: items.filter((item) => item.kind === TODAY_KINDS.APPOINTMENT),
    followUps: items.filter(
      (item) =>
        item.kind === TODAY_KINDS.FOLLOW_UP ||
        item.kind === TODAY_KINDS.SERVICE_CASE ||
        item.kind === TODAY_KINDS.DOCUMENT_REQUEST
    ),
    newLeads: items.filter((item) => item.kind === TODAY_KINDS.NEW_LEAD),
    notifications: []
  };
}

function appendDistinctTakeovers(items, notifications) {
  const seen = new Set();
  for (const item of items) {
    for (const key of collectDedupKeys(item)) {
      seen.add(key);
    }
  }
  const extras = [];
  for (const notification of notifications || []) {
    if (!isDistinctTakeoverNotification(notification)) {
      continue;
    }
    const keys = notificationDedupKeys(notification);
    let duplicate = false;
    for (const key of keys) {
      if (seen.has(key)) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) {
      continue;
    }
    extras.push(presentHumanTakeoverNotification(notification));
  }
  return extras;
}

async function getToday({
  organizationId,
  authContext,
  scope,
  filter,
  reference,
  sources
} = {}) {
  const now = reference instanceof Date ? reference : new Date(reference || Date.now());
  const resolved = resolveSources(sources);
  const resolvedFilter = normalizeTodayFilter(filter);
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
  const listServiceCases = resolved.listServiceCases || defaultListServiceCases;
  const listDocumentRequests = resolved.listDocumentRequests || defaultListDocumentRequests;

  const authForProspects = {
    ...authContext,
    organizationId: organizationId || authContext?.organizationId || null
  };

  const [
    prospectsRaw,
    appointmentsRaw,
    followUpsPayload,
    notificationsRaw,
    servicePayload,
    documentRequestPayload
  ] = await Promise.all([
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
      }),
      listServiceCases({
        organizationId,
        authContext,
        scope: ownerFilter.scope,
        reference: now
      }),
      listDocumentRequests({
        organizationId,
        authContext,
        scope: ownerFilter.scope,
        reference: now
      })
    ]);

  const orgProspects = (prospectsRaw || []).filter(
    (prospect) =>
      String(prospect.organization_id || prospect.organizationId || "") === String(organizationId)
  );
  const attentionProspects = orgProspects.filter(isTodayProspectCandidate);
  const visibleProspects = filterOwned(
    filterProspectsForAuthContext(authForProspects, attentionProspects),
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
    .map((prospect) => presentNeedsAttention(prospect));

  const needsAttentionKeys = new Set(
    needsAttention.map((item) => item.entityId || item.phone).filter(Boolean)
  );

  const { toTodayItem } = require("./clientServiceApplicationService");
  const { toTodayItem: toDocumentRequestTodayItem } = require("./clientDocumentsApplicationService");
  const followUps = (followUpsPayload.items || [])
    .filter(isDatedTodayObligation)
    .map((item) => presentFollowUpItem(item, { timeZone: timeZoneResolution.timeZone }));
  const serviceItems = (servicePayload?.items || [])
    .map((item) => toTodayItem(item))
    .filter(Boolean)
    .map((item) => presentServiceCaseItem(item, { timeZone: timeZoneResolution.timeZone }))
    .filter(Boolean);
  const documentRequestItems = (documentRequestPayload?.items || [])
    .map((item) => toDocumentRequestTodayItem(item))
    .filter(Boolean)
    .map((item) => presentDocumentRequestItem(item, { timeZone: timeZoneResolution.timeZone }));

  const appointmentsToday = visibleAppointments.map((appointment) =>
    presentAppointment(appointment, {
      timeZone: timeZoneResolution.timeZone,
      reference: now
    })
  );

  const newLeads = visibleProspects
    .filter(isActionableNewLead)
    .filter((prospect) => {
      const key = prospect.id || prospect.phone;
      return !key || !needsAttentionKeys.has(key);
    })
    .map((prospect) => presentNewLead(prospect));

  const canonicalItems = dedupeTodayItems(
    [...followUps, ...serviceItems, ...documentRequestItems, ...needsAttention, ...newLeads, ...appointmentsToday]
  );
  const takeoverExtras = appendDistinctTakeovers(canonicalItems, notificationsRaw);
  const items = dedupeTodayItems([...canonicalItems, ...takeoverExtras]).sort(compareTodayItems);

  const counts = buildCounts(items);
  const sections = buildSections(items);
  const filteredItems = items.filter((item) => matchesTodayFilter(item, resolvedFilter));

  return emptyToday({
    generatedAt: new Date().toISOString(),
    controlPlane: false,
    organizationId,
    scope: ownerFilter.scope,
    filter: resolvedFilter,
    teamAvailable,
    timeZone: timeZoneResolution.timeZone,
    today: String(todayWindow.localStart || "").slice(0, 10),
    caughtUp: items.length === 0,
    counts,
    items: filteredItems,
    sections
  });
}

module.exports = {
  setSourcesForTests,
  getToday,
  TODAY_SCOPES,
  TODAY_FILTERS
};
