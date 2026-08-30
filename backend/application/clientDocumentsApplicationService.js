/**
 * BR-183 — Client Documents & Secure Document Requests.
 * Metadata and request workflow only. POLICY_REVIEW documents are not analyzed.
 * Does not create recruiting prospects or auto-create follow-ups.
 */

const crypto = require("crypto");
const {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_REQUEST_STATUSES,
  DOCUMENT_SCOPES,
  DOCUMENT_DUE_FILTERS,
  DOCUMENT_DUE_STATUSES,
  DOCUMENT_HISTORY_TYPES,
  DOCUMENT_REQUEST_CLOSED_STATUSES,
  createMemoryDocumentStore,
  createMemoryDocumentRequestStore,
  createMemoryObjectStorage,
  assertUploadConstraints
} = require("../core/clientDocuments");
const { presentHistoryActorLabel } = require("../core/appointmentHistory");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { todayIsoDate } = require("../core/followUps/classification");
const { FOLLOW_UP_VIEW_STATUSES, FOLLOW_UP_ENTITY_TYPES } = require("../core/followUps");
const followUpApplicationService = require("./followUpApplicationService");

const TYPE_SET = new Set(Object.values(DOCUMENT_TYPES));
const DOC_STATUS_SET = new Set(Object.values(DOCUMENT_STATUSES));
const REQ_STATUS_SET = new Set(Object.values(DOCUMENT_REQUEST_STATUSES));
const CLOSED_SET = new Set(DOCUMENT_REQUEST_CLOSED_STATUSES);

let documentStoreOverride = null;
let requestStoreOverride = null;
let storageOverride = null;
let clientFindOverride = null;
let serviceFindOverride = null;
let productionFindOverride = null;

function isAutomatedTestRuntime() {
  return process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function getDocumentStore() {
  if (documentStoreOverride) return documentStoreOverride;
  if (isAutomatedTestRuntime()) return null;
  return require("../repositories/clientDocumentRepository");
}

function getRequestStore() {
  if (requestStoreOverride) return requestStoreOverride;
  if (isAutomatedTestRuntime()) return null;
  return require("../repositories/clientDocumentRequestRepository");
}

function getObjectStorage() {
  if (storageOverride) return storageOverride;
  if (isAutomatedTestRuntime()) return null;
  const impl = require("../infrastructure/clientDocumentStorage");
  return {
    upload: (input) => impl.uploadClientDocument(input),
    download: (storageKey, organizationId) => impl.downloadClientDocument(storageKey, organizationId)
  };
}

function getClientFinder() {
  if (clientFindOverride) return clientFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const clients = require("../repositories/agendaClientRepository");
  return (id, organizationId) => clients.findById(id, organizationId);
}

function getServiceFinder() {
  if (serviceFindOverride) return serviceFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const service = require("../repositories/clientServiceRepository");
  return (id, organizationId) => service.findById(id, organizationId);
}

function getProductionFinder() {
  if (productionFindOverride) return productionFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const production = require("../repositories/clientProductionRepository");
  return (id, organizationId) => production.findById(id, organizationId);
}

function setStoresForTests({
  documents = null,
  requests = null,
  storage = null,
  findClient = null,
  findServiceCase = null,
  findProduction = null
} = {}) {
  documentStoreOverride = documents || null;
  requestStoreOverride = requests || null;
  storageOverride = storage || null;
  clientFindOverride = findClient || null;
  serviceFindOverride = findServiceCase || null;
  productionFindOverride = findProduction || null;
}

function buildError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.publicCode = code;
  error.statusCode = statusCode;
  return error;
}

