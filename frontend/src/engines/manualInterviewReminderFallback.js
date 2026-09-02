/**
 * Deterministic HUMAN/manual communication fallback.
 * Implements BR-214. Used when communication preview fails. No AI/model.
 */

export const MANUAL_REMINDER_CONTACT_NAME = "Ana Perez";

export const MANUAL_COMMUNICATION_PURPOSES = Object.freeze({
  INVITATION: "invitation",
  REMINDER: "reminder",
  ZOOM: "zoom",
  OFFICE: "office"
});

export const MANUAL_COMMUNICATION_TITLE_KEYS = Object.freeze({
  [MANUAL_COMMUNICATION_PURPOSES.INVITATION]: "whatsappActionResendInterviewDetails",
  [MANUAL_COMMUNICATION_PURPOSES.REMINDER]: "whatsappActionSendReminder",
  [MANUAL_COMMUNICATION_PURPOSES.ZOOM]: "whatsappActionResendZoom",
  [MANUAL_COMMUNICATION_PURPOSES.OFFICE]: "whatsappActionSendOffice"
});

export const MANUAL_COMMUNICATION_TEMPLATES = Object.freeze({
  [MANUAL_COMMUNICATION_PURPOSES.INVITATION]: "interview_details",
  [MANUAL_COMMUNICATION_PURPOSES.REMINDER]: "interview_reminder",
  [MANUAL_COMMUNICATION_PURPOSES.ZOOM]: "zoom_invitation",
  [MANUAL_COMMUNICATION_PURPOSES.OFFICE]: "office_location"
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

export function isInPersonMeetingMode(meetingMode) {
  const raw = String(meetingMode || "").toLowerCase();
  return (
    raw === "in_person" ||
    raw === "office" ||
    raw.includes("person") ||
    raw.includes("office")
  );
}

export function formatReminderWhenParts(startIso, timezone = "America/New_York", language = "es") {
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

function looksCompleteOfficeAddress(value) {
  const trimmed = String(value || "").trim();
  if (trimmed.length < 12 || !/\d/.test(trimmed)) {
    return false;
  }
  if (/^[A-Za-z .'-]+,\s*[A-Z]{2}$/.test(trimmed)) {
    return false;
  }
  return true;
}

function resolveFallbackFacts({
  prospectName = "",
  startIso = null,
  timezone = "America/New_York",
  meetingMode = "zoom",
  officeAddress = null,
  language = "es",
  contactName = MANUAL_REMINDER_CONTACT_NAME
} = {}) {
  const firstName = getFirstName(prospectName);
  const lang = language === "en" || language === "english" ? "en" : "es";
  const when = formatReminderWhenParts(startIso, timezone, lang);
  const whenLabel = [when.weekday, when.date].filter(Boolean).join(" ");
  const timeLabel = when.time || "";
  const inPerson = isInPersonMeetingMode(meetingMode);
  const address = inPerson && looksCompleteOfficeAddress(officeAddress) ? String(officeAddress).trim() : "";
  const contact = String(contactName || MANUAL_REMINDER_CONTACT_NAME).trim() || MANUAL_REMINDER_CONTACT_NAME;
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
  const whenConfirmed = lang === "en"
    ? whenLabel
      ? `${whenLabel}${timeLabel ? ` at ${timeLabel}` : ""}`
      : "your agreed time"
    : whenClause;
  const help = lang === "en"
    ? `If you need help or have any questions, you can contact ${contact}.`
    : `Si necesita ayuda o tiene alguna pregunta, puede comunicarse con ${contact}.`;
  return { lang, hello, whenClause, whenConfirmed, inPerson, address, help };
}

export function buildManualInterviewReminderFallback(facts = {}) {
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

export function buildManualInterviewDetailsFallback(facts = {}) {
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

export function buildManualOfficeAddressFallback(facts = {}) {
  const { lang, hello, address, help } = resolveFallbackFacts({ ...facts, meetingMode: "in_person" });
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

export function buildManualZoomInvitationFallback(facts = {}) {
  const { lang, hello, whenClause, whenConfirmed, help } = resolveFallbackFacts({
    ...facts,
    meetingMode: "zoom"
  });
  if (lang === "en") {
    return `${hello} Your appointment is confirmed for ${whenConfirmed} via Zoom. ${help}`;
  }
  return `${hello} Le confirmamos su cita programada para ${whenClause} por Zoom. ${help}`;
}

export function buildManualCustomMessageFallback(facts = {}) {
  const { hello, help } = resolveFallbackFacts(facts);
  return `${hello} ${help}`;
}

export function buildManualCommunicationFallback({
  purpose = MANUAL_COMMUNICATION_PURPOSES.REMINDER,
  ...facts
} = {}) {
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

function workspaceFallbackFacts(workspace = null, language = null) {
  const interview = workspace?.interview || {};
  return {
    prospectName:
      workspace?.prospect?.name ||
      workspace?.prospect?.displayName ||
      workspace?.name ||
      "",
    startIso: interview.datetime || interview.startDateTime || null,
    timezone: interview.timezone || workspace?.timezone || "America/New_York",
    meetingMode: interview.type || interview.meetingType || "zoom",
    officeAddress: interview.meetingAddress || interview.officeAddress || null,
    language:
      language ||
      workspace?.capture?.preferredLanguage ||
      workspace?.prospect?.preferred_language ||
      workspace?.prospect?.preferredLanguage ||
      "es"
  };
}

export function buildManualInterviewReminderFallbackFromWorkspace({
  workspace = null,
  phone = null,
  language = null
} = {}) {
  const message = buildManualInterviewReminderFallback(workspaceFallbackFacts(workspace, language));
  return {
    message,
    phone: phone || workspace?.phone || workspace?.prospect?.phone || null,
    fallbackUsed: true,
    contactName: MANUAL_REMINDER_CONTACT_NAME
  };
}

export function buildManualCommunicationFallbackFromWorkspace({
  purpose = MANUAL_COMMUNICATION_PURPOSES.REMINDER,
  workspace = null,
  phone = null,
  language = null
} = {}) {
  const message = buildManualCommunicationFallback({
    purpose,
    ...workspaceFallbackFacts(workspace, language)
  });
  return {
    message,
    phone: phone || workspace?.phone || workspace?.prospect?.phone || null,
    fallbackUsed: true,
    contactName: MANUAL_REMINDER_CONTACT_NAME,
    purpose,
    titleKey: MANUAL_COMMUNICATION_TITLE_KEYS[purpose] || "whatsappActionCustomMessage",
    template: MANUAL_COMMUNICATION_TEMPLATES[purpose] || "interview_reminder"
  };
}

export function resolveManualCommunicationPreviewOrFallback({
  purpose = MANUAL_COMMUNICATION_PURPOSES.REMINDER,
  preview = null,
  workspace = null,
  phone = null
} = {}) {
  const outbound = preview?.outboundPayload || null;
  const previewMessage = String(outbound?.message || preview?.message || "").trim();
  const serverFallbackUsed = Boolean(preview?.fallbackUsed || outbound?.fallbackUsed);
  if (preview?.success && previewMessage) {
    return {
      ok: true,
      fallbackUsed: serverFallbackUsed,
      message: previewMessage,
      phone: outbound?.phone || preview.phone || phone || null,
      preview,
      purpose,
      titleKey: MANUAL_COMMUNICATION_TITLE_KEYS[purpose] || "whatsappActionCustomMessage",
      template: MANUAL_COMMUNICATION_TEMPLATES[purpose] || null
    };
  }

  const fallback = buildManualCommunicationFallbackFromWorkspace({ purpose, workspace, phone });
  if (fallback.message) {
    return {
      ok: true,
      fallbackUsed: true,
      message: fallback.message,
      phone: fallback.phone,
      preview: null,
      purpose,
      titleKey: fallback.titleKey,
      template: fallback.template
    };
  }

  return {
    ok: false,
    fallbackUsed: false,
    message: "",
    phone: phone || null,
    purpose
  };
}

export function resolveInterviewReminderPreviewOrFallback({
  preview = null,
  workspace = null,
  phone = null
} = {}) {
  return resolveManualCommunicationPreviewOrFallback({
    purpose: MANUAL_COMMUNICATION_PURPOSES.REMINDER,
    preview,
    workspace,
    phone
  });
}
