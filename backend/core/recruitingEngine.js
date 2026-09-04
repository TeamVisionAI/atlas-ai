const {
  evaluateCoverage,
  evaluateWorkAuthorization
} = require("./businessRulesEngine");

function normalize(value = "") {
  return String(value).trim().toLowerCase();
}

function determineInterviewType(city = "", coverageOptions = {}) {
  return evaluateCoverage({ city, ...coverageOptions }).defaultInterviewType;
}

function isInOfficeCoverage(city = "", coverageOptions = {}) {
  return evaluateCoverage({ city, ...coverageOptions }).coverage === "LOCAL";
}

function evaluateCandidate(candidate = {}) {
  const workAuthorization = evaluateWorkAuthorization(
    candidate.workStatus || candidate.workAuthorization
  );

  const interviewType = determineInterviewType(candidate.city, {
    organizationId: candidate.organizationId || candidate.organization_id || null,
    localCities: candidate.localCities,
    coverageCitiesSource: candidate.coverageCitiesSource || null
  });

  return {
    qualified: workAuthorization.qualified,
    interviewType,
    humanReview: workAuthorization.humanReview,
    reviewReason: workAuthorization.reason,
    nextAction: workAuthorization.qualified
      ? "Schedule Interview"
      : "Human Review",
    candidate: {
      name: candidate.name || null,
      city: candidate.city || null,
      state: candidate.state || null,
      occupation: candidate.occupation || null,
      workStatus:
        candidate.workStatus || candidate.workAuthorization || null
    }
  };
}

module.exports = {
  determineInterviewType,
  isInOfficeCoverage,
  evaluateWorkAuthorization,
  evaluateCandidate
};