function notFound(kind = "Document") {
  return buildError("NOT_FOUND", `${kind} not found.`, 404);
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

function canViewTeamDocuments(authContext) {
  return followUpApplicationService.canViewTeamFollowUps(authContext);
}

function resolveOwnerFilter({ authContext, scope }) {
  const userId = authContext?.userId;
  const requested = String(scope || DOCUMENT_SCOPES.MINE).toLowerCase();
  if (requested === DOCUMENT_SCOPES.TEAM && canViewTeamDocuments(authContext)) {
    if (
      authContext.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
      authContext.role === ROLES.ADMINISTRATOR ||
      authContext.role === ROLES.RVP
    ) {
      return { scope: DOCUMENT_SCOPES.TEAM, ownerUserIds: null };
    }
    return {
      scope: DOCUMENT_SCOPES.TEAM,
      ownerUserIds: authContext.hierarchyUserIds || [userId]
    };
  }
  return { scope: DOCUMENT_SCOPES.MINE, ownerUserIds: userId ? [userId] : [] };
}

function canAccessRecord(authContext, row) {
  if (!row || !authContext?.userId) return false;
  if (String(row.ownerUserId) === String(authContext.userId)) return true;
  if (!canViewTeamDocuments(authContext)) return false;
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
  if (CLOSED_SET.has(row.status) || row.status === DOCUMENT_REQUEST_STATUSES.RECEIVED) {
    return DOCUMENT_DUE_STATUSES.CLOSED;
  }
  if (!row.dueDate) return DOCUMENT_DUE_STATUSES.NEEDS_DATE;
  if (!today) return DOCUMENT_DUE_STATUSES.NEEDS_DATE;
  if (row.dueDate < today) return DOCUMENT_DUE_STATUSES.OVERDUE;
  if (row.dueDate === today) return DOCUMENT_DUE_STATUSES.DUE_TODAY;
  return DOCUMENT_DUE_STATUSES.UPCOMING;
}

function emptyRequestCounts() {
  return { open: 0, overdue: 0, dueToday: 0, needsDate: 0 };
}

function matchesSearch(item, query, extra = []) {
  if (!query) return true;
  const needle = String(query).trim().toLowerCase();
  if (!needle) return true;
  return [item.clientName, item.title, item.instructions, item.notes, item.documentType, item.originalFilename, ...extra]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

async function resolveOwnerName(ownerUserId, cache) {
  if (!ownerUserId) return null;
  if (isAutomatedTestRuntime()) return cache.get(ownerUserId) || null;
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

async function loadClientOrThrow(clientId, organizationId) {
  const findClient = getClientFinder();
  const client = await findClient(clientId, organizationId);
  if (!client || String(client.organizationId) !== String(organizationId)) {
    throw notFound("Client");
  }
  return client;
}

async function resolveOptionalServiceCase(serviceCaseId, organizationId, clientId) {
  if (!serviceCaseId) return null;
  const findService = getServiceFinder();
  const record = await findService(serviceCaseId, organizationId);
  if (!record || String(record.organizationId) !== String(organizationId)) {
    throw notFound("Service case");
  }
  if (clientId && String(record.clientId) !== String(clientId)) {
    throw buildError("VALIDATION_ERROR", "Service case must belong to the same client.");
  }
  return record.id;
}

async function resolveOptionalProduction(productionId, organizationId, clientId) {
  if (!productionId) return null;
  const findProduction = getProductionFinder();
  const record = await findProduction(productionId, organizationId);
  if (!record || String(record.organizationId) !== String(organizationId)) {
    throw notFound("Production record");
  }
  if (clientId && String(record.clientId) !== String(clientId)) {
    throw buildError("VALIDATION_ERROR", "Production record must belong to the same client.");
  }
  return record.id;
}

async function presentRequest(row, { nameById, ownerCache, clientName = null, today } = {}) {
  const ownerName = await resolveOwnerName(row.ownerUserId, ownerCache || new Map());
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    clientName: clientName || null,
    ownerUserId: row.ownerUserId,
    ownerName,
    serviceCaseId: row.serviceCaseId,
    productionId: row.productionId,
    documentType: row.documentType,
    title: row.title,
    instructions: row.instructions,
    status: row.status,
    dueDate: row.dueDate,
    dueStatus: classifyDue(row, today),
    requestedAt: row.requestedAt,
    fulfilledAt: row.fulfilledAt,
    cancelledAt: row.cancelledAt,
    fulfilledDocumentId: row.fulfilledDocumentId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    history: presentHistory(row.history, nameById),
    href: `/app/clients/${row.clientId}`
  };
}

async function presentDocument(row, { nameById, ownerCache, clientName = null } = {}) {
  const ownerName = await resolveOwnerName(row.ownerUserId, ownerCache || new Map());
  const uploadedByName = row.uploadedByUserId
    ? await resolveOwnerName(row.uploadedByUserId, ownerCache || new Map())
    : null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    clientName: clientName || null,
    ownerUserId: row.ownerUserId,
    ownerName,
    uploadedByUserId: row.uploadedByUserId,
    uploadedByName,
    serviceCaseId: row.serviceCaseId,
    productionId: row.productionId,
    requestId: row.requestId,
    documentType: row.documentType,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    notes: row.notes,
    receivedAt: row.receivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    history: presentHistory(row.history, nameById),
    href: `/app/clients/${row.clientId}`
  };
}

async function getAuthorizedRequest(id, organizationId, authContext) {
  const store = getRequestStore();
  if (!store) throw buildError("STORE_UNAVAILABLE", "Document request store is unavailable.", 503);
  const row = await store.findById(id, organizationId);
  if (!row || String(row.organizationId) !== String(organizationId) || !canAccessRecord(authContext, row)) {
    throw notFound("Document request");
  }
  return { store, row };
}

async function getAuthorizedDocument(id, organizationId, authContext) {
  const store = getDocumentStore();
  if (!store) throw buildError("STORE_UNAVAILABLE", "Document store is unavailable.", 503);
  const row = await store.findById(id, organizationId);
  if (!row || String(row.organizationId) !== String(organizationId) || !canAccessRecord(authContext, row)) {
    throw notFound("Document");
  }
  return { store, row };
}

async function createDocumentRequest(input, authContext) {
  const store = getRequestStore();
  if (!store) throw buildError("STORE_UNAVAILABLE", "Document request store is unavailable.", 503);
  const organizationId = input.organizationId;
  if (!organizationId || !authContext?.userId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }
  const documentType = String(input.documentType || DOCUMENT_TYPES.OTHER).trim().toUpperCase();
  if (!TYPE_SET.has(documentType)) {
    throw buildError("VALIDATION_ERROR", "A valid document type is required.");
  }
  const title = String(input.title || "").trim();
  if (!title) throw buildError("VALIDATION_ERROR", "A document request title is required.");
  const client = await loadClientOrThrow(input.clientId, organizationId);
  if (!canAccessRecord(authContext, client)) throw notFound("Client");
  const ownerUserId = input.ownerUserId || client.ownerUserId || authContext.userId;
  if (!canAccessRecord(authContext, { ownerUserId })) throw notFound("Document request");
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    organizationId,
    clientId: client.id,
    ownerUserId,
    serviceCaseId: await resolveOptionalServiceCase(input.serviceCaseId, organizationId, client.id),
    productionId: await resolveOptionalProduction(input.productionId, organizationId, client.id),
    documentType,
    title: title.slice(0, 180),
    instructions: input.instructions ? String(input.instructions).trim() : null,
    status: DOCUMENT_REQUEST_STATUSES.OPEN,
    dueDate: normalizeDueDate(input.dueDate),
    requestedAt: now,
    fulfilledAt: null,
    cancelledAt: null,
    fulfilledDocumentId: null,
    createdByUserId: authContext.userId,
    createdAt: now,
    updatedAt: now,
    history: appendHistory({ history: [] }, {
      type: DOCUMENT_HISTORY_TYPES.REQUEST_CREATED,
      at: now,
      actor: authContext.userId,
      summary: "Document request created"
    })
  };
  const saved = await store.save(row);
  const names = input.nameById || (await loadActorNames(organizationId));
  return presentRequest(saved, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client.name || null,
    today: todayIsoDate(organizationId, input.reference || new Date())
  });
}

