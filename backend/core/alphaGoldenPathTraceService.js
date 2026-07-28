/**
 * Sprint 12 — Golden path trace / replay artifact.
 * Collects timeline, decisions, rules, calendar, WhatsApp, and validation for one prospect.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { findProspectInOrganization } = require("../services/supabaseService");
const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
const { buildConfidenceProfile } = require("./alphaConfidenceEngine");
const { assessQualificationFromProspect } = require("./recruitingQualificationEngine");

async function fetchBusinessEventsForProspect(prospectId, limit = 100) {
  const { supabase } = require("../services/supabaseService");
  const { data, error } = await supabase
    .from("atlas_business_events")
    .select("id, event_type, payload, correlation_id, created_at, timestamp")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return [];
  }

  return data || [];
}

async function fetchTimelineForProspect(prospectId, limit = 100) {
  const { supabase } = require("../services/supabaseService");

  const { data, error } = await supabase
    .from("atlas_timeline_entries")
    .select("id, event_type, title, summary, occurred_at, metadata")
    .eq("prospect_id", prospectId)
    .order("occurred_at", { ascending: true })
    .limit(limit);

  if (error) {
    return [];
  }

  return data || [];
}

async function fetchConversationLogs(phone, limit = 50) {
  const { supabase } = require("../services/supabaseService");
  const { data, error } = await supabase
    .from("conversation_logs")
    .select("id, message, direction, created_at, intent")
    .eq("prospect_phone", phone)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return [];
  }

  return data || [];
}

function extractBusinessRulesApplied(prospect = {}, assessment = {}) {
  const rules = [];

  if (prospect.city && prospect.state) {
    rules.push("BR-004: Location captured");
  }

  if (prospect.work_authorized === true) {
    rules.push("BR-005: Work authorization confirmed");
  }

  if (assessment.isQualified) {
    rules.push("BR-037: Qualification milestone requirements met");
  }

  if (prospect.calendar_event_id) {
    rules.push("BR-018: Interview scheduled with calendar reference");
  }

  return rules;
}

async function buildGoldenPathTrace(phone, options = {}) {
  const organizationId = options.organizationId || DEFAULT_ORGANIZATION_ID;
  const prospect = await findProspectInOrganization(phone, organizationId);

  if (!prospect) {
    throw new Error(`Prospect not found for phone ${phone}`);
  }

  const missionControl = await getMissionControlWithActions(phone, {
    organizationId,
    tenantScoped: true
  }).catch(() => null);

  const assessment = assessQualificationFromProspect(prospect);
  const aiDecisions = missionControl?.aiActionCenter
    ? buildConfidenceProfile({
        actionCenter: missionControl.aiActionCenter,
        workflow: missionControl.workflow || {},
        brain: missionControl.brain || {},
        prospect
      })
    : null;

  const prospectId = prospect.id || prospect.prospect_id || null;
  const businessEvents = prospectId ? await fetchBusinessEventsForProspect(prospectId) : [];
  const timelineEntries = prospectId ? await fetchTimelineForProspect(prospectId) : [];
  const conversationLogs = await fetchConversationLogs(phone);

  const meetingManagementService = require("../services/meetingManagementService");
  const meetingConfig = await meetingManagementService
    .getMeetingManagement(organizationId)
    .catch(() => null);

  const whatsappMessages = conversationLogs.filter((row) => row.direction === "outgoing");
  const confirmationSent = whatsappMessages.some((row) => {
    const text = String(row.message || "").toLowerCase();
    return text.includes("confirm") || text.includes("confirmación") || text.includes("entrevista");
  });

  const meetingLocation =
    prospect.virtual_meeting_url ||
    prospect.meeting_url ||
    prospect.interview_location ||
    meetingConfig?.personalMeetingUrl ||
    meetingConfig?.effectiveOfficeAddress ||
    null;

  return {
    sprint: "12",
    generatedAt: new Date().toISOString(),
    phone,
    prospectId,
    prospect: {
      name: prospect.name,
      phone: prospect.phone,
      communication_language: prospect.communication_language,
      city: prospect.city,
      state: prospect.state,
      work_authorized: prospect.work_authorized,
      current_step: prospect.current_step,
      calendar_event_id: prospect.calendar_event_id || null
    },
    workflow: missionControl?.workflow || null,
    brain: missionControl?.brain || null,
    missionControl: missionControl?.workflow
      ? {
          canonicalMilestone: missionControl.workflow.canonicalMilestone,
          priorityTier: missionControl.workflow.missionControlPriorityTier,
          ownership: missionControl.workflow.workflowOwnership
        }
      : null,
    aiDecisions,
    businessRulesApplied: extractBusinessRulesApplied(prospect, assessment),
    calendar: {
      eventId: prospect.calendar_event_id || null,
      appointmentDate: prospect.appointment_date || null,
      interviewTime: prospect.interview_time || null
    },
    meeting: {
      configured: Boolean(meetingConfig?.configured),
      location: meetingLocation
    },
    whatsapp: {
      outboundCount: whatsappMessages.length,
      confirmationSent
    },
    timeline: {
      entryCount: timelineEntries.length,
      entries: timelineEntries
    },
    businessEvents,
    conversationLogs,
    validation: {
      qualified: assessment.isQualified,
      interviewScheduled: assessment.isInterviewScheduled,
      confidence: assessment.confidence
    },
    checks: {
      prospectClassified: Boolean(missionControl?.workflow?.canonicalMilestone),
      languageDetected: Boolean(prospect.communication_language || missionControl?.brain?.language),
      calendarCreated: Boolean(prospect.calendar_event_id),
      meetingInserted: Boolean(meetingLocation),
      whatsappConfirmation: confirmationSent,
      timelineCompleted: timelineEntries.length > 0
    },
    replay: {
      steps: [
        { step: "Facebook / Instagram Lead", status: businessEvents.some(isFacebookEvent) ? "PASS" : "UNKNOWN" },
        { step: "Meta Webhook", status: businessEvents.length ? "PASS" : "UNKNOWN" },
        { step: "Atlas AI Qualification", status: assessment.isQualified ? "PASS" : "PENDING" },
        { step: "Language Detection", status: prospect.communication_language ? "PASS" : "PENDING" },
        { step: "Google Calendar Scheduling", status: prospect.calendar_event_id ? "PASS" : "PENDING" },
        { step: "Meeting Management", status: meetingLocation ? "PASS" : "PENDING" },
        { step: "WhatsApp Confirmation", status: confirmationSent ? "PASS" : "PENDING" },
        { step: "Mission Control Update", status: missionControl?.workflow ? "PASS" : "PENDING" },
        { step: "Timeline", status: timelineEntries.length ? "PASS" : "PENDING" }
      ]
    }
  };
}

function isFacebookEvent(event) {
  const correlation = String(event.correlation_id || "").toLowerCase();
  const payload = event.payload || {};
  const source = String(payload.sourceDetail || payload.source || "").toLowerCase();
  return correlation.includes("facebook") || source.includes("facebook");
}

module.exports = {
  buildGoldenPathTrace
};
