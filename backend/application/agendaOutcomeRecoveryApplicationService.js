/**
 * BR-206 — recover manual Agenda outcomes after the local day passes.
 * Dry-run by default. Does not fabricate prospects. Recruiter is explicit.
 */

const {
  RECOVERY_ACTIONS,
  planAgendaOutcomeRecovery,
  wantsClient,
  wantsRecruit
} = require("../core/agendaOutcomeEvidence");
const { recordHistoryEvent } = require("../core/appointmentHistory");
const { normalizePhoneNumber, formatPhoneForStorage } = require("../core/phoneNormalizer");

let storeOverride = null;

function isAutomatedTestRuntime() {
  return process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
}

function getStores() {
  if (storeOverride) return storeOverride;
  if (isAutomatedTestRuntime()) {
    throw new Error("agendaOutcomeRecoveryApplicationService requires setStoresForTests in test.");
  }
  return {
    appointments: require("../repositories/appointmentRepository"),
    contacts: require("../repositories/agendaContactRepository"),
    clients: require("../repositories/agendaClientRepository"),
    recruits: require("../repositories/agendaRecruitRepository"),
    findProspect: async (phone, organizationId) => {
      if (!phone || !organizationId) return null;
      const { findProspectByNormalizedPhoneInOrganization, findProspectInOrganization } =
        require("../services/supabaseService");
      const normalized = normalizePhoneNumber(phone);
      const storage = normalized ? formatPhoneForStorage(normalized) : phone;
      return (
        (normalized && (await findProspectByNormalizedPhoneInOrganization(normalized, organizationId))) ||
        (await findProspectInOrganization(storage, organizationId)) ||
        null
      );
    },
    promoteToClient: (...args) =>
      require("./agendaApplicationService").promoteToClient(...args)
  };
}

function setStoresForTests(stores = null) {
  storeOverride = stores;
}

function buildError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

async function loadRecoveryContext(appointmentId, context) {
  const stores = getStores();
  const appointment = await stores.appointments.findById(appointmentId, context.organizationId);
  if (!appointment || !appointment.metadata?.standaloneAgenda) {
    throw buildError("AGENDA_APPOINTMENT_NOT_FOUND", "Standalone Agenda appointment not found.", 404);
  }
  const contactId = appointment.agendaContactId;
  const contact = contactId
    ? await stores.contacts.findById(contactId, context.organizationId)
    : null;
  if (!contact) {
    throw buildError("AGENDA_CONTACT_NOT_FOUND", "Agenda contact not found.", 404);
  }
  const existingClient =
    (await stores.clients.findByAgendaContactId(contact.id, context.organizationId)) ||
    (contact.promotedClientId
      ? await stores.clients.findById(contact.promotedClientId, context.organizationId)
      : null);
  const existingRecruit =
    (await stores.recruits.findByAgendaContactId(contact.id, context.organizationId)) ||
    (await stores.recruits.findByAppointmentId(appointment.id, context.organizationId));
  const phone = contact.phone || appointment.metadata?.agendaContactPhone || appointment.prospectPhone;
  const existingProspect = appointment.prospectId
    ? { id: appointment.prospectId, name: appointment.metadata?.prospectName || null, phone }
    : await stores.findProspect(phone, context.organizationId);

  return { appointment, contact, existingClient, existingRecruit, existingProspect };
}

function buildPlanInput(loaded, input) {
  return {
    action: input.action,
    appointment: loaded.appointment,
    contact: loaded.contact,
    existingClient: loaded.existingClient,
    existingRecruit: loaded.existingRecruit,
    existingProspect: loaded.existingProspect,
    recruiter: input.recruiter,
    displayName: input.displayName,
    production: input.production
  };
}

async function planRecovery(appointmentId, input, context) {
  const loaded = await loadRecoveryContext(appointmentId, context);
  return {
    ...planAgendaOutcomeRecovery(buildPlanInput(loaded, input)),
    appointmentId,
    agendaContactId: loaded.contact.id
  };
}