async function getDocumentRequest(id, { organizationId, authContext, nameById, reference } = {}) {
  const { row } = await getAuthorizedRequest(id, organizationId, authContext);
  const client = await loadClientOrThrow(row.clientId, organizationId).catch(() => null);
  const names = nameById || (await loadActorNames(organizationId));
  return presentRequest(row, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null,
    today: todayIsoDate(organizationId, reference || new Date())
  });
}

async function listDocumentRequests({
  organizationId,
  authContext,
  scope,
  search,
  status,
  documentType,
  clientId,
  serviceCaseId,
  ownerUserId,
  due,
  nameById,
  reference
} = {}) {
  const store = getRequestStore();
  const today = todayIsoDate(organizationId, reference || new Date());
  if (!store) {
    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      scope: DOCUMENT_SCOPES.MINE,
      teamAvailable: canViewTeamDocuments(authContext),
      search: search || "",
      totalCount: 0,
      filteredCount: 0,
      counts: emptyRequestCounts(),
      items: []
    };
  }
  const ownerFilter = resolveOwnerFilter({ authContext, scope });
  const rows = await store.listForOwners({
    organizationId,
    ownerUserIds: ownerFilter.ownerUserIds,
    clientId: clientId || null,
    serviceCaseId: serviceCaseId || null
  });
  const names = nameById || (await loadActorNames(organizationId));
  const ownerCache = new Map(names);
  const findClient = getClientFinder();
  const clientCache = new Map();
  const items = [];
  const dueFilter = String(due || DOCUMENT_DUE_FILTERS.ALL).toLowerCase();
  for (const row of rows) {
    if (status && String(row.status) !== String(status).toUpperCase()) continue;
    if (documentType && String(row.documentType) !== String(documentType).toUpperCase()) continue;
    if (ownerUserId && String(row.ownerUserId) !== String(ownerUserId)) continue;
    const dueStatus = classifyDue(row, today);
    if (dueFilter === DOCUMENT_DUE_FILTERS.OPEN && row.status !== DOCUMENT_REQUEST_STATUSES.OPEN) continue;
    if (
      dueFilter !== DOCUMENT_DUE_FILTERS.ALL &&
      dueFilter !== DOCUMENT_DUE_FILTERS.OPEN &&
      dueStatus !== dueFilter
    ) {
      continue;
    }
    if (!clientCache.has(row.clientId)) {
      const client = await findClient(row.clientId, organizationId).catch(() => null);
      clientCache.set(row.clientId, client);
    }
    const presented = await presentRequest(row, {
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
      if (item.dueStatus === DOCUMENT_DUE_STATUSES.OVERDUE) return 0;
      if (item.dueStatus === DOCUMENT_DUE_STATUSES.DUE_TODAY) return 1;
      if (item.dueStatus === DOCUMENT_DUE_STATUSES.NEEDS_DATE) return 2;
      if (item.dueStatus === DOCUMENT_DUE_STATUSES.UPCOMING) return 3;
      return 4;
    };
    const byDue = rank(left) - rank(right);
    if (byDue !== 0) return byDue;
    return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
  });
  const counts = emptyRequestCounts();
  for (const item of items) {
    if (item.status === DOCUMENT_REQUEST_STATUSES.OPEN) counts.open += 1;
    if (item.dueStatus === DOCUMENT_DUE_STATUSES.OVERDUE) counts.overdue += 1;
    if (item.dueStatus === DOCUMENT_DUE_STATUSES.DUE_TODAY) counts.dueToday += 1;
    if (item.dueStatus === DOCUMENT_DUE_STATUSES.NEEDS_DATE) counts.needsDate += 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: ownerFilter.scope,
    teamAvailable: canViewTeamDocuments(authContext),
    search: search || "",
    totalCount: items.length,
    filteredCount: items.length,
    counts,
    items
  };
}

