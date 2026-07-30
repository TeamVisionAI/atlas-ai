import {
  copyMessageToClipboard,
  openWhatsAppConversation
} from "./whatsappCommunicationService";
import { apiRequest } from "./apiClient";
import { MissionControlError } from "./missionControlService";

export async function postCommunicationExecute(phone, body = {}) {
  const response = await apiRequest(
    `/api/mission-control/${encodeURIComponent(phone)}/communication/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json();

  if (!response.ok && !result?.message) {
    throw new MissionControlError("Failed to execute communication action", response.status);
  }

  return result;
}

async function deliverWhatsAppResult({
  phone,
  result,
  translate,
  showSuccess,
  showError,
  showInfo,
  onRecorded
}) {
  if (!result?.message) {
    showError?.(translate("missionControlActionFailed"));
    return { success: false };
  }

  try {
    await copyMessageToClipboard(result.message);
  } catch {
    showError?.(translate("whatsappCopyOpenClipboardError"));
    return { success: false };
  }

  openWhatsAppConversation({ phone, message: result.message });

  if (result.infoToastKey) {
    showInfo?.(translate(result.infoToastKey));
  }

  showSuccess?.(translate(result.toastKey || "whatsappCopyOpenConfirmation"));
  await onRecorded?.(result);

  return { success: true, ...result };
}

/**
 * Intelligent Zoom invitation — email/calendar when available, WhatsApp otherwise.
 */
export async function executeZoomInvitationAction({
  phone,
  translate,
  showSuccess,
  showError,
  showInfo,
  onOrganizationResourceMissing,
  onRecorded,
  forceWhatsApp = false,
  onWhatsAppFallbackOffer
}) {
  if (!phone) {
    return { success: false };
  }

  let result;

  try {
    result = await postCommunicationExecute(phone, {
      sourceAction: "send_zoom_link",
      channel: forceWhatsApp ? "whatsapp" : "auto"
    });
  } catch (error) {
    const message =
      error instanceof MissionControlError
        ? translate("missionControlActionFailed")
        : error.message;
    showError?.(message);
    return { success: false, message };
  }

  if (!result?.success) {
    if (result?.error === "MEETING_URL_NOT_CONFIGURED" && result?.resourceKey) {
      onOrganizationResourceMissing?.(result.resourceKey);
    }

    showError?.(result?.message || translate("missionControlActionFailed"));
    return { success: false, message: result?.message };
  }

  if (result.channel === "email") {
    showSuccess?.(translate(result.toastKey || "zoomInvitationSentByEmail"));

    if (result.whatsappFallback?.message && onWhatsAppFallbackOffer) {
      onWhatsAppFallbackOffer({
        phone,
        preview: result.whatsappFallback
      });
    }

    await onRecorded?.(result);
    return { success: true, ...result };
  }

  return deliverWhatsAppResult({
    phone,
    result,
    translate,
    showSuccess,
    showError,
    showInfo,
    onRecorded
  });
}
