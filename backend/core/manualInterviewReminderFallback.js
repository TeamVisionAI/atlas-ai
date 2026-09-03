/**
 * Deterministic HUMAN/manual communication fallback.
 * Implements BR-214 / BR-225. Used when communication preview assembly fails.
 * Assigned interviewer name wins. Ana Perez is Team Vision seed default only.
 */

const { isCompleteOfficeAddress } = require("./officeAddressResolver");
const { isTeamVisionSeedTenant } = require("./teamVisionSeedTenant");

const MANUAL_REMINDER_CONTACT_NAME = "Ana Perez";
const NEUTRAL_REMINDER_CONTACT_NAME = Object.freeze({
  en: "our team",
  es: "nuestro equipo"
});

function resolveManualReminderContactName({
  contactName = null,
  organizationId = null,
  language = "es"
} = {}) {
  const provided = String(contactName || "").trim();
  if (provided) {
    return provided;
  }
  if (isTeamVisionSeedTenant(organizationId)) {
    return MANUAL_REMINDER_CONTACT_NAME;
  }
  const lang = language === "en" || language === "english" ? "en" : "es";
  return NEUTRAL_REMINDER_CONTACT_NAME[lang];
}
const MANUAL_COMMUNICATION_PURPOSES = Object.freeze({
  INVITATION: "invitation",
  REMINDER: "reminder",
  ZOOM: "zoom",
  OFFICE: "office"
});

function getFirstName(name) {
  const first = String(name || "")
    .trim()
    .split(/\s+/)
    .find(Boolean);
  if (!first || /unknown|prospect/i.test(first)) {
    return "";
  }
  return first;
}

function isInPersonMeetingMode(meetingMode) {
  const raw = String(meetingMode || "").toLowerCase();
  return (
    raw === "in_person" ||
    raw === "office" ||
    raw.includes("person") ||
    raw.includes("office")
  );
}

function formatReminderWhenParts(startIso, timezone = "America/New_York", language = "es") {
  const locale = language === "en" ? "en-US" : "es-US";
  const date = new Date(startIso);
  if (!startIso || Number.isNaN(date.getTime())) {
    return { weekday: "", date: "", time: "" };
  }
  try {
    return {
      weekday: new Intl.DateTimeFormat(locale, {
        weekday: "long",
        timeZone: timezone
      }).format(date),
      date: new Intl.DateTimeFormat(locale, {
        month: "long",
        day: "numeric",
        timeZone: timezone
      }).format(date),
      time: new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone
      }).format(date)
    };
  } catch {
    return { weekday: "", date: "", time: "" };
  }
}

function resolveOfficeAddressForFallback(officeAddress) {
  const raw = String(officeAddress || "").trim();
  return isCompleteOfficeAddress(raw) ? raw : "";
}

function resolveFallbackFacts({
  prospectName = "",
  startIso = null,
  timezone = "America/New_York",
  meetingMode = "zoom",
  officeAddress = null,
  language = "es",
  contactName = null,
  organizationId = null
} = {}) {
  const firstName = getFirstName(prospectName);
  const lang = language === "en" || language === "english" ? "en" : "es";
  const when = formatReminderWhenParts(startIso, timezone, lang);
  const whenLabel = [when.weekday, when.date].filter(Boolean).join(" ");
  const timeLabel = when.time || "";
  const inPerson = isInPersonMeetingMode(meetingMode);
  const address = inPerson ? resolveOfficeAddressForFallback(officeAddress) : "";
  const contact = resolveManualReminderContactName({
    contactName,
    organizationId,
    language: lang
  });
  const hello = lang === "en"
    ? firstName ? `Hi, ${firstName}.` : "Hi."
    : firstName ? `Hola, ${firstName}.` : "Hola.";
  const whenClause = lang === "en"
    ? whenLabel
      ? `scheduled for ${whenLabel}${timeLabel ? ` at ${timeLabel}` : ""}`
      : "scheduled"
    : whenLabel
      ? `${whenLabel}${timeLabel ? ` a las ${timeLabel}` : ""}`
      : "su horario acordado";
  const help = lang === "en"
    ? `If you need help or have any questions, you can contact ${contact}.`
    : `Si necesita ayuda o tiene alguna pregunta, puede comunicarse con ${contact}.`;
  const whenConfirmed = lang === "en"
    ? whenLabel
      ? `${whenLabel}${timeLabel ? ` at ${timeLabel}` : ""}`
      : "your agreed time"
    : whenClause;
  return { lang, hello, whenClause, whenConfirmed, inPerson, address, contact, help };
}