async function persistAppointmentResolution(loaded, plan, context) {
  const stores = getStores();
  const now = new Date().toISOString();
  const actor = context.userId || "agent";
  const displayName =
    clean(plan.wouldChange.find((row) => row.entity === "atlas_agenda_contacts")?.fields?.name) ||
    loaded.contact.name;

  let contact = loaded.contact;
  if (displayName && displayName !== contact.name) {
    contact = await stores.contacts.save({
      ...contact,
      name: displayName,
      updatedAt: now
    });
  }

  const appointment = await stores.appointments.save({
    ...loaded.appointment,
    status: "completed",
    outcome: plan.primaryOutcome,
    history: recordHistoryEvent(loaded.appointment, {
      type: "agenda_outcome_recovered",
      actor,
      at: now,
      summary: `Agenda recovery: ${plan.action}`,
      newValues: {
        outcome: plan.primaryOutcome,
        resultingOutcomes: plan.resultingOutcomes
      }
    }),
    metadata: {
      ...(loaded.appointment.metadata || {}),
      standaloneAgenda: true,
      noRecruitAi: true,
      lifecycleState: "completed",
      promotionPending: false,
      resultingOutcomes: plan.resultingOutcomes,
      promotedToClient: Boolean(
        plan.resultingOutcomes.includes("client") || loaded.appointment.metadata?.promotedToClient
      ),
      promotedToRecruitEvidence: Boolean(plan.resultingOutcomes.includes("recruited")),
      agendaContactName: displayName || loaded.appointment.metadata?.agendaContactName
    },
    updatedAt: now
  });

  return { appointment, contact };
}

async function persistRecruitEvidence(loaded, plan, context, contact) {
  if (loaded.existingRecruit) {
    return { recruit: loaded.existingRecruit, created: false };
  }
  const stores = getStores();
  const create = plan.wouldCreate.find((row) => row.entity === "atlas_agenda_recruits");
  const fields = create?.fields || {};
  const recruit = await stores.recruits.save({
    organizationId: context.organizationId,
    agendaContactId: contact.id,
    appointmentId: loaded.appointment.id,
    name: fields.name || contact.name,
    phone: fields.phone || contact.phone || null,
    recruiterUserId: fields.recruiterUserId || null,
    recruiterAgendaContactId: fields.recruiterAgendaContactId || null,
    recruiterClientId: fields.recruiterClientId || null,
    recruiterDisplayName: fields.recruiterDisplayName || null,
    recruitedAt: fields.recruitedAt || loaded.appointment.startDateTime || new Date().toISOString(),
    linkedProspectId: loaded.existingProspect?.id || null,
    createdByUserId: context.userId || null
  });
  return { recruit, created: true };
}

async function recoverAgendaOutcome(appointmentId, input = {}, context = {}) {
  if (!context.organizationId || !context.userId) {
    throw buildError("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 403);
  }
  if (!Object.values(RECOVERY_ACTIONS).includes(input.action)) {
    throw buildError("INVALID_ACTION", "Unknown recovery action.");
  }

  const dryRun = input.dryRun !== false;
  const plan = await planRecovery(appointmentId, input, context);
  if (!plan.ok) {
    const error = buildError(plan.blocked[0]?.code || "RECOVERY_BLOCKED", plan.blocked[0]?.message || "Recovery blocked.");
    error.plan = plan;
    throw error;
  }

  if (dryRun) {
    return { dryRun: true, executed: false, plan };
  }

  const loaded = await loadRecoveryContext(appointmentId, context);
  const stores = getStores();
  let clientResult = loaded.existingClient
    ? { client: loaded.existingClient, created: false, alreadyPromoted: true, clientId: loaded.existingClient.id }
    : null;

  if (wantsClient(input.action) && !loaded.existingClient) {
    clientResult = await stores.promoteToClient(appointmentId, {
      notes: input.notes || null
    }, context);
  }

  const persisted = await persistAppointmentResolution({ ...loaded, appointment: clientResult?.appointment || loaded.appointment }, plan, context);

  let recruitResult = null;
  if (wantsRecruit(input.action)) {
    recruitResult = await persistRecruitEvidence(loaded, plan, context, persisted.contact);
  }

  const after = await loadRecoveryContext(appointmentId, context);
  return {
    dryRun: false,
    executed: true,
    plan,
    appointment: after.appointment,
    contact: after.contact,
    client: after.existingClient || clientResult?.client || null,
    recruit: after.existingRecruit || recruitResult?.recruit || null,
    prospect: after.existingProspect,
    created: {
      client: Boolean(clientResult?.created),
      recruit: Boolean(recruitResult?.created)
    }
  };
}

module.exports = {
  RECOVERY_ACTIONS,
  setStoresForTests,
  planRecovery,
  recoverAgendaOutcome
};
