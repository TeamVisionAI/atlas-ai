/**
 * BR-182 — Client Service / Policy Review cases.
 * Records belong to clients. POLICY_REVIEW is a service case, not policy analysis.
 * Does not create recruiting prospects or auto-create follow-ups.
 */

const crypto = require("crypto");
const {
  SERVICE_TYPES,
  SERVICE_STATUSES,
  SERVICE_SCOPES,
  SERVICE_DUE_FILTERS,
  SERVICE_DUE_STATUSES,
  SERVICE_HISTORY_TYPES,
  SERVICE_CLOSED_STATUSES,
  createMemoryServiceStore
} = require("../core/clientService");
const { presentHistoryActorLabel } = require("../core/appointmentHistory");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { todayIsoDate } = require("../core/followUps/classification");
const { FOLLOW_UP_VIEW_STATUSES } = require("../core/followUps");
const followUpApplicationService = require("./followUpApplicationService");
const { FOLLOW_UP_ENTITY_TYPES } = require("../core/followUps");

const TYPE_SET = new Set(Object.values(SERVICE_TYPES));
const STATUS_SET = new Set(Object.values(SERVICE_STATUSES));
const CLOSED_SET = new Set(SERVICE_CLOSED_STATUSES);

let storeOverride = null;
let clientFindOverride = null;
let appointmentFindOverride = null;
let productionFindOverride = null;

function isAutomatedTestRuntime() {
  return process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function getStore() {
  if (storeOverride) return storeOverride;
  if (isAutomatedTestRuntime()) return null;
  return require("../repositories/clientServiceRepository");
}

function getClientFinder() {
  if (clientFindOverride) return clientFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const clients = require("../repositories/agendaClientRepository");
  return (id, organizationId) => clients.findById(id, organizationId);
}

function getAppointmentFinder() {
  if (appointmentFindOverride) return appointmentFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const appointments = require("../repositories/appointmentRepository");
  return (id, organizationId) => appointments.findById(id, organizationId);
}

function getProductionFinder() {
  if (productionFindOverride) return productionFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const production = require("../repositories/clientProductionRepository");
  return (id, organizationId) => production.findById(id, organizationId);
}

function setStoresForTests({
  service = null,
  findClient = null,
  findAppointment = null,
  findProduction = null
} = {}) {
  storeOverride = service || null;
  clientFindOverride = findClient || null;
  appointmentFindOverride = findAppointment || null;
  productionFindOverride = findProduction || null;
}

function buildError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.publicCode = code;
  error.statusCode = statusCode;
  return error;
}

function notFound() {
  return buildError("NOT_FOUND", "Service case not found.", 404);
}

function appendHistory(row, entry) {
  return [
    ...(row.history || []),
    {
      type: entry.type,
      at: entry.at || new Date().toISOString(),
      actor: entry.actor || "system",
      summary: entry.summary || null,
      oldValues: entry.oldValues || null,
      newValues: entry.newValues || null
    }
  ];
}

function canViewTeamService(authContext) {
  return followUpApplicationService.canViewTeamFollowUps(authContext);
}

function resolveOwnerFilter({ authContext, scope }) {
  const userId = authContext?.userId;
  const requested = String(scope || SERVICE_SCOPES.MINE).toLowerCase();
  if (requested === SERVICE_SCOPES.TEAM && canViewTeamService(authContext)) {
    if (
      authContext.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
      authContext.role === ROLES.ADMINISTRATOR ||
      authContext.role === ROLES.RVP
    ) {
      return { scope: SERVICE_SCOPES.TEAM, ownerUserIds: null };
    }
    return {
      scope: SERVICE_SCOPES.TEAM,
      ownerUserIds: authContext.hierarchyUserIds || [userId]
    };
  }
  return { scope: SERVICE_SCOPES.MINE, ownerUserIds: userId ? [userId] : [] };
}

function canAccessRecord(authContext, row) {
  if (!row || !authContext?.userId) return false;
  if (String(row.ownerUserId) === String(authContext.userId)) return true;
  if (!canViewTeamService(authContext)) return false;
  if (
    authContext.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
    authContext.role === ROLES.ADMINISTRATOR ||
    authContext.role === ROLES.RVP
  ) {
    return true;
  }
  return (authContext.hierarchyUserIds || []).map(String).includes(String(row.ownerUserId));
}

function normalizeDueDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw buildError("VALIDATION_ERROR", "A valid due date is required.");
  }
  return raw;
}

function classifyDue(row, today) {
  if (CLOSED_SET.has(row.status)) {
    return SERVICE_DUE_STATUSES.CLOSED;
  }
  if (!row.dueDate) return SERVICE_DUE_STATUSES.NEEDS_DATE;
  if (!today) return SERVICE_DUE_STATUSES.NEEDS_DATE;
  if (row.dueDate < today) return SERVICE_DUE_STATUSES.OVERDUE;
  if (row.dueDate === today) return SERVICE_DUE_STATUSES.DUE_TODAY;
  return SERVICE_DUE_STATUSES.UPCOMING;
}

function emptyCounts() {
  return { open: 0, overdue: 0, dueToday: 0, needsDate: 0 };
}

function matchesSearch(item, query) {
  if (!query) return true;
  const needle = String(query).trim().toLowerCase();
  if (!needle) return true;
  return [item.clientName, item.title, item.notes, item.serviceType]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

async function resolveOwnerName(ownerUserId, cache) {
  if (!ownerUserId) return null;
  if (isAutomatedTestRuntime()) {
    return cache.get(ownerUserId) || null;
  }
  if (cache.has(ownerUserId)) return cache.get(ownerUserId);
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

async function loadActorNames(organizationId, nameById = new Map()) {
  if (!organizationId || isAutomatedTestRuntime()) return nameById;
  try {
    const { listOrganizationUsers, resolveUserDisplayName } = require("../services/atlasUserService");
    const users = await listOrganizationUsers(organizationId);
    for (const user of users || []) {
      const name = resolveUserDisplayName(user);
      if (user?.id && name) nameById.set(String(user.id), name);
    }
  } catch {
    return nameById;
  }
  return nameById;
}

function presentHistory(history, nameById) {
  return (history || []).map((event) => ({
    ...event,
    actorName: presentHistoryActorLabel(event.actor, nameById)
  }));
}

async function presentCase(row, { nameById, ownerCache, clientName = null, today } = {}) {
  const ownerName = await resolveOwnerName(row.ownerUserId, ownerCache || new Map());
  const dueStatus = classifyDue(row, today);
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    clientName: clientName || null,
    ownerUserId: row.ownerUserId,
    ownerName,
    productionId: row.productionId,
    serviceType: row.serviceType,
    status: row.status,
    title: row.title,
    notes: row.notes,
    dueDate: row.dueDate,
    dueStatus,
    scheduledAppointmentId: row.scheduledAppointmentId,
    createdByUserId: row.createdByUserId,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    href: `/app/clients/${row.clientId}`,
    history: presentHistory(row.history, nameById || new Map())
  };
}

async function loadClientOrThrow(clientId, organizationId) {
  const findClient = getClientFinder();
  const client = await findClient(clientId, organizationId);
  if (!client || String(client.organizationId) !== String(organizationId)) {
    throw buildError("NOT_FOUND", "Client not found.", 404);
  }
  return client;
}

async function getAuthorizedRecord(id, organizationId, authContext) {
  const store = getStore();
  if (!store) throw buildError("STORE_UNAVAILABLE", "Service store is unavailable.", 503);
  const row = await store.findById(id, organizationId);
  if (!row || !canAccessRecord(authContext, row)) throw notFound();
  return { store, row };
}

async function resolveOptionalProduction(productionId, organizationId, clientId) {
  if (!productionId) return null;
  const findProduction = getProductionFinder();
  const record = await findProduction(productionId, organizationId);
  if (!record || String(record.organizationId) !== String(organizationId)) {
    throw buildError("NOT_FOUND", "Production record not found.", 404);
  }
  if (clientId && String(record.clientId) !== String(clientId)) {
    throw buildError("VALIDATION_ERROR", "Production record must belong to the same client.");
  }
  return record.id;
}

async function resolveOptionalAppointment(appointmentId, organizationId) {
  if (!appointmentId) return null;
  const findAppointment = getAppointmentFinder();
  const appointment = await findAppointment(appointmentId, organizationId);
  if (!appointment || String(appointment.organizationId) !== String(organizationId)) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }
  return appointment.id;
}

