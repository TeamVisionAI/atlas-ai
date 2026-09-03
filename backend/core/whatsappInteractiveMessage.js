/**
 * WhatsApp Cloud API interactive messages (reply buttons + lists).
 * Implements BR-157. Does not change ordinary text outbound.
 *
 * Meta limits (Cloud API):
 * - reply buttons: max 3; title max 20 chars
 * - list rows: max 10; title max 24 chars; description max 72
 * - list action button: max 20 chars
 */

const REPLY_BUTTON_MAX = 3;
const REPLY_BUTTON_TITLE_MAX = 20;
const LIST_ROW_TITLE_MAX = 24;
const LIST_ROW_DESCRIPTION_MAX = 72;
const LIST_ACTION_BUTTON_MAX = 20;
const LIST_SECTION_TITLE_MAX = 24;

function clip(value, max) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (text.length <= max) {
    return text;
  }
  return text.slice(0, Math.max(0, max - 1)).trimEnd();
}

function extractInteractiveReply(rawMessage = {}) {
  const type = String(rawMessage.type || "").toLowerCase();
  if (type === "interactive") {
    const interactive = rawMessage.interactive || {};
    if (interactive.button_reply) {
      return {
        type: "button_reply",
        id: String(interactive.button_reply.id || "").trim() || null,
        title: String(interactive.button_reply.title || "").trim() || null
      };
    }
    if (interactive.list_reply) {
      return {
        type: "list_reply",
        id: String(interactive.list_reply.id || "").trim() || null,
        title: String(interactive.list_reply.title || "").trim() || null,
        description: String(interactive.list_reply.description || "").trim() || null
      };
    }
  }
  if (type === "button") {
    return {
      type: "button",
      id: String(rawMessage.button?.payload || "").trim() || null,
      title: String(rawMessage.button?.text || "").trim() || null
    };
  }
  return null;
}

function buildReplyButtons({ body, buttons = [] } = {}) {
  const rows = (buttons || [])
    .map((button) => ({
      id: String(button.id || "").trim(),
      title: clip(button.title, REPLY_BUTTON_TITLE_MAX)
    }))
    .filter((button) => button.id && button.title)
    .slice(0, REPLY_BUTTON_MAX);

  if (!rows.length) {
    return null;
  }

  return {
    type: "button",
    body: { text: String(body || "").trim() },
    action: {
      buttons: rows.map((button) => ({
        type: "reply",
        reply: { id: button.id, title: button.title }
      }))
    }
  };
}

function buildListMessage({
  body,
  buttonText = "Ver opciones",
  sectionTitle = "Opciones",
  rows = []
} = {}) {
  const listRows = (rows || [])
    .map((row) => ({
      id: String(row.id || "").trim(),
      title: clip(row.title, LIST_ROW_TITLE_MAX),
      description: row.description
        ? clip(row.description, LIST_ROW_DESCRIPTION_MAX)
        : undefined
    }))
    .filter((row) => row.id && row.title)
    .slice(0, 10);

  if (!listRows.length) {
    return null;
  }

  return {
    type: "list",
    body: { text: String(body || "").trim() },
    action: {
      button: clip(buttonText, LIST_ACTION_BUTTON_MAX) || "Opciones",
      sections: [
        {
          title: clip(sectionTitle, LIST_SECTION_TITLE_MAX) || "Opciones",
          rows: listRows
        }
      ]
    }
  };
}

/**
 * Prefer reply buttons when every option fits; otherwise a list message.
 */
function buildInteractiveFromOptions({
  body,
  options = [],
  listButtonText = "Ver opciones",
  listSectionTitle = "Opciones"
} = {}) {
  const safe = (options || []).filter((option) => option?.id && option?.title);
  if (!safe.length) {
    return null;
  }

  const allFitButtons =
    safe.length <= REPLY_BUTTON_MAX &&
    safe.every((option) => String(option.title || "").trim().length <= REPLY_BUTTON_TITLE_MAX);

  if (allFitButtons) {
    return buildReplyButtons({ body, buttons: safe });
  }

  return buildListMessage({
    body,
    buttonText: listButtonText,
    sectionTitle: listSectionTitle,
    rows: safe.map((option) => {
      const title = String(option.title || "").trim();
      const rawDescription = option.description || option.label || "";
      // BR-219 — do not repeat the identical clock label as list description.
      const description =
        rawDescription && String(rawDescription).trim() !== title
          ? rawDescription
          : undefined;
      return {
        id: option.id,
        title: option.title,
        description
      };
    })
  });
}

