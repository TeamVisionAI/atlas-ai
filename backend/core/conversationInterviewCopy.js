const { evaluateCoverage } = require("./businessRulesEngine");
const { coverageInputFromProfile } = require("./recruitingCoverage");
const {
  getOutsideAreaZoomIntro,
  getLocalInterviewChoiceQuestion
} = require("./teamVisionAppointmentRules");

function buildInterviewPreferenceQuestion(profile, language) {
  const coverage = evaluateCoverage(coverageInputFromProfile(profile));

  if (coverage.coverage === "LOCAL") {
    return getLocalInterviewChoiceQuestion(language);
  }

  return getOutsideAreaZoomIntro(language);
}

function buildCoverageScheduleIntro(profile, language) {
  const coverage = evaluateCoverage(coverageInputFromProfile(profile));

  if (coverage.coverage === "LOCAL") {
    return "";
  }

  return getOutsideAreaZoomIntro(language);
}

module.exports = {
  buildInterviewPreferenceQuestion,
  buildCoverageScheduleIntro
};
