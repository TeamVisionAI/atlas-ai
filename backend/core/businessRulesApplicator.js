const {
  evaluateInterviewTypeDecision,
  evaluateHumanEscalation,
  detectRequestedInterviewType
} = require("./businessRulesEngine");

function applyBusinessRulesToProfile(profile, message = "", extractedType = null) {
  if (!profile.city) {
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

  if (typeDecision.interviewType) {
    profile.interviewType = typeDecision.interviewType;
  }

  return { profile, escalation: null };
}

module.exports = {
  applyBusinessRulesToProfile
};
