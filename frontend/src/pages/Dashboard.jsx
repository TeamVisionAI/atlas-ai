import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getDashboard } from "../services/api";
import { getOrganizationSettings } from "../services/organizationService";
import {
  getMissionControl,
  MissionControlError,
  postMissionControlAction,
  syncMissionControlWorkflow
} from "../services/missionControlService";
import {
  adaptMissionControlResponse,
  buildMockMissionControlFromQueueProspect
} from "../adapters/missionControlAdapter";
import AgentHeader from "../components/AgentHeader";
import AgentQueueNavigator from "../components/AgentQueueNavigator";
import AgentMetricPanel from "../components/AgentMetricPanel";
import WorkflowCompleteBanner from "../components/WorkflowCompleteBanner";
import CurrentProspectCard from "../components/CurrentProspectCard";
import NextActions from "../components/NextActions";
import AiBrief from "../components/AiBrief";
import ConversationPanel from "../components/ConversationPanel";
import JourneyPackage from "../components/JourneyPackage";
import WorkflowGatePanel from "../components/WorkflowGatePanel";
import {
  buildAgentMetrics,
  buildWorkspaceContext
} from "../engines/contextEngine";
import { getAvailableJourneyPackages } from "../engines/journeyEngine";
import {
  buildPrioritizedQueue,
  findQueueIndex,
  getNextPriorityProspect,
  getQueueNeighbors,
  isMockQueueProspect
} from "../engines/queueEngine";
import {
  createDefaultWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
  shouldShowWorkflowGate
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

const sectionLabelStyle = {
  margin: "0 0 12px",
  color: "#64748B",
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase"
};

function findDashboardProspect(dashboard, phone) {
  if (!dashboard?.prospects?.length || !phone) {
    return null;
  }

  return dashboard.prospects.find((prospect) => prospect.phone === phone) || null;
}

async function loadWorkspaceForQueueItem(item, dashboardData) {
  const dashboardProspect = findDashboardProspect(dashboardData, item.phone);
  const missionControl = isMockQueueProspect(item)
    ? buildMockMissionControlFromQueueProspect(item)
    : await getMissionControl(item.phone);

  if (!missionControl) {
    return null;
  }

  return adaptMissionControlResponse(missionControl, dashboardProspect || item, {
    isLive: !isMockQueueProspect(item)
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
  const [workflowState, setWorkflowState] = useState(null);
  const [showPackageSent, setShowPackageSent] = useState(false);
  const [workflowComplete, setWorkflowComplete] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [prospectLoading, setProspectLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [organizationSettings, setOrganizationSettings] = useState(null);
  const [activeMetricPanel, setActiveMetricPanel] = useState(null);

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
      setWorkflowState(loadWorkflowState(item.phone));
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
        const fullQueue = buildPrioritizedQueue(dashboardData.prospects);
        const workflowQueue = dashboardData.prioritizedWorkflowQueue || [];
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
        setWorkflowState(loadWorkflowState(adapted.phone) || createDefaultWorkflowState());
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

  const handleWorkflowComplete = useCallback(
    async (nextState) => {
      if (!phone) {
        return;
      }

      const saved = saveWorkflowState(phone, nextState);
      setWorkflowState(saved);

      const currentItem = queue[currentIndex];

      if (currentItem && !isMockQueueProspect(currentItem)) {
        try {
          await syncMissionControlWorkflow(phone, saved);
          const adapted = await loadWorkspaceForQueueItem(currentItem, dashboard);
          if (adapted) {
            setWorkspace(adapted);
          }
        } catch (err) {
          console.error(err);
        }
      }

      if (saved.orientationScheduled) {
        setWorkflowComplete({
          message: translate("missionControlOrientationReady")
        });
      }
    },
    [phone, queue, currentIndex, dashboard, translate]
  );

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

  const handleMissionAction = useCallback(
    async (actionId) => {
      setActionError(null);

      const currentItem = queue[currentIndex];
      const isMock = currentItem ? isMockQueueProspect(currentItem) : false;

      if (actionId === "call") {
        if (phone) {
          window.open(`tel:${phone}`, "_self");
        }

        if (!isMock && phone) {
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

        if (!isMock && phone) {
          const result = await postMissionControlAction(phone, "log_whatsapp_open");

          if (!result.success) {
            setActionError(result.message);
          }
        }

        return;
      }

      if (isMock) {
        setActionError(translate("missionControlActionRequiresLive"));
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
      } catch (err) {
        console.error(err);
        setActionError(translate("missionControlActionFailed"));
      }
    },
    [phone, queue, currentIndex, refreshCurrentWorkspace, translate]
  );

  const handleGateOutcome = useCallback(
    async (localState) => {
      if (!phone) {
        return;
      }

      const saved = saveWorkflowState(phone, localState);
      setWorkflowState(saved);

      try {
        await syncMissionControlWorkflow(phone, saved);
      } catch (err) {
        console.error(err);
      }

      const currentItem = queue[currentIndex];

      if (currentItem) {
        const adapted = await loadWorkspaceForQueueItem(currentItem, dashboard);

        if (adapted) {
          setWorkspace(adapted);
        }
      }

      if (saved.outcome === "Recruited" && saved.orientationScheduled) {
        setWorkflowComplete({
          message: translate("missionControlOrientationReady")
        });
      }
    },
    [phone, queue, currentIndex, dashboard, translate]
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

  const workspaceContext = useMemo(() => {
    if (!workspace || workflowState === null || !organizationSettings) {
      return null;
    }

    return buildWorkspaceContext({
      workspace,
      organizationSettings,
      workflowState,
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
    workflowState,
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

  const showGate =
    workspace?.workflowGate?.active ??
    shouldShowWorkflowGate(workspace, null, workflowState);
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
            agentName="Ana"
            metrics={metrics}
            activeMetric={activeMetricPanel}
            onMetricClick={(type) =>
              setActiveMetricPanel((current) => (current === type ? null : type))
            }
          />
          <AgentQueueNavigator
            currentIndex={currentIndex}
            totalProspects={totalProspects}
            previousProspect={previousProspect}
            nextProspect={nextProspect}
            onPrevious={goToPrevious}
            onNext={goToNextPriority}
          />
        </div>

        {prospectLoading ? (
          <p style={{ margin: 0, color: "#64748B", fontSize: 14 }}>
            {translate("missionControlLoadingProspect")}
          </p>
        ) : null}

        {loadError ? (
          <p style={{ margin: 0, color: "#B91C1C", fontSize: 14 }}>{renderLoadError(loadError)}</p>
        ) : null}

        {actionError ? (
          <p style={{ margin: 0, color: "#B91C1C", fontSize: 14 }}>{actionError}</p>
        ) : null}

        {workflowComplete ? (
          <WorkflowCompleteBanner
            message={workflowComplete.message}
            hasNextPriority={Boolean(nextProspect)}
            onNextPriority={goToNextPriority}
          />
        ) : null}

        <section>
          <h3 style={sectionLabelStyle}>{translate("missionControlCurrentProspect")}</h3>
          <CurrentProspectCard prospect={workspaceContext.prospect} />
        </section>

        <section>
          <h3 style={sectionLabelStyle}>{translate("missionControlNextActions")}</h3>
          {showGate ? (
            <WorkflowGatePanel
              gate={workspace.workflowGate}
              workflow={workspace.raw?.workflow}
              prospectName={workspace.prospect.name}
              phone={workspace.phone}
              onComplete={handleGateOutcome}
            />
          ) : (
            <NextActions actions={workspaceContext.nextActions} />
          )}
        </section>

        {journeyPackages.length ? (
          <section>
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
              <p style={{ margin: "10px 0 0", color: "#64748B", fontSize: 14 }}>
                {translate("missionControlPackageQueued")}
              </p>
            ) : null}
          </section>
        ) : null}

        <section>
          <AiBrief
            lines={workspaceContext.aiBriefLines}
            expandedContent={workspaceContext.expandedBrief}
          />
        </section>

        <section
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column"
          }}
        >
          <h3 style={sectionLabelStyle}>{translate("missionControlConversation")}</h3>
          <ConversationPanel
            lastMessage={workspace.conversation.lastMessage}
            direction={workspace.conversation.direction}
            timestamp={workspace.conversation.timestamp}
          />
        </section>
      </div>
    </>
  );
}
