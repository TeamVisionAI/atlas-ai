const { evaluateSchedulingApproach } = require("./businessRulesEngine");
const { isScheduleComplete } = require("./informationModel");
const { PHASES } = require("./schedulingEngine");
const {
  resolveTeamMemberPhrase,
  capitalizePhrase
} = require("./recruitAiV2/tenantBranding");

function buildHumanCoordinatorReply(reason, language, branding = {}) {
  const { getHumanAssistReply } = require("./teamVisionAppointmentRules");
  const teamMemberPhrase = resolveTeamMemberPhrase({
    organizationId: branding.organizationId || null,
    organizationName: branding.organizationName || null,
    language: language === "es" ? "spanish" : "english"
  });
  const TeamMemberPhrase = capitalizePhrase(teamMemberPhrase);

  if (
    reason === "SPECIAL_MEETING_REQUEST" ||
    reason === "ZOOM_ACCESS_FAILED" ||
    reason === "UNUSUAL_MEETING_METHOD" ||
    reason === "PROSPECT_REQUESTS_AGENT"
  ) {
    return getHumanAssistReply(language);
  }

  if (reason === "OUTSIDE_SCHEDULING_WINDOW") {
    return language === "es"
      ? `Ese horario está fuera de nuestro horario habitual (9:00 AM – 8:30 PM). ${TeamMemberPhrase} se comunicará contigo para coordinarlo.`
      : `That time is outside our usual scheduling window (9:00 AM – 8:30 PM). ${TeamMemberPhrase} will contact you to coordinate it.`;
  }

  return language === "es"
    ? `${TeamMemberPhrase} se comunicará contigo para ayudarte con los próximos pasos.`
    : `${TeamMemberPhrase} will contact you to help with the next steps.`;
}

const {
  buildCoverageScheduleIntro: buildCoverageScheduleIntroFromProfile,
  buildInterviewPreferenceQuestion
} = require("./conversationInterviewCopy");

function buildCoverageScheduleIntro(profile, language) {
  return buildCoverageScheduleIntroFromProfile(profile, language);
}

function buildAtlasBriefSummary({
  profile,
  prospect,
  schedulingState,
  handoff,
  missingFields,
  nextField,
  currentStep
}) {
  const lines = [];

  if (profile.city) {
    const location = profile.state ? `${profile.city}, ${profile.state}` : profile.city;
    lines.push(`Prospect from ${location}`);
  }

  if (prospect?.name) {
    lines.push(`Lead: ${prospect.name}`);
  }

  if (handoff?.handoffReady) {
    lines.push("Ready for agent handoff");
  } else if (currentStep === "CONFIRMED") {
    lines.push("Interview confirmed");
  }

  if (nextField) {
    lines.push(`Next field: ${nextField}`);
  } else if (missingFields.length) {
    lines.push(`Remaining: ${missingFields.join(", ")}`);
  }

  if (isScheduleComplete(profile)) {
    const scheduled = [profile.appointmentDate, profile.preferredTime].filter(Boolean).join(" ");
    lines.push(scheduled ? `Scheduled: ${scheduled}` : "Interview scheduled");
  } else if (schedulingState?.phase && schedulingState.phase !== PHASES.DAY) {
    lines.push(`Scheduling in progress (${schedulingState.phase})`);
  } else {
    lines.push("Interview not scheduled");
  }

  return lines;
}

module.exports = {
  buildHumanCoordinatorReply,
  buildCoverageScheduleIntro,
  buildInterviewPreferenceQuestion,
  buildAtlasBriefSummary
};
