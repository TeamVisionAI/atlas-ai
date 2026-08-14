/**
 * Canonical communication classification (BR-140).
 * Distinguishes REAL prospect/Atlas/Human communication (including media)
 * from OPERATIONAL / internal rows. Do not rely only on text starting with "[".
 *
 * WhatsApp audio is the first media modality — same prospect, org, conversation,
 * ownership, qualification, and outcome model. No parallel audio CRM.
 */

"use strict";

const INTERNAL_INTENTS = new Set([
  "REQUIRED_INFORMATION",
  "CONVERSATION_OUTCOME",
  "AGENT_ACTION",
  "REQUIRED_INFORMATION_UPDATED"
]);

const BLOCKED_OUTBOUND_STATUSES = new Set([
  "blocked_template_missing",
  "blocked_window_closed",
  "blocked_template_unapproved",
  "retry_required",
  "provider_failed"
]);

const MEDIA_KINDS = new Set([
  "audio",
  "ptt",
  "image",
  "video",
  "document",
  "sticker"
]);

const MEDIA_PLACEHOLDER_RE = /^\[(audio|ptt|image|video|document|sticker) message\]$/i;

const PREVIEW_LABELS = Object.freeze({
  voice_message: { en: "Voice message", es: "Mensaje de voz" },
  image_message: { en: "Photo", es: "Foto" },
  video_message: { en: "Video", es: "Video" },
  document_message: { en: "Document", es: "Documento" },
  sticker_message: { en: "Sticker", es: "Sticker" }
});

function logText(row) {
  return String(
    row?.message ||
      row?.text ||
      row?.body ||
      row?.content?.text ||
      row?.content?.body ||
      ""
  ).trim();
}

function normalizeDirection(direction) {
  const value = String(direction || "").toLowerCase();
  if (value === "incoming" || value === "inbound") {
    return "inbound";
  }
  if (value === "outgoing" || value === "outbound") {
    return "outbound";
  }
  return null;
}

function normalizeMediaKind(row) {
  const raw =
    row?.media_kind ||
    row?.mediaKind ||
    row?.media?.kind ||
    row?.media?.mediaKind ||
    row?.media?.media_kind ||
    row?.content?.media?.kind ||
    row?.content?.media?.mediaKind ||
    row?.content?.messageType ||
    row?.messageType ||
    row?.message_type ||
    row?.type ||
    null;
  const kind = String(raw || "")
    .trim()
    .toLowerCase();
  return kind || null;
}

function mediaKindFromPlaceholder(text) {
  const match = String(text || "").trim().match(MEDIA_PLACEHOLDER_RE);
  if (!match) {
    return null;
  }
  const kind = String(match[1] || "").toLowerCase();
  return kind === "ptt" ? "audio" : kind;
}

function isMediaPlaceholderText(text) {
  return MEDIA_PLACEHOLDER_RE.test(String(text || "").trim());
}

function resolveMediaKind(row) {
  const structured = normalizeMediaKind(row);
  if (structured && MEDIA_KINDS.has(structured === "ptt" ? "audio" : structured)) {
    return structured === "ptt" ? "audio" : structured;
  }
  return mediaKindFromPlaceholder(logText(row));
}

function previewKindForMedia(mediaKind) {
  switch (String(mediaKind || "").toLowerCase()) {
    case "audio":
    case "ptt":
      return "voice_message";
    case "image":
      return "image_message";
    case "video":
      return "video_message";
    case "document":
      return "document_message";
    case "sticker":
      return "sticker_message";
    default:
      return null;
  }
}

function previewLabelForKind(previewKind, language = "en") {
  const labels = PREVIEW_LABELS[previewKind];
  if (!labels) {
    return null;
  }
  return language === "es" ? labels.es : labels.en;
}

function isAudioCommunication(row) {
  return resolveMediaKind(row) === "audio";
}

function isRealMediaCommunication(row) {
  return Boolean(resolveMediaKind(row));
}

/**
 * Operational / internal text — provider failures, workflow, diagnostics.
 * Media placeholders like `[audio message]` are NOT operational.
 */
function isOperationalCommunicationText(text) {
  const value = String(text || "").trim();
  if (!value) {
    return false;
  }
  if (value.startsWith("[Agent note]")) {
    return true;
  }
  if (isMediaPlaceholderText(value)) {
    return false;
  }
  if (/^\[[^\]]+\]/.test(value)) {
    return true;
  }
  if (/whatsapp_outbound:/i.test(value)) {
    return true;
  }
  if (
    /blocked_template_missing|blocked_window_closed|blocked_template_unapproved/i.test(
      value
    )
  ) {
    return true;
  }
  return false;
}

function isOperationalCommunication(row) {
  const intent = String(row?.intent || row?.ai?.intent || "").toUpperCase();
  if (INTERNAL_INTENTS.has(intent)) {
    return true;
  }
  if (intent.startsWith("WHATSAPP_OUTBOUND_")) {
    return true;
  }

  const status = String(row?.status || row?.delivery_status || "").toLowerCase();
  if (BLOCKED_OUTBOUND_STATUSES.has(status)) {
    return true;
  }

  const pipeline = String(row?.pipeline || "").toUpperCase();
  if (
    pipeline === "SYSTEM" ||
    pipeline === "WORKFLOW" ||
    pipeline === "QUALIFICATION" ||
    pipeline === "DIAGNOSTIC"
  ) {
    return true;
  }

  if (isOperationalCommunicationText(logText(row))) {
    return true;
  }

  return false;
}

/**
 * Prospect / Atlas / Human WhatsApp communication, including inbound media.
 */
function isRealWhatsAppCommunication(row) {
  const direction = normalizeDirection(row?.direction);
  if (!direction) {
    return false;
  }

  if (isRealMediaCommunication(row) && !isOperationalCommunication(row)) {
    const channel = String(row?.channel || "whatsapp").toLowerCase();
    if (channel && channel !== "whatsapp") {
      return false;
    }
    return true;
  }

  if (isOperationalCommunication(row)) {
    return false;
  }

  const channel = String(row?.channel || "whatsapp").toLowerCase();
  if (channel && channel !== "whatsapp") {
    return false;
  }

  return true;
}

function friendlyCommunicationPreview(row, language = "en") {
  const mediaKind = resolveMediaKind(row);
  const previewKind = previewKindForMedia(mediaKind);
  if (previewKind) {
    return {
      text: previewLabelForKind(previewKind, language),
      previewKind
    };
  }
  const text = logText(row)
    .replace(/^\[Agent note\]\s*/i, "")
    .slice(0, 160);
  return {
    text: text || null,
    previewKind: text ? "text" : null
  };
}

module.exports = {
  INTERNAL_INTENTS,
  BLOCKED_OUTBOUND_STATUSES,
  MEDIA_KINDS,
  MEDIA_PLACEHOLDER_RE,
  PREVIEW_LABELS,
  logText,
  normalizeDirection,
  normalizeMediaKind,
  isMediaPlaceholderText,
  resolveMediaKind,
  previewKindForMedia,
  previewLabelForKind,
  isAudioCommunication,
  isRealMediaCommunication,
  isOperationalCommunicationText,
  isOperationalCommunication,
  isRealWhatsAppCommunication,
  friendlyCommunicationPreview
};
