/**
 * BR-178 — Follow-up Engine V2.
 * Durable obligations + owner queue. Does not send WhatsApp, SMS, or email.
 * Completing a follow-up does not change prospect outcome.
 */

const crypto = require("crypto");
const { FOLLOW_UP_FILTERS } = require("../core/followUpsQueueEngine");
const {
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_VIEW_STATUSES,
  FOLLOW_UP_ENTITY_TYPES,
  FOLLOW_UP_PRIORITIES,
  FOLLOW_UP_SCOPES,
  FOLLOW_UP_SURFACES,
  normalizeDueDate,
  normalizeDueTime,
  todayIsoDate,
  resolveDueAt,
  classifyPersistedFollowUp,
  priorityForViewStatus,
  planFollowUpFromOutcome,
  buildOutcomeDedupKey,
  buildManualDedupKey,
  buildLegacyConversionDedupKey,
  isLegacyCoveredByDurable,
  createMemoryFollowUpStore
} = require("../core/followUps");
const { loadOrganizationTimezone } = require("../core/organizationDateWindow");
const { presentHistoryActorLabel } = require("../core/appointmentHistory");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { EVENT_TYPES, ENTITY_TYPES } = require("../core/agentNotifications/constants");

const ENTITY_TYPE_SET = new Set(Object.values(FOLLOW_UP_ENTITY_TYPES));

let storeOverride = null;

function isAutomatedTestRuntime() {
  return process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function getStore() {
  if (storeOverride) {
    return storeOverride;
  }
  if (isAutomatedTestRuntime()) {
    return null;
  }
  return require("../repositories/followUpRepository");
}

function setStoreForTests(store) {
  storeOverride = store || null;
}

function buildError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.publicCode = code;
  error.statusCode = statusCode;
  return error;
}

function notFound() {
  return buildError("NOT_FOUND", "Follow-up not found.", 404);
}

function appendHistory(row, entry) {
  return [
    ...(row.history || []),
    {
      type: entry.type,
      at: entry.at || new Date().toISOString(),
      actor: entry.actor || "system",
      summary: entry.summary || null,
      reason: entry.reason || null,
      oldValues: entry.oldValues || null,
      newValues: entry.newValues || null
    }
  ];
}

function canViewTeamFollowUps(authContext) {
  if (!authContext) {
    return false;
  }
  if (authContext.role === ROLES.ADMINISTRATOR || authContext.role === ROLES.RVP) {
    return true;
  }
  if (authContext.hierarchyMode === HIERARCHY_MODES.ORGANIZATION) {
    return true;
  }
  return (
    authContext.hierarchyMode === HIERARCHY_MODES.SUBTREE &&
    Array.isArray(authContext.hierarchyUserIds) &&
    authContext.hierarchyUserIds.length > 1
  );
}

function resolveOwnerFilter({ authContext, scope }) {
  const userId = authContext?.userId;
  const requested = String(scope || FOLLOW_UP_SCOPES.MINE).toLowerCase();
  if (requested === FOLLOW_UP_SCOPES.TEAM && canViewTeamFollowUps(authContext)) {
    if (
      authContext.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
      authContext.role === ROLES.ADMINISTRATOR ||
      authContext.role === ROLES.RVP
    ) {
      return { scope: FOLLOW_UP_SCOPES.TEAM, ownerUserIds: null };
    }
    return {
      scope: FOLLOW_UP_SCOPES.TEAM,
      ownerUserIds: authContext.hierarchyUserIds || [userId]
    };
  }
  return { scope: FOLLOW_UP_SCOPES.MINE, ownerUserIds: userId ? [userId] : [] };
}

function canAccessFollowUp(authContext, row) {
  if (!row || !authContext?.userId) {
    return false;
  }
  if (String(row.ownerUserId) === String(authContext.userId)) {
    return true;
  }
  if (!canViewTeamFollowUps(authContext)) {
    return false;
  }
  if (
    authContext.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
    authContext.role === ROLES.ADMINISTRATOR ||
    authContext.role === ROLES.RVP
  ) {
    return true;
  }
  return (authContext.hierarchyUserIds || []).map(String).includes(String(row.ownerUserId));
}

