/**
 * Reusable WhatsApp communication engine — message templates and composition.
 * Supports copy+open today; automatic Cloud API delivery later (same templates).
 * Implements BR-027, BR-029.
 */

const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const { getOfficeLocation } = require("./businessRulesEngine");
const { getOrganizationSettings, resolveOrganizationDisplayName } = require("./organizationSettingsEngine");

const WHATSAPP_TEMPLATES = Object.freeze({
  ZOOM_INVITATION: "zoom_invitation",
  OFFICE_LOCATION: "office_location",
  MISSED_APPOINTMENT: "missed_appointment",
  INTERVIEW_REMINDER: "interview_reminder",
  INTERVIEW_DETAILS: "interview_details",
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
  send_interview_reminder: WHATSAPP_TEMPLATES.INTERVIEW_REMINDER,
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

function extractTimezoneAbbreviation(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short"
    });
    const parts = formatter.formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value || timezone;
  } catch {
    return timezone;
  }
}

function formatTimezoneLabel(timezone, language) {
  try {
    const abbreviation = extractTimezoneAbbreviation(timezone);

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
    timezoneAbbreviation: extractTimezoneAbbreviation(timezone),
    timezoneLabel: formatTimezoneLabel(timezone, language)
  };
}

function resolveOrganizationName(context = {}) {
  if (context.organizationName) {
    return context.organizationName;
  }

  return resolveOrganizationDisplayName(context.office || getOrganizationSettings().office);
}

function normalizeInterviewChannel(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("virtual")) {
    return "zoom";
  }

  if (
    normalized.includes("office") ||
    normalized.includes("person") ||
    normalized.includes("public") ||
    normalized.includes("in person") ||
    normalized.includes("in_person")
  ) {
    return "office";
  }

  return null;
}

function resolveInterviewTypeFromAppointment(appointment, prospect = null) {
  if (appointment?.meetingType === "virtual") {
    return "zoom";
  }

  if (appointment?.meetingType === "in_person") {
    return "office";
  }

  if (appointment?.meetingLocationType === "office") {
    return "office";
  }

  return (
    normalizeInterviewChannel(appointment?.meetingProvider) ||
    normalizeInterviewChannel(prospect?.interview_type) ||
    normalizeInterviewChannel(prospect?.interviewType) ||
    "zoom"
  );
}

function resolveInterviewDetailsTemplate() {
  return WHATSAPP_TEMPLATES.INTERVIEW_DETAILS;
}

function resolveInterviewReminderTemplate() {
  return WHATSAPP_TEMPLATES.INTERVIEW_REMINDER;
}

function resolveZoomInvitationTemplate() {
  return WHATSAPP_TEMPLATES.ZOOM_INVITATION;
}

function resolveOfficeLocationTemplate() {
  return WHATSAPP_TEMPLATES.OFFICE_LOCATION;
}

function buildInterviewDetailsMessage({
  prospectName,
  interviewAtMs,
  timezone = DEFAULT_TIMEZONE,
  recruiterName,
  zoomUrl,
  office,
  interviewType,
  organizationName,
  language
}) {
  const firstName = getFirstName(prospectName);
  const greeting = firstName
    ? language === "es"
      ? `Hola ${firstName},`
      : `Hello ${firstName},`
    : language === "es"
      ? "Hola,"
      : "Hello,";

  const schedule = interviewAtMs
    ? formatInterviewSchedule(interviewAtMs, timezone, language)
    : null;

  const representativeName = recruiterName || "";
  const organizationDisplayName = organizationName || resolveOrganizationName({ office });
  const channel = normalizeInterviewChannel(interviewType) || "zoom";
  const location = office || getOrganizationSettings().office;

  if (language === "es") {
    const lines = [greeting, "", "¡Tu entrevista está confirmada!", ""];

    if (schedule) {
      lines.push(
        "📅 Fecha:",
        schedule.dateLine,
        "",
        "🕚 Hora:",
        `${schedule.timeLine} (${schedule.timezoneAbbreviation})`,
        ""
      );
    }

    if (representativeName) {
      lines.push("👤 Entrevistador:", representativeName, "");
    }

    if (channel === "zoom" && zoomUrl) {
      lines.push("🔗 Únete aquí:", zoomUrl, "");
    } else if (location?.fullAddress) {
      lines.push("📍 Ubicación:", location.name, location.fullAddress, "");
    }

    lines.push(
      "Si tienes alguna pregunta antes de la entrevista, no dudes en responder este mensaje.",
      "",
      "¡Esperamos conversar contigo!",
      "",
      "—",
      representativeName,
      organizationDisplayName
    );

    return lines.join("\n");
  }

  const lines = [greeting, "", "Your interview is confirmed!", ""];

  if (schedule) {
    lines.push(
      "📅 Date:",
      schedule.dateLine,
      "",
      "🕚 Time:",
      `${schedule.timeLine} (${schedule.timezoneAbbreviation})`,
      ""
    );
  }

  if (representativeName) {
    lines.push("👤 Interviewer:", representativeName, "");
  }

  if (channel === "zoom" && zoomUrl) {
    lines.push("🔗 Join here:", zoomUrl, "");
  } else if (location?.fullAddress) {
    lines.push("📍 Location:", location.name, location.fullAddress, "");
  }

  lines.push(
    "If you have any questions before the interview, feel free to reply to this message.",
    "",
    "We look forward to speaking with you!",
    "",
    "—",
    representativeName,
    organizationDisplayName
  );

  return lines.join("\n");
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

  const recruiter = recruiterName || resolveOrganizationName();
  const orgName = resolveOrganizationName();

  if (language === "es") {
    const lines = [
      greeting,
      "",
      `¡Tu entrevista con ${orgName} está confirmada!`,
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
      orgName
    );

    return lines.join("\n");
  }

  const lines = [greeting, "", `Your ${orgName} interview is confirmed!`, ""];

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
    orgName
  );

  return lines.join("\n");
}

