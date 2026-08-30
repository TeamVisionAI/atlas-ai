/**
 * BR-179 — Client Workspace V1.
 * atlas_agenda_clients is the client SoT. Not a recruiting prospect.
 * Does not send WhatsApp, SMS, or email. Does not start Recruit AI.
 */

const {
  CLIENT_STATUSES,
  CLIENT_SCOPES,
  CLIENT_HISTORY_TYPES,
  createMemoryClientStore
} = require("../core/clients");
const { FOLLOW_UP_ENTITY_TYPES, FOLLOW_UP_VIEW_STATUSES } = require("../core/followUps");
const { presentHistoryActorLabel, presentAppointmentHistory } = require("../core/appointmentHistory");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const followUpApplicationService = require("./followUpApplicationService");

const STATUS_SET = new Set(Object.values(CLIENT_STATUSES));

let clientStoreOverride = null;
let appointmentSearchOverride = null;
let contactFindOverride = null;

function isAutomatedTestRuntime() {
  return process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function getClientStore() {
  if (clientStoreOverride) return clientStoreOverride;
  if (isAutomatedTestRuntime()) return null;
  return require("../repositories/agendaClientRepository");
}

function setStoresForTests({ clients = null, appointmentSearch = null, contactFind = null } = {}) {
  clientStoreOverride = clients || null;
  appointmentSearchOverride = appointmentSearch || null;
  contactFindOverride = contactFind || null;
}

function buildError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.publicCode = code;
  error.statusCode = statusCode;
  return error;
}

function notFound() {
  return buildError("NOT_FOUND", "Client not found.", 404);
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
      body: entry.body || null,
      oldValues: entry.oldValues || null,
      newValues: entry.newValues || null
    }
  ];
}

function canViewTeamClients(authContext) {
  return followUpApplicationService.canViewTeamFollowUps(authContext);
}

function resolveOwnerFilter({ authContext, scope }) {
  const userId = authContext?.userId;
  const requested = String(scope || CLIENT_SCOPES.MINE).toLowerCase();
  if (requested === CLIENT_SCOPES.TEAM && canViewTeamClients(authContext)) {
    if (
      authContext.hierarchyMode === HIERARCHY_MODES.ORGANIZATION ||
      authContext.role === ROLES.ADMINISTRATOR ||
      authContext.role === ROLES.RVP
    ) {
      return { scope: CLIENT_SCOPES.TEAM, ownerUserIds: null };
    }
    return {
      scope: CLIENT_SCOPES.TEAM,
      ownerUserIds: authContext.hierarchyUserIds || [userId]
    };
  }
  return { scope: CLIENT_SCOPES.MINE, ownerUserIds: userId ? [userId] : [] };
}

