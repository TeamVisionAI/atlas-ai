const {
  findProspect,
  findLatestActiveProspect
} = require("../services/supabaseService");
const { buildHandoff } = require("../core/conversationEngine");
const { detectIntent } = require("../core/intentEngine");
const { parseSchedulingState } = require("../core/schedulingState");
const {
  detectLanguage
} = require("../core/semanticConversationEngine");
const { applyBusinessRulesToProfile } = require("../core/businessRulesApplicator");
const { evaluateCoverage } = require("../core/businessRulesEngine");
const {
  buildProfileFromProspect,
  getMissingFields,
  deriveCurrentStep,
  getEffectiveInterviewType,
  emailRequired
} = require("../core/informationModel");
const { buildAtlasBriefSummary } = require("../core/conversationCopy");

async function resolveProspect(phone) {
  if (!phone || phone === "latest") {
    return findLatestActiveProspect();
  }

  const prospect = await findProspect(phone);

  if (prospect) {
    return prospect;
  }

  return findLatestActiveProspect();
}

async function getMissionControlState(phone) {
  const prospect = await resolveProspect(phone);

  if (!prospect) {
    return null;
  }

  const channel = "whatsapp";
  const profile = buildProfileFromProspect(prospect, channel);
  const schedulingState = parseSchedulingState(prospect.notes);
  const lastMessage = prospect.last_message || "";
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
  getMissionControlState
};
