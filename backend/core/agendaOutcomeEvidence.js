/**
 * BR-206 — Manual Agenda outcome evidence + attribution.
 * Plans recovery without writing. Does not fabricate prospects.
 * Appointment owner is not recruiter credit.
 */

const {
  hasCanonicalRecordedOutcome,
  resolveCanonicalAppointmentOutcome
} = require("./appointmentOutcomeState");
const { APPOINTMENT_OUTCOMES } = require("./configuration/appointmentDomain");

const RECOVERY_ACTIONS = Object.freeze({
  RECORD_CLIENT: "RECORD_CLIENT",
  RECORD_RECRUIT: "RECORD_RECRUIT",
  RECORD_RECRUIT_AND_CLIENT: "RECORD_RECRUIT_AND_CLIENT",
  RECORD_PRODUCTION: "RECORD_PRODUCTION"
});

const EVIDENCE_KINDS = Object.freeze({
  CLIENT: "client",
  RECRUIT: "recruit",
  PRODUCTION: "production"
});

function wantsClient(action) {
  return action === RECOVERY_ACTIONS.RECORD_CLIENT || action === RECOVERY_ACTIONS.RECORD_RECRUIT_AND_CLIENT;
}

function wantsRecruit(action) {
  return action === RECOVERY_ACTIONS.RECORD_RECRUIT || action === RECOVERY_ACTIONS.RECORD_RECRUIT_AND_CLIENT;
}

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function resolveRecruiterAttribution(input = {}) {
  const displayName = clean(input.displayName);
  const userId = clean(input.userId);
  const agendaContactId = clean(input.agendaContactId);
  const clientId = clean(input.clientId);
  if (!displayName && !userId && !agendaContactId && !clientId) {
    return null;
  }
  return {
    userId,
    agendaContactId,
    clientId,
    displayName
  };
}

function appointmentAttribution(appointment = {}, contact = {}) {
  return {
    ownerUserId: appointment.agentId || appointment.interviewerUserId || contact.ownerUserId || null,
    trainerUserId: appointment.interviewerUserId || appointment.agentId || null,
    appointmentType: appointment.purpose || null,
    source: appointment.source || null,
    standaloneAgenda: Boolean(appointment.metadata?.standaloneAgenda),
    scheduledAt: appointment.startDateTime || null
  };
}

function validateProductionSplits(input = {}) {
  const totalPremium = input.totalPremium == null || input.totalPremium === ""
    ? null
    : Number(input.totalPremium);
  const attributions = Array.isArray(input.attributions) ? input.attributions : [];

  if (totalPremium != null && (!Number.isFinite(totalPremium) || totalPremium < 0)) {
    return { ok: false, code: "INVALID_PREMIUM", message: "Policy total premium must be a non-negative number." };
  }

  let percentSum = 0;
  let creditedSum = 0;
  let hasPercent = false;
  let hasCredit = false;

  for (const row of attributions) {
    if (row.splitPercent != null && row.splitPercent !== "") {
      const pct = Number(row.splitPercent);
      if (!Number.isFinite(pct) || pct < 0) {
        return { ok: false, code: "INVALID_SPLIT_PERCENT", message: "Split percent must be a non-negative number." };
      }
      percentSum += pct;
      hasPercent = true;
    }
    if (row.creditedAmount != null && row.creditedAmount !== "") {
      const amount = Number(row.creditedAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        return { ok: false, code: "INVALID_CREDITED_AMOUNT", message: "Credited amount must be a non-negative number." };
      }
      creditedSum += amount;
      hasCredit = true;
    }
  }

  if (hasPercent && percentSum > 100 + 1e-9) {
    return { ok: false, code: "SPLIT_PERCENT_EXCEEDS_100", message: "Sum of split percentages cannot exceed 100." };
  }
  if (hasCredit && totalPremium != null && creditedSum > totalPremium + 1e-9) {
    return {
      ok: false,
      code: "CREDITED_EXCEEDS_PREMIUM",
      message: "Sum of credited premium cannot exceed policy total premium."
    };
  }

  return {
    ok: true,
    totalPremium,
    percentSum,
    creditedSum,
    attributions
  };
}