async function resolveOwnerName(ownerUserId, cache) {
  if (!ownerUserId) {
    return null;
  }
  if (isAutomatedTestRuntime()) {
    cache.set(ownerUserId, null);
    return null;
  }
  if (cache.has(ownerUserId)) {
    return cache.get(ownerUserId);
  }
  try {
    const { findUserById } = require("../services/atlasUserService");
    const user = await findUserById(ownerUserId);
    const name =
      [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
      user?.display_name ||
      user?.email ||
      null;
    cache.set(ownerUserId, name);
    return name;
  } catch {
    cache.set(ownerUserId, null);
    return null;
  }
}

async function loadActorNames(organizationId) {
  if (!organizationId || isAutomatedTestRuntime()) {
    return new Map();
  }
  try {
    const { listOrganizationUsers, resolveUserDisplayName } = require("../services/atlasUserService");
    const users = await listOrganizationUsers(organizationId);
    return new Map(
      (users || [])
        .map((user) => [String(user.id), resolveUserDisplayName(user)])
        .filter((entry) => entry[0] && entry[1])
    );
  } catch {
    return new Map();
  }
}

function presentHistory(history, nameById) {
  return (history || []).map((event) => ({
    ...event,
    actorName: presentHistoryActorLabel(event.actor, nameById)
  }));
}

function presentFollowUp(row, { today, nameById = new Map(), ownerName = null } = {}) {
  const classified = classifyPersistedFollowUp(row, { today });
  return {
    id: row.id,
    source: row.source || "durable",
    organizationId: row.organizationId,
    ownerUserId: row.ownerUserId,
    representativeId: row.ownerUserId,
    representativeName: ownerName || presentHistoryActorLabel(row.ownerUserId, nameById),
    entityType: row.entityType,
    entityId: row.entityId,
    phone: row.subjectPhone || null,
    name: row.subjectLabel || row.title,
    title: row.title,
    notes: row.notes || null,
    followUpReason: row.title,
    followUpDate: row.dueDate,
    followUpTime: row.dueTime || null,
    followUpAtMs: row.dueAt ? Date.parse(row.dueAt) : null,
    dueDate: row.dueDate,
    dueTime: row.dueTime || null,
    dueAt: row.dueAt,
    persistedStatus: classified.persistedStatus,
    status: classified.viewStatus,
    obligationStatus: classified.status,
    priority: priorityForViewStatus(classified.viewStatus),
    completedAt: row.completedAt || null,
    completedBy: row.completedBy || null,
    completedByName: presentHistoryActorLabel(row.completedBy, nameById),
    completionNote: row.completionNote || null,
    sourceEvent: row.sourceEvent,
    appointmentId: row.appointmentId || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    history: presentHistory(row.history, nameById),
    canManage: row.source !== "legacy"
  };
}

async function notifyDueIfNeeded(row, { today, organizationId }) {
  const classified = classifyPersistedFollowUp(row, { today });
  let eventType = null;
  if (classified.status === FOLLOW_UP_STATUSES.DUE) {
    eventType = EVENT_TYPES.FOLLOW_UP_DUE;
  } else if (classified.status === FOLLOW_UP_STATUSES.OVERDUE) {
    eventType = EVENT_TYPES.FOLLOW_UP_OVERDUE;
  }
  if (!eventType || !row.ownerUserId) {
    return { created: false, reason: "NOT_DUE" };
  }
  try {
    const { notifyOperationalEvent } = require("../services/agentNotificationService");
    return await notifyOperationalEvent({
      eventType,
      organizationId,
      recipientUserId: row.ownerUserId,
      ownerUserId: row.ownerUserId,
      entityType: ENTITY_TYPES.FOLLOW_UP || "follow_up",
      entityId: row.id,
      title: row.title,
      dueDate: row.dueDate,
      actionUrl: "/app/follow-ups",
      episodeKey: `${row.id}:${row.dueDate}`
    });
  } catch (error) {
    console.warn("[follow-ups] notification failed", error.message);
    return { created: false, reason: "NOTIFY_FAILED" };
  }
}

async function saveFollowUp(store, row) {
  return store.upsert(row);
}

async function cancelSiblingOutcomeFollowUps(store, { organizationId, appointmentId, keepDedupKey, actorUserId }) {
  if (!appointmentId || typeof store.listOpenByAppointment !== "function") {
    return;
  }
  const open = await store.listOpenByAppointment(organizationId, appointmentId);
  const now = new Date().toISOString();
  await Promise.all(
    open
      .filter((item) => item.dedupKey !== keepDedupKey)
      .map((item) =>
        saveFollowUp(store, {
          ...item,
          status: FOLLOW_UP_STATUSES.CANCELLED,
          updatedAt: now,
          history: appendHistory(item, {
            type: "cancelled",
            actor: actorUserId || "system",
            at: now,
            summary: "Superseded by a newer appointment outcome"
          })
        })
      )
  );
}

async function upsertFromPlan(store, { organizationId, actorUserId, ownerUserId, entityType, entityId, subjectLabel, subjectPhone, appointmentId, plan, notes, today }) {
  const dueDate = normalizeDueDate(plan.dueDate);
  if (!dueDate) {
    throw buildError("VALIDATION_ERROR", "A follow-up date is required.");
  }
  const dueTime = normalizeDueTime(plan.dueTime);
  const timeZone = loadOrganizationTimezone(organizationId).timeZone;
  const now = new Date().toISOString();
  const existing = await store.findByDedupKey(organizationId, plan.dedupKey);
  const row = {
    id: existing?.id || crypto.randomUUID(),
    organizationId,
    ownerUserId,
    entityType,
    entityId: String(entityId),
    subjectLabel: subjectLabel || existing?.subjectLabel || plan.title,
    subjectPhone: subjectPhone || existing?.subjectPhone || null,
    sourceEvent: plan.sourceEvent,
    appointmentId: appointmentId || existing?.appointmentId || null,
    title: plan.title,
    notes: notes || existing?.notes || null,
    dueDate,
    dueTime,
    dueAt: resolveDueAt({ dueDate, dueTime, timeZone }),
    status: FOLLOW_UP_STATUSES.OPEN,
    priority: FOLLOW_UP_PRIORITIES.NORMAL,
    completedAt: null,
    completedBy: null,
    completionNote: null,
    createdBy: existing?.createdBy || actorUserId || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    dedupKey: plan.dedupKey,
    history: appendHistory(existing || { history: [] }, {
      type: existing ? "updated" : "created",
      actor: actorUserId || "system",
      at: now,
      summary: existing ? "Follow-up updated from outcome" : "Follow-up created from outcome",
      newValues: { dueDate, dueTime, outcomeKey: plan.outcomeKey, appointmentId }
    })
  };
  const saved = await saveFollowUp(store, row);
  await cancelSiblingOutcomeFollowUps(store, {
    organizationId,
    appointmentId,
    keepDedupKey: plan.dedupKey,
    actorUserId
  });
  await notifyDueIfNeeded(saved, { today, organizationId });
  return { created: !existing, followUp: saved };
}

async function syncFromOperationalOutcome(input = {}) {
  const store = getStore();
  if (!store) {
    return { created: false, reason: "STORE_UNAVAILABLE" };
  }
  try {
    const organizationId = input.organizationId;
    if (!organizationId) {
      return { created: false, reason: "ORGANIZATION_REQUIRED" };
    }
    const today = todayIsoDate(organizationId, input.reference || new Date());
    const plan = planFollowUpFromOutcome({
      outcome: input.outcome,
      surface: input.surface || FOLLOW_UP_SURFACES.INTERVIEW,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      futureReminder: input.futureReminder,
      today
    });
    if (!plan.create) {
      return { created: false, reason: plan.reason, outcomeKey: plan.outcomeKey };
    }
    const entityType = ENTITY_TYPE_SET.has(input.entityType)
      ? input.entityType
      : FOLLOW_UP_ENTITY_TYPES.APPOINTMENT;
    const entityId = input.entityId;
    if (!entityId) {
      return { created: false, reason: "ENTITY_REQUIRED" };
    }
    const ownerUserId = input.ownerUserId || input.actorUserId;
    if (!ownerUserId) {
      return { created: false, reason: "OWNER_REQUIRED" };
    }
    plan.dedupKey = buildOutcomeDedupKey({
      surface: input.surface || FOLLOW_UP_SURFACES.INTERVIEW,
      entityType,
      entityId,
      outcomeKey: plan.outcomeKey,
      appointmentId: input.appointmentId || null
    });
    return await upsertFromPlan(store, {
      organizationId,
      actorUserId: input.actorUserId,
      ownerUserId,
      entityType,
      entityId,
      subjectLabel: input.subjectLabel,
      subjectPhone: input.subjectPhone,
      appointmentId: input.appointmentId || null,
      plan,
      notes: input.notes || null,
      today
    });
  } catch (error) {
    console.warn("[follow-ups] outcome sync failed", error.message);
    return { created: false, reason: "SYNC_FAILED" };
  }
}

async function createManualFollowUp(input, authContext) {
  const store = getStore();
  if (!store) {
    throw buildError("STORE_UNAVAILABLE", "Follow-up store is unavailable.", 503);
  }
  const organizationId = input.organizationId;
  const entityType = String(input.entityType || "").trim();
  const entityId = String(input.entityId || "").trim();
  const dueDate = normalizeDueDate(input.dueDate);
  const dueTime = normalizeDueTime(input.dueTime);
  if (!organizationId || !authContext?.userId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }
  if (!ENTITY_TYPE_SET.has(entityType)) {
    throw buildError("VALIDATION_ERROR", "A valid follow-up subject is required.");
  }
  if (!entityId) {
    throw buildError("VALIDATION_ERROR", "A follow-up subject is required.");
  }
  if (!dueDate) {
    throw buildError("VALIDATION_ERROR", "A follow-up date is required.");
  }

  const ownerUserId = input.ownerUserId || authContext.userId;
  const today = todayIsoDate(organizationId, input.reference || new Date());
  const timeZone = loadOrganizationTimezone(organizationId).timeZone;
  const dedupKey = input.legacyConversion
    ? buildLegacyConversionDedupKey({ entityType, entityId })
    : buildManualDedupKey({
        entityType,
        entityId,
        dueDate,
        notes: input.notes
      });
  const existing = await store.findByDedupKey(organizationId, dedupKey);
  if (existing && existing.status === FOLLOW_UP_STATUSES.OPEN && !input.legacyConversion) {
    return { created: false, followUp: existing };
  }
  if (existing && existing.status === FOLLOW_UP_STATUSES.OPEN && input.legacyConversion) {
    const saved = await saveFollowUp(store, {
      ...existing,
      dueDate,
      dueTime,
      dueAt: resolveDueAt({ dueDate, dueTime, timeZone }),
      title: input.title || existing.title,
      notes: input.notes || existing.notes,
      subjectLabel: input.subjectLabel || existing.subjectLabel,
      subjectPhone: input.subjectPhone || existing.subjectPhone || null,
      ownerUserId: existing.ownerUserId || ownerUserId,
      updatedAt: new Date().toISOString(),
      history: appendHistory(existing, {
        type: "rescheduled",
        actor: authContext.userId,
        summary: "Legacy follow-up date set",
        oldValues: { dueDate: existing.dueDate, dueTime: existing.dueTime },
        newValues: { dueDate, dueTime }
      })
    });
    await notifyDueIfNeeded(saved, { today, organizationId });
    return { created: false, followUp: saved };
  }
  const now = new Date().toISOString();
  const row = {
    id: existing?.id || crypto.randomUUID(),
    organizationId,
    ownerUserId,
    entityType,
    entityId,
    subjectLabel: input.subjectLabel || input.title || "Follow-up",
    subjectPhone: input.subjectPhone || null,
    sourceEvent: input.legacyConversion ? "legacy" : "manual",
    appointmentId: input.appointmentId || null,
    title: input.title || "Follow-up",
    notes: input.notes || null,
    dueDate,
    dueTime,
    dueAt: resolveDueAt({ dueDate, dueTime, timeZone }),
    status: FOLLOW_UP_STATUSES.OPEN,
    priority: FOLLOW_UP_PRIORITIES.NORMAL,
    createdBy: authContext.userId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    dedupKey,
    history: appendHistory(existing || { history: [] }, {
      type: "created",
      actor: authContext.userId,
      at: now,
      summary: input.legacyConversion ? "Legacy follow-up date set" : "Manual follow-up created",
      newValues: { dueDate, dueTime, entityType, entityId }
    })
  };
  const saved = await saveFollowUp(store, row);
  await notifyDueIfNeeded(saved, { today, organizationId });
  return { created: true, followUp: saved };
}

async function getAuthorizedFollowUp(id, organizationId, authContext) {
  const store = getStore();
  if (!store) {
    throw notFound();
  }
  const row = await store.findById(id, organizationId);
  if (!row || !canAccessFollowUp(authContext, row)) {
    throw notFound();
  }
  return row;
}

async function completeFollowUp(id, input, authContext) {
  const row = await getAuthorizedFollowUp(id, input.organizationId, authContext);
  if (row.status !== FOLLOW_UP_STATUSES.OPEN) {
    return row;
  }
  const now = new Date().toISOString();
  return saveFollowUp(getStore(), {
    ...row,
    status: FOLLOW_UP_STATUSES.COMPLETED,
    completedAt: now,
    completedBy: authContext.userId,
    completionNote: input.completionNote || input.notes || null,
    updatedAt: now,
    history: appendHistory(row, {
      type: "completed",
      actor: authContext.userId,
      at: now,
      summary: "Follow-up completed",
      reason: input.completionNote || input.notes || null
    })
  });
}

async function rescheduleFollowUp(id, input, authContext) {
  const row = await getAuthorizedFollowUp(id, input.organizationId, authContext);
  const dueDate = normalizeDueDate(input.dueDate);
  const dueTime = input.dueTime === undefined ? row.dueTime : normalizeDueTime(input.dueTime);
  if (!dueDate) {
    throw buildError("VALIDATION_ERROR", "A follow-up date is required.");
  }
  const timeZone = loadOrganizationTimezone(input.organizationId).timeZone;
  const now = new Date().toISOString();
  const saved = await saveFollowUp(getStore(), {
    ...row,
    status: FOLLOW_UP_STATUSES.OPEN,
    dueDate,
    dueTime,
    dueAt: resolveDueAt({ dueDate, dueTime, timeZone }),
    completedAt: null,
    completedBy: null,
    updatedAt: now,
    history: appendHistory(row, {
      type: "rescheduled",
      actor: authContext.userId,
      at: now,
      summary: "Follow-up rescheduled",
      oldValues: { dueDate: row.dueDate, dueTime: row.dueTime },
      newValues: { dueDate, dueTime }
    })
  });
  await notifyDueIfNeeded(saved, {
    today: todayIsoDate(input.organizationId, input.reference || new Date()),
    organizationId: input.organizationId
  });
  return saved;
}

async function cancelFollowUp(id, input, authContext) {
  const row = await getAuthorizedFollowUp(id, input.organizationId, authContext);
  if (row.status !== FOLLOW_UP_STATUSES.OPEN) {
    return row;
  }
  const now = new Date().toISOString();
  return saveFollowUp(getStore(), {
    ...row,
    status: FOLLOW_UP_STATUSES.CANCELLED,
    updatedAt: now,
    history: appendHistory(row, {
      type: "cancelled",
      actor: authContext.userId,
      at: now,
      summary: "Follow-up cancelled",
      reason: input.reason || input.notes || null
    })
  });
}

function matchesSearch(item, query) {
  if (!query) {
    return true;
  }
  const haystack = [item.name, item.title, item.phone, item.followUpReason, item.representativeName, item.notes]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return haystack.some((value) => value.includes(query.toLowerCase().trim()));
}

function compareItems(a, b) {
  const needsDateA = a.status === FOLLOW_UP_VIEW_STATUSES.NEEDS_DATE ? 0 : 1;
  const needsDateB = b.status === FOLLOW_UP_VIEW_STATUSES.NEEDS_DATE ? 0 : 1;
  if (needsDateA !== needsDateB) {
    return needsDateA - needsDateB;
  }
  const dueA = a.followUpAtMs ?? Number.MAX_SAFE_INTEGER;
  const dueB = b.followUpAtMs ?? Number.MAX_SAFE_INTEGER;
  if (dueA !== dueB) {
    return dueA - dueB;
  }
  return String(a.name || "").localeCompare(String(b.name || ""));
}

function buildFilterCounts(items) {
  const counts = {
    [FOLLOW_UP_FILTERS.ALL]: 0,
    [FOLLOW_UP_FILTERS.NEEDS_DATE]: 0,
    [FOLLOW_UP_FILTERS.DUE_TODAY]: 0,
    [FOLLOW_UP_FILTERS.OVERDUE]: 0,
    [FOLLOW_UP_FILTERS.UPCOMING]: 0,
    [FOLLOW_UP_FILTERS.COMPLETED]: 0
  };
  for (const item of items) {
    if (item.status === FOLLOW_UP_VIEW_STATUSES.COMPLETED) {
      counts[FOLLOW_UP_FILTERS.COMPLETED] += 1;
    } else {
      counts[FOLLOW_UP_FILTERS.ALL] += 1;
      if (item.status === FOLLOW_UP_VIEW_STATUSES.NEEDS_DATE) {
        counts[FOLLOW_UP_FILTERS.NEEDS_DATE] += 1;
      } else if (item.status === FOLLOW_UP_VIEW_STATUSES.DUE_TODAY) {
        counts[FOLLOW_UP_FILTERS.DUE_TODAY] += 1;
      } else if (item.status === FOLLOW_UP_VIEW_STATUSES.OVERDUE) {
        counts[FOLLOW_UP_FILTERS.OVERDUE] += 1;
      } else {
        counts[FOLLOW_UP_FILTERS.UPCOMING] += 1;
      }
    }
  }
  return Object.entries(counts).map(([id, count]) => ({ id, count }));
}

async function mergeLegacyItems(durableItems, { organizationId, ownerUserIds, reference }) {
  try {
    const { buildFollowUpsReadModel } = require("../core/followUpsReadModel");
    const legacy = await buildFollowUpsReadModel({
      filter: FOLLOW_UP_FILTERS.ALL,
      organizationId,
      reference
    });
    const allowedOwners = ownerUserIds ? new Set(ownerUserIds.map(String)) : null;
    return (legacy.items || [])
      .filter((item) => !allowedOwners || allowedOwners.has(String(item.representativeId)))
      .filter((item) => !isLegacyCoveredByDurable(durableItems, item))
      .map((item) => ({
        ...item,
        id: `legacy:${item.phone}:${item.followUpDate || "none"}`,
        source: "legacy",
        entityType: FOLLOW_UP_ENTITY_TYPES.PROSPECT,
        entityId: item.phone,
        title: item.followUpReason || "Follow-up",
        dueDate: item.followUpDate,
        dueTime: item.followUpTime,
        canManage: false,
        canSetDate: !item.followUpDate,
        obligationStatus:
          item.status === "overdue"
            ? FOLLOW_UP_STATUSES.OVERDUE
            : item.status === "due-today"
              ? FOLLOW_UP_STATUSES.DUE
              : item.status === "needs-date"
                ? FOLLOW_UP_STATUSES.OPEN
                : item.status === "completed"
                  ? FOLLOW_UP_STATUSES.COMPLETED
                  : FOLLOW_UP_STATUSES.OPEN
      }));
  } catch {
    return [];
  }
}

async function listFollowUps({ organizationId, authContext, filter, search, sort, scope, reference, includeLegacy = true }) {
  const store = getStore();
  if (!store) {
    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      scope: FOLLOW_UP_SCOPES.MINE,
      teamAvailable: canViewTeamFollowUps(authContext),
      totalCount: 0,
      filteredCount: 0,
      activeFilter: filter || FOLLOW_UP_FILTERS.ALL,
      search: search || "",
      sort: sort || "due-date",
      filters: buildFilterCounts([]),
      items: []
    };
  }

  const ownerFilter = resolveOwnerFilter({ authContext, scope });
  const today = todayIsoDate(organizationId, reference || new Date());
  const nameById = await loadActorNames(organizationId);
  const ownerCache = new Map();
  const rows = await store.listForOwners({
    organizationId,
    ownerUserIds: ownerFilter.ownerUserIds
  });

  const presented = [];
  for (const row of rows) {
    const classified = classifyPersistedFollowUp(row, { today });
    if (row.status === FOLLOW_UP_STATUSES.OPEN) {
      await notifyDueIfNeeded(row, { today, organizationId });
    }
    const ownerName = await resolveOwnerName(row.ownerUserId, ownerCache);
    presented.push(
      presentFollowUp(row, { today, nameById, ownerName })
    );
    void classified;
  }

  const legacyItems = includeLegacy
    ? await mergeLegacyItems(presented, {
        organizationId,
        ownerUserIds: ownerFilter.ownerUserIds,
        reference: reference || new Date()
      })
    : [];
  let items = [...presented, ...legacyItems];
  const filters = buildFilterCounts(items);
  const activeFilter = filter && filter !== FOLLOW_UP_FILTERS.ALL ? filter : FOLLOW_UP_FILTERS.ALL;

  if (activeFilter === FOLLOW_UP_FILTERS.COMPLETED) {
    items = items.filter((item) => item.status === FOLLOW_UP_VIEW_STATUSES.COMPLETED);
  } else if (activeFilter !== FOLLOW_UP_FILTERS.ALL) {
    items = items.filter((item) => item.status === activeFilter);
  } else {
    items = items.filter((item) => item.status !== FOLLOW_UP_VIEW_STATUSES.COMPLETED);
  }

  if (search) {
    items = items.filter((item) => matchesSearch(item, search));
  }
  items.sort(compareItems);

  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: ownerFilter.scope,
    teamAvailable: canViewTeamFollowUps(authContext),
    totalCount: filters.find((row) => row.id === FOLLOW_UP_FILTERS.ALL)?.count || 0,
    filteredCount: items.length,
    activeFilter,
    search: search || "",
    sort: sort || "due-date",
    filters,
    items
  };
}

async function summarizeForOwner({ organizationId, authContext, reference, limit = 3 }) {
  const payload = await listFollowUps({
    organizationId,
    authContext,
    filter: FOLLOW_UP_FILTERS.ALL,
    scope: FOLLOW_UP_SCOPES.MINE,
    reference,
    includeLegacy: true
  });
  const dueToday = payload.filters.find((row) => row.id === FOLLOW_UP_FILTERS.DUE_TODAY)?.count || 0;
  const overdue = payload.filters.find((row) => row.id === FOLLOW_UP_FILTERS.OVERDUE)?.count || 0;
  return {
    followUpsDue: dueToday,
    followUpsOverdue: overdue,
    nextFollowUps: (payload.items || []).slice(0, limit)
  };
}

module.exports = {
  setStoreForTests,
  createMemoryFollowUpStore,
  canViewTeamFollowUps,
  syncFromOperationalOutcome,
  createManualFollowUp,
  completeFollowUp,
  rescheduleFollowUp,
  cancelFollowUp,
  getAuthorizedFollowUp,
  listFollowUps,
  summarizeForOwner,
  presentFollowUp
};
