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
  createMemoryPolicyReviewStore,
  applyAcquisitionToRecord,
  presentAcquisition,
  emptyAcquisition,
  emptyAcquisitionMetrics,
  aggregateAcquisitionMetrics,
  ACQUISITION_GROUP_BY,
  acquisitionFromIntake,
  hasValidAcquisition
} = require("../core/policyReviewPipeline");
const {
  resolveDashboardDateRange,
  itemInDateRange,
  buildFunnel,
  classifyNeedsAction,
  buildNeedsActionRows,
  buildDashboardKpis,
  emptyPolicyReviewDashboard
} = require("../core/policyReviewDashboard");
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
let clientByPhoneOverride = null;
let createClientOverride = null;
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

function getClientByPhoneFinder() {
  if (clientByPhoneOverride) return clientByPhoneOverride;
  if (isAutomatedTestRuntime()) return async () => null;
  const clients = require("../repositories/agendaClientRepository");
  return (phone, organizationId) => clients.findByPhone(phone, organizationId);
}

function getClientCreator() {
  if (createClientOverride) return createClientOverride;
  if (isAutomatedTestRuntime()) return null;
  const clients = require("../repositories/agendaClientRepository");
  return (record) => clients.save(record);
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
  findClientByPhone = null,
  createClient = null,
  findAppointment = null,
  findDocumentRequest = null,
  createServiceCase = null,
  createDocumentRequest = null,
  createProduction = null
} = {}) {
  storeOverride = pipeline || null;
  clientFindOverride = findClient || null;
  clientBatchOverride = listClientsByIds || null;
  clientByPhoneOverride = findClientByPhone || null;
  createClientOverride = createClient || null;
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
  const acquisition = presentAcquisition(withCommission.acquisition || emptyAcquisition());
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
    sourcePlatform: withCommission.sourcePlatform || acquisition.firstTouch.platform || null,
    sourceLabel: acquisition.sourceLabel,
    campaign: withCommission.campaign || acquisition.campaignLabel || null,
    campaignId: withCommission.campaignId || null,
    campaignName: withCommission.campaignName || acquisition.campaignLabel || null,
    adId: withCommission.adId || null,
    adName: withCommission.adName || null,
    adLabel: acquisition.adLabel,
    adsetId: withCommission.adsetId || null,
    adSetName: withCommission.adSetName || null,
    creativeId: withCommission.creativeId || null,
    creativeName: withCommission.creativeName || null,
    creativeLabel: acquisition.creativeLabel,
    campaignIntakeCode: withCommission.campaignIntakeCode || null,
    landingFormSource: withCommission.landingFormSource || null,
    utmSource: withCommission.utmSource || null,
    utmMedium: withCommission.utmMedium || null,
    utmCampaign: withCommission.utmCampaign || null,
    utmContent: withCommission.utmContent || null,
    utmTerm: withCommission.utmTerm || null,
    firstTouchAt: withCommission.firstTouchAt || acquisition.firstTouch.at || null,
    latestTouchAt: withCommission.latestTouchAt || acquisition.latestTouch.at || null,
    acquisition,
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

function emptyList(organizationId, authContext, scope, search, dateRange = null) {
  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: scope || POLICY_REVIEW_SCOPES.MINE,
    teamAvailable: canViewTeamPipeline(authContext),
    search: search || "",
    range: dateRange,
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
  return [
    item.clientName,
    item.stage,
    item.source,
    item.sourceLabel,
    item.sourcePlatform,
    item.campaign,
    item.campaignName,
    item.campaignIntakeCode,
    item.adLabel,
    item.creativeLabel,
    item.state,
    item.language
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function matchesAcquisitionFilters(item, filters = {}) {
  const first = item.acquisition?.firstTouch || {};
  if (filters.platform) {
    const platform = String(filters.platform).trim().toLowerCase();
    const actual = String(item.sourcePlatform || first.platform || "").toLowerCase();
    if (actual !== platform) return false;
  }
  if (filters.campaign) {
    const campaign = String(filters.campaign).trim().toLowerCase();
    const haystack = [item.campaign, item.campaignName, item.campaignId, first.campaignName, first.campaignId]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    if (!haystack.includes(campaign) && !haystack.some((value) => value.includes(campaign))) return false;
  }
  if (filters.source) {
    const source = String(filters.source).trim().toLowerCase();
    const haystack = [item.source, item.sourceLabel, item.sourcePlatform, first.source]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    if (!haystack.includes(source) && !haystack.some((value) => value.includes(source))) return false;
  }
  if (filters.intakeCode) {
    const code = String(filters.intakeCode).trim().toUpperCase();
    if (String(item.campaignIntakeCode || first.intakeCode || "").toUpperCase() !== code) return false;
  }
  if (filters.language && String(item.language || "").toLowerCase() !== String(filters.language).toLowerCase()) {
    return false;
  }
  if (filters.state && String(item.state || "").toUpperCase() !== String(filters.state).toUpperCase()) {
    return false;
  }
  return true;
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
  if (input.language !== undefined) next.language = input.language ? String(input.language).trim() : null;
  if (input.state !== undefined) next.state = input.state ? String(input.state).trim() : null;
  if (input.contactId !== undefined) next.contactId = input.contactId || null;
  if (input.linkedProspectId !== undefined) next.linkedProspectId = input.linkedProspectId || null;
  const stamped = applyAcquisitionToRecord(next, input);
  if (!hasValidAcquisition(stamped.acquisition?.firstTouch) && !hasValidAcquisition(stamped.acquisition?.latestTouch)) {
    const fields = [
      ["source", "source"],
      ["campaign", "campaign"],
      ["adId", "adId"],
      ["adsetId", "adsetId"],
      ["creativeId", "creativeId"],
      ["campaignIntakeCode", "campaignIntakeCode"]
    ];
    for (const [inputKey, rowKey] of fields) {
      if (input[inputKey] !== undefined) {
        stamped[rowKey] = input[inputKey] ? String(input[inputKey]).trim() : null;
      }
    }
  }
  return stamped;
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
        sourcePlatform: input.sourcePlatform || null,
        campaign: input.campaign || null,
        campaignId: input.campaignId || null,
        campaignName: input.campaignName || input.campaign || null,
        adId: input.adId || null,
        adName: input.adName || null,
        adsetId: input.adsetId || null,
        adSetName: input.adSetName || null,
        creativeId: input.creativeId || null,
        creativeName: input.creativeName || null,
        campaignIntakeCode: input.campaignIntakeCode || null,
        landingFormSource: input.landingFormSource || null,
        utmSource: input.utmSource || null,
        utmMedium: input.utmMedium || null,
        utmCampaign: input.utmCampaign || null,
        utmContent: input.utmContent || null,
        utmTerm: input.utmTerm || null,
        firstTouchAt: null,
        latestTouchAt: null,
        acquisition: input.acquisition || emptyAcquisition(),
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

async function collectScopedPipelineItems({
  organizationId,
  authContext,
  scope,
  search,
  stage,
  clientId,
  ownerUserId,
  platform,
  campaign,
  source,
  intakeCode,
  language,
  state,
  range,
  from,
  to,
  nameById,
  includeClientNames = true,
  includeOwnerNames = true,
  timezoneDeps
} = {}) {
  const store = getStore();
  const dateRange = resolveDashboardDateRange({
    organizationId,
    range,
    from,
    to,
    timezoneDeps
  });
  if (!store) {
    return {
      store: null,
      ownerFilter: resolveOwnerFilter({ authContext, scope }),
      items: [],
      dateRange,
      generatedAt: new Date().toISOString()
    };
  }
  const ownerFilter = resolveOwnerFilter({ authContext, scope });
  const [rows, defaultsList] = await Promise.all([
    store.listForOwners({
      organizationId,
      ownerUserIds: ownerFilter.ownerUserIds,
      clientId: clientId || null
    }),
    loadDefaultsMap(store, organizationId)
  ]);
  const names =
    includeOwnerNames || nameById ? nameById || (await loadActorNames(organizationId)) : new Map();
  const ownerCache = new Map(names);
  const clients = includeClientNames ? await loadClientNameMap(rows, organizationId) : new Map();
  const items = [];
  for (const row of rows) {
    if (stage && String(row.stage) !== String(stage).toUpperCase()) continue;
    if (ownerUserId && String(row.ownerUserId) !== String(ownerUserId)) continue;
    if (!itemInDateRange(row, dateRange)) continue;
    const defaults = pickDefaults(defaultsList, row.ownerUserId);
    const presented = presentRecord(row, {
      nameById: names,
      ownerName: includeOwnerNames ? await resolveOwnerName(row.ownerUserId, ownerCache) : null,
      clientName: clients.get(String(row.clientId))?.name || null,
      defaults
    });
    if (!matchesSearch(presented, search)) continue;
    if (
      !matchesAcquisitionFilters(presented, {
        platform,
        campaign,
        source,
        intakeCode,
        language,
        state
      })
    ) {
      continue;
    }
    items.push(presented);
  }
  items.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  return {
    store,
    ownerFilter,
    items,
    dateRange,
    generatedAt: new Date().toISOString()
  };
}

async function listPolicyReviews({
  organizationId,
  authContext,
  scope,
  search,
  stage,
  clientId,
  ownerUserId,
  platform,
  campaign,
  source,
  intakeCode,
  language,
  state,
  range,
  from,
  to,
  nameById,
  timezoneDeps
} = {}) {
  const collected = await collectScopedPipelineItems({
    organizationId,
    authContext,
    scope,
    search,
    stage,
    clientId,
    ownerUserId,
    platform,
    campaign,
    source,
    intakeCode,
    language,
    state,
    range,
    from,
    to,
    nameById,
    includeClientNames: true,
    includeOwnerNames: true,
    timezoneDeps
  });
  if (!collected.store) return emptyList(organizationId, authContext, scope, search, collected.dateRange);
  return {
    generatedAt: collected.generatedAt,
    organizationId,
    scope: collected.ownerFilter.scope,
    teamAvailable: canViewTeamPipeline(authContext),
    search: search || "",
    range: collected.dateRange,
    totalCount: collected.items.length,
    filteredCount: collected.items.length,
    metrics: aggregateDashboardMetrics(collected.items),
    items: collected.items
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

async function applyAcquisitionToReview(id, input, authContext) {
  const { store, row } = await getAuthorizedRecord(id, input.organizationId, authContext);
  const now = input.at || new Date().toISOString();
  const next = applyAttribution(
    { ...row, updatedAt: now },
    { ...input, acquisitionEvent: input.acquisitionEvent || input }
  );
  if (JSON.stringify(next.acquisition) === JSON.stringify(row.acquisition || {})) {
    return presentRecord(row, {
      nameById: await loadActorNames(row.organizationId),
      ownerName: await resolveOwnerName(row.ownerUserId, new Map()),
      defaults: pickDefaults(await loadDefaultsMap(store, row.organizationId), row.ownerUserId)
    });
  }
  next.history = appendHistory(row, {
    type: POLICY_REVIEW_HISTORY_TYPES.ATTRIBUTION_SET,
    at: now,
    actor: authContext.userId,
    summary: "Acquisition touch recorded",
    newValues: {
      firstTouch: next.acquisition?.firstTouch?.campaignName || next.campaign,
      latestTouch: next.acquisition?.latestTouch?.campaignName || next.acquisition?.latestTouch?.intakeCode
    }
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

async function getAcquisitionMetrics({
  organizationId,
  authContext,
  scope,
  groupBy,
  platform,
  campaign,
  source,
  intakeCode,
  language,
  state,
  ownerUserId,
  range,
  from,
  to,
  nameById,
  timezoneDeps
} = {}) {
  const resolvedGroup = ACQUISITION_GROUP_BY.includes(groupBy) ? groupBy : "campaign";
  const collected = await collectScopedPipelineItems({
    organizationId,
    authContext,
    scope,
    platform,
    campaign,
    source,
    intakeCode,
    language,
    state,
    ownerUserId,
    range,
    from,
    to,
    nameById,
    includeClientNames: false,
    includeOwnerNames: resolvedGroup === "owner",
    timezoneDeps
  });
  const aggregated = aggregateAcquisitionMetrics(collected.items, { groupBy: resolvedGroup });
  return {
    generatedAt: collected.generatedAt,
    organizationId,
    scope: collected.ownerFilter.scope,
    teamAvailable: canViewTeamPipeline(authContext),
    groupBy: aggregated.groupBy,
    range: collected.dateRange,
    filters: {
      platform: platform || null,
      campaign: campaign || null,
      source: source || null,
      intakeCode: intakeCode || null,
      language: language || null,
      state: state || null
    },
    totals: aggregated.totals,
    groups: aggregated.groups
  };
}

async function getPolicyReviewDashboard({
  organizationId,
  authContext,
  scope,
  groupBy,
  platform,
  campaign,
  source,
  intakeCode,
  language,
  state,
  ownerUserId,
  range,
  from,
  to,
  nameById,
  timezoneDeps
} = {}) {
  const resolvedGroup = ACQUISITION_GROUP_BY.includes(groupBy) ? groupBy : "campaign";
  const collected = await collectScopedPipelineItems({
    organizationId,
    authContext,
    scope,
    platform,
    campaign,
    source,
    intakeCode,
    language,
    state,
    ownerUserId,
    range: range || (from || to ? "custom" : "30d"),
    from,
    to,
    nameById,
    includeClientNames: false,
    includeOwnerNames: resolvedGroup === "owner",
    timezoneDeps
  });
  if (!collected.store) {
    return {
      ...emptyPolicyReviewDashboard(),
      generatedAt: collected.generatedAt,
      organizationId,
      scope: collected.ownerFilter.scope,
      teamAvailable: canViewTeamPipeline(authContext),
      range: collected.dateRange,
      groupBy: resolvedGroup
    };
  }
  const aggregated = aggregateAcquisitionMetrics(collected.items, { groupBy: resolvedGroup });
  return {
    generatedAt: collected.generatedAt,
    organizationId,
    scope: collected.ownerFilter.scope,
    teamAvailable: canViewTeamPipeline(authContext),
    range: collected.dateRange,
    groupBy: aggregated.groupBy,
    filters: {
      platform: platform || null,
      campaign: campaign || null,
      source: source || null,
      intakeCode: intakeCode || null,
      language: language || null,
      state: state || null
    },
    kpis: buildDashboardKpis(aggregated.totals),
    funnel: buildFunnel(aggregated.totals),
    attribution: {
      groupBy: aggregated.groupBy,
      totals: aggregated.totals,
      groups: aggregated.groups
    },
    needsAction: buildNeedsActionRows(classifyNeedsAction(collected.items))
  };
}

async function ensurePolicyReviewFromIulIntake(input = {}) {
  const organizationId = input.organizationId;
  const ownerUserId = input.ownerUserId || input.match?.ownerUserId;
  if (!organizationId) {
    return { ok: false, reason: "NO_ORGANIZATION", recruitingEligible: false };
  }
  const event =
    input.acquisitionEvent ||
    acquisitionFromIntake({
      match: input.match,
      ctwaReferral: input.ctwaReferral || null,
      utm: input.utm || null,
      landingFormSource: input.landingFormSource || null,
      at: input.at
    });
  const store = getStore();
  if (!store) {
    return { ok: true, pending: true, acquisition: event, recruitingEligible: false, reason: "STORE_UNAVAILABLE" };
  }

  let existing = null;
  if (input.prospect?.id && store.findByLinkedProspectId) {
    existing = await store.findByLinkedProspectId(input.prospect.id, organizationId);
  }
  if (!existing && input.clientId) {
    const rows = await store.listForOwners({
      organizationId,
      ownerUserIds: ownerUserId ? [ownerUserId] : null,
      clientId: input.clientId
    });
    existing = rows[0] || null;
  }
  if (existing) {
    const actor = { userId: ownerUserId || existing.ownerUserId, role: "agent" };
    const record = await applyAcquisitionToReview(
      existing.id,
      { organizationId, acquisitionEvent: event, at: input.at },
      actor
    );
    return {
      ok: true,
      linked: true,
      created: false,
      reviewId: record.id,
      acquisition: record.acquisition,
      recruitingEligible: false
    };
  }

  let client = input.client || null;
  if (!client && input.clientId) {
    client = await getClientFinder()(input.clientId, organizationId);
  }
  if (!client && input.prospect?.phone) {
    client = await getClientByPhoneFinder()(input.prospect.phone, organizationId);
  }
  if (!client && ownerUserId) {
    const creator = getClientCreator();
    if (creator) {
      client = await creator({
        organizationId,
        ownerUserId,
        name: input.prospect?.name || input.prospect?.phone || "Policy review",
        phone: input.prospect?.phone || null,
        preferredLanguage: input.match?.language || input.language || null,
        source: event.platform || "campaign_intake",
        createdBy: ownerUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }
  if (!client || !ownerUserId) {
    return {
      ok: true,
      pending: true,
      acquisition: event,
      recruitingEligible: false,
      reason: client ? "NO_OWNER" : "NO_CLIENT"
    };
  }

  const record = await createPolicyReview(
    {
      organizationId,
      clientId: client.id,
      ownerUserId,
      linkedProspectId: input.prospect?.id || null,
      language: input.match?.language || input.language || client.preferredLanguage || null,
      acquisitionEvent: event,
      nameById: input.nameById
    },
    { userId: ownerUserId, role: "agent" }
  );
  return {
    ok: true,
    created: true,
    linked: true,
    reviewId: record.id,
    clientId: client.id,
    acquisition: record.acquisition,
    recruitingEligible: false
  };
}

async function linkAppointmentForProspect(input = {}, authContext = {}) {
  const organizationId = input.organizationId;
  const appointmentId = input.appointmentId;
  const linkedProspectId = input.linkedProspectId;
  if (!organizationId || !appointmentId) {
    return { ok: false, reason: "MISSING_SCOPE" };
  }
  const store = getStore();
  if (!store) {
    return { ok: false, pending: true, reason: "STORE_UNAVAILABLE" };
  }
  let row = null;
  if (linkedProspectId && store.findByLinkedProspectId) {
    row = await store.findByLinkedProspectId(linkedProspectId, organizationId);
  }
  if (!row) {
    const ensured = await ensurePolicyReviewFromIulIntake({
      organizationId,
      ownerUserId: authContext.userId || input.ownerUserId || null,
      prospect: {
        id: linkedProspectId || null,
        phone: input.phone || null,
        name: input.prospectName || null
      }
    });
    if (ensured?.reviewId) {
      row = { id: ensured.reviewId, ownerUserId: authContext.userId || input.ownerUserId };
    }
  }
  if (!row?.id) {
    return { ok: false, pending: true, reason: "NO_PIPELINE_ROW" };
  }
  const actor = {
    userId: authContext.userId || input.ownerUserId || row.ownerUserId,
    role: authContext.role || "agent"
  };
  await linkAppointment(
    row.id,
    { organizationId, appointmentId },
    actor
  );
  return { ok: true, reviewId: row.id, appointmentId };
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
  applyAcquisitionToReview,
  getAcquisitionMetrics,
  getPolicyReviewDashboard,
  ensurePolicyReviewFromIulIntake,
  linkAppointmentForProspect,
  emptyAcquisitionMetrics,
  getCommissionDefaults,
  saveCommissionDefaults,
  POLICY_REVIEW_STAGES,
  POLICY_REVIEW_OUTCOMES,
  POLICY_REVIEW_SCOPES,
  createMemoryPolicyReviewStore
};
