import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import AgentHeader from "../components/AgentHeader";
import AgentQueueNavigator from "../components/AgentQueueNavigator";
import AgentMetricPanel from "../components/AgentMetricPanel";
import WorkflowCompleteBanner from "../components/WorkflowCompleteBanner";
import ExecutiveInformationPanel from "../components/design-system/ExecutiveInformationPanel";
import ExecutiveSection from "../components/design-system/ExecutiveSection";
import AtlasBrief from "../components/design-system/AtlasBrief";
import AiActionCenter from "../components/AiActionCenter";
import ConversationPanel from "../components/ConversationPanel";
import ConversationOutcomePanel from "../components/ConversationOutcomePanel";
import RecruitingFunnelStatus from "../components/RecruitingFunnelStatus";
import JourneyPackage from "../components/JourneyPackage";
import WorkflowGatePanel from "../components/WorkflowGatePanel";
import MissionCard from "../components/mission-control/MissionCard";
import MissionActionCenter from "../components/mission-control/MissionActionCenter";
import MissionExecutionDialog from "../components/mission-control/MissionExecutionDialog";
import { useMissionExecutionSuccessToast } from "../components/mission-control/MissionExecutionSuccessToast";
import KnownInformationSection from "../components/mission-control/KnownInformationSection";
import { executeScheduleInterview } from "../services/missionExecutionService";
import { useProspectCore } from "../features/prospect-workspace/hooks/useProspectWorkspace";
import {
  fetchProspectMissions,
  recalculateMissions
} from "../services/missionService";
import {
  buildAgentMetrics,
  buildWorkspaceContext
} from "../engines/contextEngine";
import { buildAtlasBriefBullets } from "../engines/missionPresentationEngine";
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
import { fetchCurrentUser } from "../services/atlasAuthService";
import {
  buildProspectCenterPath,
  buildProspectWorkspacePath
} from "../utils/prospectRoutes";
import "./MissionControl.css";

