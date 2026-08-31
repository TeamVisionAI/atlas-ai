/**
 * BR-186 — IUL / Policy Review Pipeline V2.
 * Records belong to clients. Replacement is an explicit human outcome only.
 * Does not create recruiting prospects, touch Recruit AI, or add Today rows.
 */

const crypto = require("crypto");
const {
  POLICY_REVIEW_STAGES,
  POLICY_REVIEW_OUTCOMES,
  POLICY_REVIEW_SCOPES,
  POLICY_REVIEW_HISTORY_TYPES,
  canTransitionStage,
  isExplicitOutcome,
  isReplacementStage,
  stampStage,
  parseMoney,
  parsePercent,
  calculateAnnualizedPremium,
  calculateEstimatedTakeHome,
  resolveCommissionPresentation,
  emptyDashboardMetrics,
  aggregateDashboardMetrics,
  createMemoryPolicyReviewStore
} = require("../core/policyReviewPipeline");
const { presentHistoryActorLabel } = require("../core/appointmentHistory");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { SERVICE_TYPES } = require("../core/clientService");
const { DOCUMENT_TYPES } = require("../core/clientDocuments");
const { PRODUCTION_ACTIVITY_TYPES, PRODUCTION_STATUSES } = require("../core/clientProduction");
const { FOLLOW_UP_ENTITY_TYPES } = require("../core/followUps");
const followUpApplicationService = require("./followUpApplicationService");

const STAGE_SET = new Set(Object.values(POLICY_REVIEW_STAGES));
const OUTCOME_SET = new Set(Object.values(POLICY_REVIEW_OUTCOMES));

let storeOverride = null;
let clientFindOverride = null;
let clientBatchOverride = null;
let appointmentFindOverride = null;
let documentRequestFindOverride = null;
let createServiceCaseOverride = null;
let createDocumentRequestOverride = null;
let createProductionOverride = null;

function isAutomatedTestRuntime() {
  return process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function getStore() {
  if (storeOverride) return storeOverride;
  if (isAutomatedTestRuntime()) return null;
  return require("../repositories/policyReviewPipelineRepository");
}

function getClientFinder() {
  if (clientFindOverride) return clientFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const clients = require("../repositories/agendaClientRepository");
  return (id, organizationId) => clients.findById(id, organizationId);
}

function getClientBatchFinder() {
  if (clientBatchOverride) return clientBatchOverride;
  if (isAutomatedTestRuntime()) return async () => [];
  const clients = require("../repositories/agendaClientRepository");
  return (ids, organizationId) => clients.listByIds(ids, organizationId);
}

function getAppointmentFinder() {
  if (appointmentFindOverride) return appointmentFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const appointments = require("../repositories/appointmentRepository");
  return (id, organizationId) => appointments.findById(id, organizationId);
}

function getDocumentRequestFinder() {
  if (documentRequestFindOverride) return documentRequestFindOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const documents = require("../application/clientDocumentsApplicationService");
  return (id, { organizationId, authContext }) =>
    documents.getDocumentRequest(id, { organizationId, authContext });
}

function setStoresForTests({
  pipeline = null,
  findClient = null,
  listClientsByIds = null,
  findAppointment = null,
  findDocumentRequest = null,
  createServiceCase = null,
  createDocumentRequest = null,
  createProduction = null
} = {}) {
  storeOverride = pipeline || null;
  clientFindOverride = findClient || null;
  clientBatchOverride = listClientsByIds || null;
  appointmentFindOverride = findAppointment || null;
  documentRequestFindOverride = findDocumentRequest || null;
  createServiceCaseOverride = createServiceCase || null;
  createDocumentRequestOverride = createDocumentRequest || null;
  createProductionOverride = createProduction || null;
}

function buildError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.publicCode = code;
  error.statusCode = statusCode;
  return error;
}

