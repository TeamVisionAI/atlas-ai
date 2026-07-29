const {
  evaluateInterviewTypeDecision,
  evaluateHumanEscalation,
  detectRequestedInterviewType
} = require("./businessRulesEngine");

function applyBusinessRulesToProfile(profile, message = "", extractedType = null) {
  if (!profile.city || !profile.state) {
    return { profile, escalation: null };
  }

  const explicitRequest = detectRequestedInterviewType(message) || extractedType || null;
  const typeDecision = evaluateInterviewTypeDecision({
    city: profile.city,
    state: profile.state,
    requestedType: explicitRequest,
    currentType: profile.interviewType,
    message
  });

  if (typeDecision.needsHumanCoordinator) {
    return {
      profile: {
        ...profile,
        interviewType: typeDecision.interviewType || profile.interviewType
      },
      escalation: evaluateHumanEscalation({
        needsHumanCoordinator: true,
        outsideInPersonRequest: true,
        reason: typeDecision.reason
      })
    };
  }

  if (typeDecision.autoApplied && typeDecision.interviewType) {
    profile.interviewType = typeDecision.interviewType;
  } else if (typeDecision.interviewType && explicitRequest) {
    profile.interviewType = typeDecision.interviewType;
  } else if (
    typeDecision.interviewType &&
    !profile.interviewType &&
    typeDecision.coverage === "LOCAL"
  ) {
    profile.interviewType = typeDecision.interviewType;
  }

  return { profile, escalation: null };
}

module.exports = {
  applyBusinessRulesToProfile
};
