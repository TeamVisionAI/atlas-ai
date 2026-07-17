import { useCallback, useEffect, useMemo, useState } from "react";
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
import { WorkflowGateModal } from "../components/WorkflowGateModal";
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
        setLoadError("No mission control data found for this prospect.");
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
          ? "Unable to load mission control data."
          : "Something went wrong loading this prospect."
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
        const sortedQueue = buildPrioritizedQueue(dashboardData.prospects);
        const initialItem = sortedQueue[0];

        setDashboard(dashboardData);
        setOrganizationSettings(orgSettings);
        setQueue(sortedQueue);

        if (!initialItem) {
          setLoadError("No prospects in queue.");
          return;
        }

        const adapted = await loadWorkspaceForQueueItem(initialItem, dashboardData);

        if (!adapted) {
          setLoadError("No active conversation found.");
          return;
        }

        setWorkspace(adapted);
        setCurrentIndex(findQueueIndex(sortedQueue, adapted.phone));
        setWorkflowState(loadWorkflowState(adapted.phone) || createDefaultWorkflowState());
      } catch (err) {
        console.error(err);
        setLoadError("Unable to load Atlas workspace.");
      } finally {
        setInitialLoading(false);
      }
    }

    loadDashboard();
  }, []);

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
          message: "Orientation scheduled. Ready for the next prospect?"
        });
      }
    },
    [phone, queue, currentIndex, dashboard]
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
        setActionError("This action requires a live prospect record.");
        return;
      }

      if (!phone) {
        return;
      }

      try {
        let payload = {};

        if (actionId === "notes") {
          const text = window.prompt("Add agent note:");

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
        setActionError("Unable to complete action.");
      }
    },
    [phone, queue, currentIndex, refreshCurrentWorkspace]
  );

  const handlePackageSent = useCallback(() => {
    setShowPackageSent(true);
    setWorkflowComplete({
      message: "Onboarding package sent. Ready for the next prospect?"
    });
  }, []);

  const handleOrganizationResourceMissing = useCallback((resourceKey) => {
    const messages = {
      zoomInterviewUrl: "Zoom interview URL is not configured on the server.",
      "office.mapsUrl": "Office location is not configured on the server."
    };

    setActionError(messages[resourceKey] || "Organization resource is not configured.");
  }, []);

  const workspaceContext = useMemo(() => {
    if (!workspace || workflowState === null || !organizationSettings) {
      return null;
    }

    return buildWorkspaceContext({
      workspace,
      organizationSettings,
      workflowState,
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
      const index = findQueueIndex(queue, targetPhone);

      loadProspectAtIndex(index, queue, dashboard);
      setActiveMetricPanel(null);
    },
    [loadProspectAtIndex, queue, dashboard]
  );

  if (initialLoading || !dashboard) {
    return <h2>🚀 Loading Atlas...</h2>;
  }

  if (loadError && !workspace) {
    return (
      <div>
        <p>{loadError}</p>
      </div>
    );
  }

  if (!workspace || !workspaceContext) {
    return (
      <div>
        <p>No active conversation found.</p>
      </div>
    );
  }

  const showGate = shouldShowWorkflowGate(workspace, null, workflowState);
  const metrics = buildAgentMetrics(dashboard);

  return (
    <>
      {showGate ? (
        <WorkflowGateModal
          prospectName={workspace.prospect.name}
          onComplete={handleWorkflowComplete}
        />
      ) : null}

      <AgentMetricPanel
        type={activeMetricPanel}
        queue={queue}
        onClose={() => setActiveMetricPanel(null)}
        onOpenWorkspace={openWorkspaceForPhone}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          gap: 20
        }}
      >
        <div
          style={{
            margin: "-30px -30px 0",
            borderBottom: "1px solid #E5E7EB"
          }}
        >
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
          <p style={{ margin: 0, color: "#64748B", fontSize: 14 }}>Loading prospect…</p>
        ) : null}

        {loadError ? (
          <p style={{ margin: 0, color: "#B91C1C", fontSize: 14 }}>{loadError}</p>
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
          <h3 style={sectionLabelStyle}>Current Prospect</h3>
          <CurrentProspectCard prospect={workspaceContext.prospect} />
        </section>

        <section>
          <h3 style={sectionLabelStyle}>Next Actions</h3>
          {!showGate ? (
            <NextActions actions={workspaceContext.nextActions} />
          ) : null}
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
                Onboarding package queued to send (placeholder).
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
          <h3 style={sectionLabelStyle}>Conversation</h3>
          <ConversationPanel lastMessage={workspace.conversation.lastMessage} />
        </section>
      </div>
    </>
  );
}
