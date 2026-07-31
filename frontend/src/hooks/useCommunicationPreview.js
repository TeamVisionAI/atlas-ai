import { useCallback, useState } from "react";
import { isCommunicationPreviewEnabled } from "../config/communicationPreview";
import {
  extractOutboundPayload,
  previewMessageMatchesSendPayload
} from "../engines/communicationPreviewEngine.js";
import {
  fetchAppointmentCommunicationPreview,
  fetchPhoneCommunicationPreview
} from "../services/communicationPreviewService";
import {
  copyMessageToClipboard,
  openWhatsAppConversation
} from "../services/whatsappCommunicationService";
import { sendInterviewDetails } from "../services/appointmentService";

export function useCommunicationPreview({ translate, showToast, onRecorded }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const closePreview = useCallback(() => {
    if (sending) {
      return;
    }

    setOpen(false);
    setPayload(null);
    setError(null);
    setPendingAction(null);
  }, [sending]);

  const openPreview = useCallback(async (action) => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setPayload(null);
    setPendingAction(action);

    try {
      let result;

      if (action.type === "appointment") {
        result = await fetchAppointmentCommunicationPreview(action.appointmentId);
      } else {
        result = await fetchPhoneCommunicationPreview(action.phone, {
          sourceAction: action.sourceAction,
          template: action.template
        });
      }

      if (!result?.success) {
        setError(result?.message || translate("communicationPreviewLoadFailed"));
        return;
      }

      const outboundPayload = extractOutboundPayload(result);

      if (!outboundPayload?.message) {
        setError(translate("communicationPreviewLoadFailed"));
        return;
      }

      setPayload(outboundPayload);
    } catch (requestError) {
      console.error(requestError);
      setError(translate("communicationPreviewLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [translate]);

  const requestPreviewIfEnabled = useCallback(
    async (action) => {
      if (!isCommunicationPreviewEnabled()) {
        return false;
      }

      await openPreview(action);
      return true;
    },
    [openPreview]
  );

  const copyPreviewMessage = useCallback(async () => {
    if (!payload?.message) {
      return;
    }

    setCopyBusy(true);

    try {
      await copyMessageToClipboard(payload.message);
      showToast?.showSuccess(translate("communicationPreviewCopied"));
    } catch {
      showToast?.showError(translate("whatsappCopyOpenClipboardError"));
    } finally {
      setCopyBusy(false);
    }
  }, [payload?.message, showToast, translate]);

  const deliverWhatsAppPayload = useCallback(
    async (result) => {
      if (!result?.message || !result?.phone) {
        showToast?.showError(translate("missionControlActionFailed"));
        return { success: false };
      }

      try {
        await copyMessageToClipboard(result.message);
      } catch {
        showToast?.showError(translate("whatsappCopyOpenClipboardError"));
        return { success: false };
      }

      openWhatsAppConversation({ phone: result.phone, message: result.message });
      showToast?.showSuccess(translate(result.toastKey || "whatsappCopyOpenConfirmation"));
      await onRecorded?.(result);
      return { success: true, ...result };
    },
    [onRecorded, showToast, translate]
  );

  const confirmSend = useCallback(async () => {
    if (!pendingAction || !payload) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      if (pendingAction.type === "appointment") {
        const result = await sendInterviewDetails(pendingAction.appointmentId);

        if (!result?.success) {
          setError(result?.message || translate("missionControlActionFailed"));
          showToast?.showError(result?.message || translate("missionControlActionFailed"));
          return;
        }

        const sendPayload = extractOutboundPayload(result) || {
          message: result.message,
          template: result.template,
          language: result.language,
          phone: result.phone
        };

        if (!previewMessageMatchesSendPayload(payload, sendPayload)) {
          console.warn("[CommunicationPreview] Preview/send payload mismatch.", {
            appointmentId: pendingAction.appointmentId
          });
        }

        closePreview();
        await deliverWhatsAppPayload(result);
        return;
      }

      if (pendingAction.onSend) {
        const result = await pendingAction.onSend(payload);

        if (!result?.success) {
          setError(result?.message || translate("missionControlActionFailed"));
          return;
        }

        closePreview();
        return;
      }

      setError(translate("missionControlActionFailed"));
    } catch (requestError) {
      console.error(requestError);
      setError(translate("missionControlActionFailed"));
      showToast?.showError(translate("missionControlActionFailed"));
    } finally {
      setSending(false);
    }
  }, [closePreview, deliverWhatsAppPayload, payload, pendingAction, showToast, translate]);

  return {
    open,
    loading,
    payload,
    error,
    sending,
    copyBusy,
    closePreview,
    openPreview,
    requestPreviewIfEnabled,
    copyPreviewMessage,
    confirmSend,
    isCommunicationPreviewEnabled
  };
}
