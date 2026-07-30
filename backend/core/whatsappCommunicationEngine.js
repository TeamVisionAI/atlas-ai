/**
 * Reusable WhatsApp communication engine — message templates and composition.
 * Supports copy+open today; automatic Cloud API delivery later (same templates).
 * Implements BR-027, BR-029.
 */

const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const { getOfficeLocation } = require("./businessRulesEngine");
const { getOrganizationSettings } = require("./organizationSettingsEngine");

const WHATSAPP_TEMPLATES = Object.freeze({
  ZOOM_INVITATION: "zoom_invitation",
  OFFICE_LOCATION: "office_location",
  MISSED_APPOINTMENT: "missed_appointment",
  INTERVIEW_REMINDER: "interview_reminder",
  APPOINTMENT_REMINDER: "appointment_reminder",
  FOLLOW_UP: "follow_up",
  ORIENTATION_INVITATION: "orientation_invitation",
  GENERAL: "general"
});

const DELIVERY_MODES = Object.freeze({
  COPY_OPEN: "copy_open",
  AUTOMATIC: "automatic"
});

const ACTION_TO_TEMPLATE = Object.freeze({
  send_zoom_link: WHATSAPP_TEMPLATES.ZOOM_INVITATION,
  send_office_location: WHATSAPP_TEMPLATES.OFFICE_LOCATION,
  send_missed_appointment: WHATSAPP_TEMPLATES.MISSED_APPOINTMENT,
  whatsapp: WHATSAPP_TEMPLATES.GENERAL
});

const TEMPLATE_FLAG_KEYS = Object.freeze({
  [WHATSAPP_TEMPLATES.ZOOM_INVITATION]: "zoom_link_sent",
  [WHATSAPP_TEMPLATES.OFFICE_LOCATION]: "office_location_sent",
  [WHATSAPP_TEMPLATES.MISSED_APPOINTMENT]: "missed_appointment_sent"
});

const DEFAULT_TIMEZONE = "America/New_York";

function getFirstName(name) {
  const trimmed = String(name || "").trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.split(/\s+/)[0];
}

function formatTimezoneLabel(timezone, language) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short"
    });
    const parts = formatter.formatToParts(new Date());
    const abbreviation = parts.find((part) => part.type === "timeZoneName")?.value || timezone;

    if (language === "es") {
      if (timezone === "America/New_York") {
        return `Hora del Este (${abbreviation})`;
      }

      return `${timezone} (${abbreviation})`;
    }

    if (timezone === "America/New_York") {
      return `Eastern Time (${abbreviation})`;
    }

    return `${timezone} (${abbreviation})`;
  } catch {
    return timezone;
  }
}

function formatInterviewSchedule(timestampMs, timezone, language) {
  const locale = language === "es" ? "es-US" : "en-US";
  const date = new Date(timestampMs);

  return {
    dateLine: date.toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: timezone
    }),
    timeLine: date.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone
    }),
    timezoneLabel: formatTimezoneLabel(timezone, language)
  };
}

function buildZoomInvitationMessage({
  prospectName,
  interviewAtMs,
  timezone = DEFAULT_TIMEZONE,
  recruiterName,
  zoomUrl,
  language
}) {
  const firstName = getFirstName(prospectName);
  const greeting = firstName
    ? language === "es"
      ? `Hola ${firstName},`
      : `Hi ${firstName},`
    : language === "es"
      ? "Hola,"
      : "Hi,";

  const schedule = interviewAtMs
    ? formatInterviewSchedule(interviewAtMs, timezone, language)
    : null;

  const recruiter = recruiterName || "Team Vision";

  if (language === "es") {
    const lines = [
      greeting,
      "",
      "¡Tu entrevista con Team Vision está confirmada!",
      ""
    ];

    if (schedule) {
      lines.push(
        `Fecha: ${schedule.dateLine}`,
        `Hora: ${schedule.timeLine}`,
        `Zona horaria: ${schedule.timezoneLabel}`,
        ""
      );
    }

    lines.push(
      `Reclutador/a: ${recruiter}`,
      "",
      "Únete a tu entrevista aquí:",
      zoomUrl,
      "",
      "¡Esperamos conversar contigo!",
      "",
      "Team Vision"
    );

    return lines.join("\n");
  }

  const lines = [greeting, "", "Your Team Vision interview is confirmed!", ""];

  if (schedule) {
    lines.push(
      `Date: ${schedule.dateLine}`,
      `Time: ${schedule.timeLine}`,
      `Time Zone: ${schedule.timezoneLabel}`,
      ""
    );
  }

  lines.push(
    `Recruiter: ${recruiter}`,
    "",
    "Join your interview here:",
    zoomUrl,
    "",
    "We look forward to speaking with you!",
    "",
    "Team Vision"
  );

  return lines.join("\n");
}

function buildOfficeLocationInvitationMessage({ office, language }) {
  const location = office || getOrganizationSettings().office;

  if (language === "es") {
    return [
      "Hola,",
      "",
      "Nuestra oficina de Team Vision está en:",
      location.name,
      location.fullAddress,
      "",
      "Te esperamos en tu entrevista.",
      "",
      "Team Vision"
    ].join("\n");
  }

  return [
    "Hi,",
    "",
    "Our Team Vision office is located at:",
    location.name,
    location.fullAddress,
    "",
    "We look forward to seeing you at your interview.",
    "",
    "Team Vision"
  ].join("\n");
}