async function updateDocumentRequest(id, input, authContext) {
  const { store, row } = await getAuthorizedRequest(id, input.organizationId, authContext);
  const now = new Date().toISOString();
  let next = { ...row, updatedAt: now };
  if (Object.prototype.hasOwnProperty.call(input, "title")) {
    const title = String(input.title || "").trim();
    if (!title) throw buildError("VALIDATION_ERROR", "A document request title is required.");
    if (title !== row.title) {
      next.title = title.slice(0, 180);
      next.history = appendHistory(next, {
        type: DOCUMENT_HISTORY_TYPES.TITLE_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: "Title updated"
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "instructions")) {
    next.instructions = input.instructions ? String(input.instructions).trim() : null;
  }
  if (input.documentType) {
    const documentType = String(input.documentType).trim().toUpperCase();
    if (!TYPE_SET.has(documentType)) {
      throw buildError("VALIDATION_ERROR", "A valid document type is required.");
    }
    next.documentType = documentType;
  }
  if (Object.prototype.hasOwnProperty.call(input, "dueDate")) {
    const dueDate = normalizeDueDate(input.dueDate);
    if (dueDate !== row.dueDate) {
      next.dueDate = dueDate;
      next.history = appendHistory(next, {
        type: DOCUMENT_HISTORY_TYPES.DUE_DATE_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: dueDate ? `Due date set to ${dueDate}` : "Due date cleared",
        oldValues: { dueDate: row.dueDate },
        newValues: { dueDate }
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "serviceCaseId")) {
    next.serviceCaseId = await resolveOptionalServiceCase(
      input.serviceCaseId,
      input.organizationId,
      next.clientId
    );
  }
  if (input.status) {
    return updateRequestStatus(id, { ...input, status: input.status }, authContext, next);
  }
  const saved = await store.save(next);
  const client = await loadClientOrThrow(saved.clientId, input.organizationId).catch(() => null);
  const names = input.nameById || (await loadActorNames(input.organizationId));
  return presentRequest(saved, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null,
    today: todayIsoDate(input.organizationId, input.reference || new Date())
  });
}

async function updateRequestStatus(id, input, authContext, draft = null) {
  const authorized = await getAuthorizedRequest(id, input.organizationId, authContext);
  const store = authorized.store;
  const row = draft || authorized.row;
  const status = String(input.status || "").trim().toUpperCase();
  if (!REQ_STATUS_SET.has(status)) {
    throw buildError("VALIDATION_ERROR", "A valid request status is required.");
  }
  const now = new Date().toISOString();
  let next = { ...row, status, updatedAt: now };
  if (status === DOCUMENT_REQUEST_STATUSES.CANCELLED && !next.cancelledAt) next.cancelledAt = now;
  if (status !== DOCUMENT_REQUEST_STATUSES.CANCELLED) next.cancelledAt = row.cancelledAt;
  if (status !== row.status) {
    next.history = appendHistory(next, {
      type: DOCUMENT_HISTORY_TYPES.REQUEST_STATUS_CHANGED,
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
  return presentRequest(saved, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null,
    today: todayIsoDate(input.organizationId, input.reference || new Date())
  });
}

async function fulfillDocumentRequest(requestRow, documentRow, authContext, now) {
  if (
    requestRow.fulfilledDocumentId &&
    String(requestRow.fulfilledDocumentId) === String(documentRow.id)
  ) {
    return requestRow;
  }
  if (requestRow.fulfilledDocumentId && String(requestRow.fulfilledDocumentId) !== String(documentRow.id)) {
    throw buildError("VALIDATION_ERROR", "Document request is already fulfilled.");
  }
  if (String(requestRow.clientId) !== String(documentRow.clientId)) {
    throw buildError("VALIDATION_ERROR", "Document must belong to the same client.");
  }
  const requestStore = getRequestStore();
  let next = {
    ...requestRow,
    fulfilledDocumentId: documentRow.id,
    fulfilledAt: requestRow.fulfilledAt || now,
    status:
      requestRow.status === DOCUMENT_REQUEST_STATUSES.OPEN
        ? DOCUMENT_REQUEST_STATUSES.RECEIVED
        : requestRow.status,
    updatedAt: now
  };
  next.history = appendHistory(next, {
    type: DOCUMENT_HISTORY_TYPES.REQUEST_FULFILLED,
    at: now,
    actor: authContext.userId,
    summary: "Document linked to request",
    newValues: { documentId: documentRow.id }
  });
  return requestStore.save(next);
}

async function uploadDocument(input, authContext) {
  const store = getDocumentStore();
  const storage = getObjectStorage();
  if (!store || !storage) throw buildError("STORE_UNAVAILABLE", "Document store is unavailable.", 503);
  const organizationId = input.organizationId;
  if (!organizationId || !authContext?.userId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }
  const checked = assertUploadConstraints({
    buffer: input.buffer,
    mimeType: input.mimeType,
    filename: input.originalFilename
  });
  const documentType = String(input.documentType || DOCUMENT_TYPES.OTHER).trim().toUpperCase();
  if (!TYPE_SET.has(documentType)) {
    throw buildError("VALIDATION_ERROR", "A valid document type is required.");
  }
  const client = await loadClientOrThrow(input.clientId, organizationId);
  if (!canAccessRecord(authContext, client)) throw notFound("Client");
  const ownerUserId = input.ownerUserId || client.ownerUserId || authContext.userId;
  if (!canAccessRecord(authContext, { ownerUserId })) throw notFound("Document");
  let requestRow = null;
  if (input.requestId) {
    const authorized = await getAuthorizedRequest(input.requestId, organizationId, authContext);
    requestRow = authorized.row;
    if (String(requestRow.clientId) !== String(client.id)) {
      throw buildError("VALIDATION_ERROR", "Document request must belong to the same client.");
    }
  }
  const now = new Date().toISOString();
  const documentId = crypto.randomUUID();
  const stored = await storage.upload({
    organizationId,
    clientId: client.id,
    documentId,
    mimeType: checked.mimeType,
    filename: checked.originalFilename,
    buffer: input.buffer,
    storageKey: undefined
  });
  const storageKey = stored.storageKey;
  const row = {
    id: documentId,
    organizationId,
    clientId: client.id,
    ownerUserId,
    uploadedByUserId: authContext.userId,
    serviceCaseId:
      (await resolveOptionalServiceCase(input.serviceCaseId, organizationId, client.id)) ||
      requestRow?.serviceCaseId ||
      null,
    productionId: await resolveOptionalProduction(input.productionId, organizationId, client.id),
    requestId: requestRow?.id || null,
    documentType: requestRow?.documentType || documentType,
    originalFilename: checked.originalFilename,
    storageKey,
    mimeType: checked.mimeType,
    sizeBytes: checked.sizeBytes,
    status: DOCUMENT_STATUSES.RECEIVED,
    notes: input.notes ? String(input.notes).trim() : null,
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
    history: appendHistory({ history: [] }, {
      type: DOCUMENT_HISTORY_TYPES.DOCUMENT_UPLOADED,
      at: now,
      actor: authContext.userId,
      summary: "Document uploaded"
    })
  };
  const saved = await store.save(row);
  if (requestRow) {
    const fulfilled = await fulfillDocumentRequest(requestRow, saved, authContext, now);
    if (!saved.requestId) {
      saved.requestId = fulfilled.id;
      saved.history = appendHistory(saved, {
        type: DOCUMENT_HISTORY_TYPES.DOCUMENT_LINKED,
        at: now,
        actor: authContext.userId,
        summary: "Document linked to request"
      });
      await store.save(saved);
    }
  }
  const names = input.nameById || (await loadActorNames(organizationId));
  return presentDocument(saved, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client.name || null
  });
}

async function getDocument(id, { organizationId, authContext, nameById } = {}) {
  const { row } = await getAuthorizedDocument(id, organizationId, authContext);
  const client = await loadClientOrThrow(row.clientId, organizationId).catch(() => null);
  const names = nameById || (await loadActorNames(organizationId));
  return presentDocument(row, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null
  });
}

async function listDocuments({
  organizationId,
  authContext,
  scope,
  search,
  status,
  documentType,
  clientId,
  serviceCaseId,
  ownerUserId,
  nameById
} = {}) {
  const store = getDocumentStore();
  if (!store) {
    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      scope: DOCUMENT_SCOPES.MINE,
      teamAvailable: canViewTeamDocuments(authContext),
      items: []
    };
  }
  const ownerFilter = resolveOwnerFilter({ authContext, scope });
  const rows = await store.listForOwners({
    organizationId,
    ownerUserIds: ownerFilter.ownerUserIds,
    clientId: clientId || null,
    serviceCaseId: serviceCaseId || null
  });
  const names = nameById || (await loadActorNames(organizationId));
  const ownerCache = new Map(names);
  const findClient = getClientFinder();
  const clientCache = new Map();
  const items = [];
  for (const row of rows) {
    if (status && String(row.status) !== String(status).toUpperCase()) continue;
    if (documentType && String(row.documentType) !== String(documentType).toUpperCase()) continue;
    if (ownerUserId && String(row.ownerUserId) !== String(ownerUserId)) continue;
    if (!clientCache.has(row.clientId)) {
      const client = await findClient(row.clientId, organizationId).catch(() => null);
      clientCache.set(row.clientId, client);
    }
    const presented = await presentDocument(row, {
      nameById: names,
      ownerCache,
      clientName: clientCache.get(row.clientId)?.name || null
    });
    if (!matchesSearch(presented, search)) continue;
    items.push(presented);
  }
  items.sort((left, right) => String(right.receivedAt || "").localeCompare(String(left.receivedAt || "")));
  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: ownerFilter.scope,
    teamAvailable: canViewTeamDocuments(authContext),
    items
  };
}

async function updateDocumentStatus(id, input, authContext) {
  const { store, row } = await getAuthorizedDocument(id, input.organizationId, authContext);
  const status = String(input.status || "").trim().toUpperCase();
  if (!DOC_STATUS_SET.has(status)) {
    throw buildError("VALIDATION_ERROR", "A valid document status is required.");
  }
  const now = new Date().toISOString();
  let next = { ...row, status, updatedAt: now };
  if (Object.prototype.hasOwnProperty.call(input, "notes")) {
    next.notes = input.notes ? String(input.notes).trim() : null;
  }
  if (status !== row.status) {
    const historyType =
      status === DOCUMENT_STATUSES.REVIEWED
        ? DOCUMENT_HISTORY_TYPES.DOCUMENT_REVIEWED
        : status === DOCUMENT_STATUSES.REJECTED
          ? DOCUMENT_HISTORY_TYPES.DOCUMENT_REJECTED
          : status === DOCUMENT_STATUSES.ARCHIVED
            ? DOCUMENT_HISTORY_TYPES.DOCUMENT_ARCHIVED
            : DOCUMENT_HISTORY_TYPES.DOCUMENT_STATUS_CHANGED;
    next.history = appendHistory(next, {
      type: historyType,
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
  return presentDocument(saved, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null
  });
}

async function linkDocumentToRequest(documentId, requestId, input, authContext) {
  const { store, row } = await getAuthorizedDocument(documentId, input.organizationId, authContext);
  const authorizedRequest = await getAuthorizedRequest(requestId, input.organizationId, authContext);
  const now = new Date().toISOString();
  if (row.requestId && String(row.requestId) === String(requestId)) {
    const client = await loadClientOrThrow(row.clientId, input.organizationId).catch(() => null);
    const names = input.nameById || (await loadActorNames(input.organizationId));
    return presentDocument(row, {
      nameById: names,
      ownerCache: new Map(names),
      clientName: client?.name || null
    });
  }
  if (row.requestId && String(row.requestId) !== String(requestId)) {
    throw buildError("VALIDATION_ERROR", "Document is already linked to a request.");
  }
  await fulfillDocumentRequest(authorizedRequest.row, row, authContext, now);
  const next = {
    ...row,
    requestId,
    serviceCaseId: row.serviceCaseId || authorizedRequest.row.serviceCaseId,
    updatedAt: now,
    history: appendHistory(row, {
      type: DOCUMENT_HISTORY_TYPES.DOCUMENT_LINKED,
      at: now,
      actor: authContext.userId,
      summary: "Document linked to request"
    })
  };
  const saved = await store.save(next);
  const client = await loadClientOrThrow(saved.clientId, input.organizationId).catch(() => null);
  const names = input.nameById || (await loadActorNames(input.organizationId));
  return presentDocument(saved, {
    nameById: names,
    ownerCache: new Map(names),
    clientName: client?.name || null
  });
}

async function downloadDocument(id, { organizationId, authContext } = {}) {
  const { store, row } = await getAuthorizedDocument(id, organizationId, authContext);
  const storage = getObjectStorage();
  if (!storage) throw buildError("STORE_UNAVAILABLE", "Document store is unavailable.", 503);
  const downloaded = storage.download
    ? await storage.download(row.storageKey, organizationId)
    : await require("../infrastructure/clientDocumentStorage").downloadClientDocument(
        row.storageKey,
        organizationId
      );
  const now = new Date().toISOString();
  await store.save({
    ...row,
    updatedAt: now,
    history: appendHistory(row, {
      type: DOCUMENT_HISTORY_TYPES.DOCUMENT_DOWNLOADED,
      at: now,
      actor: authContext.userId,
      summary: "Document downloaded"
    })
  });
  return {
    buffer: downloaded.buffer,
    mimeType: row.mimeType,
    originalFilename: row.originalFilename
  };
}

async function createRequestFollowUp(id, input, authContext) {
  const { row } = await getAuthorizedRequest(id, input.organizationId, authContext);
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
  if (item.status !== DOCUMENT_REQUEST_STATUSES.OPEN) return null;
  if (
    item.dueStatus !== DOCUMENT_DUE_STATUSES.OVERDUE &&
    item.dueStatus !== DOCUMENT_DUE_STATUSES.DUE_TODAY
  ) {
    return null;
  }
  return {
    id: item.id,
    kind: "document_request",
    status:
      item.dueStatus === DOCUMENT_DUE_STATUSES.OVERDUE
        ? FOLLOW_UP_VIEW_STATUSES.OVERDUE
        : FOLLOW_UP_VIEW_STATUSES.DUE_TODAY,
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
      documentType: item.documentType,
      clientId: item.clientId
    }
  };
}

module.exports = {
  setStoresForTests,
  createMemoryDocumentStore,
  createMemoryDocumentRequestStore,
  createMemoryObjectStorage,
  canViewTeamDocuments,
  resolveOwnerFilter,
  classifyDue,
  createDocumentRequest,
  getDocumentRequest,
  listDocumentRequests,
  updateDocumentRequest,
  updateRequestStatus,
  uploadDocument,
  getDocument,
  listDocuments,
  updateDocumentStatus,
  linkDocumentToRequest,
  downloadDocument,
  createRequestFollowUp,
  toTodayItem
};
