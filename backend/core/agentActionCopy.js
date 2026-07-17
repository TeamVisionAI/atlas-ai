const { getOfficeLocation } = require("./businessRulesEngine");
const { getOrganizationSettings } = require("./organizationSettingsEngine");

function buildZoomLinkMessage({ url, language }) {
  if (language === "es") {
    return `Aquí está el enlace de Zoom para tu entrevista con Team Vision:\n${url}`;
  }

  return `Here is your Team Vision interview Zoom link:\n${url}`;
}

function buildOfficeLocationMessage({ office, language }) {
  const location = office || getOfficeLocation();

  if (language === "es") {
    return `Nuestra oficina de Team Vision está en:\n${location.name}\n${location.fullAddress}`;
  }

  return `Our Team Vision office is located at:\n${location.name}\n${location.fullAddress}`;
}

function buildMissedAppointmentMessage({ name, language }) {
  const greeting = name ? (language === "es" ? `Hola ${name},` : `Hi ${name},`) : "";

  if (language === "es") {
    return `${greeting} notamos que no pudiste asistir a tu entrevista. ¿Te gustaría reprogramarla?`.trim();
  }

  return `${greeting} we noticed you missed your interview. Would you like to reschedule?`.trim();
}

function buildAgentNoteTimelineMessage(text) {
  return `[Agent note] ${text}`;
}

function buildAgentActionTimelineMessage(actionLabel) {
  return `[Agent action] ${actionLabel}`;
}

module.exports = {
  buildZoomLinkMessage,
  buildOfficeLocationMessage,
  buildMissedAppointmentMessage,
  buildAgentNoteTimelineMessage,
  buildAgentActionTimelineMessage
};