function buildOfficeLocationInvitationMessage({ office, language, organizationName }) {
  const location = office || getOrganizationSettings().office;
  const orgName = organizationName || resolveOrganizationName({ office: location });

  if (language === "es") {
    return [
      "Hola,",
      "",
      `Nuestra oficina de ${orgName} está en:`,
      location.name,
      location.fullAddress,
      "",
      "Te esperamos en tu entrevista.",
      "",
      orgName
    ].join("\n");
  }

  return [
    "Hi,",
    "",
    `Our ${orgName} office is located at:`,
    location.name,
    location.fullAddress,
    "",
    "We look forward to seeing you at your interview.",
    "",
    orgName
  ].join("\n");
}

function buildMissedAppointmentInvitationMessage({ prospectName, language, organizationName }) {
  const firstName = getFirstName(prospectName);
  const greeting = firstName
    ? language === "es"
      ? `Hola ${firstName},`
      : `Hi ${firstName},`
    : language === "es"
      ? "Hola,"
      : "Hi,";

  const orgName = organizationName || resolveOrganizationName();

  if (language === "es") {
    return [
      greeting,
      "",
      "Notamos que no pudiste asistir a tu entrevista. ¿Te gustaría reprogramarla?",
      "",
      orgName
    ].join("\n");
  }

  return [
    greeting,
    "",
    "We noticed you missed your interview. Would you like to reschedule?",
    "",
    orgName
  ].join("\n");
}

function buildInterviewReminderMessage({
  prospectName,
  interviewAtMs,
  timezone = DEFAULT_TIMEZONE,
  recruiterName,
  zoomUrl,
  office,
  interviewType,
  organizationName,
  language
}) {
  const firstName = getFirstName(prospectName);
  const greeting = firstName
    ? language === "es"
      ? `Hola ${firstName},`
      : `Hello ${firstName},`
    : language === "es"
      ? "Hola,"
      : "Hello,";

  const schedule = interviewAtMs
    ? formatInterviewSchedule(interviewAtMs, timezone, language)
    : null;

  const representativeName = recruiterName || "";
  const organizationDisplayName = organizationName || resolveOrganizationName({ office });
  const channel = normalizeInterviewChannel(interviewType) || "zoom";
  const location = office || getOrganizationSettings().office;

  if (language === "es") {
    const lines = [greeting, "", "Te recuerdo que tu entrevista está programada para:", ""];

    if (schedule) {
      lines.push(
        "📅 Fecha:",
        schedule.dateLine,
        "",
        "🕔 Hora:",
        `${schedule.timeLine} (${schedule.timezoneAbbreviation})`,
        ""
      );
    }

    if (channel === "zoom" && zoomUrl) {
      lines.push("🔗 Únete aquí:", zoomUrl, "");
    } else if (location?.fullAddress) {
      lines.push("📍 Ubicación:", location.name, location.fullAddress, "");
    }

    lines.push(
      "Si tienes alguna pregunta antes de la entrevista, puedes responderme por este medio.",
      "",
      "¡Nos vemos pronto!",
      "",
      "—",
      representativeName,
      organizationDisplayName
    );

    return lines.join("\n");
  }

  const lines = [
    greeting,
    "",
    "This is a reminder that your interview is scheduled for:",
    ""
  ];

  if (schedule) {
    lines.push(
      "📅 Date:",
      schedule.dateLine,
      "",
      "🕔 Time:",
      `${schedule.timeLine} (${schedule.timezoneAbbreviation})`,
      ""
    );
  }

  if (channel === "zoom" && zoomUrl) {
    lines.push("🔗 Join here:", zoomUrl, "");
  } else if (location?.fullAddress) {
    lines.push("📍 Location:", location.name, location.fullAddress, "");
  }

  lines.push(
    "If you have any questions before the interview, feel free to reply to this message.",
    "",
    "See you soon!",
    "",
    "—",
    representativeName,
    organizationDisplayName
  );

  return lines.join("\n");
}

