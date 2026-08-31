/**
 * BR-181 — Client Production / Activity.
 * Records belong to clients. Does not create recruiting prospects or touch Recruit AI.
 * Does not auto-create follow-ups or add items to Today.
 */

const crypto = require("crypto");
const {
  PRODUCTION_ACTIVITY_TYPES,
  PRODUCTION_STATUSES,
  PRODUCTION_SCOPES,
  PRODUCTION_SOURCES,
  PRODUCTION_KPI_SCOPES,
  PRODUCTION_HISTORY_TYPES,
  PRODUCTION_METRIC_STATUSES,
  createMemoryProductionStore
} = require("../core/clientProduction");
const {
  summarizeRecords,
  resolveKpiOwnerFilter,
  assertTenantIsolation
} = require("../core/clientProduction/productionKpiEngine");
const { presentHistoryActorLabel } = require("../core/appointmentHistory");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const followUpApplicationService = require("./followUpApplicationService");
const { FOLLOW_UP_ENTITY_TYPES } = require("../core/followUps");

const TYPE_SET = new Set(Object.values(PRODUCTION_ACTIVITY_TYPES));
const STATUS_SET = new Set(Object.values(PRODUCTION_STATUSES));

let storeOverride = null;
let clientFindOverride = null;

function isAutomatedTestRuntime() {
  return process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function getStore() {
  if (storeOverride) return storeOverride;
  if (isAutomatedTestRuntime()) return null;
  return require("../repositories/clientProductionRepository");
}

function getClientFinder() {
  if (clientFindOverride) return clientFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const clients = require("../repositories/agendaClientRepository");
  return (id, organizationId) => clients.findById(id, organizationId);
}

function setStoresForTests({ production = null, findClient = null } = {}) {
  storeOverride = production || null;
  clientFindOverride = findClient || null;
}

function buildError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.publicCode = code;
  error.statusCode = statusCode;
  return error;
}

function notFound() {
  return buildError("NOT_FOUND", "Production record not found.", 404);
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

function canViewTeamProduction(authContext) {
  return followUpApplicationService.canViewTeamFollowUps(authContext);
}

function canViewOrgProduction(authContext) {
  return (
    authContext?.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
    authContext?.role === ROLES.ADMINISTRATOR ||
    authContext?.role === ROLES.RVP
  );
}

function resolveOwnerFilter({ authContext, scope }) {
  const userId = authContext?.userId;
  const requested = String(scope || PRODUCTION_SCOPES.MINE).toLowerCase();
  if (requested === PRODUCTION_KPI_SCOPES.ORGANIZATION && canViewOrgProduction(authContext)) {
    return { scope: PRODUCTION_KPI_SCOPES.ORGANIZATION, ownerUserIds: null };
  }
  if (requested === PRODUCTION_SCOPES.TEAM && canViewTeamProduction(authContext)) {
    if (Array.isArray(authContext.hierarchyUserIds) && authContext.hierarchyUserIds.length > 0) {
      return {
        scope: PRODUCTION_SCOPES.TEAM,
        ownerUserIds: authContext.hierarchyUserIds
      };
    }
    return {
      scope: PRODUCTION_SCOPES.TEAM,
      ownerUserIds: userId ? [userId] : []
    };
  }
  return { scope: PRODUCTION_SCOPES.MINE, ownerUserIds: userId ? [userId] : [] };
}

function canAccessRecord(authContext, row) {
  if (!row || !authContext?.userId) return false;
  if (String(row.ownerUserId) === String(authContext.userId)) return true;
  if (!canViewTeamProduction(authContext)) return false;
  if (
    authContext.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
    authContext.role === ROLES.ADMINISTRATOR ||
    authContext.role === ROLES.RVP
  ) {
    return true;
  }
  return (authContext.hierarchyUserIds || []).map(String).includes(String(row.ownerUserId));
}

function parseAmount(value) {
  if (value === undefined || value === null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) {
    throw buildError("VALIDATION_ERROR", "Amount must be a real number or empty.");
  }
  return amount;
}

function parseRequiredPremium(value) {
  const amount = parseAmount(value);
  if (amount == null) {
    throw buildError("VALIDATION_ERROR", "Premium amount is required.");
  }
  if (amount < 0) {
    throw buildError("VALIDATION_ERROR", "Premium amount must be zero or greater.");
  }
  return amount;
}

function parseCurrency(value) {
  const currency = String(value || "USD")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw buildError("VALIDATION_ERROR", "Currency must be a 3-letter code.");
  }
  return currency;
}