function buildManualInterviewReminderFallback(facts = {}) {
  const { lang, hello, whenClause, inPerson, address, help } = resolveFallbackFacts(facts);
  if (lang === "en") {
    if (inPerson) {
      const location = address
        ? ` The meeting will be at our office located at ${address}.`
        : " The meeting will be at our office.";
      return `${hello} This is a reminder of your appointment ${whenClause}.${location} ${help} Please confirm you received this reminder.`;
    }
    return `${hello} This is a reminder of your appointment ${whenClause} via Zoom. ${help} Please confirm you received this reminder.`;
  }
  if (inPerson) {
    const location = address
      ? ` La reunión será en nuestra oficina ubicada en ${address}.`
      : " La reunión será en la oficina.";
    return `${hello} Le recordamos su cita programada para ${whenClause}.${location} ${help} Por favor confirme que recibió este recordatorio.`;
  }
  return `${hello} Le recordamos su cita programada para ${whenClause} por Zoom. ${help} Por favor confirme que recibió este recordatorio.`;
}

function buildManualInterviewDetailsFallback(facts = {}) {
  const { lang, hello, whenClause, whenConfirmed, inPerson, address, help } = resolveFallbackFacts(facts);
  if (lang === "en") {
    if (inPerson) {
      const location = address
        ? ` The meeting will be at our office located at ${address}.`
        : " The meeting will be at our office.";
      return `${hello} Your appointment is confirmed for ${whenConfirmed}.${location} ${help}`;
    }
    return `${hello} Your appointment is confirmed for ${whenConfirmed} via Zoom. ${help}`;
  }
  if (inPerson) {
    const location = address
      ? ` La reunión será en nuestra oficina ubicada en ${address}.`
      : " La reunión será en la oficina.";
    return `${hello} Le confirmamos su cita programada para ${whenClause}.${location} ${help}`;
  }
  return `${hello} Le confirmamos su cita programada para ${whenClause} por Zoom. ${help}`;
}

function buildManualOfficeAddressFallback(facts = {}) {
  const officeFacts = { ...facts, meetingMode: "in_person" };
  const { lang, hello, address, help } = resolveFallbackFacts(officeFacts);
  if (lang === "en") {
    const location = address
      ? `Our office is located at ${address}.`
      : "The meeting will be at our office.";
    return `${hello} ${location} ${help}`;
  }
  const location = address
    ? `Nuestra oficina está ubicada en ${address}.`
    : "La reunión será en la oficina.";
  return `${hello} ${location} ${help}`;
}

function buildManualZoomInvitationFallback(facts = {}) {
  const zoomFacts = { ...facts, meetingMode: "zoom" };
  const { lang, hello, whenClause, whenConfirmed, help } = resolveFallbackFacts(zoomFacts);
  if (lang === "en") {
    return `${hello} Your appointment is confirmed for ${whenConfirmed} via Zoom. ${help}`;
  }
  return `${hello} Le confirmamos su cita programada para ${whenClause} por Zoom. ${help}`;
}

function buildManualCustomMessageFallback(facts = {}) {
  const { hello, help } = resolveFallbackFacts(facts);
  return `${hello} ${help}`;
}

function buildManualCommunicationFallback({ purpose = MANUAL_COMMUNICATION_PURPOSES.REMINDER, ...facts } = {}) {
  if (purpose === MANUAL_COMMUNICATION_PURPOSES.OFFICE) {
    return buildManualOfficeAddressFallback(facts);
  }
  if (purpose === MANUAL_COMMUNICATION_PURPOSES.ZOOM) {
    return buildManualZoomInvitationFallback(facts);
  }
  if (purpose === MANUAL_COMMUNICATION_PURPOSES.INVITATION) {
    return buildManualInterviewDetailsFallback(facts);
  }
  if (purpose === "custom" || purpose === "phone") {
    return buildManualCustomMessageFallback(facts);
  }
  return buildManualInterviewReminderFallback(facts);
}

module.exports = {
  MANUAL_REMINDER_CONTACT_NAME,
  NEUTRAL_REMINDER_CONTACT_NAME,
  resolveManualReminderContactName,
  MANUAL_COMMUNICATION_PURPOSES,
  buildManualInterviewReminderFallback,
  buildManualInterviewDetailsFallback,
  buildManualOfficeAddressFallback,
  buildManualZoomInvitationFallback,
  buildManualCustomMessageFallback,
  buildManualCommunicationFallback,
  formatReminderWhenParts,
  isInPersonMeetingMode,
  getFirstName
};