function canAccessClient(authContext, row) {
  if (!row || !authContext?.userId) return false;
  if (String(row.ownerUserId) === String(authContext.userId)) return true;
  if (!canViewTeamClients(authContext)) return false;
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
  if (isAutomatedTestRuntime()) {
    cache.set(ownerUserId, cache.get(ownerUserId) || null);
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

function matchesSearch(item, query) {
  if (!query) return true;
  const needle = String(query).toLowerCase().trim();
  return [item.name, item.phone, item.email]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function summarizeAppointment(appointment) {
  if (!appointment) return null;
  return {
    id: appointment.id,
    startDateTime: appointment.startDateTime || appointment.start_date_time || null,
    status: appointment.status || null,
    purpose: appointment.purpose || null,
    outcome: appointment.outcome || appointment.metadata?.outcome || null
  };
}

function pickAppointmentAnchors(appointments = [], reference = new Date()) {
  const now = reference.getTime();
  const sorted = [...appointments].sort((a, b) => {
    const aMs = Date.parse(a.startDateTime || a.start_date_time || "") || 0;
    const bMs = Date.parse(b.startDateTime || b.start_date_time || "") || 0;
    return aMs - bMs;
  });
  const closed = new Set(["cancelled", "canceled", "completed"]);
  const next = sorted.find((row) => {
    const start = Date.parse(row.startDateTime || row.start_date_time || "");
    const status = String(row.status || "").toLowerCase();
    return Number.isFinite(start) && start >= now && !closed.has(status);
  });
  const latest = [...sorted].reverse()[0] || null;
  return {
    nextAppointment: summarizeAppointment(next),
    latestAppointment: summarizeAppointment(latest)
  };
}

function pickNextFollowUp(followUps = []) {
  const open = followUps.filter((item) => item.status !== FOLLOW_UP_VIEW_STATUSES.COMPLETED);
  if (!open.length) return null;
  return [...open].sort((a, b) => (a.followUpAtMs ?? Number.MAX_SAFE_INTEGER) - (b.followUpAtMs ?? Number.MAX_SAFE_INTEGER))[0];
}

function presentClient(row, extras = {}) {
  const nameById = extras.nameById || new Map();
  return {
    id: row.id,
    source: "client",
    organizationId: row.organizationId,
    ownerUserId: row.ownerUserId,
    ownerName: extras.ownerName || presentHistoryActorLabel(row.ownerUserId, nameById),
    agendaContactId: row.agendaContactId,
    name: row.name,
    phone: row.phone || null,
    email: row.email || null,
    preferredLanguage: row.preferredLanguage || null,
    sourceLabel: row.source || null,
    notes: row.notes || null,
    status: row.status || CLIENT_STATUSES.ACTIVE,
    createdBy: row.createdBy || null,
    createdByName: presentHistoryActorLabel(row.createdBy, nameById),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    promotedAt: row.createdAt,
    history: presentHistory(row.history, nameById),
    nextAppointment: extras.nextAppointment || null,
    latestAppointment: extras.latestAppointment || null,
    nextFollowUp: extras.nextFollowUp || null,
    workspacePath: `/app/clients/${row.id}`
  };
}

async function searchAppointments(filters) {
  if (appointmentSearchOverride) {
    return appointmentSearchOverride(filters);
  }
  if (isAutomatedTestRuntime()) {
    return { items: [], total: 0 };
  }
  return require("../repositories/appointmentRepository").search(filters);
}

async function findContact(id, organizationId) {
  if (contactFindOverride) {
    return contactFindOverride(id, organizationId);
  }
  if (isAutomatedTestRuntime()) {
    return null;
  }
  return require("../repositories/agendaContactRepository").findById(id, organizationId);
}

async function loadFollowUpsForClient(client, authContext, reference) {
  const payload = await followUpApplicationService.listFollowUps({
    organizationId: client.organizationId,
    authContext,
    filter: "all",
    includeLegacy: false,
    reference,
    scope: CLIENT_SCOPES.TEAM
  });
  const open = (payload.items || []).filter(
    (item) =>
      item.entityType === FOLLOW_UP_ENTITY_TYPES.CLIENT && String(item.entityId) === String(client.id)
  );
  const completedPayload = await followUpApplicationService.listFollowUps({
    organizationId: client.organizationId,
    authContext,
    filter: "completed",
    includeLegacy: false,
    reference,
    scope: CLIENT_SCOPES.TEAM
  });
  const completed = (completedPayload.items || []).filter(
    (item) =>
      item.entityType === FOLLOW_UP_ENTITY_TYPES.CLIENT && String(item.entityId) === String(client.id)
  );
  return [...open, ...completed];
}

async function listClients({ organizationId, authContext, search, scope, reference }) {
  const store = getClientStore();
  if (!store) {
    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      scope: CLIENT_SCOPES.MINE,
      teamAvailable: canViewTeamClients(authContext),
      totalCount: 0,
      filteredCount: 0,
      search: search || "",
      items: []
    };
  }
  if (!organizationId || !authContext?.userId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }

  const ownerFilter = resolveOwnerFilter({ authContext, scope });
  const rows = await store.listForOwners({
    organizationId,
    ownerUserIds: ownerFilter.ownerUserIds
  });
  const nameById = await loadActorNames(organizationId);
  const ownerCache = new Map(nameById);
  const contactIds = rows.map((row) => row.agendaContactId).filter(Boolean);
  const appointmentResult = contactIds.length
    ? await searchAppointments({ organizationId, agendaContactIds: contactIds })
    : { items: [] };
  const appointmentsByContact = new Map();
  for (const appointment of appointmentResult.items || []) {
    const key = String(appointment.agendaContactId || "");
    if (!key) continue;
    if (!appointmentsByContact.has(key)) appointmentsByContact.set(key, []);
    appointmentsByContact.get(key).push(appointment);
  }

  const followUpPayload = await followUpApplicationService.listFollowUps({
    organizationId,
    authContext,
    filter: "all",
    includeLegacy: false,
    reference,
    scope: ownerFilter.scope
  });
  const followUpsByClient = new Map();
  for (const item of followUpPayload.items || []) {
    if (item.entityType !== FOLLOW_UP_ENTITY_TYPES.CLIENT) continue;
    const key = String(item.entityId);
    if (!followUpsByClient.has(key)) followUpsByClient.set(key, []);
    followUpsByClient.get(key).push(item);
  }

  const presented = [];
  for (const row of rows) {
    const ownerName = await resolveOwnerName(row.ownerUserId, ownerCache);
    const anchors = pickAppointmentAnchors(
      appointmentsByContact.get(String(row.agendaContactId)) || [],
      reference || new Date()
    );
    presented.push(
      presentClient(row, {
        nameById,
        ownerName,
        nextAppointment: anchors.nextAppointment,
        latestAppointment: anchors.latestAppointment,
        nextFollowUp: pickNextFollowUp(followUpsByClient.get(String(row.id)) || [])
      })
    );
  }

  const query = String(search || "").trim();
  const items = query ? presented.filter((item) => matchesSearch(item, query)) : presented;
  items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    scope: ownerFilter.scope,
    teamAvailable: canViewTeamClients(authContext),
    totalCount: presented.length,
    filteredCount: items.length,
    search: query,
    items
  };
}

async function getAuthorizedClient(id, organizationId, authContext) {
  const store = getClientStore();
  if (!store) throw notFound();
  const row = await store.findById(id, organizationId);
  if (!row || !canAccessClient(authContext, row)) {
    throw notFound();
  }
  return row;
}

async function getClient(id, { organizationId, authContext, reference, nameById: seededNames } = {}) {
  const row = await getAuthorizedClient(id, organizationId, authContext);
  const nameById = await loadActorNames(organizationId, seededNames || new Map());
  const ownerName = await resolveOwnerName(row.ownerUserId, nameById);
  const contact = row.agendaContactId ? await findContact(row.agendaContactId, organizationId) : null;
  const appointmentResult = row.agendaContactId
    ? await searchAppointments({ organizationId, agendaContactId: row.agendaContactId })
    : { items: [] };
  const appointments = (appointmentResult.items || []).map((appointment) => ({
    ...appointment,
    history: presentAppointmentHistory(appointment.history || [], nameById)
  }));
  const anchors = pickAppointmentAnchors(appointments, reference || new Date());
  const followUps = await loadFollowUpsForClient(row, authContext, reference);
  return {
    client: presentClient(row, {
      nameById,
      ownerName,
      nextAppointment: anchors.nextAppointment,
      latestAppointment: anchors.latestAppointment,
      nextFollowUp: pickNextFollowUp(followUps)
    }),
    contact: contact
      ? {
          id: contact.id,
          name: contact.name,
          phone: contact.phone || null,
          email: contact.email || null,
          preferredLanguage: contact.preferredLanguage || null,
          source: contact.source || null
        }
      : null,
    appointments,
    followUps
  };
}

async function addNote(id, input, authContext) {
  const body = String(input?.body || input?.notes || "").trim();
  if (!body) {
    throw buildError("VALIDATION_ERROR", "A note is required.");
  }
  const row = await getAuthorizedClient(id, input.organizationId, authContext);
  const now = new Date().toISOString();
  const saved = await getClientStore().save({
    ...row,
    updatedAt: now,
    history: appendHistory(row, {
      type: CLIENT_HISTORY_TYPES.NOTE_ADDED,
      actor: authContext.userId,
      at: now,
      summary: "Note added",
      body
    })
  });
  return presentClient(saved, { nameById: input.nameById || new Map() });
}

async function updateStatus(id, input, authContext) {
  const status = String(input?.status || "").trim().toUpperCase();
  if (!STATUS_SET.has(status)) {
    throw buildError("VALIDATION_ERROR", "A valid client status is required.");
  }
  const row = await getAuthorizedClient(id, input.organizationId, authContext);
  if (row.status === status) {
    return presentClient(row, { nameById: input.nameById || new Map() });
  }
  const now = new Date().toISOString();
  const saved = await getClientStore().save({
    ...row,
    status,
    updatedAt: now,
    history: appendHistory(row, {
      type: CLIENT_HISTORY_TYPES.STATUS_CHANGED,
      actor: authContext.userId,
      at: now,
      summary: "Client status changed",
      oldValues: { status: row.status },
      newValues: { status }
    })
  });
  return presentClient(saved, { nameById: input.nameById || new Map() });
}

async function summarizeForOwner({ organizationId, authContext, reference }) {
  const listed = await listClients({
    organizationId,
    authContext,
    scope: CLIENT_SCOPES.MINE,
    reference
  });
  const followUps = await followUpApplicationService.listFollowUps({
    organizationId,
    authContext,
    filter: "all",
    includeLegacy: false,
    reference,
    scope: CLIENT_SCOPES.MINE
  });
  const clientFollowUpsDue = (followUps.items || []).filter(
    (item) =>
      item.entityType === FOLLOW_UP_ENTITY_TYPES.CLIENT &&
      (item.status === FOLLOW_UP_VIEW_STATUSES.DUE_TODAY || item.status === FOLLOW_UP_VIEW_STATUSES.OVERDUE)
  ).length;
  return {
    myClientsCount: listed.totalCount,
    clientFollowUpsDue
  };
}

module.exports = {
  CLIENT_STATUSES,
  CLIENT_SCOPES,
  setStoresForTests,
  createMemoryClientStore,
  canViewTeamClients,
  canAccessClient,
  listClients,
  getClient,
  addNote,
  updateStatus,
  summarizeForOwner,
  presentClient,
  matchesSearch
};
