import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getDashboard } from "../services/api";
import { getOrganizationSettings } from "../services/organizationService";
import {
  getMissionControl,
  MissionControlError,
  postMissionControlAction
} from "../services/missionControlService";
import {
  adaptMissionControlResponse
} from "../adapters/missionControlAdapter";
import AgentMetricPanel from "../components/AgentMetricPanel";
import WorkflowCompleteBanner from "../components/WorkflowCompleteBanner";
import MissionControlDashboard from "../components/mission-control/MissionControlDashboard";
import MissionControlPermanentActions from "../components/mission-control/MissionControlPermanentActions";
import CommunicationActionsPanel from "../components/communication/CommunicationActionsPanel";
import MissionActionCenter from "../components/mission-control/MissionActionCenter";
import MissionControlWorkspaceHeader from "../components/mission-control/MissionControlWorkspaceHeader";
import MissionControlExecutionPanel from "../components/mission-control/MissionControlExecutionPanel";
import { useMissionExecutionSuccessToast } from "../components/mission-control/MissionExecutionSuccessToast";
import { useToast } from "../components/ui/ToastProvider";
import {
  isWhatsAppCopyAction
} from "../services/whatsappCommunicationService";
import { executeCommunicationAction } from "../engines/communicationActionEngine";
import { executeScheduleInterview } from "../services/missionExecutionService";
import {
  fetchProspectMissions,
  recalculateMissions
} from "../services/missionService";
import {
  buildAgentMetrics,
  buildWorkspaceContext
} from "../engines/contextEngine";
import {
  buildQueueFromBackendWorkflowQueue,
  findQueueIndex,
  getNextPriorityProspect,
  getQueueNeighbors
} from "../engines/queueEngine";
import {
  createDefaultWorkflowState,
  saveWorkflowState
} from "../engines/workflowEngine";
import {
  EXECUTIVE_FILTER_LABEL_KEYS,
  filterQueueForExecutiveFilter
} from "../engines/executiveFilterEngine";
import { useLanguage } from "../i18n/LanguageContext";
import { navigateToProspectWorkspace } from "../utils/prospectRoutes";
import { subscribeProspectProfileUpdated } from "../utils/prospectRefreshBus";
import { usePromptDialog } from "../hooks/usePromptDialog";
import "./MissionControl.css";

const MISSION_CONTROL_LIVE_POLL_MS = 5000;

function findDashboardProspect(dashboard, phone) {
  if (!dashboard?.prospects?.length || !phone) {
    return null;
  }

  return dashboard.prospects.find((prospect) => prospect.phone === phone) || null;
}

function buildProspectPatchFromMissionControl(missionControl) {
  const prospect = missionControl?.prospect;

  if (!prospect) {
    return null;
  }

  return {
    name: prospect.name || undefined,
    city: prospect.city ?? null,
    state: prospect.state ?? null,
    occupation: prospect.occupation ?? null
  };
}

function patchProspectInCollection(collection, phone, patch) {
  if (!collection?.length || !phone || !patch) {
    return collection;
  }

  return collection.map((item) => (item.phone === phone ? { ...item, ...patch } : item));
}

async function loadWorkspaceForQueueItem(item, dashboardData) {
  const dashboardProspect = findDashboardProspect(dashboardData, item.phone);
  const missionControl = await getMissionControl(item.phone);

  if (!missionControl) {
    return null;
  }

  return adaptMissionControlResponse(missionControl, dashboardProspect || item, {
    isLive: true
  });
}

