import { useCallback, useState } from "react";
import {
  MissionControlError,
  postMissionControlAction
} from "../../../services/missionControlService";
import {
  isWhatsAppCopyAction
} from "../../../services/whatsappCommunicationService";
import { executeCommunicationAction } from "../../../engines/communicationActionEngine";
import { updateProspectCommunicationLanguage, ProspectWorkspaceError } from "../services/prospectWorkspaceApi";
import {
  archiveProspect,
  assignProspect,
  mergeProspects,
  ProspectLifecycleError,
  restoreProspect
} from "../services/prospectLifecycleApi";
import { notifyProspectProfileUpdated } from "../../../utils/prospectRefreshBus";

export function useWorkspaceActions({
  workspace,
  prospectCoreId,
  refreshWorkspace,
  translate,
  showToast,
  confirm,
  prompt
}) {
  const [actionError, setActionError] = useState(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [pendingActionId, setPendingActionId] = useState(null);
  const [communicationLanguageSaving, setCommunicationLanguageSaving] = useState(false);
  const [communicationLanguageError, setCommunicationLanguageError] = useState(null);
  const [prospectEditorOpen, setProspectEditorOpen] = useState(false);

  const handleOrganizationResourceMissing = useCallback(
    (resourceKey) => {
      const messages = {
        zoomInterviewUrl: translate("missionControlZoomNotConfigured"),
        "office.mapsUrl": translate("missionControlOfficeNotConfigured")
      };

      const message = messages[resourceKey] || translate("missionControlOrgResourceMissing");
      setActionError(message);
      showToast?.showError(message);
    },
    [showToast, translate]
  );

  const handleWhatsAppFallbackOffer = useCallback(
    ({ phone: targetPhone }) => {
      showToast?.showInfo(translate("zoomInvitationCopyWhatsAppOffer"), {
        actionLabel: translate("zoomInvitationCopyWhatsAppAction"),
        duration: 10000,
        onAction: () => {
          executeCommunicationAction({
            phone: targetPhone,
            actionId: "send_zoom_link",
            forceWhatsApp: true,
            translate,
            showSuccess: showToast?.showSuccess,
            showError: (message) => {
              setActionError(message);
              showToast?.showError(message);
            },
            onOrganizationResourceMissing: handleOrganizationResourceMissing,
            onRecorded: refreshWorkspace
          });
        }
      });
    },
    [showToast, translate, handleOrganizationResourceMissing, refreshWorkspace]
  );

  const handleMissionAction = useCallback(
    async (actionId) => {
      setActionError(null);
      setPendingActionId(actionId);

      if (!workspace?.phone) {
        setPendingActionId(null);
        return;
      }

      if (actionId === "call") {
        window.open(`tel:${workspace.phone}`, "_self");
        await postMissionControlAction(workspace.phone, "call");
        showToast?.showSuccess(translate("workspaceToastActionCompleted"));
        setPendingActionId(null);
        return;
      }

      if (isWhatsAppCopyAction(actionId)) {
        await executeCommunicationAction({
          phone: workspace.phone,
          actionId,
          translate,
          showSuccess: showToast?.showSuccess,
          showInfo: showToast?.showInfo,
          showError: (message) => {
            setActionError(message);
            showToast?.showError(message);
          },
          onOrganizationResourceMissing: handleOrganizationResourceMissing,
          onWhatsAppFallbackOffer: handleWhatsAppFallbackOffer,
          onRecorded: refreshWorkspace
        });
        setPendingActionId(null);
        return;
      }

      if (actionId === "resend_interview_details") {
        await executeCommunicationAction({
          phone: workspace.phone,
          actionId,
          appointmentId: workspace.interview?.appointmentId,
          translate,
          showSuccess: showToast?.showSuccess,
          showError: (message) => {
            setActionError(message);
            showToast?.showError(message);
          },
          onOrganizationResourceMissing: handleOrganizationResourceMissing,
          onRecorded: refreshWorkspace
        });
        setPendingActionId(null);
        return;
      }

      if (actionId === "reschedule") {
        try {
          const result = await postMissionControlAction(workspace.phone, actionId, {});

          if (!result.success) {
            setActionError(result.message);
            showToast?.showError(result.message);
            return;
          }

          await refreshWorkspace();
          showToast?.showSuccess(translate("workspaceToastActionCompleted"));
        } catch (error) {
          console.error(error);
          const message =
            error instanceof MissionControlError
              ? translate("missionControlActionFailed")
              : error.message;
          setActionError(message);
          showToast?.showError(message);
        } finally {
          setPendingActionId(null);
        }

        return;
      }

      try {
        const result = await postMissionControlAction(workspace.phone, actionId, {});

        if (!result.success) {
          setActionError(result.message);
          showToast?.showError(result.message);
          return;
        }

        await refreshWorkspace();
        showToast?.showSuccess(translate("workspaceToastActionCompleted"));
      } catch (error) {
        console.error(error);
        const message =
          error instanceof MissionControlError
            ? translate("missionControlActionFailed")
            : error.message;
        setActionError(message);
        showToast?.showError(message);
      } finally {
        setPendingActionId(null);
      }
    },
    [workspace?.phone, workspace?.interview?.appointmentId, refreshWorkspace, showToast, translate, handleOrganizationResourceMissing, handleWhatsAppFallbackOffer]
  );

  const runLifecycleAction = useCallback(
    async (actionId, runner, successMessage) => {
      if (!prospectCoreId) {
        const message = translate("workspaceLifecycleRequiresCoreProspect");
        setActionError(message);
        showToast?.showWarning(message);
        return;
      }

      setLifecycleBusy(true);
      setPendingActionId(actionId);
      setActionError(null);

      try {
        await runner();
        await refreshWorkspace();
        showToast?.showSuccess(successMessage || translate("workspaceToastActionCompleted"));
      } catch (error) {
        console.error(error);
        const message =
          error instanceof ProspectLifecycleError
            ? error.message
            : translate("workspaceLifecycleActionFailed");
        setActionError(message);
        showToast?.showError(message);
      } finally {
        setLifecycleBusy(false);
        setPendingActionId(null);
      }
    },
    [prospectCoreId, refreshWorkspace, showToast, translate]
  );

  const handleLifecycleAction = useCallback(
    async (actionId) => {
      if (actionId === "assign") {
        const assignedAgentId = prompt
          ? await prompt({
              title: translate("workspaceActionAssign"),
              label: translate("workspaceAssignPrompt"),
              confirmLabel: translate("workspaceActionAssign"),
              cancelLabel: translate("workspaceCancel")
            })
          : null;

        if (!assignedAgentId) {
          return;
        }

        await runLifecycleAction(
          actionId,
          () => assignProspect(prospectCoreId, { assignedAgentId }),
          translate("workspaceToastAssigned")
        );
        return;
      }

      if (actionId === "archive") {
        const confirmed = confirm
          ? await confirm({
              title: translate("workspaceArchiveConfirmTitle"),
              body: translate("workspaceArchiveConfirm"),
              confirmLabel: translate("workspaceArchiveConfirmAction"),
              cancelLabel: translate("workspaceCancel")
            })
          : window.confirm(translate("workspaceArchiveConfirm"));

        if (!confirmed) {
          return;
        }

        await runLifecycleAction(
          actionId,
          () => archiveProspect(prospectCoreId),
          translate("workspaceToastArchived")
        );
        return;
      }

      if (actionId === "restore") {
        await runLifecycleAction(
          actionId,
          () => restoreProspect(prospectCoreId),
          translate("workspaceToastRestored")
        );
        return;
      }

      if (actionId === "merge") {
        const mergedId = prompt
          ? await prompt({
              title: translate("workspaceActionMerge"),
              label: translate("workspaceMergePrompt"),
              confirmLabel: translate("workspaceActionMerge"),
              cancelLabel: translate("workspaceCancel")
            })
          : null;

        if (!mergedId) {
          return;
        }

        await runLifecycleAction(
          actionId,
          () =>
            mergeProspects({
              survivorId: prospectCoreId,
              mergedId
            }),
          translate("workspaceToastMerged")
        );
        return;
      }

      if (actionId === "update") {
        setProspectEditorOpen(true);
        return;
      }

      if (actionId === "schedule") {
        await handleMissionAction("schedule");
      }
    },
    [confirm, handleMissionAction, prompt, prospectCoreId, runLifecycleAction, translate]
  );

  const handleProspectEditorClose = useCallback(() => {
    setProspectEditorOpen(false);
  }, []);

  const handleProspectEditorSaved = useCallback(async () => {
    await refreshWorkspace();
    notifyProspectProfileUpdated(workspace?.phone);
    showToast?.showSuccess(translate("workspaceToastUpdated"));
  }, [refreshWorkspace, showToast, translate, workspace?.phone]);

  const handleCommunicationLanguageChange = useCallback(
    async (nextLanguage) => {
      if (!workspace?.phone || workspace.capture?.communicationLanguage === nextLanguage) {
        return;
      }

      setCommunicationLanguageSaving(true);
      setCommunicationLanguageError(null);

      try {
        await updateProspectCommunicationLanguage(workspace.phone, nextLanguage);
        await refreshWorkspace();
        showToast?.showSuccess(translate("workspaceToastLanguageUpdated"));
      } catch (error) {
        console.error(error);
        const message = translate("workspaceCommunicationLanguageError");
        setCommunicationLanguageError(message);
        showToast?.showError(message);
      } finally {
        setCommunicationLanguageSaving(false);
      }
    },
    [workspace?.phone, workspace?.capture?.communicationLanguage, refreshWorkspace, showToast, translate]
  );

  return {
    actionError,
    lifecycleBusy,
    pendingActionId,
    communicationLanguageSaving,
    communicationLanguageError,
    handleMissionAction,
    handleLifecycleAction,
    handleCommunicationLanguageChange,
    handleOrganizationResourceMissing,
    prospectEditorOpen,
    handleProspectEditorClose,
    handleProspectEditorSaved
  };
}