function formatNumberedFallback(body, options = []) {
  const lines = (options || [])
    .map((option, index) => `${index + 1}. ${option.label || option.title}`)
    .filter(Boolean);
  const header = String(body || "").trim();
  if (!lines.length) {
    return header;
  }
  return [header, "", ...lines].join("\n");
}

function parseNumericFallback(text, options = []) {
  const trimmed = String(text || "").trim();
  if (!/^\d{1,2}$/.test(trimmed)) {
    return null;
  }
  const index = Number(trimmed) - 1;
  return options[index] || null;
}

function collectInteractiveOptionParts(interactive = {}) {
  if (interactive?.type === "button") {
    return (interactive.action?.buttons || []).map((row) => ({
      id: row?.reply?.id || "",
      title: row?.reply?.title || ""
    }));
  }
  if (interactive?.type === "list") {
    return (interactive.action?.sections || []).flatMap((section) =>
      (section.rows || []).map((row) => ({
        id: row?.id || "",
        title: row?.title || ""
      }))
    );
  }
  return [];
}

function interactiveContainsAppointmentTimes(interactive) {
  const parts = collectInteractiveOptionParts(interactive);
  if (!parts.length) {
    return false;
  }
  return parts.some((part) => {
    const id = String(part.id || "");
    const title = String(part.title || "");
    return (
      id.startsWith("IUL_SLOT_") ||
      /\d{1,2}:\d{2}/.test(title) ||
      /\b\d{1,2}\s*(am|pm)\b/i.test(title)
    );
  });
}

function recoveryTextForInteractiveFailure(interactive, language = "es") {
  if (interactiveContainsAppointmentTimes(interactive)) {
    return language === "en"
      ? "I could not display the time options just now. An advisor will contact you to coordinate your Zoom review."
      : "No pude mostrar las opciones de horario en este momento. Un asesor le contactará para coordinar su revisión por Zoom.";
  }
  return null;
}

function looksLikeTappableAppointmentText(text) {
  const value = String(text || "");
  return (
    /IUL_SLOT_/.test(value) ||
    /^\s*[-•]\s+.+\d{1,2}(?::\d{2})?\s*(AM|PM)?/m.test(value) ||
    /^\s*\d+\.\s+.+\d{1,2}(?::\d{2})?\s*(AM|PM)?/m.test(value)
  );
}

function resolveInteractiveProviderFailureText({
  interactive,
  interactiveFallbackText,
  message,
  language = "es"
} = {}) {
  const recovery = recoveryTextForInteractiveFailure(interactive, language);
  if (recovery) {
    return recovery;
  }
  const fallback = String(interactiveFallbackText || "").trim();
  if (fallback && !looksLikeTappableAppointmentText(fallback)) {
    return fallback;
  }
  const body = String(message || "").trim();
  if (body && !looksLikeTappableAppointmentText(body)) {
    return body;
  }
  return recoveryTextForInteractiveFailure({ type: "button", action: { buttons: [{ reply: { id: "IUL_SLOT_0", title: "9:00 AM" } }] } }, language);
}

module.exports = {
  REPLY_BUTTON_MAX,
  REPLY_BUTTON_TITLE_MAX,
  LIST_ROW_TITLE_MAX,
  extractInteractiveReply,
  buildReplyButtons,
  buildListMessage,
  buildInteractiveFromOptions,
  formatNumberedFallback,
  parseNumericFallback,
  collectInteractiveOptionParts,
  interactiveContainsAppointmentTimes,
  recoveryTextForInteractiveFailure,
  looksLikeTappableAppointmentText,
  resolveInteractiveProviderFailureText,
  clip
};
