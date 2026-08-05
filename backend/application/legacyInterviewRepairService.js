/**
 * Sprint 12.5.6 — Repair legacy interviews missing persisted atlas_appointments rows.
 * Implements BR-039 backfill path.
 */

const appointmentRepository = require("../repositories/appointmentRepository");
const appointmentApplicationService = require("./appointmentApplicationService");
const appointmentListService = require("../services/appointmentListService");
const { loadProspectsForOrganization } = require("../services/supabaseService");
const { parseInterviewDatetime } = require("../core/parseInterviewDatetime");
const { extractEmailFromNotes } = require("../core/informationModel");
const { normalizeEmail, validateEmailFormat } = require("../core/emailNormalization");
const { APPOINTMENT_SOURCES } = require("../core/configuration/appointmentDomain");
const {
  deriveDateKeyTimeKey,
  inferMeetingTypeFromProspect
} = require("../core/legacyInterviewRepairEngine");
const { isPersistedAppointment } = require("../core/appointmentListQuery");

const SCHEDULED_STEPS = new Set(["CONFIRMED", "SCHEDULE"]);

function hasScheduledInterviewMetadata(prospect = {}) {
  const interviewMs = parseInterviewDatetime(prospect);

  if (!interviewMs) {
    return false;
  }

  if (!prospect.calendar_event_id && !prospect.interview_time && !prospect.appointment_date) {
    return false;
  }

  if (!SCHEDULED_STEPS.has(String(prospect.current_step || "").toUpperCase())) {
    return false;
  }

  return true;
}

/**
 * Resolve the agent_id stamped on repaired appointments.
 *
 * Appointments → Upcoming filters by authenticated user id (`agent_id`).
 * Prefer an explicit preferredAgentId (e.g. operating RVP) over a prospect
 * owner that may be a different same-org admin account.
 */
function resolveRepairAgentId(prospect, options = {}) {
  return (
    options.preferredAgentId ||
    options.repairActorId ||
    prospect.owner_user_id ||
    prospect.created_by_user_id ||
    options.fallbackAgentId ||
    null
  );
}

async function findPersistedAppointmentMatch(prospect, organizationId) {
  const startDateTime = new Date(parseInterviewDatetime(prospect)).toISOString();
  const result = await appointmentListService.listPersistedAppointments({
    organizationId,
    prospectPhone: prospect.phone
  });

  return (
    result.items.find((appointment) => appointment.startDateTime === startDateTime) ||
    result.items.find((appointment) => {
      if (!prospect.calendar_event_id) {
        return false;
      }

      return appointment.calendarEventId === prospect.calendar_event_id;
    }) ||
    null
  );
}

function buildRepairCandidateSummary(prospect, organizationId) {
  const interviewMs = parseInterviewDatetime(prospect);
  const keys = deriveDateKeyTimeKey(new Date(interviewMs).toISOString());

  return {
    phone: prospect.phone,
    name: prospect.name,
    organizationId,
    currentStep: prospect.current_step,
    calendarEventId: prospect.calendar_event_id || null,
    startDateTime: keys ? new Date(interviewMs).toISOString() : null,
    dateKey: keys?.dateKey || null,
    timeKey: keys?.timeKey || null,
    interviewType: prospect.interview_type || null
  };
}

async function isLegacyRepairCandidate(prospect, organizationId) {
  if (!organizationId || !prospect?.phone) {
    return { candidate: false, reason: "missing_scope" };
  }

  if (!hasScheduledInterviewMetadata(prospect)) {
    return { candidate: false, reason: "missing_scheduled_metadata" };
  }

  const active = await appointmentListService.findPersistedAppointmentForProspect(prospect.phone, organizationId);

  if (active) {
    return { candidate: false, reason: "persisted_appointment_exists", appointmentId: active.id };
  }

  const matched = await findPersistedAppointmentMatch(prospect, organizationId);

  if (matched) {
    return { candidate: false, reason: "persisted_appointment_exists", appointmentId: matched.id };
  }

  return { candidate: true, reason: "repair_required" };
}

