import { useCallback, useState } from "react";
import {
  MissionControlError,
  postMissionControlAction
} from "../../../services/missionControlService";
import { updateProspectCommunicationLanguage } from "../services/prospectWorkspaceApi";
import {
  archiveProspect,
  assignProspect,
  mergeProspects,
  ProspectLifecycleError,
  restoreProspect,
  updateProspect
} from "../services/prospectLifecycleApi";

export function useWorkspaceActions({
  workspace,
  prospectCoreId,
  refreshWorkspace,
  translate,
  showToast,
  confirm
}) {
  const [actionError, setActionError] = useState(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [pendingActionId, setPendingActionId] = useState(null);
  const [communicationLanguageSaving, setCommunicationLanguageSaving] = useState(false);
  const [communicationLanguageError, setCommunicationLanguageError] = useState(null);

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

      if (actionId === "whatsapp") {
        window.open(`https://wa.me/${workspace.phone.replace(/\D/g, "")}`, "_blank");
        await postMissionControlAction(workspace.phone, "log_whatsapp_open");
        showToast?.showSuccess(translate("workspaceToastActionCompleted"));
        setPendingActionId(null);
        return;
      }

      try {
        let actionPayload = {};

        if (actionId === "notes") {
          const text = window.prompt(translate("missionControlAddNotePrompt"));

          if (!text?.trim()) {
            setPendingActionId(null);
            return;
          }

          actionPayload = { text: text.trim() };
        }

        const result = await postMissionControlAction(workspace.phone, actionId, actionPayload);

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
    [workspace?.phone, refreshWorkspace, showToast, translate]
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
        const assignedAgentId = window.prompt(translate("workspaceAssignPrompt"));

        if (!assignedAgentId?.trim()) {
          return;
        }

        await runLifecycleAction(
          actionId,
          () => assignProspect(prospectCoreId, { assignedAgentId: assignedAgentId.trim() }),
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
        const mergedId = window.prompt(translate("workspaceMergePrompt"));

        if (!mergedId?.trim()) {
          return;
        }

        await runLifecycleAction(
          actionId,
          () =>
            mergeProspects({
              survivorId: prospectCoreId,
              mergedId: mergedId.trim()
            }),
          translate("workspaceToastMerged")
        );
        return;
      }

      if (actionId === "update") {
        const displayName = window.prompt(translate("workspaceUpdatePrompt"));

        if (!displayName?.trim()) {
          return;
        }

        await runLifecycleAction(
          actionId,
          () => updateProspect(prospectCoreId, { displayName: displayName.trim() }),
          translate("workspaceToastUpdated")
        );
        return;
      }

      if (actionId === "schedule") {
        await handleMissionAction("schedule");
        return;
      }

      if (actionId === "contact") {
        await handleMissionAction("whatsapp");
      }
    },
    [confirm, handleMissionAction, prospectCoreId, runLifecycleAction, translate]
  );

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
    handleOrganizationResourceMissing
  };
}
