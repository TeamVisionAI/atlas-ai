import { useCallback, useState } from "react";
import { resolvePersistedAppointmentId } from "../engines/appointmentIdEngine.js";
import {
  buildInterviewComposerPrefill,
  buildInterviewTemplateConfirmModel,
  isNativeInterviewWhatsAppAction,
  openingNativeInterviewWhatsAppActionChangesOwnership,
  resolveInterviewWhatsAppPurpose,
  shouldNavigateToWaMeForInterviewAction,
  shouldUseSharedComposerForInterviewAction
} from "../engines/nativeInterviewWhatsAppActions.js";
import { extractOutboundPayload } from "../engines/communicationPreviewEngine.js";
import { fetchAppointmentCommunicationPreviewByPurpose } from "../services/communicationPreviewService";
import {
  sendInterviewDetails,
  sendInterviewReminder,
  sendZoomInvitation
} from "../services/appointmentService";
import { APPOINTMENT_COMMUNICATION_PURPOSES } from "../engines/appointmentCommunicationEngine.js";

const SEND_BY_PURPOSE = Object.freeze({
  [APPOINTMENT_COMMUNICATION_PURPOSES.INVITATION]: sendInterviewDetails,
  [APPOINTMENT_COMMUNICATION_PURPOSES.REMINDER]: sendInterviewReminder,
  [APPOINTMENT_COMMUNICATION_PURPOSES.ZOOM]: sendZoomInvitation
});

/**
 * Routes interview WhatsApp actions to shared composer (inside 24h) or
 * approved Meta template confirm (outside 24h). Never opens wa.me.
 */
export function useNativeInterviewWhatsApp({
  translate,
  showToast,
  onRecorded
} = {}) {
  const [composerSession, setComposerSession] = useState(null);
  const [templateSession, setTemplateSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const closeComposer = useCallback(() => {
    setComposerSession(null);
  }, []);

  const closeTemplateSession = useCallback(() => {
    setTemplateSession(null);
    setError(null);
  }, []);

  const openInterviewWhatsAppAction = useCallback(
    async ({ actionId, appointmentId, phone = null, workspace = null }) => {
      void openingNativeInterviewWhatsAppActionChangesOwnership;
      void shouldNavigateToWaMeForInterviewAction;

      if (!isNativeInterviewWhatsAppAction(actionId)) {
        return { handled: false };
      }

      const persistedId = resolvePersistedAppointmentId(appointmentId);
      const purpose = resolveInterviewWhatsAppPurpose(actionId);

      if (!persistedId || !purpose) {
        showToast?.showError?.(translate("missionControlActionFailed"));
        return { handled: true, success: false };
      }

      setBusy(true);
      setError(null);
      setComposerSession(null);
      setTemplateSession(null);

      try {
        const preview = await fetchAppointmentCommunicationPreviewByPurpose(
          persistedId,
          purpose
        );

        if (!preview?.success) {
          const message =
            preview?.message || translate("communicationPreviewLoadFailed");
          setError(message);
          showToast?.showError?.(message);
          return { handled: true, success: false };
        }

        const outbound = extractOutboundPayload(preview) || {
          message: preview.message,
          phone: preview.phone || phone,
          language: preview.language
        };
        const customerCareWindow = preview.customerCareWindow || null;
        const resolvedPhone =
          outbound.phone || preview.phone || phone || workspace?.phone || null;

        if (shouldUseSharedComposerForInterviewAction(customerCareWindow)) {
          setComposerSession({
            ...buildInterviewComposerPrefill({
              actionId,
              previewMessage: outbound.message || preview.message,
              phone: resolvedPhone,
              appointmentId: persistedId
            }),
            customerCareWindow,
            titleKey:
              actionId === "send_zoom_link"
                ? "whatsappActionResendZoom"
                : actionId === "send_interview_reminder"
                  ? "whatsappActionSendReminder"
                  : "whatsappActionResendInterviewDetails"
          });
          return { handled: true, success: true, mode: "freeform_composer" };
        }

        setTemplateSession({
          ...buildInterviewTemplateConfirmModel({
            actionId,
            phone: resolvedPhone,
            appointmentId: persistedId,
            language: outbound.language || preview.language,
            preferredLanguage:
              workspace?.capture?.preferredLanguage ||
              workspace?.prospect?.preferred_language ||
              workspace?.raw?.prospect?.preferred_language ||
              null,
            communicationLanguage:
              workspace?.capture?.communicationLanguage ||
              workspace?.prospect?.communication_language ||
              null,
            customerCareWindow
          }),
          previewMessage: outbound.message || preview.message || null,
          language: outbound.language || preview.language || null
        });
        return { handled: true, success: true, mode: "approved_template" };
      } catch (requestError) {
        console.error(requestError);
        const message = translate("communicationPreviewLoadFailed");
        setError(message);
        showToast?.showError?.(message);
        return { handled: true, success: false };
      } finally {
        setBusy(false);
      }
    },
    [showToast, translate]
  );

  const confirmApprovedTemplateSend = useCallback(async () => {
    if (!templateSession?.appointmentId || !templateSession?.purpose) {
      return { success: false };
    }

    const sendFn = SEND_BY_PURPOSE[templateSession.purpose];
    if (!sendFn) {
      return { success: false };
    }

    setBusy(true);
    setError(null);

    try {
      const result = await sendFn(templateSession.appointmentId);

      if (!result?.success) {
        const message =
          result?.message || translate("missionControlActionFailed");
        setError(message);
        showToast?.showError?.(message);
        return { success: false };
      }

      // Native template path must never open wa.me.
      if (result.opensWaMe || result.deliveryMode === "copy_open") {
        const message = translate("missionControlActionFailed");
        setError(message);
        showToast?.showError?.(message);
        return { success: false };
      }

      showToast?.showSuccess?.(
        translate(result.toastKey || "whatsappNativeTemplateSent")
      );
      await onRecorded?.(result);
      setTemplateSession(null);
      return { success: true, ...result };
    } catch (requestError) {
      console.error(requestError);
      const message = translate("missionControlActionFailed");
      setError(message);
      showToast?.showError?.(message);
      return { success: false };
    } finally {
      setBusy(false);
    }
  }, [onRecorded, showToast, templateSession, translate]);

  return {
    busy,
    error,
    composerSession,
    templateSession,
    openInterviewWhatsAppAction,
    closeComposer,
    closeTemplateSession,
    confirmApprovedTemplateSend,
    isNativeInterviewWhatsAppAction
  };
}
