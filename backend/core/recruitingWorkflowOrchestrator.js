/**
 * Sprint 16.1 — Autonomous recruiting workflow orchestrator.
 *
 * Facebook Lead → Prospect Engine → WhatsApp → AI Qualification →
 * Interview Scheduling → Google Calendar → Business Events → Executive Dashboard
 */

const { findProspectInOrganization } = require("../services/supabaseService");
const { sendAndPersistWhatsAppMessage } = require("./whatsappOutboundPipeline");
const { LIFECYCLE_STATES } = require("../modules/prospects/domain/constants");
const {
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS,
  LEAD_EVENTS
} = require("../modules/business-events/domain/EventTypes");
const { assessQualificationFromProspect } = require("./recruitingQualificationEngine");
const {
  ensureCoreProspectForLegacyLead,
  findCoreProspectIdByPhone,
  normalizeStoragePhone
} = require("./recruitingProspectBridge");
const { recordBusinessEvent } = require("./recruitingBusinessEventBridge");
const { getRecruitingWorkflowDeps, isRecruitingWorkflowReady } = require("./recruitingWorkflowRegistry");
const { buildProfileFromProspect } = require("./informationModel");
const { MILESTONES } = require("./workflowConstants");
const { savePersistedWorkflowState } = require("./workflowStateStore");

const qualificationStateByPhone = new Map();

async function resolveLegacyProspectInOrganization(phone, organizationId) {
  if (!phone || !organizationId) {
    return null;
  }

  const storagePhone = normalizeStoragePhone(phone);

  return (
    (await findProspectInOrganization(storagePhone, organizationId)) ||
    (await findProspectInOrganization(phone, organizationId))
  );
}

function resolveWelcomeOrganizationLabel({ organizationId = null, organizationName = null } = {}) {
  const { isTeamVisionSeedTenant } = require("./teamVisionSeedTenant");
  const { isSafeOrganizationDisplayName } = require("./recruitAiV2/tenantBranding");
  if (isTeamVisionSeedTenant(organizationId)) {
    return "Team Vision";
  }
  if (isSafeOrganizationDisplayName(organizationName, organizationId)) {
    return String(organizationName).trim();
  }
  return null;
}

function buildWelcomeMessage({
  displayName,
  language = "es",
  organizationId = null,
  organizationName = null
}) {
  const name = displayName?.split(" ")[0] || displayName || "";
  const orgLabel = resolveWelcomeOrganizationLabel({
    organizationId,
    organizationName
  });

  if (language === "en") {
    const intro = orgLabel ? `I'm Atlas from ${orgLabel}` : "I'm Atlas";
    return `Hi${name ? ` ${name}` : ""}! ${intro}. I received your interest and can help schedule your interview in just a few messages. What city are you in?`;
  }

  const intro = orgLabel ? `Soy Atlas de ${orgLabel}` : "Soy Atlas";
  return `Hola${name ? ` ${name}` : ""}! ${intro}. Recibí tu interés y puedo ayudarte a agendar tu entrevista en pocos mensajes. ¿En qué ciudad te encuentras?`;
}

async function advanceLifecycleTo(prospectId, targetState, actor = "ATLAS", organizationId = null) {
  if (!prospectId || !organizationId || !isRecruitingWorkflowReady()) {
    return null;
  }

  const { prospectService, prospectRepository } = getRecruitingWorkflowDeps();
  const aggregate = await prospectRepository.findById(prospectId, organizationId);

  if (!aggregate) {
    return null;
  }

  const sequence = [
    LIFECYCLE_STATES.NEW_LEAD,
    LIFECYCLE_STATES.CONTACT_ATTEMPTED,
    LIFECYCLE_STATES.CONVERSATION_STARTED,
    LIFECYCLE_STATES.QUALIFIED,
    LIFECYCLE_STATES.INTERVIEW_SCHEDULED
  ];

  const current = aggregate.toJSON().status.lifecycleState;
  const startIndex = sequence.indexOf(current);
  const targetIndex = sequence.indexOf(targetState);

  if (targetIndex === -1) {
    return null;
  }

  if (startIndex === -1 || targetIndex <= startIndex) {
    if (current === targetState) {
      return aggregate;
    }

    return updateCoreLifecycle(prospectId, targetState, actor, organizationId);
  }

  let latest = aggregate;

  for (let index = startIndex + 1; index <= targetIndex; index += 1) {
    latest = await prospectService.updateProspect(
      prospectId,
      organizationId,
      { lifecycleState: sequence[index] },
      actor
    );
  }

  return latest;
}