async function repairLegacyInterviewForProspect(prospect, options = {}) {
  const organizationId = options.organizationId;
  const dryRun = Boolean(options.dryRun);
  const summary = buildRepairCandidateSummary(prospect, organizationId);
  const eligibility = await isLegacyRepairCandidate(prospect, organizationId);

  if (!eligibility.candidate) {
    return {
      status: "skipped",
      reason: eligibility.reason,
      appointmentId: eligibility.appointmentId || null,
      summary
    };
  }

  const agentId = resolveRepairAgentId(prospect, options);

  if (!agentId) {
    return {
      status: "failed",
      reason: "missing_repair_agent_id",
      summary
    };
  }

  const interviewMs = parseInterviewDatetime(prospect);
  const startDateTime = new Date(interviewMs).toISOString();
  const endDateTime = new Date(interviewMs + 30 * 60_000).toISOString();
  const keys = deriveDateKeyTimeKey(startDateTime);

  if (!keys) {
    return {
      status: "failed",
      reason: "invalid_datetime",
      summary
    };
  }

  const { meetingType, isZoom } = inferMeetingTypeFromProspect(prospect);
  const email = normalizeEmail(extractEmailFromNotes(prospect.notes));
  const attendeeEmail = email && validateEmailFormat(email) ? email : null;

  if (dryRun) {
    return {
      status: "dry_run",
      reason: "would_repair",
      summary: {
        ...summary,
        agentId,
        meetingType,
        attendeeEmail
      }
    };
  }

  const appointmentRecord = await appointmentApplicationService.createAppointment(
    {
      organizationId,
      agentId,
      prospectPhone: prospect.phone,
      purpose: "recruiting_interview",
      dateKey: keys.dateKey,
      timeKey: keys.timeKey,
      source: APPOINTMENT_SOURCES.MISSION_CONTROL,
      meetingType,
      meetingProvider: isZoom ? "zoom" : undefined,
      contact: attendeeEmail ? { email: attendeeEmail } : {},
      existingBooking: {
        success: true,
        startTimeISO: startDateTime,
        endTimeISO: endDateTime,
        googleCalendarEventId: prospect.calendar_event_id || null,
        // Always reconcile after persist so Google time matches the appointment
        // even when a stale event id survived reconnect.
        googleCalendarSynced: false
      },
      skipWorkflowSideEffects: true,
      skipReminders: true,
      skipProspectUpdate: true,
      metadata: {
        legacyRepair: true,
        repairedAt: new Date().toISOString()
      }
    },
    { organizationId }
  );

  const synced = await appointmentApplicationService.reconcileAppointmentGoogleCalendar(
    appointmentRecord.id,
    { organizationId, agentId }
  );

  const verified = await appointmentRepository.findById(synced.id || appointmentRecord.id, organizationId);

  if (!verified || !isPersistedAppointment(verified)) {
    return {
      status: "failed",
      reason: "verification_failed",
      summary
    };
  }

  return {
    status: "repaired",
    reason: "persisted",
    appointmentId: verified.id,
    summary: {
      ...summary,
      appointmentId: verified.id,
      calendarEventId: verified.calendarEventId,
      calendarSyncStatus: verified.metadata?.calendarSyncStatus || null
    }
  };
}

async function listLegacyRepairCandidates(options = {}) {
  const organizationId = options.organizationId;
  const phone = options.phone || null;
  let prospects = [];

  if (phone) {
    const { findProspectInOrganization } = require("../services/supabaseService");
    const prospect = await findProspectInOrganization(phone, organizationId);

    prospects = prospect ? [prospect] : [];
  } else {
    prospects = await loadProspectsForOrganization(organizationId);
  }

  const candidates = [];

  for (const prospect of prospects) {
    const eligibility = await isLegacyRepairCandidate(prospect, organizationId);

    if (eligibility.candidate) {
      candidates.push({
        ...buildRepairCandidateSummary(prospect, organizationId),
        reason: eligibility.reason
      });
    }
  }

  return candidates;
}

async function runLegacyInterviewRepair(options = {}) {
  const organizationId = options.organizationId;
  const dryRun = Boolean(options.dryRun);
  const candidates = await listLegacyRepairCandidates(options);
  const results = {
    candidates: candidates.length,
    repaired: 0,
    skipped: 0,
    failed: 0,
    dryRun,
    records: []
  };

  for (const candidate of candidates) {
    const { findProspectInOrganization } = require("../services/supabaseService");
    const prospect = await findProspectInOrganization(candidate.phone, organizationId);
    const outcome = await repairLegacyInterviewForProspect(prospect, {
      ...options,
      dryRun
    });

    results.records.push(outcome);

    if (outcome.status === "repaired" || outcome.status === "dry_run") {
      results.repaired += outcome.status === "repaired" ? 1 : 0;
    } else if (outcome.status === "skipped") {
      results.skipped += 1;
    } else {
      results.failed += 1;
    }
  }

  if (dryRun) {
    results.repaired = 0;
    results.skipped = 0;
    results.failed = 0;
    results.wouldRepair = candidates.length;
  }

  return results;
}

module.exports = {
  hasScheduledInterviewMetadata,
  isLegacyRepairCandidate,
  listLegacyRepairCandidates,
  repairLegacyInterviewForProspect,
  runLegacyInterviewRepair,
  buildRepairCandidateSummary,
  resolveRepairAgentId
};