async function createServiceCase(input, authContext) {
  const store = getStore();
  if (!store) throw buildError("STORE_UNAVAILABLE", "Service store is unavailable.", 503);
  const organizationId = input.organizationId;
  if (!organizationId || !authContext?.userId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }
  const serviceType = String(input.serviceType || SERVICE_TYPES.GENERAL_SERVICE).trim().toUpperCase();
  if (!TYPE_SET.has(serviceType)) {
    throw buildError("VALIDATION_ERROR", "A valid service type is required.");
  }
  const status = String(input.status || SERVICE_STATUSES.OPEN).trim().toUpperCase();
  if (!STATUS_SET.has(status)) {
    throw buildError("VALIDATION_ERROR", "A valid service status is required.");
  }
  const title = String(input.title || "").trim();
  if (!title) {
    throw buildError("VALIDATION_ERROR", "A service title is required.");
  }
  const client = await loadClientOrThrow(input.clientId, organizationId);
  if (!canAccessRecord(authContext, client)) throw notFound();
  const ownerUserId = input.ownerUserId || client.ownerUserId || authContext.userId;
  if (!canAccessRecord(authContext, { ownerUserId })) throw notFound();
  const productionId = await resolveOptionalProduction(input.productionId, organizationId, client.id);
  const scheduledAppointmentId = await resolveOptionalAppointment(
    input.scheduledAppointmentId,
    organizationId
  );
  const now = new Date().toISOString();
  const dueDate = normalizeDueDate(input.dueDate);
  const row = {
    id: crypto.randomUUID(),
    organizationId,
    clientId: client.id,
    ownerUserId,
    productionId,
    serviceType,
    status,
    title: title.slice(0, 180),
    notes: input.notes ? String(input.notes).trim() : null,
    dueDate,
    scheduledAppointmentId,
    createdByUserId: authContext.userId,
    completedAt: CLOSED_SET.has(status) ? now : null,
    createdAt: now,
    updatedAt: now,
    history: []
  };
  row.history = appendHistory(row, {
    type: SERVICE_HISTORY_TYPES.CREATED,
    at: now,
    actor: authContext.userId,
    summary: "Service case created",
    newValues: { serviceType, status, dueDate }
  });
  const saved = await store.save(row);
  const names = input.nameById || (await loadActorNames(organizationId));
  return presentCase(saved, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client.name,
    today: todayIsoDate(organizationId, input.reference || new Date())
  });
}

async function getServiceCase(id, { organizationId, authContext, nameById, reference } = {}) {
  const { row } = await getAuthorizedRecord(id, organizationId, authContext);
  const client = await loadClientOrThrow(row.clientId, organizationId).catch(() => null);
  const names = nameById || (await loadActorNames(organizationId));
  return presentCase(row, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null,
    today: todayIsoDate(organizationId, reference || new Date())
  });
}