async function updateCoreLifecycle(prospectId, lifecycleState, actor = "ATLAS", organizationId = null) {
  if (!prospectId || !organizationId || !isRecruitingWorkflowReady()) {
    return null;
  }

  const { prospectService } = getRecruitingWorkflowDeps();

  try {
    return await prospectService.updateProspect(
      prospectId,
      organizationId,
      { lifecycleState },
      actor
    );
  } catch (error) {
    console.warn("[recruitingWorkflowOrchestrator] lifecycle update skipped:", error.message);
    return null;
  }
}

async function processFacebookLead(input = {}) {
  const phone = normalizeStoragePhone(input.phone);
  const displayName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || "New Lead";
  const language = input.language === "en" ? "en" : "es";

  const bridge = await ensureCoreProspectForLegacyLead({
    phone,
    displayName,
    email: input.email || null,
    leadSource: {
      sourceType: "social",
      sourceDetail: input.leadgenId ? `Facebook Lead Ads (${input.leadgenId})` : "Facebook Lead Ads"
    },
    actor: "SYSTEM"
  });

  await savePersistedWorkflowState(
    phone,
    {
      canonicalMilestone: MILESTONES.NEW_LEAD,
      workflowOwnership: "ATLAS",
      needsHumanAttention: false
    },
    {
      organizationId: input.organizationId || bridge.organizationId || null,
      prospectId: bridge.prospectId || null
    }
  );

  let organizationName = input.organizationName || null;
  if (!organizationName && input.organizationId) {
    try {
      const branding = await require("../services/organizationBrandingService").getOrganizationBranding(
        input.organizationId
      );
      organizationName = branding?.name || null;
    } catch {
      organizationName = null;
    }
  }

  const welcomeMessage =
    input.welcomeMessage ||
    buildWelcomeMessage({
      displayName,
      language,
      organizationId: input.organizationId || bridge.organizationId || null,
      organizationName
    });
  const { buildLeadWelcomeVariables } = require("./whatsappTemplateVariableBuilder");
  const outbound = await sendAndPersistWhatsAppMessage({
    to: phone,
    message: welcomeMessage,
    actor: "ATLAS",
    intent: "FACEBOOK_LEAD_WELCOME",
    organizationId: input.organizationId || null,
    templateKey: "lead_welcome",
    templateVariables: buildLeadWelcomeVariables({ name: displayName || "" }),
    idempotencyKey: input.leadgenId ? `facebook-lead-welcome:${input.leadgenId}` : null
  });

  // Do not claim MESSAGE_SENT when the outbound gate blocked or provider failed.
  if (bridge.prospectId && bridge.organizationId && outbound?.success) {
    await recordBusinessEvent({
      phone,
      prospectId: bridge.prospectId,
      organizationId: bridge.organizationId,
      eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
      actor: "ATLAS",
      channel: "whatsapp",
      lifecycleStateAtEvent: LIFECYCLE_STATES.NEW_LEAD,
      summary: "Initial outreach",
      payload: {
        direction: "outbound",
        channel: "whatsapp",
        source: "facebook_lead",
        deliveryStatus: outbound.status || null
      },
      correlationId: input.leadgenId ? `facebook-lead:${input.leadgenId}` : null
    });

    await updateCoreLifecycle(
      bridge.prospectId,
      LIFECYCLE_STATES.CONTACT_ATTEMPTED,
      "ATLAS",
      bridge.organizationId
    );
  }

  return {
    success: true,
    phone,
    prospectId: bridge.prospectId,
    createdCoreProspect: bridge.created,
    welcomeDelivered: outbound.success,
    welcomeSimulated: outbound.simulated || false
  };
}