export default function Dashboard() {
  const { phone: routePhone } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { translate } = useLanguage();
  const executiveFilter = searchParams.get("filter");
  const deepLinkPhone = routePhone || searchParams.get("phone");
  const [dashboard, setDashboard] = useState(null);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [workspace, setWorkspace] = useState(null);
  const [workflowComplete, setWorkflowComplete] = useState(null);
  const [primaryMission, setPrimaryMission] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [prospectLoading, setProspectLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [organizationSettings, setOrganizationSettings] = useState(null);
  const [activeMetricPanel, setActiveMetricPanel] = useState(null);
  const [expandedMissionActionId, setExpandedMissionActionId] = useState(null);
  const [executionSubmitting, setExecutionSubmitting] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [qualificationDraftActive, setQualificationDraftActive] = useState(false);
  const showMissionExecutionSuccess = useMissionExecutionSuccessToast();
  const { showSuccess, showError, showInfo } = useToast();
  const { prompt, promptDialog } = usePromptDialog();

  const loadProspectAtIndex = useCallback(async (index, queueItems, dashboardData) => {
    const item = queueItems[index];

    if (!item) {
      return;
    }

    setProspectLoading(true);
    setLoadError(null);
    setActionError(null);

    try {
      const adapted = await loadWorkspaceForQueueItem(item, dashboardData);

      if (!adapted) {
        setLoadError({ key: "missionControlNoData" });
        return;
      }

      setWorkspace(adapted);
      setCurrentIndex(index);
      setWorkflowComplete(null);
    } catch (err) {
      console.error(err);
      setLoadError(
        err instanceof MissionControlError
          ? { key: "missionControlLoadError" }
          : { key: "missionControlProspectLoadError" }
      );
    } finally {
      setProspectLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [dashboardData, orgSettings] = await Promise.all([
          getDashboard(),
          getOrganizationSettings()
        ]);
        const workflowQueue = dashboardData.prioritizedWorkflowQueue || [];
        const fullQueue = buildQueueFromBackendWorkflowQueue(
          workflowQueue,
          dashboardData.prospects
        );
        const filteredQueue = executiveFilter
          ? filterQueueForExecutiveFilter(
              fullQueue,
              executiveFilter,
              workflowQueue,
              dashboardData.prospects
            )
          : fullQueue;
        const sortedQueue = filteredQueue.length ? filteredQueue : fullQueue;
        const targetPhone = deepLinkPhone || sortedQueue[0]?.phone;
        const initialIndex = findQueueIndex(sortedQueue, targetPhone);
        const initialItem = sortedQueue[initialIndex];

        setDashboard(dashboardData);
        setOrganizationSettings(orgSettings);
        setQueue(sortedQueue);

        if (!initialItem) {
          const filterLabelKey = EXECUTIVE_FILTER_LABEL_KEYS[executiveFilter];
          setLoadError(
            executiveFilter
              ? {
                  key: "missionControlNoProspectsForFilter",
                  params: {
                    filter: filterLabelKey
                      ? translate(filterLabelKey)
                      : executiveFilter
                  }
                }
              : { key: "missionControlNoQueue" }
          );
          return;
        }

        const adapted = await loadWorkspaceForQueueItem(initialItem, dashboardData);

        if (!adapted) {
          setLoadError({ key: "missionControlNoActive" });
          return;
        }

        setWorkspace(adapted);
        setCurrentIndex(initialIndex);
      } catch (err) {
        console.error(err);
        setLoadError({ key: "missionControlWorkspaceError" });
      } finally {
        setInitialLoading(false);
      }
    }

    loadDashboard();
  }, [executiveFilter, deepLinkPhone, translate]);

  const phone = workspace?.phone;

  const refreshMissions = useCallback(async (prospectPhone = phone) => {
    if (!prospectPhone) {
      setPrimaryMission(null);
      return;
    }

    try {
      const result = await fetchProspectMissions(prospectPhone);
      setPrimaryMission(result.primaryMission || null);
    } catch (error) {
      console.error("[missions]", error);
      setPrimaryMission(null);
    }
  }, [phone]);

  useEffect(() => {
    setExpandedMissionActionId(null);
    setQualificationDraftActive(false);
    refreshMissions(phone);
  }, [phone, refreshMissions]);

  const refreshCurrentWorkspace = useCallback(async () => {
    const currentItem = queue[currentIndex];

    if (!currentItem || !dashboard) {
      return;
    }

    const adapted = await loadWorkspaceForQueueItem(currentItem, dashboard);

    if (adapted) {
      setWorkspace(adapted);
    }
  }, [queue, currentIndex, dashboard]);

  const evaluateMissionWorkflow = useCallback(
    async ({ skipAdvance = false } = {}) => {
      if (!phone) {
        return null;
      }

      setExpandedMissionActionId(null);
      setExecutionError(null);

      const missionsResult = await fetchProspectMissions(phone);
      const nextMission = missionsResult.primaryMission || null;
      setPrimaryMission(nextMission);
      await recalculateMissions({ prospectPhone: phone }).catch(() => {});

      if (!skipAdvance && !nextMission) {
        const next = getNextPriorityProspect(queue, currentIndex);

        if (next) {
          await loadProspectAtIndex(next.index, queue, dashboard);
        }
      }

      return nextMission;
    },
    [phone, queue, currentIndex, dashboard, loadProspectAtIndex]
  );

  const handleConversationOutcomeSaved = useCallback(
    async (result) => {
      const currentItem = queue[currentIndex];

      if (result?.missionControl && currentItem) {
        const prospectPatch = buildProspectPatchFromMissionControl(result.missionControl);
        const patchedItem = prospectPatch
          ? { ...currentItem, ...prospectPatch }
          : currentItem;

        if (prospectPatch) {
          setDashboard((previous) =>
            previous
              ? {
                  ...previous,
                  prospects: patchProspectInCollection(
                    previous.prospects,
                    currentItem.phone,
                    prospectPatch
                  )
                }
              : previous
          );
          setQueue((previous) =>
            patchProspectInCollection(previous, currentItem.phone, prospectPatch)
          );
        }

        const adapted = adaptMissionControlResponse(
          result.missionControl,
          findDashboardProspect(dashboard, currentItem.phone) || patchedItem,
          { isLive: true }
        );
        setWorkspace(adapted);
        await refreshMissions(phone);
        await evaluateMissionWorkflow({ skipAdvance: Boolean(result.missionControl?.primaryMission) });

        return;
      }

      await refreshCurrentWorkspace();
      await evaluateMissionWorkflow();
    },
    [phone, queue, currentIndex, dashboard, refreshCurrentWorkspace, refreshMissions, evaluateMissionWorkflow]
  );

  useEffect(() => {
    if (!phone || !workspace?.isLive || prospectLoading || qualificationDraftActive) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      refreshCurrentWorkspace();
    }, MISSION_CONTROL_LIVE_POLL_MS);

    return () => window.clearInterval(timer);
  }, [phone, workspace?.isLive, prospectLoading, qualificationDraftActive, refreshCurrentWorkspace]);

  useEffect(() => {
    return subscribeProspectProfileUpdated((updatedPhone) => {
      if (!updatedPhone || updatedPhone !== phone) {
        return;
      }

      refreshCurrentWorkspace();
      refreshMissions(updatedPhone);
    });
  }, [phone, refreshCurrentWorkspace, refreshMissions]);

  const handleOrganizationResourceMissing = useCallback(
    (resourceKey) => {
      const messages = {
        zoomInterviewUrl: translate("missionControlZoomNotConfigured"),
        "office.mapsUrl": translate("missionControlOfficeNotConfigured")
      };

      setActionError(messages[resourceKey] || translate("missionControlOrgResourceMissing"));
    },
    [translate]
  );

  const handleWhatsAppFallbackOffer = useCallback(
    ({ phone: targetPhone }) => {
      showInfo(translate("zoomInvitationCopyWhatsAppOffer"), {
        actionLabel: translate("zoomInvitationCopyWhatsAppAction"),
        duration: 10000,
        onAction: () => {
          executeCommunicationAction({
            phone: targetPhone,
            actionId: "send_zoom_link",
            forceWhatsApp: true,
            translate,
            showSuccess,
            showError: (message) => {
              setActionError(message);
              showError(message);
            },
            onOrganizationResourceMissing: handleOrganizationResourceMissing,
            onRecorded: async () => {
              await refreshCurrentWorkspace();
              await refreshMissions(targetPhone);
              await recalculateMissions({ prospectPhone: targetPhone }).catch(() => {});
            }
          });
        }
      });
    },
    [
      translate,
      showInfo,
      showSuccess,
      showError,
      handleOrganizationResourceMissing,
      refreshCurrentWorkspace,
      refreshMissions
    ]
  );

  const runCommunicationAction = useCallback(
    async (actionId, { forceWhatsApp = false } = {}) => {
      if (!phone) {
        return;
      }

      await executeCommunicationAction({
        phone,
        actionId,
        forceWhatsApp,
        translate,
        showSuccess,
        showInfo,
        showError: (message) => {
          setActionError(message);
          showError(message);
        },
        onOrganizationResourceMissing: handleOrganizationResourceMissing,
        onWhatsAppFallbackOffer: handleWhatsAppFallbackOffer,
        onRecorded: async () => {
          await refreshCurrentWorkspace();
          await refreshMissions(phone);
          await recalculateMissions({ prospectPhone: phone }).catch(() => {});
        }
      });
    },
    [
      phone,
      translate,
      showSuccess,
      showInfo,
      showError,
      handleOrganizationResourceMissing,
      handleWhatsAppFallbackOffer,
      refreshCurrentWorkspace,
      refreshMissions
    ]
  );

  const handleMissionAction = useCallback(
    async (actionId) => {
      setActionError(null);

      if (actionId === "call") {
        if (phone) {
          window.open(`tel:${phone}`, "_self");
        }

        if (phone) {
          const result = await postMissionControlAction(phone, "call");

          if (!result.success) {
            setActionError(result.message);
          }
        }

        return;
      }

      if (isWhatsAppCopyAction(actionId)) {
        await runCommunicationAction(actionId);
        return;
      }

      if (!phone) {
        return;
      }

      try {
        let payload = {};

        if (actionId === "notes") {
          const text = await prompt({
            title: translate("missionControlActionNotes"),
            label: translate("missionControlAddNotePrompt"),
            placeholder: translate("workspaceActivityAddNotePlaceholder"),
            confirmLabel: translate("workspaceActivityAddNote"),
            cancelLabel: translate("workspaceCancel"),
            multiline: true
          });

          if (!text) {
            return;
          }

          payload = { text };
        }

        const result = await postMissionControlAction(phone, actionId, payload);

        if (!result.success) {
          setActionError(result.message);
          return;
        }

        await refreshCurrentWorkspace();
        await refreshMissions(phone);
        await recalculateMissions({ prospectPhone: phone }).catch(() => {});
      } catch (err) {
        console.error(err);
        setActionError(translate("missionControlActionFailed"));
      }
    },
    [phone, queue, currentIndex, refreshCurrentWorkspace, refreshMissions, translate, runCommunicationAction, prompt]
  );

  const handleMissionActionImmediate = useCallback(
    async (actionId) => {
      setActionError(null);

      if (isWhatsAppCopyAction(actionId)) {
        if (!phone) {
          return;
        }

        await runCommunicationAction(actionId);
        return;
      }

      await handleMissionAction(actionId);
      await evaluateMissionWorkflow();
    },
    [
      phone,
      translate,
      runCommunicationAction,
      refreshCurrentWorkspace,
      evaluateMissionWorkflow,
      handleMissionAction
    ]
  );

  const handleMissionActionScheduleSubmit = useCallback(
    async (form) => {
      if (!phone) {
        return;
      }

      setExecutionSubmitting(true);
      setExecutionError(null);
      setActionError(null);

      try {
        const interviewTypeMap = {
          zoom: "Zoom",
          office: "In Person",
          public_location: "Public Location"
        };
        const interviewType = interviewTypeMap[form.interviewType] || "In Person";
        const result = await executeScheduleInterview(phone, {
          dateKey: form.dateKey,
          timeKey: form.timeKey,
          duration: form.duration,
          interviewType,
          recruiter: form.recruiter?.trim() || undefined,
          officeLocation: form.officeLocation?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          email: form.email || undefined
        });

        if (!result.success) {
          setExecutionError(result.message || translate("missionExecutionFailed"));
          return;
        }

        const currentItem = queue[currentIndex];

        if (result.missionControl && currentItem) {
          const adapted = adaptMissionControlResponse(
            result.missionControl,
            findDashboardProspect(dashboard, currentItem.phone) || currentItem,
            { isLive: true }
          );
          setWorkspace(adapted);
        } else {
          await refreshCurrentWorkspace();
        }

        await refreshMissions(phone);
        showMissionExecutionSuccess(result);
        await evaluateMissionWorkflow();
      } catch (error) {
        console.error(error);
        setExecutionError(
          error instanceof MissionControlError
            ? translate("missionExecutionFailed")
            : error.message || translate("missionExecutionFailed")
        );
      } finally {
        setExecutionSubmitting(false);
      }
    },
    [
      phone,
      queue,
      currentIndex,
      dashboard,
      refreshCurrentWorkspace,
      refreshMissions,
      translate,
      showMissionExecutionSuccess,
      evaluateMissionWorkflow
    ]
  );

  const handleMissionActionOutcomeComplete = useCallback(
    async (formState, result) => {
      if (!phone) {
        return;
      }

      const currentItem = queue[currentIndex];

      if (result?.missionControl && currentItem) {
        const adapted = adaptMissionControlResponse(
          result.missionControl,
          findDashboardProspect(dashboard, currentItem.phone) || currentItem,
          { isLive: true }
        );
        setWorkspace(adapted);

        const agentOutcome = result.missionControl.brain?.outcome ?? result.outcome ?? null;
        const saved = saveWorkflowState(phone, {
          ...createDefaultWorkflowState(),
          outcome: agentOutcome,
          orientationDate: formState?.orientationDate || null,
          orientationTime: formState?.orientationTime || null,
          orientationScheduled: Boolean(formState?.orientationDate && formState?.orientationTime),
          followUpDate: formState?.followUpDate || null,
          followUpTime: formState?.followUpTime || null
        });

        if (
          (result.outcome === "Recruited" || result.outcome === "Orientation Scheduled") &&
          saved.orientationScheduled
        ) {
          setWorkflowComplete({
            message: translate("missionControlOrientationReady")
          });
        }
      } else {
        await refreshCurrentWorkspace();
      }

      await evaluateMissionWorkflow();
    },
    [phone, queue, currentIndex, dashboard, refreshCurrentWorkspace, translate, evaluateMissionWorkflow]
  );

  const handleMissionActionQualificationSaved = handleConversationOutcomeSaved;

  const displayWorkflowState = useMemo(() => {
    const agentState = workspace?.raw?.agentState;
    return agentState
      ? { ...createDefaultWorkflowState(), ...agentState }
      : createDefaultWorkflowState();
  }, [workspace]);

  const workspaceContext = useMemo(() => {
    if (!workspace || !organizationSettings) {
      return null;
    }

    return buildWorkspaceContext({
      workspace,
      organizationSettings,
      workflowState: displayWorkflowState,
      translate,
      handlers: {
        onAction: handleMissionAction,
        onOrganizationResourceMissing: handleOrganizationResourceMissing
      }
    });
  }, [
    workspace,
    organizationSettings,
    displayWorkflowState,
    translate,
    handleMissionAction,
    handleOrganizationResourceMissing
  ]);

  const { totalProspects, previousProspect, nextProspect } = useMemo(
    () => getQueueNeighbors(queue, currentIndex),
    [queue, currentIndex]
  );

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      loadProspectAtIndex(currentIndex - 1, queue, dashboard);
    }
  }, [currentIndex, loadProspectAtIndex, queue, dashboard]);

  const goToNextPriority = useCallback(() => {
    const next = getNextPriorityProspect(queue, currentIndex);

    if (next) {
      loadProspectAtIndex(next.index, queue, dashboard);
    }
  }, [currentIndex, loadProspectAtIndex, queue, dashboard]);

  const openWorkspaceForPhone = useCallback(
    (targetPhone) => {
      navigateToProspectWorkspace(navigate, targetPhone);
      setActiveMetricPanel(null);
    },
    [navigate]
  );

  function renderLoadError(error) {
    if (!error) {
      return null;
    }

    if (typeof error === "string") {
      return error;
    }

    return translate(error.key, error.params);
  }

  if (initialLoading) {
    return <h2>🚀 {translate("missionControlLoading")}</h2>;
  }

  if (loadError && !workspace) {
    return (
      <div>
        <p>{renderLoadError(loadError)}</p>
      </div>
    );
  }

  if (!dashboard) {
    return <h2>🚀 {translate("missionControlLoading")}</h2>;
  }

  if (!workspace || !workspaceContext) {
    return (
      <div>
        <p>{translate("missionControlNoActive")}</p>
      </div>
    );
  }

  const qualificationInputs = workspace?.conversationOutcome?.requiredInputs || [];
  const hasMissionActions = Boolean(primaryMission) || qualificationInputs.length > 0;
  const metrics = {
    ...buildAgentMetrics(dashboard),
    prospectsAction: queue.length
  };

  const prospectEmail = workspaceContext.prospect.email || workspace?.conversationOutcome?.fields?.email || null;
  const nextAction =
    primaryMission?.primaryAction?.label ||
    primaryMission?.title ||
    null;

  return (
    <>
      {promptDialog}
      <AgentMetricPanel
        type={activeMetricPanel}
        queue={queue}
        onClose={() => setActiveMetricPanel(null)}
        onOpenWorkspace={openWorkspaceForPhone}
      />

      <div className="mission-control-shell">
        <div className="mission-control-cockpit">
          <MissionControlWorkspaceHeader
            prospect={workspaceContext.prospect}
            phone={phone}
            email={prospectEmail}
            nextAction={nextAction}
            executiveFilter={executiveFilter}
            currentIndex={currentIndex}
            totalProspects={totalProspects}
            previousProspect={previousProspect}
            nextProspect={nextProspect}
            onPrevious={goToPrevious}
            onNext={goToNextPriority}
          />
        </div>

        <div className="mission-control-shell__body">
          {prospectLoading ? (
            <p className="mission-control-page__loading">{translate("missionControlLoadingProspect")}</p>
          ) : null}

          {loadError ? (
            <p className="mission-control-page__error">{renderLoadError(loadError)}</p>
          ) : null}

          {actionError ? (
            <p className="mission-control-page__error">{actionError}</p>
          ) : null}

          {workflowComplete ? (
            <WorkflowCompleteBanner
              message={workflowComplete.message}
              hasNextPriority={Boolean(nextProspect)}
              onNextPriority={goToNextPriority}
            />
          ) : null}

          <MissionControlDashboard
            metrics={metrics}
            executiveFilter={executiveFilter}
            onOpenMetricPanel={setActiveMetricPanel}
          />

          <div className="mission-control-page__workspace">
            {hasMissionActions ? (
              <MissionActionCenter
                mission={primaryMission}
                phone={phone}
                prospect={workspaceContext.prospect}
                conversationOutcome={workspace.conversationOutcome}
                workflowGate={workspace.workflowGate}
                rawWorkflowGate={workspace.raw?.workflowGate}
                recruiterName="Ana"
                expandedActionId={expandedMissionActionId}
                onExpandedActionIdChange={setExpandedMissionActionId}
                busy={executionSubmitting || prospectLoading}
                submitting={executionSubmitting}
                submitError={executionError}
                onImmediateAction={handleMissionActionImmediate}
                onScheduleSubmit={handleMissionActionScheduleSubmit}
                onOutcomeComplete={handleMissionActionOutcomeComplete}
                onQualificationSaved={handleMissionActionQualificationSaved}
                onQualificationDraftChange={setQualificationDraftActive}
                onCancel={() => {
                  setExecutionError(null);
                  setExpandedMissionActionId(null);
                }}
              />
            ) : null}

            <CommunicationActionsPanel
              workspace={workspace}
              onAction={handleMissionAction}
              busy={executionSubmitting || prospectLoading}
            />

            <MissionControlPermanentActions
              phone={phone}
              onAction={handleMissionAction}
              busy={executionSubmitting || prospectLoading}
            />

            <MissionControlExecutionPanel
              workspace={workspace}
              primaryMission={primaryMission}
              expandedBrief={workspaceContext.expandedBrief}
              phone={phone}
            />
          </div>
        </div>
      </div>
    </>
  );
}