async function listServiceCases({
  organizationId,
  authContext,
  scope,
  search,
  status,
  serviceType,
  clientId,
  ownerUserId,
  due,
  nameById,
  reference
} = {}) {
  const store = getStore();
  const today = todayIsoDate(organizationId, reference || new Date());
  if (!store) {
    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      scope: SERVICE_SCOPES.MINE,
      teamAvailable: canViewTeamService(authContext),
      search: search || "",
      totalCount: 0,
      filteredCount: 0,
      counts: emptyCounts(),
      items: []
    };
  }
  const ownerFilter = resolveOwnerFilter({ authContext, scope });
  const rows = await store.listForOwners({
    organizationId,
    ownerUserIds: ownerFilter.ownerUserIds,
    clientId: clientId || null
  });
  const names = nameById || (await loadActorNames(organizationId));
  const ownerCache = new Map(names);
  const findClient = getClientFinder();
  const clientCache = new Map();
  const items = [];
  const dueFilter = String(due || SERVICE_DUE_FILTERS.ALL).toLowerCase();
  for (const row of rows) {
    if (status && String(row.status) !== String(status).toUpperCase()) continue;
    if (serviceType && String(row.serviceType) !== String(serviceType).toUpperCase()) continue;
    if (ownerUserId && String(row.ownerUserId) !== String(ownerUserId)) continue;
    const dueStatus = classifyDue(row, today);
    if (dueFilter === SERVICE_DUE_FILTERS.OPEN && CLOSED_SET.has(row.status)) continue;
    if (
      dueFilter !== SERVICE_DUE_FILTERS.ALL &&
      dueFilter !== SERVICE_DUE_FILTERS.OPEN &&
      dueStatus !== dueFilter
    ) {
      continue;
    }
    if (!clientCache.has(row.clientId)) {
      const client = await findClient(row.clientId, organizationId).catch(() => null);
      clientCache.set(row.clientId, client);
    }
    const presented = await presentCase(row, {
      nameById: names,
      ownerCache,
      clientName: clientCache.get(row.clientId)?.name || null,
      today
    });
    if (!matchesSearch(presented, search)) continue;
    items.push(presented);
  }
  items.sort((left, right) => {
    const rank = (item) => {
      if (item.dueStatus === SERVICE_DUE_STATUSES.OVERDUE) return 0;
      if (item.dueStatus === SERVICE_DUE_STATUSES.DUE_TODAY) return 1;
      if (item.dueStatus === SERVICE_DUE_STATUSES.NEEDS_DATE) return 2;
      if (item.dueStatus === SERVICE_DUE_STATUSES.UPCOMING) return 3;
      return 4;
    };
    const byDue = rank(left) - rank(right);
    if (byDue !== 0) return byDue;
    return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
  });
  const counts = emptyCounts();
  for (const item of items) {
    if (!CLOSED_SET.has(item.status)) counts.open += 1;
    if (item.dueStatus === SERVICE_DUE_STATUSES.OVERDUE) counts.overdue += 1;
    if (item.dueStatus === SERVICE_DUE_STATUSES.DUE_TODAY) counts.dueToday += 1;
    if (item.dueStatus === SERVICE_DUE_STATUSES.NEEDS_DATE) counts.needsDate += 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: ownerFilter.scope,
    teamAvailable: canViewTeamService(authContext),
    search: search || "",
    totalCount: items.length,
    filteredCount: items.length,
    counts,
    items
  };
}

