const { evaluateCoverage } = require("./businessRulesEngine");
const {
  getOutsideAreaZoomIntro,
  getLocalInterviewChoiceQuestion
} = require("./teamVisionAppointmentRules");

function buildInterviewPreferenceQuestion(profile, language) {
  const coverage = evaluateCoverage({
    city: profile?.city,
    state: profile?.state
  });

  if (coverage.coverage === "LOCAL") {
    return getLocalInterviewChoiceQuestion(language);
  }

  return getOutsideAreaZoomIntro(language);
}

function buildCoverageScheduleIntro(profile, language) {
  const coverage = evaluateCoverage({
    city: profile?.city,
    state: profile?.state
  });

  if (coverage.coverage === "LOCAL") {
    return "";
  }

  return getOutsideAreaZoomIntro(language);
}

module.exports = {
  buildInterviewPreferenceQuestion,
  buildCoverageScheduleIntro
};