function buildGeneralWhatsAppMessage({ prospectName, recruiterName, language, organizationName }) {
  const firstName = getFirstName(prospectName);
  const greeting = firstName
    ? language === "es"
      ? `Hola ${firstName},`
      : `Hi ${firstName},`
    : language === "es"
      ? "Hola,"
      : "Hi,";

  const recruiter = recruiterName || resolveOrganizationName();
  const orgName = organizationName || resolveOrganizationName();

  if (language === "es") {
    return [
      greeting,
      "",
      `Soy ${recruiter} de ${orgName}. Quería dar seguimiento a tu proceso de entrevista.`,
      "",
      "Avísame si tienes alguna pregunta.",
      "",
      orgName
    ].join("\n");
  }

  return [
    greeting,
    "",
    `This is ${recruiter} from ${orgName}. I wanted to follow up with you about your interview process.`,
    "",
    "Let me know if you have any questions!",
    "",
    orgName
  ].join("\n");
}

function buildStubTemplateMessage(templateId, language, organizationName) {
  const label = templateId.replace(/_/g, " ");
  const orgName = organizationName || resolveOrganizationName();

  if (language === "es") {
    return `Hola,\n\n[Mensaje ${label} — plantilla pendiente]\n\n${orgName}`;
  }

  return `Hi,\n\n[${label} message — template pending]\n\n${orgName}`;
}

function resolveTemplateForAction(actionId) {
  return ACTION_TO_TEMPLATE[actionId] || WHATSAPP_TEMPLATES.GENERAL;
}

function composeWhatsAppMessage(templateId, context = {}) {
  const language = context.language || "en";
  const organizationName = resolveOrganizationName(context);

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
        language,
        organizationName
      });

    case WHATSAPP_TEMPLATES.MISSED_APPOINTMENT:
      return buildMissedAppointmentInvitationMessage({
        prospectName: context.prospectName,
        language,
        organizationName
      });

    case WHATSAPP_TEMPLATES.INTERVIEW_REMINDER:
      return buildInterviewReminderMessage({
        prospectName: context.prospectName,
        interviewAtMs: context.interviewAtMs,
        timezone: context.timezone || DEFAULT_TIMEZONE,
        recruiterName: context.recruiterName,
        zoomUrl: context.zoomUrl,
        office: context.office,
        interviewType: context.interviewType,
        organizationName,
        language
      });

    case WHATSAPP_TEMPLATES.INTERVIEW_DETAILS:
      return buildInterviewDetailsMessage({
        prospectName: context.prospectName,
        interviewAtMs: context.interviewAtMs,
        timezone: context.timezone || DEFAULT_TIMEZONE,
        recruiterName: context.recruiterName,
        zoomUrl: context.zoomUrl,
        office: context.office,
        interviewType: context.interviewType,
        organizationName,
        language
      });

    case WHATSAPP_TEMPLATES.APPOINTMENT_REMINDER:
    case WHATSAPP_TEMPLATES.FOLLOW_UP:
    case WHATSAPP_TEMPLATES.ORIENTATION_INVITATION:
      return buildStubTemplateMessage(templateId, language, organizationName);

    case WHATSAPP_TEMPLATES.GENERAL:
    default:
      return buildGeneralWhatsAppMessage({
        prospectName: context.prospectName,
        recruiterName: context.recruiterName,
        language,
        organizationName
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
  resolveInterviewDetailsTemplate,
  resolveInterviewReminderTemplate,
  resolveZoomInvitationTemplate,
  resolveOfficeLocationTemplate,
  resolveInterviewTypeFromAppointment,
  composeWhatsAppMessage,
  getTemplateFlagKey,
  resolveRecruiterDisplayName,
  resolveOrganizationName,
  formatInterviewSchedule,
  extractTimezoneAbbreviation,
  buildZoomInvitationMessage,
  buildOfficeLocationInvitationMessage,
  buildMissedAppointmentInvitationMessage,
  buildInterviewReminderMessage,
  buildInterviewDetailsMessage,
  buildGeneralWhatsAppMessage
};