function buildMissedAppointmentInvitationMessage({ prospectName, language }) {
  const firstName = getFirstName(prospectName);
  const greeting = firstName
    ? language === "es"
      ? `Hola ${firstName},`
      : `Hi ${firstName},`
    : language === "es"
      ? "Hola,"
      : "Hi,";

  if (language === "es") {
    return [
      greeting,
      "",
      "Notamos que no pudiste asistir a tu entrevista. ¿Te gustaría reprogramarla?",
      "",
      "Team Vision"
    ].join("\n");
  }

  return [
    greeting,
    "",
    "We noticed you missed your interview. Would you like to reschedule?",
    "",
    "Team Vision"
  ].join("\n");
}

function buildGeneralWhatsAppMessage({ prospectName, recruiterName, language }) {
  const firstName = getFirstName(prospectName);
  const greeting = firstName
    ? language === "es"
      ? `Hola ${firstName},`
      : `Hi ${firstName},`
    : language === "es"
      ? "Hola,"
      : "Hi,";

  const recruiter = recruiterName || "Team Vision";

  if (language === "es") {
    return [
      greeting,
      "",
      `Soy ${recruiter} de Team Vision. Quería dar seguimiento a tu proceso de entrevista.`,
      "",
      "Avísame si tienes alguna pregunta.",
      "",
      "Team Vision"
    ].join("\n");
  }

  return [
    greeting,
    "",
    `This is ${recruiter} from Team Vision. I wanted to follow up with you about your interview process.`,
    "",
    "Let me know if you have any questions!",
    "",
    "Team Vision"
  ].join("\n");
}

function buildStubTemplateMessage(templateId, language) {
  const label = templateId.replace(/_/g, " ");

  if (language === "es") {
    return `Hola,\n\n[Mensaje ${label} — plantilla pendiente]\n\nTeam Vision`;
  }

  return `Hi,\n\n[${label} message — template pending]\n\nTeam Vision`;
}

function resolveContextTemplate(prospect) {
  const interviewType = String(prospect?.interview_type || "").toLowerCase();

  if (interviewType.includes("zoom") && parseInterviewDatetime(prospect)) {
    return WHATSAPP_TEMPLATES.ZOOM_INVITATION;
  }

  return WHATSAPP_TEMPLATES.GENERAL;
}

function resolveTemplateForAction(actionId, prospect) {
  if (actionId === "whatsapp") {
    return resolveContextTemplate(prospect);
  }

  return ACTION_TO_TEMPLATE[actionId] || WHATSAPP_TEMPLATES.GENERAL;
}

function composeWhatsAppMessage(templateId, context = {}) {
  const language = context.language || "en";

  switch (templateId) {
    case WHATSAPP_TEMPLATES.ZOOM_INVITATION:
      return buildZoomInvitationMessage({
        prospectName: context.prospectName,
        interviewAtMs: context.interviewAtMs,
        timezone: context.timezone || DEFAULT_TIMEZONE,
        recruiterName: context.recruiterName,
        zoomUrl: context.zoomUrl,
        language
      });

    case WHATSAPP_TEMPLATES.OFFICE_LOCATION:
      return buildOfficeLocationInvitationMessage({
        office: context.office,
        language
      });

    case WHATSAPP_TEMPLATES.MISSED_APPOINTMENT:
      return buildMissedAppointmentInvitationMessage({
        prospectName: context.prospectName,
        language
      });

    case WHATSAPP_TEMPLATES.INTERVIEW_REMINDER:
    case WHATSAPP_TEMPLATES.APPOINTMENT_REMINDER:
    case WHATSAPP_TEMPLATES.FOLLOW_UP:
    case WHATSAPP_TEMPLATES.ORIENTATION_INVITATION:
      return buildStubTemplateMessage(templateId, language);

    case WHATSAPP_TEMPLATES.GENERAL:
    default:
      return buildGeneralWhatsAppMessage({
        prospectName: context.prospectName,
        recruiterName: context.recruiterName,
        language
      });
  }
}

function getTemplateFlagKey(templateId) {
  return TEMPLATE_FLAG_KEYS[templateId] || null;
}

function resolveRecruiterDisplayName(actorUser) {
  if (!actorUser) {
    return null;
  }

  const displayName = String(actorUser.display_name || "").trim();

  if (displayName) {
    return displayName;
  }

  const parts = [actorUser.first_name, actorUser.last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return parts.length ? parts.join(" ") : null;
}

module.exports = {
  WHATSAPP_TEMPLATES,
  DELIVERY_MODES,
  ACTION_TO_TEMPLATE,
  DEFAULT_TIMEZONE,
  resolveTemplateForAction,
  composeWhatsAppMessage,
  getTemplateFlagKey,
  resolveRecruiterDisplayName,
  buildZoomInvitationMessage,
  buildOfficeLocationInvitationMessage,
  buildMissedAppointmentInvitationMessage,
  buildGeneralWhatsAppMessage
};
