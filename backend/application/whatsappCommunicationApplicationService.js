/**
 * WhatsApp communication application service — preview and copy+open recording.
 * Automatic Cloud API delivery reuses the same templates via deliveryMode: "automatic".
 */

const {
  findProspectInOrganization,
  findProspectForSystemIngress
} = require("../services/supabaseService");
const meetingManagementService = require("../services/meetingManagementService");
const { parseInterviewDatetime } = require("../core/parseInterviewDatetime");
const { isProductionProspect } = require("../core/productionProspectFilter");
const { loadAgentState, mergeAgentState } = require("../core/agentActionState");
const { resolveProspectCommunicationCode } = require("../core/prospectLanguage");
const { getOrganizationSettings } = require("../core/organizationSettingsEngine");
const { buildAgentActionTimelineMessage } = require("../core/agentActionCopy");
const { logConversation } = require("../services/logService");
const {
  requireTenantOrganizationId,
  isTenantScopedRequest
} = require("../core/tenantProspectLookup");
const {
  WHATSAPP_TEMPLATES,
  DELIVERY_MODES,
  DEFAULT_TIMEZONE,
  resolveTemplateForAction,
  composeWhatsAppMessage,
  getTemplateFlagKey,
  resolveRecruiterDisplayName
} = require("../core/whatsappCommunicationEngine");

function buildError(error, message, extras = {}) {
  return {
    success: false,
    error,
    message,
    ...extras
  };
}

function buildSuccess(message, extras = {}) {
  return {
    success: true,
    message,
    deliveryMode: DELIVERY_MODES.COPY_OPEN,
    ...extras
  };
}

async function resolveTenantProspect(phone, options = {}) {
  const tenantScoped = isTenantScopedRequest(options);

  if (tenantScoped) {
    const organizationId = requireTenantOrganizationId(options.organizationId);
    return findProspectInOrganization(phone, organizationId);
  }

  if (options.organizationId) {
    return findProspectInOrganization(phone, options.organizationId);
  }

  return findProspectForSystemIngress(phone);
}

async function logAgentTimeline(prospect, message) {
  await logConversation({
    phone: prospect.phone,
    name: prospect.name,
    direction: "outgoing",
    message,
    intent: "AGENT_ACTION",
    pipeline: "AGENT",
    currentStep: prospect.current_step || "AGENT",
    language: prospect.language || "en",
    city: prospect.city,
    state: prospect.state
  });
}

function resolveTemplate({ template, sourceAction, prospect }) {
  if (template && Object.values(WHATSAPP_TEMPLATES).includes(template)) {
    return template;
  }

  return resolveTemplateForAction(sourceAction || "whatsapp");
}

async function buildMessageContext(prospect, template, options = {}) {
  const language = resolveProspectCommunicationCode(prospect);
  const organizationId = requireTenantOrganizationId(options.organizationId);
  const recruiterName = resolveRecruiterDisplayName(options.actorUser);
  const interviewAtMs = parseInterviewDatetime(prospect);
  const timezone = prospect.timezone || options.timezone || DEFAULT_TIMEZONE;

  const context = {
    language,
    prospectName: prospect.name,
    recruiterName,
    interviewAtMs,
    timezone,
    office: getOrganizationSettings().office,
    interviewType: prospect.interview_type || null
  };

  if (
    template === WHATSAPP_TEMPLATES.ZOOM_INVITATION ||
    (template === WHATSAPP_TEMPLATES.INTERVIEW_REMINDER &&
      String(prospect.interview_type || "")
        .toLowerCase()
        .includes("zoom"))
  ) {
    let zoomUrl = null;

    try {
      zoomUrl = await meetingManagementService.resolveJoinUrlForProspect(
        organizationId,
        prospect.phone
      );
    } catch (error) {
      console.error("[whatsappCommunication] resolveJoinUrlForProspect failed:", error.message);
    }

    if (!zoomUrl) {
      return {
        error: buildError(
          "MEETING_URL_NOT_CONFIGURED",
          "No meeting link is available. Configure a personal meeting URL under Organization settings.",
          { template, resourceKey: "zoomInterviewUrl" }
        )
      };
    }

    context.zoomUrl = zoomUrl;
  }

  const message = composeWhatsAppMessage(template, context);

  return {
    template,
    message,
    language,
    phone: prospect.phone,
    zoomUrl: context.zoomUrl || null
  };
}

async function previewWhatsAppCommunication(phone, params = {}, options = {}) {
  if (!isProductionProspect(phone)) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const prospect = await resolveTenantProspect(phone, options);

  if (!prospect) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const template = resolveTemplate({
    template: params.template,
    sourceAction: params.sourceAction,
    prospect
  });

  const built = await buildMessageContext(prospect, template, options);

  if (built.error) {
    return built.error;
  }

  return buildSuccess("Message ready.", built);
}

async function recordWhatsAppCopyOpen(phone, params = {}, options = {}) {
  if (!isProductionProspect(phone)) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const prospect = await resolveTenantProspect(phone, options);

  if (!prospect) {
    return buildError("PROSPECT_NOT_FOUND", "Prospect not found.");
  }

  const agentState = loadAgentState(phone);
  const template = resolveTemplate({
    template: params.template,
    sourceAction: params.sourceAction,
    prospect
  });

  const built = await buildMessageContext(prospect, template, options);

  if (built.error) {
    return built.error;
  }

  const timelineLabel =
    template === WHATSAPP_TEMPLATES.ZOOM_INVITATION
      ? "Agent prepared Zoom invitation via WhatsApp"
      : template === WHATSAPP_TEMPLATES.OFFICE_LOCATION
        ? "Agent prepared office location via WhatsApp"
        : template === WHATSAPP_TEMPLATES.MISSED_APPOINTMENT
          ? "Agent prepared missed appointment follow-up via WhatsApp"
          : template === WHATSAPP_TEMPLATES.INTERVIEW_REMINDER
            ? "Agent prepared interview reminder via WhatsApp"
            : "Agent opened WhatsApp conversation";

  await logAgentTimeline(prospect, buildAgentActionTimelineMessage(timelineLabel));

  let workflowPatch = {};
  const flagKey = getTemplateFlagKey(template);

  if (flagKey) {
    workflowPatch = {
      flags: { [flagKey]: true }
    };

    if (template === WHATSAPP_TEMPLATES.MISSED_APPOINTMENT) {
      workflowPatch.outcome = "No Show";
    }
  }

  const workflowState =
    Object.keys(workflowPatch).length > 0
      ? mergeAgentState(phone, workflowPatch)
      : agentState;

  return buildSuccess("WhatsApp message prepared.", {
    template,
    sourceAction: params.sourceAction || null,
    workflowState: {
      flags: workflowState.flags,
      outcome: workflowState.outcome
    }
  });
}

module.exports = {
  previewWhatsAppCommunication,
  recordWhatsAppCopyOpen,
  DELIVERY_MODES
};
