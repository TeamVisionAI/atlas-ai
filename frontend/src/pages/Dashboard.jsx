import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import ExecutiveSection from "../components/design-system/ExecutiveSection";
import ConversationOutcomePanel from "../components/ConversationOutcomePanel";
import JourneyPackage from "../components/JourneyPackage";
import WorkflowGatePanel from "../components/WorkflowGatePanel";
import MissionCard from "../components/mission-control/MissionCard";
import MissionActionCenter from "../components/mission-control/MissionActionCenter";
import MissionExecutionDialog from "../components/mission-control/MissionExecutionDialog";
import MissionControlWorkspaceHeader from "../components/mission-control/MissionControlWorkspaceHeader";
import MissionControlExecutionPanel from "../components/mission-control/MissionControlExecutionPanel";
import QualificationForm from "../components/mission-control/QualificationForm";
import { useMissionExecutionSuccessToast } from "../components/mission-control/MissionExecutionSuccessToast";
import { useToast } from "../components/ui/ToastProvider";
import {
  executeSendViaWhatsApp,
  isWhatsAppCopyAction
} from "../services/whatsappCommunicationService";
import { executeScheduleInterview } from "../services/missionExecutionService";
import {
  fetchProspectMissions,
  recalculateMissions
} from "../services/missionService";
import {
  buildAgentMetrics,
  buildWorkspaceContext
} from "../engines/contextEngine";
import { getAvailableJourneyPackages } from "../engines/journeyEngine";
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
import {
  buildProspectCenterPath,
  buildProspectWorkspacePath
} from "../utils/prospectRoutes";
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
  const [showPackageSent, setShowPackageSent] = useState(false);
  const [workflowComplete, setWorkflowComplete] = useState(null);
  const [primaryMission, setPrimaryMission] = useState(null);
  const [missionLoading, setMissionLoading] = useState(false);
  const [showOutcomeGate, setShowOutcomeGate] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [prospectLoading, setProspectLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [organizationSettings, setOrganizationSettings] = useState(null);
  const [activeMetricPanel, setActiveMetricPanel] = useState(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [executionSubmitting, setExecutionSubmitting] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [qualificationDraftActive, setQualificationDraftActive] = useState(false);
  const showMissionExecutionSuccess = useMissionExecutionSuccessToast();
  const { showSuccess, showError } = useToast();

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
      setShowPackageSent(false);
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

    setMissionLoading(true);

    try {
      const result = await fetchProspectMissions(prospectPhone);
      setPrimaryMission(result.primaryMission || null);
    } catch (error) {
      console.error("[missions]", error);
      setPrimaryMission(null);
    } finally {
      setMissionLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    setShowOutcomeGate(false);
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

        const nextMission = result.missionControl?.primaryMission;

        if (
          nextMission?.missionType === "ScheduleInterview" ||
          nextMission?.primaryAction?.id === "schedule"
        ) {
          setExecutionError(null);
          setScheduleDialogOpen(true);
        }

        return;
      }

      await refreshCurrentWorkspace();
      await refreshMissions(phone);
    },
    [phone, queue, currentIndex, dashboard, refreshCurrentWorkspace, refreshMissions]
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
        if (!phone) {
          return;
        }

        await executeSendViaWhatsApp({
          phone,
          actionId,
          translate,
          showSuccess,
          showError: (message) => {
            setActionError(message);
            showError(message);
          },
          onOrganizationResourceMissing: handleOrganizationResourceMissing,
          onRecorded: async () => {
            await refreshCurrentWorkspace();
            await refreshMissions(phone);
            await recalculateMissions({ prospectPhone: phone }).catch(() => {});
          }
        });

        return;
      }

      if (!phone) {
        return;
      }

      try {
        let payload = {};

        if (actionId === "notes") {
          const text = window.prompt(translate("missionControlAddNotePrompt"));

          if (!text?.trim()) {
            return;
          }

          payload = { text: text.trim() };
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
    [phone, queue, currentIndex, refreshCurrentWorkspace, refreshMissions, translate, showSuccess, showError, handleOrganizationResourceMissing]
  );

  const handleMissionPrimaryAction = useCallback(
    async (actionId) => {
      if (actionId === "enter_interview_outcome") {
        setShowOutcomeGate(true);
        document.getElementById("workflow-outcome-gate")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
        return;
      }

      if (actionId === "schedule") {
        setExecutionError(null);
        setScheduleDialogOpen(true);
        return;
      }

      await handleMissionAction(actionId);
    },
    [handleMissionAction]
  );

  const handleChecklistAction = useCallback(
    async ({ actionId, scrollTarget }) => {
      if (scrollTarget) {
        document.getElementById(scrollTarget)?.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
      }

      if (!actionId || actionId === "qualification") {
        return;
      }

      if (actionId === "enter_interview_outcome" || actionId === "schedule") {
        await handleMissionPrimaryAction(actionId);
        return;
      }

      if (isWhatsAppCopyAction(actionId)) {
        if (!phone) {
          return;
        }

        await executeSendViaWhatsApp({
          phone,
          actionId,
          translate,
          showSuccess,
          showError: (message) => {
            setActionError(message);
            showError(message);
          },
          onOrganizationResourceMissing: handleOrganizationResourceMissing,
          onRecorded: async () => {
            await refreshCurrentWorkspace();
            await refreshMissions(phone);
            await recalculateMissions({ prospectPhone: phone }).catch(() => {});
          }
        });
        return;
      }

      await handleMissionPrimaryAction(actionId);
    },
    [
      phone,
      translate,
      showSuccess,
      showError,
      handleMissionPrimaryAction,
      handleOrganizationResourceMissing,
      refreshCurrentWorkspace,
      refreshMissions
    ]
  );

  const handleScheduleMissionSubmit = useCallback(
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
          notes: form.notes?.trim() || undefined
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
        await recalculateMissions({ prospectPhone: phone }).catch(() => {});

        setScheduleDialogOpen(false);
        showMissionExecutionSuccess(result);
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
      showMissionExecutionSuccess
    ]
  );

  const handleMissionSecondaryAction = useCallback(
    async (actionId) => {
      await handleMissionAction(actionId);
    },
    [handleMissionAction]
  );

  const handleGateOutcome = useCallback(
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

        await refreshMissions(phone);
        await recalculateMissions({ prospectPhone: phone }).catch(() => {});
        setShowOutcomeGate(false);
        return;
      }

      await refreshCurrentWorkspace();
      await refreshMissions(phone);
      await recalculateMissions({ prospectPhone: phone }).catch(() => {});
    },
    [phone, queue, currentIndex, dashboard, refreshCurrentWorkspace, refreshMissions, translate]
  );

  const handlePackageSent = useCallback(() => {
    setShowPackageSent(true);
    setWorkflowComplete({
      message: translate("missionControlPackageSent")
    });
  }, [translate]);

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
        onSendOnboarding: handlePackageSent,
        onOrganizationResourceMissing: handleOrganizationResourceMissing
      }
    });
  }, [
    workspace,
    organizationSettings,
    displayWorkflowState,
    translate,
    handleMissionAction,
    handlePackageSent,
    handleOrganizationResourceMissing
  ]);

  const journeyPackages = useMemo(() => {
    if (!workspaceContext) {
      return [];
    }

    return getAvailableJourneyPackages(workspaceContext);
  }, [workspaceContext]);

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
      navigate(buildProspectWorkspacePath({ phone: targetPhone }));
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

  const showGate = Boolean(workspace?.workflowGate?.active);
  const shouldShowOutcomeGate =
    showOutcomeGate ||
    showGate ||
    primaryMission?.missionType === "EnterInterviewOutcome";
  const qualificationInputs = workspace?.conversationOutcome?.requiredInputs || [];
  const showQualificationForm =
    !prospectLoading && !shouldShowOutcomeGate && qualificationInputs.length > 0;
  const showMissionBlock =
    missionLoading || Boolean(primaryMission) || shouldShowOutcomeGate || showQualificationForm;
  const showConversationOutcomePanel =
    !prospectLoading &&
    !shouldShowOutcomeGate &&
    !showQualificationForm &&
    !primaryMission &&
    workspace?.conversationOutcome?.canRecordOutcome;
  const metrics = buildAgentMetrics(dashboard);

  return (
    <>
      <AgentMetricPanel
        type={activeMetricPanel}
        queue={queue}
        onClose={() => setActiveMetricPanel(null)}
        onOpenWorkspace={openWorkspaceForPhone}
      />

      <div className="mission-control-shell">
        <div className="mission-control-cockpit">
          <div className="mission-control-cockpit__utility">
            <div className="mission-control-cockpit__utility-links">
              <Link
                to={buildProspectCenterPath({
                  filter: executiveFilter || undefined
                })}
                className="mission-control-cockpit__link"
              >
                {translate("missionControlOpenProspectCenter")}
              </Link>
              {executiveFilter ? (
                <span className="mission-control-cockpit__filter">
                  {EXECUTIVE_FILTER_LABEL_KEYS[executiveFilter]
                    ? translate(EXECUTIVE_FILTER_LABEL_KEYS[executiveFilter])
                    : executiveFilter}
                </span>
              ) : null}
            </div>
            <div className="mission-control-cockpit__metrics">
              <button
                type="button"
                className={`mission-control-cockpit__metric${activeMetricPanel === "interviews" ? " is-active" : ""}`}
                onClick={() =>
                  setActiveMetricPanel((current) => (current === "interviews" ? null : "interviews"))
                }
              >
                <span className="mission-control-cockpit__metric-value">
                  {metrics?.interviews ?? 0}
                </span>{" "}
                {translate("missionControlMetricInterviews")}
              </button>
              <button
                type="button"
                className={`mission-control-cockpit__metric${activeMetricPanel === "followUps" ? " is-active" : ""}`}
                onClick={() =>
                  setActiveMetricPanel((current) => (current === "followUps" ? null : "followUps"))
                }
              >
                <span className="mission-control-cockpit__metric-value">
                  {metrics?.followUps ?? 0}
                </span>{" "}
                {translate("missionControlMetricFollowUps")}
              </button>
              <button
                type="button"
                className={`mission-control-cockpit__metric${activeMetricPanel === "tasks" ? " is-active" : ""}`}
                onClick={() =>
                  setActiveMetricPanel((current) => (current === "tasks" ? null : "tasks"))
                }
              >
                <span className="mission-control-cockpit__metric-value">{metrics?.tasks ?? 0}</span>{" "}
                {translate("missionControlMetricTasks")}
              </button>
            </div>
          </div>

          <MissionControlWorkspaceHeader
            prospect={workspaceContext.prospect}
            recruitingStatus={workspace.recruitingStatus}
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

          <div className="mission-control-page__executive">
          {showMissionBlock ? (
            <ExecutiveSection>
              {missionLoading ? (
                <p className="mission-control-page__loading">{translate("missionLoading")}</p>
              ) : null}
              {primaryMission ? (
                <MissionCard
                  mission={primaryMission}
                  translate={translate}
                  phone={phone}
                  onPrimaryAction={handleMissionPrimaryAction}
                  busy={executionSubmitting}
                />
              ) : null}
              {primaryMission && (primaryMission.secondaryActions || []).length ? (
                <MissionActionCenter
                  mission={primaryMission}
                  translate={translate}
                  phone={phone}
                  onSecondaryAction={handleMissionSecondaryAction}
                  busy={executionSubmitting}
                />
              ) : null}
              {shouldShowOutcomeGate ? (
                <div className="mission-control-page__outcome-gate">
                  <WorkflowGatePanel
                    gate={workspace.workflowGate?.active ? workspace.workflowGate : { active: true }}
                    prospectName={workspace.prospect.name}
                    phone={workspace.phone}
                    onComplete={handleGateOutcome}
                  />
                </div>
              ) : null}
              {showQualificationForm ? (
                <QualificationForm
                  key={`qualification-${phone}`}
                  phone={phone}
                  conversationOutcome={workspace.conversationOutcome}
                  disabled={prospectLoading || executionSubmitting}
                  onSaved={handleConversationOutcomeSaved}
                  onDraftActiveChange={setQualificationDraftActive}
                />
              ) : null}
            </ExecutiveSection>
          ) : null}

          <MissionControlExecutionPanel
            workspace={workspace}
            primaryMission={primaryMission}
            expandedBrief={workspaceContext.expandedBrief}
            phone={phone}
            onChecklistAction={handleChecklistAction}
            checklistBusy={executionSubmitting}
          />

          {journeyPackages.length ? (
            <ExecutiveSection className="mission-control-page__supporting">
              {journeyPackages.map((pkg) => (
                <JourneyPackage
                  key={pkg.id}
                  title={pkg.title}
                  items={pkg.items}
                  actionLabel={pkg.actionLabel}
                  language={pkg.language}
                  onSend={handlePackageSent}
                />
              ))}
              {showPackageSent ? (
                <p className="mission-control-page__package-note">
                  {translate("missionControlPackageQueued")}
                </p>
              ) : null}
            </ExecutiveSection>
          ) : null}

          {showConversationOutcomePanel ? (
            <ExecutiveSection className="mission-control-page__supporting">
              <ConversationOutcomePanel
                phone={phone}
                conversationOutcome={workspace.conversationOutcome}
                disabled={prospectLoading}
                onSaved={handleConversationOutcomeSaved}
                showKnownInformation={false}
              />
            </ExecutiveSection>
          ) : null}
        </div>
        </div>
      </div>

      <MissionExecutionDialog
        open={scheduleDialogOpen}
        phone={phone}
        mission={primaryMission}
        prospect={workspaceContext.prospect}
        recruiterName="Ana"
        submitting={executionSubmitting}
        error={executionError}
        onClose={() => {
          if (!executionSubmitting) {
            setScheduleDialogOpen(false);
            setExecutionError(null);
          }
        }}
        onSubmit={handleScheduleMissionSubmit}
      />
    </>
  );
}
