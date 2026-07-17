const { evaluateSchedulingApproach } = require("./businessRulesEngine");
const { isScheduleComplete } = require("./informationModel");
const { PHASES } = require("./schedulingEngine");

function buildHumanCoordinatorReply(reason, language) {
  if (reason === "SPECIAL_MEETING_REQUEST") {
    return language === "es"
      ? "Entendido. Un agente de Team Vision se comunicará contigo para coordinar una entrevista presencial."
      : "Understood. A Team Vision agent will contact you to coordinate an in-person interview.";
  }

  if (reason === "OUTSIDE_SCHEDULING_WINDOW") {
    return language === "es"
      ? "Ese horario está fuera de nuestro horario habitual (9:00 AM – 8:30 PM). Un agente de Team Vision se comunicará contigo para coordinarlo."
      : "That time is outside our usual scheduling window (9:00 AM – 8:30 PM). A Team Vision agent will contact you to coordinate it.";
  }

  return language === "es"
    ? "Un agente de Team Vision se comunicará contigo para ayudarte con los próximos pasos."
    : "A Team Vision agent will contact you to help with the next steps.";
}

function buildCoverageScheduleIntro(profile, language) {
  const approach = evaluateSchedulingApproach({
    city: profile.city,
    state: profile.state,
    occupation: profile.occupation
  });

  if (language === "es") {
    if (approach.messageKey === "LOCAL_DEFAULT") {
      return "Perfecto. Estamos realizando las entrevistas en nuestras oficinas en Doral.";
    }

    return "Perfecto. Estamos realizando las entrevistas por Zoom.";
  }

  if (approach.messageKey === "LOCAL_DEFAULT") {
    return "Perfect. We're conducting interviews at our Doral office.";
  }

  return "Perfect. We're conducting interviews via Zoom.";
}

function buildAtlasBriefSummary({
  profile,
  prospect,
  schedulingState,
  handoff,
  missingFields,
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

  if (missingFields.length) {
    lines.push(`Waiting for: ${missingFields.join(", ")}`);
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
  buildAtlasBriefSummary
};
