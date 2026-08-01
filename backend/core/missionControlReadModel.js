/**
 * Sprint 19 — Mission Control read model (domain layer).
 * Sprint 19.1 — Tenant-scoped prospect resolution for authenticated paths.
 */

const {
  findProspectForSystemIngress,
  findProspectInOrganization,
  findLatestActiveProspectInOrganization
} = require("../services/supabaseService");
const {
  requireTenantOrganizationId,
  isTenantScopedRequest
} = require("./tenantProspectLookup");
const { detectIntent } = require("./intentEngine");
const { detectLanguage } = require("./semanticConversationEngine");
const { buildQualificationBrain } = require("./informationModel");
const {
  formatPreferredLanguageLabel,
  resolveProspectPreferredLanguage
} = require("./prospectLanguage");

async function resolveProspect(phone, organizationId = null, options = {}) {
  const tenantScoped = isTenantScopedRequest(options);

  if (tenantScoped) {
    requireTenantOrganizationId(organizationId);
  }

  if (!phone || phone === "latest") {
    if (tenantScoped) {
      return findLatestActiveProspectInOrganization(organizationId);
    }

    return findLatestActiveProspectInOrganization(null);
  }

  const prospect = tenantScoped
    ? await findProspectInOrganization(phone, organizationId)
    : organizationId
      ? await findProspectInOrganization(phone, organizationId)
      : await findProspectForSystemIngress(phone);

  return prospect || null;
}

async function getMissionControlState(phone, options = {}) {
  const organizationId = options.organizationId || null;
  const prospect = await resolveProspect(phone, organizationId, options);

  if (!prospect) {
    return null;
  }

  const channel = "whatsapp";
  const lastMessage =
    options.latestMessage?.text || prospect.last_message || "";
  const qualification = buildQualificationBrain(prospect, {
    channel,
    message: lastMessage
  });
  const { profile: ruledProfile, missingFields, nextField, currentStep, interviewType } =
    qualification;
  const intent = detectIntent(lastMessage);
  const language = detectLanguage(prospect, lastMessage);
  const { evaluateCoverage } = require("./businessRulesEngine");
  const { emailRequired } = require("./informationModel");
  const coverage = evaluateCoverage({
    city: ruledProfile.city,
    state: ruledProfile.state
  });
  const requiresEmail = emailRequired({
    ...ruledProfile,
    interviewType
  });
  // Implements BR-041 — preferred_language is exposed on prospect; brain.language stays internal.
  const preferredLanguage = resolveProspectPreferredLanguage(prospect);

  return {
    prospect: {
      name: prospect.name || null,
      phone: prospect.phone,
      city: ruledProfile.city,
      state: ruledProfile.state,
      occupation: ruledProfile.occupation,
      preferred_language: preferredLanguage,
      preferred_language_label: formatPreferredLanguageLabel(preferredLanguage)
    },
    brain: {
      language,
      intent,
      currentStep,
      nextField,
      missingFields,
      interviewType,
      dayPart: qualification.dayPart,
      captureState: qualification.captureState,
      canBeginScheduling: qualification.canBeginScheduling,
      schedulingEligibleReason: qualification.schedulingEligibleReason,
      isPreScheduleQualificationComplete: qualification.isPreScheduleQualificationComplete,
      isLocal: qualification.isLocal,
      calendarChecked: qualification.calendarChecked,
      handoffRequired: qualification.handoffRequired,
      handoffReason: qualification.handoffReason
    },
    businessRules: {
      localProspect: coverage.coverage === "LOCAL",
      interviewType,
      workAuthorization: ruledProfile.authorization,
      emailRequired: requiresEmail
    },
    atlasBrief: {
      summary: []
    }
  };
}

module.exports = {
  getMissionControlState,
  resolveProspect
};