function notFound() {
  return buildError("NOT_FOUND", "Policy review not found.", 404);
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

function canViewTeamPipeline(authContext) {
  return followUpApplicationService.canViewTeamFollowUps(authContext);
}

function resolveOwnerFilter({ authContext, scope }) {
  const userId = authContext?.userId;
  const requested = String(scope || POLICY_REVIEW_SCOPES.MINE).toLowerCase();
  if (requested === POLICY_REVIEW_SCOPES.TEAM && canViewTeamPipeline(authContext)) {
    if (
      authContext.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
      authContext.role === ROLES.ADMINISTRATOR ||
      authContext.role === ROLES.RVP
    ) {
      return { scope: POLICY_REVIEW_SCOPES.TEAM, ownerUserIds: null };
    }
    return {
      scope: POLICY_REVIEW_SCOPES.TEAM,
      ownerUserIds: authContext.hierarchyUserIds || [userId]
    };
  }
  return { scope: POLICY_REVIEW_SCOPES.MINE, ownerUserIds: userId ? [userId] : [] };
}

function canAccessRecord(authContext, row) {
  if (!row || !authContext?.userId) return false;
  if (String(row.ownerUserId) === String(authContext.userId)) return true;
  if (!canViewTeamPipeline(authContext)) return false;
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

function applyCommission(row, defaults = {}) {
  const commissionLevelPct =
    row.commissionLevelPct != null ? row.commissionLevelPct : defaults.commissionLevelPct ?? null;
  const paidAdvanceFactorPct =
    row.paidAdvanceFactorPct != null ? row.paidAdvanceFactorPct : defaults.paidAdvanceFactorPct ?? null;
  const annualizedPremium = calculateAnnualizedPremium(row.monthlyPremium, row.annualizedPremium);
  const estimatedTakeHome = calculateEstimatedTakeHome({
    annualizedPremium,
    commissionLevelPct,
    paidAdvanceFactorPct
  });
  const presented = resolveCommissionPresentation({
    estimatedTakeHome,
    actualPaidCommission: row.actualPaidCommission
  });
  return {
    ...row,
    annualizedPremium,
    commissionLevelPct,
    paidAdvanceFactorPct,
    estimatedTakeHome: presented.estimatedTakeHome,
    commissionLabel: presented.commissionLabel,
    commissionAmount: presented.commissionAmount
  };
}

function presentRecord(row, { nameById, ownerName = null, clientName = null, defaults } = {}) {
  const withCommission = applyCommission(row, defaults);
  return {
    id: withCommission.id,
    organizationId: withCommission.organizationId,
    clientId: withCommission.clientId,
    clientName: clientName || null,
    ownerUserId: withCommission.ownerUserId,
    ownerName,
    contactId: withCommission.contactId || null,
    serviceCaseId: withCommission.serviceCaseId || null,
    appointmentId: withCommission.appointmentId || null,
    documentRequestId: withCommission.documentRequestId || null,
    productionId: withCommission.productionId || null,
    linkedProspectId: withCommission.linkedProspectId || null,
    stage: withCommission.stage,
    language: withCommission.language || null,
    state: withCommission.state || null,
    source: withCommission.source || null,
    campaign: withCommission.campaign || null,
    adId: withCommission.adId || null,
    adsetId: withCommission.adsetId || null,
    creativeId: withCommission.creativeId || null,
    campaignIntakeCode: withCommission.campaignIntakeCode || null,
    stageTimestamps: withCommission.stageTimestamps || {},
    carrierProductLabel: withCommission.carrierProductLabel || null,
    monthlyPremium: withCommission.monthlyPremium,
    annualizedPremium: withCommission.annualizedPremium,
    submissionDate: withCommission.submissionDate || null,
    placedDate: withCommission.placedDate || null,
    commissionLevelPct: withCommission.commissionLevelPct,
    paidAdvanceFactorPct: withCommission.paidAdvanceFactorPct,
    estimatedTakeHome: withCommission.estimatedTakeHome,
    actualPaidCommission: withCommission.actualPaidCommission,
    commissionLabel: withCommission.commissionLabel,
    commissionAmount: withCommission.commissionAmount,
    createdByUserId: withCommission.createdByUserId || null,
    createdAt: withCommission.createdAt,
    updatedAt: withCommission.updatedAt,
    href: `/app/clients/${withCommission.clientId}`,
    history: presentHistory(withCommission.history, nameById || new Map())
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
  if (!store) throw buildError("STORE_UNAVAILABLE", "Policy review store is unavailable.", 503);
  const row = await store.findById(id, organizationId);
  if (!row || !canAccessRecord(authContext, row)) throw notFound();
  return { store, row };
}

function pickDefaults(defaults, ownerUserId) {
  const orgDefault = defaults.find((item) => !item.userId) || null;
  const userDefault = defaults.find((item) => String(item.userId) === String(ownerUserId)) || null;
  return userDefault || orgDefault || {};
}

async function loadDefaultsMap(store, organizationId) {
  if (!store?.listCommissionDefaults) return [];
  return store.listCommissionDefaults(organizationId);
}

async function loadClientNameMap(rows, organizationId) {
  const ids = [...new Set(rows.map((row) => row.clientId).filter(Boolean))];
  const listClients = getClientBatchFinder();
  const clients = await listClients(ids, organizationId);
  return new Map((clients || []).map((client) => [String(client.id), client]));
}

function emptyList(organizationId, authContext, scope, search) {
  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: scope || POLICY_REVIEW_SCOPES.MINE,
    teamAvailable: canViewTeamPipeline(authContext),
    search: search || "",
    totalCount: 0,
    filteredCount: 0,
    metrics: emptyDashboardMetrics(),
    items: []
  };
}

function matchesSearch(item, query) {
  if (!query) return true;
  const needle = String(query).trim().toLowerCase();
  if (!needle) return true;
  return [item.clientName, item.stage, item.source, item.campaign, item.state, item.language]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

async function maybeCreateServiceCase(input, authContext, client) {
  const createServiceCase =
    createServiceCaseOverride ||
    (!isAutomatedTestRuntime()
      ? (payload, actor) =>
          require("./clientServiceApplicationService").createServiceCase(payload, actor)
      : null);
  if (!createServiceCase) return null;
  try {
    const created = await createServiceCase(
      {
        organizationId: input.organizationId,
        clientId: client.id,
        ownerUserId: input.ownerUserId || client.ownerUserId || authContext.userId,
        serviceType: SERVICE_TYPES.POLICY_REVIEW,
        title: input.title || "Policy review"
      },
      authContext
    );
    return created?.id || null;
  } catch {
    return null;
  }
}

function applyAttribution(row, input) {
  const next = { ...row };
  const fields = [
    ["language", "language"],
    ["state", "state"],
    ["source", "source"],
    ["campaign", "campaign"],
    ["adId", "adId"],
    ["adsetId", "adsetId"],
    ["creativeId", "creativeId"],
    ["campaignIntakeCode", "campaignIntakeCode"],
    ["contactId", "contactId"],
    ["linkedProspectId", "linkedProspectId"]
  ];
  for (const [inputKey, rowKey] of fields) {
    if (input[inputKey] !== undefined) {
      next[rowKey] = input[inputKey] ? String(input[inputKey]).trim() : null;
    }
  }
  return next;
}

function applyProductionFields(row, input) {
  const next = { ...row };
  if (input.carrierProductLabel !== undefined) {
    next.carrierProductLabel = input.carrierProductLabel
      ? String(input.carrierProductLabel).trim().slice(0, 180)
      : null;
  }
  if (input.monthlyPremium !== undefined) next.monthlyPremium = parseMoney(input.monthlyPremium, "monthly premium");
  if (input.annualizedPremium !== undefined) {
    next.annualizedPremium = parseMoney(input.annualizedPremium, "annualized premium");
  }
  if (input.submissionDate !== undefined) next.submissionDate = input.submissionDate || null;
  if (input.placedDate !== undefined) next.placedDate = input.placedDate || null;
  if (input.commissionLevelPct !== undefined) {
    next.commissionLevelPct = parsePercent(input.commissionLevelPct, "commission level");
  }
  if (input.paidAdvanceFactorPct !== undefined) {
    next.paidAdvanceFactorPct = parsePercent(input.paidAdvanceFactorPct, "paid/advance factor");
  }
  if (input.actualPaidCommission !== undefined) {
    next.actualPaidCommission = parseMoney(input.actualPaidCommission, "actual paid commission");
  }
  const computed = applyCommission(next);
  next.annualizedPremium = computed.annualizedPremium;
  next.estimatedTakeHome = computed.estimatedTakeHome;
  return next;
}

async function createPolicyReview(input, authContext) {
  const store = getStore();
  if (!store) throw buildError("STORE_UNAVAILABLE", "Policy review store is unavailable.", 503);
  const organizationId = input.organizationId;
  if (!organizationId || !authContext?.userId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }
  const client = await loadClientOrThrow(input.clientId, organizationId);
  if (!canAccessRecord(authContext, client)) throw notFound();
  const ownerUserId = input.ownerUserId || client.ownerUserId || authContext.userId;
  if (!canAccessRecord(authContext, { ownerUserId })) throw notFound();
  const now = new Date().toISOString();
  const stage = String(input.stage || POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD).trim().toUpperCase();
  if (!STAGE_SET.has(stage)) throw buildError("VALIDATION_ERROR", "A valid stage is required.");
  if (isReplacementStage(stage)) {
    throw buildError("VALIDATION_ERROR", "Replacement opportunity must be recorded explicitly after review.");
  }
  const defaults = pickDefaults(await loadDefaultsMap(store, organizationId), ownerUserId);
  let row = applyProductionFields(
    applyAttribution(
      {
        id: crypto.randomUUID(),
        organizationId,
        clientId: client.id,
        ownerUserId,
        contactId: input.contactId || client.agendaContactId || null,
        serviceCaseId: input.serviceCaseId || null,
        appointmentId: null,
        documentRequestId: null,
        productionId: input.productionId || null,
        linkedProspectId: input.linkedProspectId || null,
        stage,
        language: input.language || client.preferredLanguage || null,
        state: input.state || null,
        source: input.source || client.source || null,
        campaign: input.campaign || null,
        adId: input.adId || null,
        adsetId: input.adsetId || null,
        creativeId: input.creativeId || null,
        campaignIntakeCode: input.campaignIntakeCode || null,
        stageTimestamps: stampStage({}, stage, now),
        carrierProductLabel: null,
        monthlyPremium: null,
        annualizedPremium: null,
        submissionDate: null,
        placedDate: null,
        commissionLevelPct: defaults.commissionLevelPct ?? null,
        paidAdvanceFactorPct: defaults.paidAdvanceFactorPct ?? null,
        estimatedTakeHome: null,
        actualPaidCommission: null,
        createdByUserId: authContext.userId,
        createdAt: now,
        updatedAt: now,
        history: []
      },
      input
    ),
    input
  );
  if (!row.serviceCaseId) {
    row.serviceCaseId = await maybeCreateServiceCase({ ...input, ownerUserId }, authContext, client);
  }
  row.history = appendHistory(row, {
    type: POLICY_REVIEW_HISTORY_TYPES.CREATED,
    at: now,
    actor: authContext.userId,
    summary: "Policy review created",
    newValues: { stage, source: row.source, campaign: row.campaign }
  });
  const saved = await store.save(row);
  const names = input.nameById || (await loadActorNames(organizationId));
  return presentRecord(saved, {
    nameById: names,
    ownerName: await resolveOwnerName(saved.ownerUserId, new Map(names)),
    clientName: client.name,
    defaults
  });
}

async function getPolicyReview(id, { organizationId, authContext, nameById } = {}) {
  const { store, row } = await getAuthorizedRecord(id, organizationId, authContext);
  const client = await loadClientOrThrow(row.clientId, organizationId).catch(() => null);
  const names = nameById || (await loadActorNames(organizationId));
  const defaults = pickDefaults(await loadDefaultsMap(store, organizationId), row.ownerUserId);
  return presentRecord(row, {
    nameById: names,
    ownerName: await resolveOwnerName(row.ownerUserId, new Map(names)),
    clientName: client?.name || null,
    defaults
  });
}

async function listPolicyReviews({
  organizationId,
  authContext,
  scope,
  search,
  stage,
  clientId,
  ownerUserId,
  nameById
} = {}) {
  const store = getStore();
  if (!store) return emptyList(organizationId, authContext, scope, search);
  const ownerFilter = resolveOwnerFilter({ authContext, scope });
  const rows = await store.listForOwners({
    organizationId,
    ownerUserIds: ownerFilter.ownerUserIds,
    clientId: clientId || null
  });
  const names = nameById || (await loadActorNames(organizationId));
  const ownerCache = new Map(names);
  const clients = await loadClientNameMap(rows, organizationId);
  const defaultsList = await loadDefaultsMap(store, organizationId);
  const items = [];
  for (const row of rows) {
    if (stage && String(row.stage) !== String(stage).toUpperCase()) continue;
    if (ownerUserId && String(row.ownerUserId) !== String(ownerUserId)) continue;
    const defaults = pickDefaults(defaultsList, row.ownerUserId);
    const presented = presentRecord(row, {
      nameById: names,
      ownerName: await resolveOwnerName(row.ownerUserId, ownerCache),
      clientName: clients.get(String(row.clientId))?.name || null,
      defaults
    });
    if (!matchesSearch(presented, search)) continue;
    items.push(presented);
  }
  items.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: ownerFilter.scope,
    teamAvailable: canViewTeamPipeline(authContext),
    search: search || "",
    totalCount: items.length,
    filteredCount: items.length,
    metrics: aggregateDashboardMetrics(items),
    items
  };
}

async function persistTransition(store, row, nextStage, authContext, extras = {}, historyType, summary) {
  if (nextStage === row.stage) {
    const names = await loadActorNames(row.organizationId);
    const client = await loadClientOrThrow(row.clientId, row.organizationId).catch(() => null);
    return presentRecord({ ...row, ...extras }, {
      nameById: names,
      ownerName: await resolveOwnerName(row.ownerUserId, new Map(names)),
      clientName: client?.name || null,
      defaults: pickDefaults(await loadDefaultsMap(store, row.organizationId), row.ownerUserId)
    });
  }
  if (!canTransitionStage(row.stage, nextStage)) {
    throw buildError("INVALID_STAGE_TRANSITION", `Cannot move from ${row.stage} to ${nextStage}.`);
  }
  if (isReplacementStage(nextStage) && row.stage !== POLICY_REVIEW_STAGES.REVIEW_COMPLETED) {
    throw buildError(
      "REPLACEMENT_REQUIRES_REVIEW",
      "Replacement opportunity must be recorded explicitly after review completed."
    );
  }
  const now = extras.updatedAt || new Date().toISOString();
  const next = applyProductionFields(
    {
      ...row,
      ...extras,
      stage: nextStage,
      stageTimestamps: stampStage(row.stageTimestamps, nextStage, now),
      updatedAt: now,
      history: appendHistory(row, {
        type: historyType || POLICY_REVIEW_HISTORY_TYPES.STAGE_CHANGED,
        at: now,
        actor: authContext.userId,
        summary: summary || `Stage set to ${nextStage}`,
        oldValues: { stage: row.stage },
        newValues: { stage: nextStage }
      })
    },
    extras
  );
  const saved = await store.save(next);
  const names = await loadActorNames(row.organizationId);
  const client = await loadClientOrThrow(saved.clientId, saved.organizationId).catch(() => null);
  return presentRecord(saved, {
    nameById: names,
    ownerName: await resolveOwnerName(saved.ownerUserId, new Map(names)),
    clientName: client?.name || null,
    defaults: pickDefaults(await loadDefaultsMap(store, saved.organizationId), saved.ownerUserId)
  });
}

async function transitionStage(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const stage = String(input.stage || "").trim().toUpperCase();
  if (!STAGE_SET.has(stage)) throw buildError("VALIDATION_ERROR", "A valid stage is required.");
  if (isReplacementStage(stage) && !isExplicitOutcome(stage)) {
    throw buildError("VALIDATION_ERROR", "Replacement opportunity must be recorded as an explicit outcome.");
  }
  if (isReplacementStage(stage) && row.stage !== POLICY_REVIEW_STAGES.REVIEW_COMPLETED) {
    throw buildError(
      "REPLACEMENT_REQUIRES_REVIEW",
      "Replacement opportunity must be recorded explicitly after review completed."
    );
  }
  return persistTransition(store, row, stage, authContext, input);
}

async function completeReview(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  return persistTransition(
    store,
    row,
    POLICY_REVIEW_STAGES.REVIEW_COMPLETED,
    authContext,
    input,
    POLICY_REVIEW_HISTORY_TYPES.REVIEW_COMPLETED,
    "Review completed"
  );
}

async function recordOutcome(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const outcome = String(input.outcome || input.stage || "").trim().toUpperCase();
  if (!OUTCOME_SET.has(outcome)) {
    throw buildError("VALIDATION_ERROR", "A valid review outcome is required.");
  }
  if (row.stage !== POLICY_REVIEW_STAGES.REVIEW_COMPLETED) {
    throw buildError("VALIDATION_ERROR", "Record review completed before recording an outcome.");
  }
  return persistTransition(
    store,
    row,
    outcome,
    authContext,
    input,
    POLICY_REVIEW_HISTORY_TYPES.OUTCOME_RECORDED,
    `Outcome recorded: ${outcome}`
  );
}

async function linkAppointment(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const appointmentId = String(input.appointmentId || "").trim();
  if (!appointmentId) throw buildError("VALIDATION_ERROR", "An appointment is required.");
  const appointment = await getAppointmentFinder()(appointmentId, input.organizationId);
  if (!appointment || String(appointment.organizationId) !== String(input.organizationId)) {
    throw buildError("NOT_FOUND", "Appointment not found.", 404);
  }
  return persistTransition(
    store,
    row,
    POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED,
    authContext,
    { ...input, appointmentId },
    POLICY_REVIEW_HISTORY_TYPES.APPOINTMENT_LINKED,
    "Review appointment linked"
  );
}

async function requestDocuments(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  let documentRequestId = input.documentRequestId || row.documentRequestId;
  const createDocumentRequest =
    createDocumentRequestOverride ||
    (!isAutomatedTestRuntime()
      ? (payload, actor) =>
          require("./clientDocumentsApplicationService").createDocumentRequest(payload, actor)
      : null);
  if (!documentRequestId && createDocumentRequest) {
    const created = await createDocumentRequest(
      {
        organizationId: input.organizationId,
        clientId: row.clientId,
        ownerUserId: row.ownerUserId,
        serviceCaseId: row.serviceCaseId,
        documentType: input.documentType || DOCUMENT_TYPES.POLICY_DOCUMENT,
        title: input.title || "Policy review documents",
        instructions: input.instructions || null,
        dueDate: input.dueDate || null
      },
      authContext
    );
    documentRequestId = created?.id || null;
  }
  if (!documentRequestId) throw buildError("VALIDATION_ERROR", "A document request is required.");
  return persistTransition(
    store,
    row,
    POLICY_REVIEW_STAGES.DOCUMENTS_REQUESTED,
    authContext,
    { ...input, documentRequestId },
    POLICY_REVIEW_HISTORY_TYPES.DOCUMENTS_REQUESTED,
    "Documents requested"
  );
}

async function markDocumentsReceived(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  if (row.documentRequestId && getDocumentRequestFinder()) {
    const request = await getDocumentRequestFinder()(row.documentRequestId, {
      organizationId: input.organizationId,
      authContext
    }).catch(() => null);
    if (request && request.organizationId && String(request.organizationId) !== String(input.organizationId)) {
      throw notFound();
    }
  }
  return persistTransition(
    store,
    row,
    POLICY_REVIEW_STAGES.DOCUMENTS_RECEIVED,
    authContext,
    input,
    POLICY_REVIEW_HISTORY_TYPES.DOCUMENTS_RECEIVED,
    "Documents received"
  );
}

async function submitApplication(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const now = new Date().toISOString();
  const nextFields = applyProductionFields(
    {
      ...row,
      submissionDate: input.submissionDate || now.slice(0, 10)
    },
    input
  );
  let productionId = row.productionId;
  const createProduction =
    createProductionOverride ||
    (!isAutomatedTestRuntime()
      ? (payload, actor) => require("./clientProductionApplicationService").createProduction(payload, actor)
      : null);
  if (!productionId && createProduction) {
    const created = await createProduction(
      {
        organizationId: input.organizationId,
        clientId: row.clientId,
        ownerUserId: row.ownerUserId,
        activityType: PRODUCTION_ACTIVITY_TYPES.POLICY_REVIEW,
        status: PRODUCTION_STATUSES.SUBMITTED,
        carrier: nextFields.carrierProductLabel,
        amount: nextFields.annualizedPremium,
        notes: input.notes || null
      },
      authContext
    );
    productionId = created?.id || null;
  }
  return persistTransition(
    store,
    row,
    POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED,
    authContext,
    { ...nextFields, productionId, submissionDate: nextFields.submissionDate },
    POLICY_REVIEW_HISTORY_TYPES.APPLICATION_SUBMITTED,
    "Application submitted"
  );
}

async function markPlaced(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const now = new Date().toISOString();
  return persistTransition(
    store,
    row,
    POLICY_REVIEW_STAGES.PLACED,
    authContext,
    applyProductionFields(
      { ...row, placedDate: input.placedDate || now.slice(0, 10) },
      input
    ),
    POLICY_REVIEW_HISTORY_TYPES.PLACED,
    "Policy placed"
  );
}

async function updatePolicyReview(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const now = new Date().toISOString();
  let next = applyProductionFields(applyAttribution({ ...row, updatedAt: now }, input), input);
  if (input.stage && input.stage !== row.stage) {
    return persistTransition(store, row, String(input.stage).toUpperCase(), authContext, next);
  }
  next.history = appendHistory(row, {
    type: POLICY_REVIEW_HISTORY_TYPES.PRODUCTION_UPDATED,
    at: now,
    actor: authContext.userId,
    summary: "Policy review updated"
  });
  const saved = await store.save(next);
  const names = await loadActorNames(row.organizationId);
  const client = await loadClientOrThrow(saved.clientId, saved.organizationId).catch(() => null);
  return presentRecord(saved, {
    nameById: names,
    ownerName: await resolveOwnerName(saved.ownerUserId, new Map(names)),
    clientName: client?.name || null,
    defaults: pickDefaults(await loadDefaultsMap(store, saved.organizationId), saved.ownerUserId)
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
      title: input.title || "Policy review follow-up",
      notes: input.notes || null,
      ownerUserId: authContext.userId
    },
    authContext
  );
}

async function getCommissionDefaults({ organizationId, authContext, userId } = {}) {
  const store = getStore();
  if (!store) return { organizationId, org: null, user: null };
  if (!canViewTeamPipeline(authContext) && userId && String(userId) !== String(authContext.userId)) {
    throw notFound();
  }
  const defaults = await loadDefaultsMap(store, organizationId);
  return {
    organizationId,
    org: defaults.find((item) => !item.userId) || null,
    user: defaults.find((item) => String(item.userId) === String(userId || authContext.userId)) || null
  };
}

async function saveCommissionDefaults(input, authContext) {
  const store = getStore();
  if (!store) throw buildError("STORE_UNAVAILABLE", "Policy review store is unavailable.", 503);
  if (!input.organizationId || !authContext?.userId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }
  const userId = input.scope === "org" ? null : input.userId || authContext.userId;
  if (input.scope === "org" && !canViewTeamPipeline(authContext)) {
    throw buildError("FORBIDDEN", "Organization commission defaults require leadership access.", 403);
  }
  const saved = await store.saveCommissionDefault({
    organizationId: input.organizationId,
    userId,
    commissionLevelPct: parsePercent(input.commissionLevelPct, "commission level"),
    paidAdvanceFactorPct: parsePercent(input.paidAdvanceFactorPct, "paid/advance factor"),
    updatedAt: new Date().toISOString()
  });
  return saved;
}

module.exports = {
  setStoresForTests,
  createPolicyReview,
  getPolicyReview,
  listPolicyReviews,
  updatePolicyReview,
  transitionStage,
  completeReview,
  recordOutcome,
  linkAppointment,
  requestDocuments,
  markDocumentsReceived,
  submitApplication,
  markPlaced,
  createClientFollowUp,
  getCommissionDefaults,
  saveCommissionDefaults,
  POLICY_REVIEW_STAGES,
  POLICY_REVIEW_OUTCOMES,
  POLICY_REVIEW_SCOPES,
  createMemoryPolicyReviewStore
};