function parseOptionalIso(value) {
  if (value === undefined || value === null || value === "") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw buildError("VALIDATION_ERROR", "A valid timestamp is required.");
  }
  return new Date(ms).toISOString();
}

function applyStatusTimestamps(row, nextStatus, explicit = {}) {
  const now = new Date().toISOString();
  const next = { ...row };
  if (Object.prototype.hasOwnProperty.call(explicit, "submittedAt")) {
    next.submittedAt = parseOptionalIso(explicit.submittedAt);
  }
  if (Object.prototype.hasOwnProperty.call(explicit, "issuedAt")) {
    next.issuedAt = parseOptionalIso(explicit.issuedAt);
  }
  if (Object.prototype.hasOwnProperty.call(explicit, "paidAt")) {
    next.paidAt = parseOptionalIso(explicit.paidAt);
  }
  if (Object.prototype.hasOwnProperty.call(explicit, "closedAt")) {
    next.closedAt = parseOptionalIso(explicit.closedAt);
  }
  if (nextStatus === PRODUCTION_STATUSES.SUBMITTED && !next.submittedAt) next.submittedAt = now;
  if (nextStatus === PRODUCTION_STATUSES.ISSUED && !next.issuedAt) next.issuedAt = now;
  if (nextStatus === PRODUCTION_STATUSES.PAID && !next.paidAt) next.paidAt = now;
  if (
    (nextStatus === PRODUCTION_STATUSES.CLOSED ||
      nextStatus === PRODUCTION_STATUSES.DECLINED ||
      nextStatus === PRODUCTION_STATUSES.WITHDRAWN) &&
    !next.closedAt
  ) {
    next.closedAt = now;
  }
  return next;
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

function emptyCounts() {
  return { submitted: 0, pending: 0, issued: 0, paid: 0 };
}

function emptyAmounts() {
  return { submitted: null, pending: null, issued: null, paid: null };
}

function metricKey(status) {
  if (status === PRODUCTION_STATUSES.SUBMITTED) return "submitted";
  if (status === PRODUCTION_STATUSES.PENDING) return "pending";
  if (status === PRODUCTION_STATUSES.ISSUED) return "issued";
  if (status === PRODUCTION_STATUSES.PAID) return "paid";
  return null;
}

function buildMetrics(items) {
  const counts = emptyCounts();
  const sums = { submitted: 0, pending: 0, issued: 0, paid: 0 };
  const hasAmount = { submitted: false, pending: false, issued: false, paid: false };
  for (const item of items) {
    const key = metricKey(item.status);
    if (!key) continue;
    counts[key] += 1;
    if (item.amount != null && Number.isFinite(Number(item.amount))) {
      sums[key] += Number(item.amount);
      hasAmount[key] = true;
    }
  }
  return {
    counts,
    amounts: {
      submitted: hasAmount.submitted ? sums.submitted : null,
      pending: hasAmount.pending ? sums.pending : null,
      issued: hasAmount.issued ? sums.issued : null,
      paid: hasAmount.paid ? sums.paid : null
    }
  };
}

function matchesSearch(item, query) {
  if (!query) return true;
  const needle = String(query).trim().toLowerCase();
  if (!needle) return true;
  return [item.clientName, item.carrier, item.productType, item.notes, item.activityType]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function inDateRange(item, from, to) {
  if (!from && !to) return true;
  const stamp = item.submittedAt || item.createdAt;
  if (!stamp) return false;
  if (from && String(stamp).slice(0, 10) < from) return false;
  if (to && String(stamp).slice(0, 10) > to) return false;
  return true;
}

async function presentRecord(row, { nameById, ownerCache, clientName = null } = {}) {
  const ownerName = await resolveOwnerName(row.ownerUserId, ownerCache || new Map());
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    clientName: clientName || null,
    ownerUserId: row.ownerUserId,
    ownerName,
    activityType: row.activityType,
    status: row.status,
    carrier: row.carrier,
    productType: row.productType,
    amount: row.amount,
    currency: row.currency || "USD",
    appointmentId: row.appointmentId || null,
    source: row.source || PRODUCTION_SOURCES.MANUAL,
    submittedAt: row.submittedAt,
    issuedAt: row.issuedAt,
    paidAt: row.paidAt,
    closedAt: row.closedAt,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
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
  if (!store) throw buildError("STORE_UNAVAILABLE", "Production store is unavailable.", 503);
  const row = await store.findById(id, organizationId);
  if (!row || !canAccessRecord(authContext, row)) throw notFound();
  return { store, row };
}

async function createProduction(input, authContext) {
  const store = getStore();
  if (!store) throw buildError("STORE_UNAVAILABLE", "Production store is unavailable.", 503);
  const organizationId = input.organizationId;
  if (!organizationId || !authContext?.userId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }
  const activityType = String(input.activityType || "").trim().toUpperCase();
  if (!TYPE_SET.has(activityType)) {
    throw buildError("VALIDATION_ERROR", "A valid activity type is required.");
  }
  const status = String(input.status || PRODUCTION_STATUSES.DRAFT).trim().toUpperCase();
  if (!STATUS_SET.has(status)) {
    throw buildError("VALIDATION_ERROR", "A valid production status is required.");
  }
  const client = await loadClientOrThrow(input.clientId, organizationId);
  if (!canAccessRecord(authContext, client)) {
    throw notFound();
  }
  const ownerUserId = input.ownerUserId || client.ownerUserId || authContext.userId;
  if (!canAccessRecord(authContext, { ownerUserId })) {
    throw notFound();
  }
  const now = new Date().toISOString();
  const amount = parseAmount(input.amount);
  if (amount != null && amount < 0) {
    throw buildError("VALIDATION_ERROR", "Premium amount must be zero or greater.");
  }
  let row = {
    id: crypto.randomUUID(),
    organizationId,
    clientId: client.id,
    ownerUserId,
    activityType,
    status,
    carrier: input.carrier ? String(input.carrier).trim().slice(0, 160) : null,
    productType: input.productType ? String(input.productType).trim().slice(0, 160) : null,
    amount,
    currency: parseCurrency(input.currency),
    appointmentId: input.appointmentId || null,
    source: input.source || PRODUCTION_SOURCES.MANUAL,
    submittedAt: null,
    issuedAt: null,
    paidAt: null,
    closedAt: null,
    notes: input.notes ? String(input.notes).trim() : null,
    createdByUserId: authContext.userId,
    createdAt: now,
    updatedAt: now,
    history: []
  };
  row = applyStatusTimestamps(row, status, input);
  row.history = appendHistory(row, {
    type: PRODUCTION_HISTORY_TYPES.CREATED,
    at: now,
    actor: authContext.userId,
    summary: "Production record created",
    newValues: { activityType, status, amount }
  });
  const saved = await store.save(row);
  const nameById = input.nameById || (await loadActorNames(organizationId));
  return presentRecord(saved, {
    nameById,
    ownerCache: new Map(nameById),
    clientName: client.name
  });
}

async function getProduction(id, { organizationId, authContext, nameById } = {}) {
  const { row } = await getAuthorizedRecord(id, organizationId, authContext);
  const client = await loadClientOrThrow(row.clientId, organizationId).catch(() => null);
  const names = nameById || (await loadActorNames(organizationId));
  return presentRecord(row, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null
  });
}

async function listProduction({
  organizationId,
  authContext,
  scope,
  search,
  status,
  activityType,
  clientId,
  ownerUserId,
  from,
  to,
  nameById
} = {}) {
  const store = getStore();
  if (!store) {
    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      scope: PRODUCTION_SCOPES.MINE,
      teamAvailable: canViewTeamProduction(authContext),
      organizationAvailable: canViewOrgProduction(authContext),
      search: search || "",
      totalCount: 0,
      filteredCount: 0,
      counts: emptyCounts(),
      amounts: emptyAmounts(),
      kpis: summarizeRecords([]),
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
  for (const row of rows) {
    if (status && String(row.status) !== String(status).toUpperCase()) continue;
    if (activityType && String(row.activityType) !== String(activityType).toUpperCase()) continue;
    if (ownerUserId && String(row.ownerUserId) !== String(ownerUserId)) continue;
    if (!inDateRange(row, from, to)) continue;
    let clientName = null;
    if (!clientCache.has(row.clientId)) {
      const client = await findClient(row.clientId, organizationId).catch(() => null);
      clientCache.set(row.clientId, client);
    }
    clientName = clientCache.get(row.clientId)?.name || null;
    const presented = await presentRecord(row, { nameById: names, ownerCache, clientName });
    if (!matchesSearch(presented, search)) continue;
    items.push(presented);
  }
  items.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  const metrics = buildMetrics(items);
  const kpis = summarizeRecords(items);
  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: ownerFilter.scope,
    teamAvailable: canViewTeamProduction(authContext),
    organizationAvailable: canViewOrgProduction(authContext),
    search: search || "",
    totalCount: items.length,
    filteredCount: items.length,
    ...metrics,
    kpis,
    items
  };
}

async function updateProduction(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const now = new Date().toISOString();
  let next = { ...row, updatedAt: now };
  if (input.activityType) {
    const activityType = String(input.activityType).trim().toUpperCase();
    if (!TYPE_SET.has(activityType)) {
      throw buildError("VALIDATION_ERROR", "A valid activity type is required.");
    }
    next.activityType = activityType;
  }
  if (Object.prototype.hasOwnProperty.call(input, "carrier")) {
    const carrier = input.carrier ? String(input.carrier).trim().slice(0, 160) : null;
    if (carrier !== row.carrier) {
      next.carrier = carrier;
      next.history = appendHistory(next, {
        type: PRODUCTION_HISTORY_TYPES.CARRIER_PRODUCT_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: "Carrier updated",
        oldValues: { carrier: row.carrier, productType: row.productType },
        newValues: { carrier, productType: next.productType }
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "productType")) {
    const productType = input.productType ? String(input.productType).trim().slice(0, 160) : null;
    if (productType !== row.productType) {
      next.productType = productType;
      next.history = appendHistory(next, {
        type: PRODUCTION_HISTORY_TYPES.CARRIER_PRODUCT_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: "Product updated",
        oldValues: { carrier: next.carrier, productType: row.productType },
        newValues: { carrier: next.carrier, productType }
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "currency")) {
    next.currency = parseCurrency(input.currency);
  }
  if (Object.prototype.hasOwnProperty.call(input, "amount")) {
    const amount = parseAmount(input.amount);
    if (amount != null && amount < 0) {
      throw buildError("VALIDATION_ERROR", "Premium amount must be zero or greater.");
    }
    if (amount !== row.amount) {
      next.amount = amount;
      next.history = appendHistory(next, {
        type: PRODUCTION_HISTORY_TYPES.AMOUNT_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: "Amount updated",
        oldValues: { amount: row.amount },
        newValues: { amount }
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "notes")) {
    const notes = input.notes ? String(input.notes).trim() : null;
    if (notes !== row.notes) {
      next.notes = notes;
      next.history = appendHistory(next, {
        type: PRODUCTION_HISTORY_TYPES.NOTES_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: "Notes updated"
      });
    }
  }
  if (input.status) {
    const status = String(input.status).trim().toUpperCase();
    if (!STATUS_SET.has(status)) {
      throw buildError("VALIDATION_ERROR", "A valid production status is required.");
    }
    next = applyStatusTimestamps({ ...next, status }, status, input);
    if (status !== row.status) {
      next.history = appendHistory(next, {
        type: PRODUCTION_HISTORY_TYPES.STATUS_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: `Status changed to ${status}`,
        oldValues: { status: row.status },
        newValues: { status }
      });
    }
  } else {
    next = applyStatusTimestamps(next, next.status, input);
  }
  const saved = await store.save(next);
  const client = await loadClientOrThrow(saved.clientId, input.organizationId).catch(() => null);
  const names = input.nameById || (await loadActorNames(input.organizationId));
  return presentRecord(saved, { nameById: names, ownerCache: new Map(names), clientName: client?.name || null });
}

async function updateStatus(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const status = String(input.status || "").trim().toUpperCase();
  if (!STATUS_SET.has(status)) {
    throw buildError("VALIDATION_ERROR", "A valid production status is required.");
  }
  const now = new Date().toISOString();
  let next = applyStatusTimestamps({ ...row, status, updatedAt: now }, status, input);
  if (status !== row.status) {
    next.history = appendHistory(next, {
      type: PRODUCTION_HISTORY_TYPES.STATUS_CHANGED,
      at: now,
      actor: authContext.userId,
      summary: `Status changed to ${status}`,
      oldValues: { status: row.status },
      newValues: { status }
    });
  }
  const saved = await store.save(next);
  const client = await loadClientOrThrow(saved.clientId, input.organizationId).catch(() => null);
  const names = input.nameById || (await loadActorNames(input.organizationId));
  return presentRecord(saved, { nameById: names, ownerCache: new Map(names), clientName: client?.name || null });
}

async function upsertAppointmentProduction(input, authContext) {
  const store = getStore();
  if (!store) throw buildError("STORE_UNAVAILABLE", "Production store is unavailable.", 503);
  const organizationId = input.organizationId;
  const appointmentId = String(input.appointmentId || "").trim();
  if (!organizationId || !appointmentId) {
    throw buildError("VALIDATION_ERROR", "Appointment and organization are required.");
  }
  const amount = parseRequiredPremium(input.amount);
  const existing =
    typeof store.findByAppointmentId === "function"
      ? await store.findByAppointmentId(appointmentId, organizationId)
      : null;
  if (existing) {
    if (!sameId(existing.organizationId, organizationId)) {
      throw notFound();
    }
    return updateProduction(
      existing.id,
      {
        organizationId,
        amount,
        currency: input.currency,
        activityType: input.activityType,
        carrier: input.carrier,
        productType: input.productType,
        submittedAt: input.submittedAt,
        status: existing.status || PRODUCTION_STATUSES.SUBMITTED,
        nameById: input.nameById
      },
      authContext
    );
  }
  return createProduction(
    {
      organizationId,
      clientId: input.clientId,
      ownerUserId: input.ownerUserId,
      activityType: input.activityType || PRODUCTION_ACTIVITY_TYPES.LIFE,
      status: PRODUCTION_STATUSES.SUBMITTED,
      amount,
      currency: input.currency,
      appointmentId,
      source: PRODUCTION_SOURCES.AGENDA_CLIENT_CONVERSION,
      carrier: input.carrier,
      productType: input.productType,
      submittedAt: input.submittedAt,
      notes: input.notes,
      nameById: input.nameById
    },
    authContext
  );
}

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

async function summarizeProductionKpis({
  organizationId,
  authContext,
  scope,
  from,
  to
} = {}) {
  const store = getStore();
  const filter = resolveKpiOwnerFilter({ authContext, scope });
  if (!store) {
    return {
      generatedAt: new Date().toISOString(),
      organizationId: organizationId || null,
      scope: filter.scope,
      ...summarizeRecords([])
    };
  }

  if (filter.scope === PRODUCTION_KPI_SCOPES.PLATFORM) {
    const all =
      typeof store.listAllForPlatform === "function" ? await store.listAllForPlatform() : [];
    const byOrg = new Map();
    for (const row of all) {
      const orgId = String(row.organizationId || "");
      if (!orgId) continue;
      if (!byOrg.has(orgId)) byOrg.set(orgId, []);
      byOrg.get(orgId).push(row);
    }
    const organizations = [...byOrg.entries()].map(([orgId, rows]) => ({
      organizationId: orgId,
      ...summarizeRecords(rows)
    }));
    return {
      generatedAt: new Date().toISOString(),
      scope: PRODUCTION_KPI_SCOPES.PLATFORM,
      ...summarizeRecords(all),
      organizations
    };
  }

  if (!organizationId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }
  const rows = await store.listForOwners({
    organizationId,
    ownerUserIds: filter.ownerUserIds
  });
  const isolated = assertTenantIsolation(rows, organizationId).filter((item) =>
    inDateRange(item, from, to)
  );
  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: filter.scope,
    ...summarizeRecords(isolated)
  };
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
      title: input.title || row.carrier || row.activityType || "Client follow-up",
      notes: input.notes || null,
      ownerUserId: authContext.userId
    },
    authContext
  );
}

module.exports = {
  setStoresForTests,
  createMemoryProductionStore,
  canViewTeamProduction,
  resolveOwnerFilter,
  createProduction,
  getProduction,
  listProduction,
  updateProduction,
  updateStatus,
  upsertAppointmentProduction,
  summarizeProductionKpis,
  parseRequiredPremium,
  createClientFollowUp,
  PRODUCTION_ACTIVITY_TYPES,
  PRODUCTION_STATUSES,
  PRODUCTION_SCOPES,
  PRODUCTION_SOURCES,
  PRODUCTION_KPI_SCOPES,
  PRODUCTION_METRIC_STATUSES
};
