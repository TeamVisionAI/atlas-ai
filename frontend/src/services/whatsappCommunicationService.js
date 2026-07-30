/**
 * One-click WhatsApp workflow — copy message, open conversation, record action.
 *
 * Platform deep-link behavior (see buildWhatsAppDeepLink):
 * - Desktop / Web: https://wa.me opens WhatsApp Web or the desktop app with pre-filled text.
 * - Android: intent URL targets com.whatsapp.w4b (WhatsApp Business) with wa.me fallback.
 * - iOS: wa.me only — Apple does not expose an API to force WhatsApp Business vs Messenger.
 */

import {
  getWhatsAppCommunicationPreview,
  postWhatsAppCommunicationSend,
  MissionControlError
} from "./missionControlService";

export const WHATSAPP_COPY_ACTIONS = new Set([
  "whatsapp",
  "send_zoom_link",
  "send_office_location",
  "send_missed_appointment",
  "send_interview_reminder"
]);

export function isWhatsAppCopyAction(actionId) {
  return WHATSAPP_COPY_ACTIONS.has(actionId);
}

export function normalizePhoneForWaMe(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function detectMobilePlatform() {
  if (typeof navigator === "undefined") {
    return "desktop";
  }

  const ua = navigator.userAgent;

  if (/android/i.test(ua)) {
    return "android";
  }

  if (/iPad|iPhone|iPod/i.test(ua)) {
    return "ios";
  }

  return "desktop";
}

/**
 * Builds the best available deep link to open a WhatsApp conversation.
 *
 * iOS limitation: only universal wa.me links are supported; the OS chooses
 * WhatsApp Messenger or WhatsApp Business — Atlas cannot force Business on iOS.
 *
 * Android: tries WhatsApp Business (com.whatsapp.w4b) via intent URL with
 * S.browser_fallback_url pointing at wa.me when Business is not installed.
 */
export function buildWhatsAppDeepLink({ phone, message, preferBusiness = true }) {
  const digits = normalizePhoneForWaMe(phone);
  const encodedMessage = encodeURIComponent(message || "");
  const waMeUrl = `https://wa.me/${digits}?text=${encodedMessage}`;
  const platform = detectMobilePlatform();

  if (platform === "android" && preferBusiness) {
    const fallback = encodeURIComponent(waMeUrl);
    return `intent://send?phone=${digits}&text=${encodedMessage}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=${fallback};end`;
  }

  return waMeUrl;
}

export async function copyMessageToClipboard(message) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = message;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand("copy");

    if (!copied) {
      throw new Error("Clipboard copy failed.");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

export function openWhatsAppConversation({ phone, message }) {
  const url = buildWhatsAppDeepLink({ phone, message });
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Full one-click workflow: preview → copy → open WhatsApp → record → confirm.
 */
export async function executeSendViaWhatsApp({
  phone,
  actionId,
  translate,
  showSuccess,
  showError,
  onOrganizationResourceMissing,
  onRecorded
}) {
  if (!phone) {
    return { success: false };
  }

  let preview;

  try {
    preview = await getWhatsAppCommunicationPreview(phone, {
      sourceAction: actionId
    });
  } catch (error) {
    const message =
      error instanceof MissionControlError
        ? translate("missionControlActionFailed")
        : error.message;
    showError?.(message);
    return { success: false, message };
  }

  if (!preview?.success) {
    if (preview?.error === "MEETING_URL_NOT_CONFIGURED" && preview?.resourceKey) {
      onOrganizationResourceMissing?.(preview.resourceKey);
    }

    showError?.(preview?.message || translate("missionControlActionFailed"));
    return { success: false, message: preview?.message };
  }

  try {
    await copyMessageToClipboard(preview.message);
  } catch {
    showError?.(translate("whatsappCopyOpenClipboardError"));
    return { success: false };
  }

  openWhatsAppConversation({ phone, message: preview.message });

  let recordResult;

  try {
    recordResult = await postWhatsAppCommunicationSend(phone, {
      sourceAction: actionId,
      template: preview.template,
      deliveryMode: "copy_open"
    });
  } catch (error) {
    showError?.(translate("missionControlActionFailed"));
    return { success: false, message: error.message };
  }

  if (!recordResult?.success) {
    showError?.(recordResult?.message || translate("missionControlActionFailed"));
    return { success: false, message: recordResult?.message };
  }

  showSuccess?.(translate("whatsappCopyOpenConfirmation"));
  await onRecorded?.(recordResult);

  return { success: true, ...recordResult };
}