async function onLegacyProspectCreated({
  prospect,
  source = "facebook",
  organizationId = null
}) {
  if (!prospect?.phone) {
    return null;
  }

  return ensureCoreProspectForLegacyLead({
    phone: prospect.phone,
    displayName: prospect.name,
    organizationId: organizationId || prospect.organization_id || null,
    leadSource: {
      sourceType: "social",
      sourceDetail: source === "facebook" ? "Facebook" : source
    }
  });
}

async function onMessageReceived({ phone, message, prospectId = null, organizationId = null }) {
  const legacyProspect = await resolveLegacyProspectInOrganization(phone, organizationId);
  const resolvedOrganizationId =
    organizationId ||
    legacyProspect?.organization_id ||
    legacyProspect?.organizationId ||
    null;
  const assessment = assessQualificationFromProspect(legacyProspect);
  const resolvedProspectId =
    prospectId ||
    (resolvedOrganizationId
      ? await findCoreProspectIdByPhone(phone, resolvedOrganizationId)
      : null);

  await recordBusinessEvent({
    phone,
    prospectId: resolvedProspectId,
    organizationId: resolvedOrganizationId,
    eventType: COMMUNICATION_EVENTS.MESSAGE_RECEIVED,
    actor: "PROSPECT",
    channel: "whatsapp",
    lifecycleStateAtEvent: assessment.isQualified
      ? LIFECYCLE_STATES.QUALIFIED
      : LIFECYCLE_STATES.CONTACT_ATTEMPTED,
    summary: "Message received",
    payload: {
      direction: "inbound",
      preview: String(message || "").slice(0, 140)
    }
  });

  if (resolvedProspectId && resolvedOrganizationId) {
    await updateCoreLifecycle(
      resolvedProspectId,
      LIFECYCLE_STATES.CONVERSATION_STARTED,
      "ATLAS",
      resolvedOrganizationId
    );
  }

  return handleQualificationProgress({
    phone,
    legacyProspect,
    assessment,
    resolvedProspectId,
    organizationId: resolvedOrganizationId
  });
}

async function onMessageSent({
  phone,
  message,
  prospectId = null,
  organizationId = null,
  summary = "Message sent"
}) {
  const legacyProspect = await resolveLegacyProspectInOrganization(phone, organizationId);
  const resolvedOrganizationId =
    organizationId ||
    legacyProspect?.organization_id ||
    legacyProspect?.organizationId ||
    null;
  const assessment = assessQualificationFromProspect(legacyProspect);
  const resolvedProspectId =
    prospectId ||
    (resolvedOrganizationId
      ? await findCoreProspectIdByPhone(phone, resolvedOrganizationId)
      : null);

  await recordBusinessEvent({
    phone,
    prospectId: resolvedProspectId,
    organizationId: resolvedOrganizationId,
    eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
    actor: "ATLAS",
    channel: "whatsapp",
    lifecycleStateAtEvent: assessment.isQualified
      ? LIFECYCLE_STATES.QUALIFIED
      : LIFECYCLE_STATES.CONTACT_ATTEMPTED,
    summary,
    payload: {
      direction: "outbound",
      preview: String(message || "").slice(0, 140)
    }
  });

  return handleQualificationProgress({
    phone,
    legacyProspect,
    assessment,
    resolvedProspectId,
    organizationId: resolvedOrganizationId
  });
}

async function handleQualificationProgress({
  phone,
  legacyProspect,
  assessment,
  resolvedProspectId,
  organizationId = null
}) {
  const storagePhone = normalizeStoragePhone(phone);
  const resolvedOrganizationId =
    organizationId ||
    legacyProspect?.organization_id ||
    legacyProspect?.organizationId ||
    null;
  const previous = qualificationStateByPhone.get(storagePhone) || {
    isQualified: false,
    isInterviewScheduled: false
  };

  if (resolvedProspectId && resolvedOrganizationId && assessment.isQualified && !previous.isQualified) {
    await recordBusinessEvent({
      phone,
      prospectId: resolvedProspectId,
      organizationId: resolvedOrganizationId,
      eventType: LEAD_EVENTS.PROSPECT_UPDATED,
      actor: "ATLAS",
      channel: "whatsapp",
      lifecycleStateAtEvent: LIFECYCLE_STATES.QUALIFIED,
      summary: "Qualified",
      changedFields: ["status.lifecycleState"],
      payload: {
        qualification: assessment,
        missingFields: assessment.missingFields
      }
    });

    await updateCoreLifecycle(
      resolvedProspectId,
      LIFECYCLE_STATES.QUALIFIED,
      "ATLAS",
      resolvedOrganizationId
    );
  }

  qualificationStateByPhone.set(storagePhone, {
    isQualified: assessment.isQualified,
    isInterviewScheduled: assessment.isInterviewScheduled
  });

  return {
    assessment,
    prospectId: resolvedProspectId,
    legacyProspect,
    aiActionCenter: buildAutonomousActionCenter(assessment, legacyProspect)
  };
}