function deriveProductionKpi(productions = [], attributions = []) {
  let totalPremium = 0;
  let policiesWithAmount = 0;
  const creditedByAgent = {};

  for (const production of productions) {
    if (production.amount != null && Number.isFinite(Number(production.amount))) {
      totalPremium += Number(production.amount);
      policiesWithAmount += 1;
    }
  }

  for (const row of attributions) {
    const key = String(row.agentUserId || row.participantDisplayName || "unassigned");
    const credit = row.creditedAmount != null
      ? Number(row.creditedAmount)
      : row.splitPercent != null && productions[0]?.amount != null
        ? (Number(row.splitPercent) / 100) * Number(productions[0].amount)
        : 0;
    creditedByAgent[key] = (creditedByAgent[key] || 0) + (Number.isFinite(credit) ? credit : 0);
  }

  return {
    policyCount: productions.length,
    totalPremium,
    policiesWithAmount,
    creditedByAgent,
    doubleCountSafe: true
  };
}

function deriveAgendaOutcomeKpis({
  clients = [],
  recruits = [],
  productions = [],
  attributions = [],
  appointments = []
} = {}) {
  const recruitsByRecruiter = {};
  for (const recruit of recruits) {
    const key =
      recruit.recruiterAgendaContactId ||
      recruit.recruiterUserId ||
      recruit.recruiterDisplayName ||
      "unattributed";
    recruitsByRecruiter[String(key)] = (recruitsByRecruiter[String(key)] || 0) + 1;
  }

  return {
    clientCount: clients.length,
    recruitCount: recruits.length,
    recruitsByRecruiter,
    appointmentCount: appointments.length,
    production: deriveProductionKpi(productions, attributions)
  };
}

function resolvePrimaryOutcome({ appointment, action }) {
  const existing = resolveCanonicalAppointmentOutcome(appointment);
  if (existing && existing !== APPOINTMENT_OUTCOMES.COMPLETED) {
    return existing;
  }
  if (action === RECOVERY_ACTIONS.RECORD_CLIENT) {
    return APPOINTMENT_OUTCOMES.CLIENT;
  }
  if (action === RECOVERY_ACTIONS.RECORD_RECRUIT) {
    return APPOINTMENT_OUTCOMES.RECRUITED;
  }
  if (action === RECOVERY_ACTIONS.RECORD_RECRUIT_AND_CLIENT) {
    return APPOINTMENT_OUTCOMES.COMPLETED;
  }
  return existing || APPOINTMENT_OUTCOMES.COMPLETED;
}

function resultingOutcomesFor(action, appointment = {}) {
  const current = new Set(
    Array.isArray(appointment.metadata?.resultingOutcomes)
      ? appointment.metadata.resultingOutcomes
      : []
  );
  const existing = resolveCanonicalAppointmentOutcome(appointment);
  if (existing === APPOINTMENT_OUTCOMES.CLIENT) current.add("client");
  if (existing === APPOINTMENT_OUTCOMES.RECRUITED) current.add("recruited");
  if (wantsClient(action)) current.add("client");
  if (wantsRecruit(action)) current.add("recruited");
  return [...current];
}

