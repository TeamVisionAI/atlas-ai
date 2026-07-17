import { useCallback, useEffect, useMemo, useState } from "react";
import { getDashboard } from "../services/api";
import {
  getMissionControl,
  MissionControlError
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
  const [activeMetricPanel, setActiveMetricPanel] = useState(null);

  const loadProspectAtIndex = useCallback(async (index, queueItems, dashboardData) => {
    const item = queueItems[index];

    if (!item) {
      return;
    }

    setProspectLoading(true);
    setLoadError(null);

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
        const dashboardData = await getDashboard();
        const sortedQueue = buildPrioritizedQueue(dashboardData.prospects);
        const initialItem = sortedQueue[0];

        setDashboard(dashboardData);
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
    (nextState) => {
      if (!phone) {
        return;
      }

      const saved = saveWorkflowState(phone, nextState);
      setWorkflowState(saved);

      if (saved.orientationScheduled) {
        setWorkflowComplete({
          message: "Orientation scheduled. Ready for the next prospect?"
        });
      }
    },
    [phone]
  );

  const handlePackageSent = useCallback(() => {
    setShowPackageSent(true);
    setWorkflowComplete({
      message: "Onboarding package sent. Ready for the next prospect?"
    });
  }, []);

  const workspaceContext = useMemo(() => {
    if (!workspace || workflowState === null) {
      return null;
    }

    return buildWorkspaceContext({
      workspace,
      workflowState,
      handlers: {
        onNotes: () => {},
        onSchedule: () => {},
        onReschedule: () => {},
        onSendOnboarding: handlePackageSent
      }
    });
  }, [workspace, workflowState, handlePackageSent]);

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
          <NextActions actions={workspaceContext.nextActions} />
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