function buildAutonomousActionCenter(assessment, legacyProspect) {
  if (assessment.isInterviewScheduled) {
    return {
      priority: "Monitoring",
      nextBestAction: "Confirm interview attendance",
      reason: "Interview is scheduled on Google Calendar.",
      confidence: assessment.confidence,
      actionId: null
    };
  }

  if (assessment.readyForScheduling) {
    return {
      priority: "Interview immediate",
      nextBestAction: "Schedule interview",
      reason: "Prospect is qualified and ready to schedule an interview.",
      confidence: assessment.confidence,
      actionId: "schedule"
    };
  }

  if (assessment.isQualified) {
    return {
      priority: "Interview immediate",
      nextBestAction: "Schedule interview",
      reason: "Prospect is qualified and ready to schedule an interview.",
      confidence: assessment.confidence,
      actionId: "schedule"
    };
  }

  const nextField = assessment.nextField || assessment.nextFocus || null;

  return {
    priority: "Atlas active",
    nextBestAction: nextField ? `Collect ${nextField}` : "Continue qualification",
    reason: nextField
      ? `Qualification in progress — waiting for ${nextField}.`
      : "Qualification in progress.",
    confidence: assessment.confidence,
    actionId: "whatsapp"
  };
}

async function onInterviewScheduled({
  phone,
  prospect,
  profile,
  calendarEvent
}) {
  const organizationId = prospect?.organization_id || prospect?.organizationId || null;
  const resolvedProspectId = organizationId
    ? await findCoreProspectIdByPhone(phone, organizationId)
    : null;

  if (!resolvedProspectId || !organizationId) {
    return null;
  }

  await recordBusinessEvent({
    phone,
    prospectId: resolvedProspectId,
    organizationId,
    eventType: APPOINTMENT_EVENTS.APPOINTMENT_CREATED,
    actor: "ATLAS",
    channel: "whatsapp",
    lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
    summary: "Interview scheduled",
    payload: {
      appointmentId: calendarEvent?.id || null,
      scheduledStart: profile?.appointmentDate || prospect?.appointment_date || null,
      interviewType: profile?.interviewType || prospect?.interview_type || null,
      calendarEventId: calendarEvent?.id || prospect?.calendar_event_id || null
    }
  });

  await advanceLifecycleTo(
    resolvedProspectId,
    LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
    "ATLAS",
    organizationId
  );

  const assessment = assessQualificationFromProspect(prospect);
  qualificationStateByPhone.set(normalizeStoragePhone(phone), {
    isQualified: true,
    isInterviewScheduled: true
  });

  return {
    prospectId: resolvedProspectId,
    assessment,
    aiActionCenter: buildAutonomousActionCenter(assessment, prospect)
  };
}

async function onConversationProgress({ phone, organizationId = null }) {
  if (!organizationId) {
    return null;
  }

  const legacyProspect = await resolveLegacyProspectInOrganization(phone, organizationId);

  if (!legacyProspect) {
    return null;
  }

  const assessment = assessQualificationFromProspect(legacyProspect);
  const resolvedProspectId = await findCoreProspectIdByPhone(phone, organizationId);

  return handleQualificationProgress({
    phone,
    legacyProspect,
    assessment,
    resolvedProspectId,
    organizationId
  });
}

function clearAutonomousWorkflowStateForTests() {
  qualificationStateByPhone.clear();
}

module.exports = {
  buildWelcomeMessage,
  buildAutonomousActionCenter,
  processFacebookLead,
  onLegacyProspectCreated,
  onMessageReceived,
  onMessageSent,
  onInterviewScheduled,
  onConversationProgress,
  clearAutonomousWorkflowStateForTests
};