function planAgendaOutcomeRecovery(input = {}) {
  const action = input.action;
  if (!Object.values(RECOVERY_ACTIONS).includes(action)) {
    return {
      ok: false,
      dryRun: true,
      blocked: [{ code: "INVALID_ACTION", message: "Unknown recovery action." }]
    };
  }

  const appointment = input.appointment || {};
  const contact = input.contact || {};
  const existingProspect = input.existingProspect || null;
  const existingClient = input.existingClient || null;
  const existingRecruit = input.existingRecruit || null;
  const displayName = clean(input.displayName) || clean(contact.name) || clean(appointment.metadata?.agendaContactName);
  const recruiter = resolveRecruiterAttribution(input.recruiter || {});
  const appointmentAttr = appointmentAttribution(appointment, contact);
  const blocked = [];
  const wouldCreate = [];
  const wouldLink = [];
  const wouldChange = [];
  const wouldNotChange = [];
  const schemaGaps = [];

  if (!appointment.id || !appointment.metadata?.standaloneAgenda) {
    blocked.push({ code: "NOT_STANDALONE_AGENDA", message: "Recovery applies only to manual Add-to-Agenda appointments." });
  }
  if (!contact.id) {
    blocked.push({ code: "MISSING_AGENDA_CONTACT", message: "Agenda contact is required." });
  }

  if (wantsRecruit(action) && !recruiter) {
    blocked.push({
      code: "RECRUITER_REQUIRED",
      message: "Recruiter/sponsor must be set explicitly. Appointment owner is not recruiting credit."
    });
  }

  if (wantsRecruit(action) && recruiter && recruiter.userId && recruiter.userId === appointmentAttr.ownerUserId) {
    // Allowed only when explicitly intended — still recorded as recruiter, not inferred.
    wouldNotChange.push({
      entity: "appointment.agentId",
      reason: "appointment_owner_is_not_inferred_as_recruiter"
    });
  }

  let productionPlan = null;
  if (action === RECOVERY_ACTIONS.RECORD_PRODUCTION || input.production) {
    productionPlan = validateProductionSplits(input.production || {});
    if (!productionPlan.ok) {
      blocked.push({ code: productionPlan.code, message: productionPlan.message });
    }
  }

  if (blocked.length) {
    return {
      ok: false,
      dryRun: true,
      action,
      blocked,
      wouldCreate,
      wouldLink,
      wouldChange,
      wouldNotChange,
      schemaGaps,
      kpiEffects: deriveAgendaOutcomeKpis({}),
      recruiterAttribution: recruiter,
      appointmentAttribution: appointmentAttr
    };
  }

  const primaryOutcome = resolvePrimaryOutcome({ appointment, action });
  const resultingOutcomes = resultingOutcomesFor(action, appointment);

  if (existingProspect) {
    wouldLink.push({
      entity: "prospects",
      id: existingProspect.id,
      action: "preserve_unchanged"
    });
    wouldNotChange.push({
      entity: "prospects",
      id: existingProspect.id,
      reason: "existing_prospect_is_not_duplicated_or_rewritten"
    });
  } else if (wantsRecruit(action)) {
    wouldNotChange.push({
      entity: "prospects",
      reason: "recruit_evidence_does_not_fabricate_a_prospect"
    });
  }

  if (wantsClient(action)) {
    if (existingClient) {
      wouldLink.push({
        entity: "atlas_agenda_clients",
        id: existingClient.id,
        action: "reuse_existing"
      });
    } else {
      wouldCreate.push({
        entity: "atlas_agenda_clients",
        fields: {
          organizationId: appointment.organizationId,
          agendaContactId: contact.id,
          name: displayName,
          phone: contact.phone || appointment.metadata?.agendaContactPhone || null,
          sourceAppointmentId: appointment.id,
          ownerUserId: contact.ownerUserId || appointmentAttr.ownerUserId
        }
      });
    }
  }

  if (wantsRecruit(action)) {
    if (existingRecruit) {
      wouldLink.push({
        entity: "atlas_agenda_recruits",
        id: existingRecruit.id,
        action: "reuse_existing"
      });
    } else {
      wouldCreate.push({
        entity: "atlas_agenda_recruits",
        fields: {
          organizationId: appointment.organizationId,
          agendaContactId: contact.id,
          appointmentId: appointment.id,
          name: displayName,
          phone: contact.phone || appointment.metadata?.agendaContactPhone || null,
          recruiterUserId: recruiter.userId,
          recruiterAgendaContactId: recruiter.agendaContactId,
          recruiterClientId: recruiter.clientId,
          recruiterDisplayName: recruiter.displayName,
          linkedProspectId: existingProspect?.id || null,
          recruitedAt: appointment.startDateTime || null
        }
      });
    }
  }

  if (action === RECOVERY_ACTIONS.RECORD_PRODUCTION) {
    if (productionPlan?.totalPremium == null && !(productionPlan?.attributions || []).length) {
      wouldNotChange.push({
        entity: "atlas_client_production",
        reason: "no_premium_or_split_provided_do_not_invent"
      });
    } else {
      wouldCreate.push({
        entity: "atlas_client_production",
        fields: {
          amount: productionPlan.totalPremium,
          sourceAppointmentId: appointment.id
        }
      });
      for (const row of productionPlan.attributions) {
        wouldCreate.push({
          entity: "atlas_client_production_attributions",
          fields: {
            agentUserId: row.agentUserId || null,
            splitPercent: row.splitPercent ?? null,
            creditedAmount: row.creditedAmount ?? null
          }
        });
      }
    }
  }

  if (displayName && displayName !== contact.name) {
    wouldChange.push({
      entity: "atlas_agenda_contacts",
      id: contact.id,
      fields: { name: displayName }
    });
  }

  wouldChange.push({
    entity: "atlas_appointments",
    id: appointment.id,
    fields: {
      status: "completed",
      outcome: primaryOutcome,
      promotionPending: false,
      resultingOutcomes,
      promotedToClient: wantsClient(action) || Boolean(appointment.metadata?.promotedToClient),
      promotedToRecruitEvidence: wantsRecruit(action) || Boolean(appointment.metadata?.promotedToRecruitEvidence)
    }
  });

  if (hasCanonicalRecordedOutcome(appointment) && appointment.outcome === primaryOutcome) {
    wouldNotChange.push({
      entity: "atlas_appointments.outcome",
      reason: "primary_outcome_already_recorded"
    });
  }

  const kpiEffects = {
    clientsDelta: wantsClient(action) && !existingClient ? 1 : 0,
    recruitsDelta: wantsRecruit(action) && !existingRecruit ? 1 : 0,
    recruitCredit: recruiter
      ? {
          recruiterDisplayName: recruiter.displayName,
          recruiterAgendaContactId: recruiter.agendaContactId,
          recruiterUserId: recruiter.userId,
          notAppointmentOwner: recruiter.userId !== appointmentAttr.ownerUserId
        }
      : null,
    appointmentsResolvedDelta: hasCanonicalRecordedOutcome(appointment) ? 0 : 1,
    productionDelta: action === RECOVERY_ACTIONS.RECORD_PRODUCTION && productionPlan?.totalPremium != null
      ? { policyCount: 1, totalPremium: productionPlan.totalPremium }
      : { policyCount: 0, totalPremium: 0 },
    existingProspectUnchanged: Boolean(existingProspect)
  };

  return {
    ok: true,
    dryRun: true,
    action,
    blocked: [],
    wouldCreate,
    wouldLink,
    wouldChange,
    wouldNotChange,
    schemaGaps,
    primaryOutcome,
    resultingOutcomes,
    kpiEffects,
    recruiterAttribution: recruiter,
    appointmentAttribution: appointmentAttr,
    pastDateRecoverable: true
  };
}

module.exports = {
  RECOVERY_ACTIONS,
  EVIDENCE_KINDS,
  wantsClient,
  wantsRecruit,
  resolveRecruiterAttribution,
  appointmentAttribution,
  validateProductionSplits,
  deriveProductionKpi,
  deriveAgendaOutcomeKpis,
  resolvePrimaryOutcome,
  resultingOutcomesFor,
  planAgendaOutcomeRecovery
};