const ProspectTimelinePanel = lazy(
  () => import("../features/prospect-workspace/components/ProspectTimelinePanel")
);

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
  const [currentUser, setCurrentUser] = useState(null);
  const showMissionExecutionSuccess = useMissionExecutionSuccessToast();

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
    fetchCurrentUser()
      .then((user) => setCurrentUser(user))
      .catch(() => setCurrentUser(null));
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

  const { prospectCoreId } = useProspectCore(phone, {
    enabled: Boolean(phone) && !prospectLoading && !initialLoading
  });

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
        return;
      }

      await refreshCurrentWorkspace();
      await refreshMissions(phone);
    },
    [phone, queue, currentIndex, dashboard, refreshCurrentWorkspace, refreshMissions]
  );

  useEffect(() => {
    if (!phone || !workspace?.isLive || prospectLoading) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      refreshCurrentWorkspace();
    }, MISSION_CONTROL_LIVE_POLL_MS);

    return () => window.clearInterval(timer);
  }, [phone, workspace?.isLive, prospectLoading, refreshCurrentWorkspace]);

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

      if (actionId === "whatsapp") {
        if (phone) {
          window.open(`https://wa.me/${phone.replace(/\D/g, "")}`, "_blank");
        }

        if (phone) {
          const result = await postMissionControlAction(phone, "log_whatsapp_open");

          if (!result.success) {
            setActionError(result.message);
          }
        }

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
    [phone, queue, currentIndex, refreshCurrentWorkspace, refreshMissions, translate]
  );

  const handleMissionPrimaryAction = useCallback(
    async (actionId) => {
      if (actionId === "enter_interview_outcome") {
        setShowOutcomeGate(true);
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

  const handleHumanOverride = useCallback(
    async (overrideType) => {
      if (!phone) {
        return;
      }

      const actionId = workspace?.aiActionCenter?.actionId;

      if (overrideType === "approve") {
        if (actionId) {
          await handleMissionPrimaryAction(actionId);
        }

        return;
      }

      if (overrideType === "edit") {
        const text = window.prompt(translate("missionControlAddNotePrompt"));

        if (!text?.trim()) {
          return;
        }

        const result = await postMissionControlAction(phone, "notes", {
          text: text.trim()
        });

        if (!result.success) {
          setActionError(result.message);
          return;
        }

        await refreshCurrentWorkspace();
        return;
      }

      if (overrideType === "retry") {
        if (!actionId) {
          setActionError(translate("missionControlActionFailed"));
          return;
        }

        await handleMissionAction(actionId);
        return;
      }

      if (overrideType === "escalate") {
        const result = await postMissionControlAction(phone, "escalate_to_recruiter");

        if (!result.success) {
          setActionError(result.message);
          return;
        }

        await refreshCurrentWorkspace();
      }
    },
    [
      phone,
      workspace?.aiActionCenter?.actionId,
      handleMissionPrimaryAction,
      handleMissionAction,
      refreshCurrentWorkspace,
      translate
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

  const atlasBriefBullets = useMemo(
    () => buildAtlasBriefBullets(workspaceContext?.aiBriefLines || []),
    [workspaceContext?.aiBriefLines]
  );

  const knownInformationItems = workspace?.conversationOutcome?.knownInformation || [];
  const hasKnownInformation = knownInformationItems.length > 0;

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
  const metrics = buildAgentMetrics(dashboard);

  return (
    <>
      <AgentMetricPanel
        type={activeMetricPanel}
        queue={queue}
        onClose={() => setActiveMetricPanel(null)}
        onOpenWorkspace={openWorkspaceForPhone}
      />

      <div className="mission-control-page">
        <div className="mission-control-page__header-band">
          <div className="mission-control-page__header-links">
            <Link
              to={buildProspectCenterPath({
                filter: executiveFilter || undefined
              })}
              className="mission-control-page__prospect-center-link"
            >
              {translate("missionControlOpenProspectCenter")}
            </Link>
          </div>
          {executiveFilter ? (
            <div className="mission-control-page__filter-banner">
              {translate("missionControlFilteredView")}{" "}
              <strong>
                {EXECUTIVE_FILTER_LABEL_KEYS[executiveFilter]
                  ? translate(EXECUTIVE_FILTER_LABEL_KEYS[executiveFilter])
                  : executiveFilter}
              </strong>
              {" · "}
              {queue.length === 1
                ? translate("missionControlProspectCount", { count: queue.length })
                : translate("missionControlProspectCountPlural", { count: queue.length })}
            </div>
          ) : null}
          <AgentHeader
            agentName={
              currentUser?.display_name ||
              currentUser?.first_name ||
              translate("missionControlAgentLabel")
            }
            agentPhotoUrl={currentUser?.photo_url || null}
            metrics={metrics}
            activeMetric={activeMetricPanel}
            onMetricClick={(type) =>
              setActiveMetricPanel((current) => (current === type ? null : type))
            }
          />
        </div>

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
          <ExecutiveSection className="mission-control-page__navigation">
            <AgentQueueNavigator
              currentIndex={currentIndex}
              totalProspects={totalProspects}
              previousProspect={previousProspect}
              nextProspect={nextProspect}
              onPrevious={goToPrevious}
              onNext={goToNextPriority}
            />
          </ExecutiveSection>

          <ExecutiveSection label={translate("missionControlCurrentProspect")}>
            <ExecutiveInformationPanel prospect={workspaceContext.prospect} />
          </ExecutiveSection>

          <ExecutiveSection label={translate("missionControlRecruitingStatus")}>
            <RecruitingFunnelStatus recruitingStatus={workspace.recruitingStatus} />
          </ExecutiveSection>

          <ExecutiveSection label={translate("todaysMission")} className="mission-control-page__hero">
            {missionLoading ? (
              <p className="mission-control-page__loading">{translate("missionLoading")}</p>
            ) : null}
            <MissionCard mission={primaryMission} translate={translate} />
            {!missionLoading && !primaryMission ? (
              <p className="mission-card__empty">{translate("missionNoActiveMission")}</p>
            ) : null}
          </ExecutiveSection>

          {primaryMission &&
          (primaryMission.primaryAction || (primaryMission.secondaryActions || []).length) ? (
            <ExecutiveSection label={translate("missionControlActionCenterTitle")}>
            <MissionActionCenter
              mission={primaryMission}
              translate={translate}
              phone={phone}
              onPrimaryAction={handleMissionPrimaryAction}
              onSecondaryAction={handleMissionSecondaryAction}
              busy={executionSubmitting}
            />
              {shouldShowOutcomeGate ? (
                <div className="mission-control-page__outcome-gate">
                  <WorkflowGatePanel
                    gate={workspace.workflowGate?.active ? workspace.workflowGate : { active: true }}
                    workflow={workspace.raw?.workflow}
                    prospectName={workspace.prospect.name}
                    phone={workspace.phone}
                    onComplete={handleGateOutcome}
                  />
                </div>
              ) : null}
            </ExecutiveSection>
          ) : shouldShowOutcomeGate ? (
            <ExecutiveSection label={translate("missionControlActionCenterTitle")}>
              <div className="mission-control-page__outcome-gate">
                <WorkflowGatePanel
                  gate={workspace.workflowGate?.active ? workspace.workflowGate : { active: true }}
                  workflow={workspace.raw?.workflow}
                  prospectName={workspace.prospect.name}
                  phone={workspace.phone}
                  onComplete={handleGateOutcome}
                />
              </div>
            </ExecutiveSection>
          ) : null}

          {atlasBriefBullets.length ? (
            <AtlasBrief
              bullets={atlasBriefBullets}
              expandedContent={workspaceContext.expandedBrief}
            />
          ) : null}

          {hasKnownInformation ? (
            <ExecutiveSection label={translate("conversationOutcomeKnownInformation")}>
              <KnownInformationSection items={knownInformationItems} showHeading={false} />
            </ExecutiveSection>
          ) : null}

          <ExecutiveSection
            label={translate("missionControlConversation")}
            className="mission-control-page__conversation"
          >
            <ConversationPanel
              messages={workspace.conversation.messages}
              lastMessage={workspace.conversation.lastMessage}
              direction={workspace.conversation.direction}
              timestamp={workspace.conversation.timestamp}
              atlasAvatar={{
                photoUrl: currentUser?.photo_url || null,
                name:
                  currentUser?.display_name ||
                  currentUser?.first_name ||
                  translate("missionControlConversationAtlas")
              }}
              prospectAvatar={{
                photoUrl: null,
                name: workspace.prospect?.name || translate("missionControlConversationProspect")
              }}
            />
          </ExecutiveSection>

          <ExecutiveSection label={translate("workspaceSectionTimeline")}>
            <Suspense fallback={<p className="mission-control-page__loading">{translate("missionControlLoading")}</p>}>
              <ProspectTimelinePanel prospectCoreId={prospectCoreId} />
            </Suspense>
          </ExecutiveSection>

          {workspace.aiActionCenter ? (
            <ExecutiveSection
              label={translate("missionControlAiActionCenterTitle")}
              className="mission-control-page__supporting"
            >
              <AiActionCenter
                actionCenter={workspace.aiActionCenter}
                onExecuteAction={handleMissionAction}
                onHumanOverride={handleHumanOverride}
              />
            </ExecutiveSection>
          ) : null}

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

          {!prospectLoading ? (
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
