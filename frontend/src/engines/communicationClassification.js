/**
 * Frontend mirror of backend/core/communicationClassification.js (BR-140).
 * Keep in sync: real WhatsApp communication vs operational / internal rows.
 * Media placeholders like `[audio message]` are REAL communication.
 */

const MEDIA_PLACEHOLDER_RE = /^\[(audio|ptt|image|video|document|sticker) message\]$/i;

const INTERNAL_MESSAGE_INTENTS = new Set([
  "REQUIRED_INFORMATION",
  "CONVERSATION_OUTCOME",
  "AGENT_ACTION",
  "REQUIRED_INFORMATION_UPDATED"
]);

export function isMediaPlaceholderText(text) {
  return MEDIA_PLACEHOLDER_RE.test(String(text || "").trim());
}

export function resolveMediaKind(item) {
  const structured = String(
    item?.content?.media?.mediaKind ||
      item?.content?.media?.kind ||
      item?.content?.messageType ||
      item?.media?.mediaKind ||
      item?.media?.kind ||
      item?.messageType ||
      item?.message_type ||
      ""
  )
    .trim()
    .toLowerCase();
  if (structured === "ptt" || structured === "audio") {
    return "audio";
  }
  if (["image", "video", "document", "sticker"].includes(structured)) {
    return structured;
  }
  const text = String(item?.content?.text || item?.content?.body || item?.message || "").trim();
  const match = text.match(MEDIA_PLACEHOLDER_RE);
  if (!match) {
    return null;
  }
  return match[1].toLowerCase() === "ptt" ? "audio" : match[1].toLowerCase();
}

export function isAudioCommunicationItem(item) {
  return resolveMediaKind(item) === "audio";
}

export function isOperationalCommunicationText(text) {
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

export function localizeCommunicationPreview(item, translate) {
  const kind = item?.lastMessagePreviewKind || null;
  if (kind === "voice_message") {
    return translate("voiceMessage");
  }
  if (isAudioCommunicationItem(item) || isAudioCommunicationItem({ message: item?.lastMessagePreview })) {
    return translate("voiceMessage");
  }
  return item?.lastMessagePreview || null;
}

export { INTERNAL_MESSAGE_INTENTS, MEDIA_PLACEHOLDER_RE };
