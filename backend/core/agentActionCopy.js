const { resolveTenantDisplayName } = require("./tenantOperationalIdentity");

function resolveOrganizationLabel(organizationName) {
  return resolveTenantDisplayName({ brandingName: organizationName });
}

function buildZoomLinkMessage({ url, language, organizationName } = {}) {
  const org = resolveOrganizationLabel(organizationName);

  if (language === "es") {
    return `Aquí está el enlace de Zoom para tu entrevista con ${org}:\n${url}`;
  }

  return `Here is your ${org} interview Zoom link:\n${url}`;
}

function buildOfficeLocationMessage({ office, language, organizationName } = {}) {
  const location = office || null;
  if (!location?.fullAddress) {
    return "";
  }
  const org = resolveOrganizationLabel(organizationName || location.name);

  if (language === "es") {
    return `Nuestra oficina de ${org} está en:\n${location.name || org}\n${location.fullAddress}`;
  }

  return `Our ${org} office is located at:\n${location.name || org}\n${location.fullAddress}`;
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