async function updateServiceCase(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const now = new Date().toISOString();
  let next = { ...row, updatedAt: now };
  if (input.serviceType) {
    const serviceType = String(input.serviceType).trim().toUpperCase();
    if (!TYPE_SET.has(serviceType)) {
      throw buildError("VALIDATION_ERROR", "A valid service type is required.");
    }
    next.serviceType = serviceType;
  }
  if (Object.prototype.hasOwnProperty.call(input, "title")) {
    const title = String(input.title || "").trim();
    if (!title) throw buildError("VALIDATION_ERROR", "A service title is required.");
    if (title !== row.title) {
      next.title = title.slice(0, 180);
      next.history = appendHistory(next, {
        type: SERVICE_HISTORY_TYPES.TITLE_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: "Title updated"
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "notes")) {
    const notes = input.notes ? String(input.notes).trim() : null;
    if (notes !== row.notes) {
      next.notes = notes;
      next.history = appendHistory(next, {
        type: SERVICE_HISTORY_TYPES.NOTES_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: "Notes updated"
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "dueDate")) {
    const dueDate = normalizeDueDate(input.dueDate);
    if (dueDate !== row.dueDate) {
      next.dueDate = dueDate;
      next.history = appendHistory(next, {
        type: SERVICE_HISTORY_TYPES.DUE_DATE_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: dueDate ? `Due date set to ${dueDate}` : "Due date cleared",
        oldValues: { dueDate: row.dueDate },
        newValues: { dueDate }
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "scheduledAppointmentId")) {
    const scheduledAppointmentId = input.scheduledAppointmentId
      ? await resolveOptionalAppointment(input.scheduledAppointmentId, input.organizationId)
      : null;
    if (scheduledAppointmentId !== row.scheduledAppointmentId) {
      next.scheduledAppointmentId = scheduledAppointmentId;
      next.history = appendHistory(next, {
        type: scheduledAppointmentId
          ? SERVICE_HISTORY_TYPES.APPOINTMENT_LINKED
          : SERVICE_HISTORY_TYPES.APPOINTMENT_UNLINKED,
        at: now,
        actor: authContext.userId,
        summary: scheduledAppointmentId ? "Appointment linked" : "Appointment unlinked",
        oldValues: { scheduledAppointmentId: row.scheduledAppointmentId },
        newValues: { scheduledAppointmentId }
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "productionId")) {
    next.productionId = await resolveOptionalProduction(
      input.productionId,
      input.organizationId,
      next.clientId
    );
  }
  if (input.status) {
    return updateStatus(id, { ...input, status: input.status }, authContext, next);
  }
  const saved = await store.save(next);
  const client = await loadClientOrThrow(saved.clientId, input.organizationId).catch(() => null);
  const names = input.nameById || (await loadActorNames(input.organizationId));
  return presentCase(saved, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null,
    today: todayIsoDate(input.organizationId, input.reference || new Date())
  });
}

async function updateStatus(id, input, authContext, draft = null) {
  const authorized = await getAuthorizedRecord(id, input.organizationId, authContext);
  const store = authorized.store;
  const row = draft || authorized.row;
  const status = String(input.status || "").trim().toUpperCase();
  if (!STATUS_SET.has(status)) {
    throw buildError("VALIDATION_ERROR", "A valid service status is required.");
  }
  const now = new Date().toISOString();
  let next = { ...row, status, updatedAt: now };
  if (CLOSED_SET.has(status) && !next.completedAt) next.completedAt = now;
  if (!CLOSED_SET.has(status)) next.completedAt = null;
  if (status !== (draft ? draft.status : row.status) || !draft) {
    const previous = draft ? draft.status : row.status;
    if (status !== previous) {
      const historyType =
        status === SERVICE_STATUSES.COMPLETED
          ? SERVICE_HISTORY_TYPES.COMPLETED
          : status === SERVICE_STATUSES.CANCELLED
            ? SERVICE_HISTORY_TYPES.CANCELLED
            : SERVICE_HISTORY_TYPES.STATUS_CHANGED;
      next.history = appendHistory(next, {
        type: historyType,
        at: now,
        actor: authContext.userId,
        summary: `Status changed to ${status}`,
        oldValues: { status: previous },
        newValues: { status }
      });
    }
  }
  const saved = await store.save(next);
  const client = await loadClientOrThrow(saved.clientId, input.organizationId).catch(() => null);
  const names = input.nameById || (await loadActorNames(input.organizationId));
  return presentCase(saved, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null,
    today: todayIsoDate(input.organizationId, input.reference || new Date())
  });
}

async function createClientFollowUp(id, input, authContext) {
  const { row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const client = await loadClientOrThrow(row.clientId, input.organizationId);
  return followUpApplicationService.createManualFollowUp(
    {
      organizationId: input.organizationId,
      entityType: FOLLOW_UP_ENTITY_TYPES.CLIENT,
      entityId: client.id,
      subjectLabel: client.name,
      subjectPhone: client.phone || null,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      title: input.title || row.title,
      notes: input.notes || null,
      ownerUserId: authContext.userId
    },
    authContext
  );
}

function toTodayItem(item) {
  const dueStatus = item.dueStatus;
  if (CLOSED_SET.has(item.status)) return null;
  // Implements BR-184 — Needs Date is not a Today obligation. Do not invent urgency.
  if (
    dueStatus !== SERVICE_DUE_STATUSES.OVERDUE &&
    dueStatus !== SERVICE_DUE_STATUSES.DUE_TODAY
  ) {
    return null;
  }
  const viewStatus =
    dueStatus === SERVICE_DUE_STATUSES.OVERDUE
      ? FOLLOW_UP_VIEW_STATUSES.OVERDUE
      : FOLLOW_UP_VIEW_STATUSES.DUE_TODAY;
  return {
    id: item.id,
    kind: "service_case",
    status: viewStatus,
    title: item.title,
    name: item.clientName || item.title,
    dueDate: item.dueDate,
    ownerUserId: item.ownerUserId,
    ownerName: item.ownerName,
    href: item.href,
    entityType: "client",
    entityId: item.clientId,
    source: {
      id: item.id,
      serviceType: item.serviceType,
      clientId: item.clientId
    }
  };
}

module.exports = {
  setStoresForTests,
  createMemoryServiceStore,
  canViewTeamService,
  resolveOwnerFilter,
  classifyDue,
  createServiceCase,
  getServiceCase,
  listServiceCases,
  updateServiceCase,
  updateStatus,
  createClientFollowUp,
  toTodayItem,
  SERVICE_TYPES,
  SERVICE_STATUSES,
  SERVICE_SCOPES,
  SERVICE_DUE_FILTERS,
  SERVICE_DUE_STATUSES
};
