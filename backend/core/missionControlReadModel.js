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
const { buildHandoff } = require("./conversationEngine");
const { detectIntent } = require("./intentEngine");
const { parseSchedulingState } = require("./schedulingState");
const { detectLanguage } = require("./semanticConversationEngine");
const { applyBusinessRulesToProfile } = require("./businessRulesApplicator");
const { evaluateCoverage } = require("./businessRulesEngine");
const {
  buildProfileFromProspect,
  getMissingFields,
  deriveCurrentStep,
  getEffectiveInterviewType,
  emailRequired
} = require("./informationModel");
const { buildAtlasBriefSummary } = require("./conversationCopy");

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
  const profile = buildProfileFromProspect(prospect, channel);
  const schedulingState = parseSchedulingState(prospect.notes);
  const lastMessage =
    options.latestMessage?.text || prospect.last_message || "";
  const { profile: ruledProfile } = applyBusinessRulesToProfile(
    { ...profile },
    lastMessage
  );

  const currentStep = deriveCurrentStep(ruledProfile, schedulingState);
  const missingFields = getMissingFields(ruledProfile);
  const interviewType = getEffectiveInterviewType(ruledProfile, lastMessage);
  const intent = detectIntent(lastMessage);
  const language = detectLanguage(prospect, lastMessage);
  const coverage = evaluateCoverage({
    city: ruledProfile.city,
    state: ruledProfile.state
  });
  const handoff = buildHandoff(prospect);
  const requiresEmail = emailRequired({
    ...ruledProfile,
    interviewType
  });

  return {
    prospect: {
      name: prospect.name || null,
      phone: prospect.phone,
      city: ruledProfile.city,
      state: ruledProfile.state,
      occupation: ruledProfile.occupation
    },
    brain: {
      language,
      intent,
      currentStep,
      interviewType,
      missingFields
    },
    businessRules: {
      localProspect: coverage.coverage === "LOCAL",
      interviewType,
      workAuthorization: ruledProfile.authorization,
      emailRequired: requiresEmail
    },
    atlasBrief: {
      summary: buildAtlasBriefSummary({
        profile: ruledProfile,
        prospect,
        schedulingState,
        handoff,
        missingFields,
        currentStep
      })
    }
  };
}

module.exports = {
  getMissionControlState,
  resolveProspect
};
