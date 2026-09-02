import { useCallback, useState } from "react";
import { isCommunicationPreviewEnabled } from "../config/communicationPreview";
import {
  extractOutboundPayload,
  hasRequiredValidationErrors,
  previewMessageMatchesSendPayload
} from "../engines/communicationPreviewEngine.js";
import {
  fetchAppointmentCommunicationPreviewByPurpose,
  fetchPhoneCommunicationPreview
} from "../services/communicationPreviewService";
import {
  copyMessageToClipboard,
  openWhatsAppConversation
} from "../services/whatsappCommunicationService";
import {
  sendInterviewDetails,
  sendInterviewReminder,
  sendZoomInvitation,
  sendOfficeLocation
} from "../services/appointmentService";
import { resolvePersistedAppointmentId } from "../engines/appointmentIdEngine.js";
import {
  APPOINTMENT_COMMUNICATION_PURPOSES,
  resolveAppointmentCommunicationPurpose
} from "../engines/appointmentCommunicationEngine.js";
import { sendHumanConversationReply } from "../services/conversationsCenterService";
import { resolveManualCommunicationPreviewOrFallback } from "../engines/manualInterviewReminderFallback.js";

const APPOINTMENT_SEND_BY_PURPOSE = Object.freeze({
  [APPOINTMENT_COMMUNICATION_PURPOSES.INVITATION]: sendInterviewDetails,
  [APPOINTMENT_COMMUNICATION_PURPOSES.REMINDER]: sendInterviewReminder,
  [APPOINTMENT_COMMUNICATION_PURPOSES.ZOOM]: sendZoomInvitation,
  [APPOINTMENT_COMMUNICATION_PURPOSES.OFFICE]: sendOfficeLocation
});

export function useCommunicationPreview({ translate, showToast, onRecorded }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [composerSession, setComposerSession] = useState(null);

  const closePreview = useCallback(() => {
    if (sending) {
      return;
    }

    setOpen(false);
    setPayload(null);
    setError(null);
    setPendingAction(null);
    setComposerSession(null);
  }, [sending]);

  const closeComposer = useCallback(() => {
    setComposerSession(null);
  }, []);

  const applyFallbackComposer = useCallback((resolved) => {
    setOpen(false);
    setError(null);
    setPayload(null);
    setComposerSession({
      message: resolved.message,
      phone: resolved.phone || null,
      titleKey: resolved.titleKey,
      fallbackUsed: true
    });
  }, []);

  const openPreview = useCallback(async (action) => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setPayload(null);
    setPendingAction(action);

    try {
      let result;
      const purpose =
        action.type === "appointment"
          ? action.purpose ||
            resolveAppointmentCommunicationPurpose(action.actionId) ||
            APPOINTMENT_COMMUNICATION_PURPOSES.INVITATION
          : null;

      if (action.type === "appointment") {
        const appointmentId = resolvePersistedAppointmentId(action.appointmentId);

        if (!appointmentId) {
          const resolved = resolveManualCommunicationPreviewOrFallback({
            purpose,
            preview: { success: false },
            workspace: action.workspace || null,
            phone: action.phone || null
          });
          if (resolved.ok && resolved.message) {
            applyFallbackComposer(resolved);
            return;
          }
          setError(translate("communicationPreviewLoadFailed"));
          return;
        }

        result = await fetchAppointmentCommunicationPreviewByPurpose(appointmentId, purpose);
      } else {
        result = await fetchPhoneCommunicationPreview(action.phone, {
          sourceAction: action.sourceAction,
          template: action.template
        });
        if (!result?.success) {
          const resolved = resolveManualCommunicationPreviewOrFallback({
            purpose: "custom",
            preview: { success: false },
            workspace: action.workspace || null,
            phone: action.phone || null
          });
          if (resolved.ok && resolved.message) {
            applyFallbackComposer(resolved);
            return;
          }
        }
      }

      if (purpose) {
        const resolved = resolveManualCommunicationPreviewOrFallback({
          preview: result,
          purpose,
          workspace: action.workspace || null,
          phone: action.phone || null
        });
        if (resolved.ok && resolved.fallbackUsed && resolved.message) {
          applyFallbackComposer(resolved);
          return;
        }
      }

      if (!result?.success) {
        if (purpose) {
          const resolved = resolveManualCommunicationPreviewOrFallback({
            purpose,
            preview: { success: false },
            workspace: action.workspace || null,
            phone: action.phone || null
          });
          if (resolved.ok && resolved.message) {
            applyFallbackComposer(resolved);
            return;
          }
        }
        setError(result?.message || translate("communicationPreviewLoadFailed"));
        return;
      }

      const outboundPayload = extractOutboundPayload(result);

      if (!outboundPayload?.message) {
        if (purpose) {
          const resolved = resolveManualCommunicationPreviewOrFallback({
            purpose,
            preview: { success: false },
            workspace: action.workspace || null,
            phone: action.phone || null
          });
          if (resolved.ok && resolved.message) {
            applyFallbackComposer(resolved);
            return;
          }
        }
        setError(translate("communicationPreviewLoadFailed"));
        return;
      }

      setPayload(outboundPayload);
    } catch (requestError) {
      console.error(requestError);
      const failedPurpose =
        action.type === "appointment"
          ? action.purpose ||
            resolveAppointmentCommunicationPurpose(action.actionId) ||
            APPOINTMENT_COMMUNICATION_PURPOSES.INVITATION
          : null;
      if (failedPurpose) {
        const resolved = resolveManualCommunicationPreviewOrFallback({
          purpose: failedPurpose,
          preview: { success: false },
          workspace: action.workspace || null,
          phone: action.phone || null
        });
        if (resolved.ok && resolved.message) {
          applyFallbackComposer(resolved);
          return;
        }
      }
      setError(translate("communicationPreviewLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [applyFallbackComposer, translate]);

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

    if (hasRequiredValidationErrors(payload.missingContent)) {
      showToast?.showError(translate("communicationPreviewRequiredMissing"));
      return;
    }

    setSending(true);
    setError(null);

    try {
      if (payload.fallbackUsed) {
        if (!payload.phone || !payload.message) {
          setError(translate("communicationPreviewLoadFailed"));
          showToast?.showError(translate("communicationPreviewLoadFailed"));
          return;
        }
        await sendHumanConversationReply(payload.phone, {
          message: payload.message
        });
        closePreview();
        showToast?.showSuccess(translate("conversationsComposerSent"));
        await onRecorded?.({ success: true, fallbackUsed: true });
        return;
      }

      if (pendingAction.type === "appointment") {
        const appointmentId = resolvePersistedAppointmentId(pendingAction.appointmentId);
        const purpose =
          pendingAction.purpose ||
          resolveAppointmentCommunicationPurpose(pendingAction.actionId) ||
          APPOINTMENT_COMMUNICATION_PURPOSES.INVITATION;
        const sendFn = APPOINTMENT_SEND_BY_PURPOSE[purpose] || sendInterviewDetails;

        if (!appointmentId) {
          setError(translate("communicationPreviewLoadFailed"));
          showToast?.showError(translate("communicationPreviewLoadFailed"));
          return;
        }

        const result = await sendFn(appointmentId);

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
            appointmentId,
            purpose
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
  }, [closePreview, deliverWhatsAppPayload, onRecorded, payload, pendingAction, showToast, translate]);

  return {
    open,
    loading,
    payload,
    error,
    sending,
    copyBusy,
    closePreview,
    closeComposer,
    composerSession,
    openPreview,
    requestPreviewIfEnabled,
    copyPreviewMessage,
    confirmSend,
    isCommunicationPreviewEnabled
  };
}
