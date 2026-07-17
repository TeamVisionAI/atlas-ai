import { useCallback, useEffect, useMemo, useState } from "react";
import { getDashboard } from "../services/api";
import { getMissionControl } from "../services/missionControlService";
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
  buildMockMissionFromProspect,
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

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mission, setMission] = useState(null);
  const [workflowState, setWorkflowState] = useState(null);
  const [showPackageSent, setShowPackageSent] = useState(false);
  const [workflowComplete, setWorkflowComplete] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeMetricPanel, setActiveMetricPanel] = useState(null);

  const loadProspectAtIndex = useCallback(async (index, queueItems) => {
    const item = queueItems[index];

    if (!item) {
      return;
    }

    try {
      const missionData = isMockQueueProspect(item)
        ? buildMockMissionFromProspect(item)
        : await getMissionControl(item.phone);

      if (!missionData) {
        return;
      }

      setMission(missionData);
      setWorkflowState(loadWorkflowState(item.phone));
      setCurrentIndex(index);
      setShowPackageSent(false);
      setWorkflowComplete(null);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const dashboardData = await getDashboard();
        const sortedQueue = buildPrioritizedQueue(dashboardData.prospects);
        const missionData = await getMissionControl();

        setDashboard(dashboardData);
        setQueue(sortedQueue);

        if (missionData) {
          setMission(missionData);
          setCurrentIndex(findQueueIndex(sortedQueue, missionData.prospect?.phone));
          setWorkflowState(
            loadWorkflowState(missionData.prospect?.phone) || createDefaultWorkflowState()
          );
        }
      } catch (err) {
        console.error(err);
      } finally {
        setInitialLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const conversationProspect = useMemo(() => {
    if (!dashboard?.prospects?.length || !mission?.prospect?.phone) {
      return queue[currentIndex] || null;
    }

    return (
      dashboard.prospects.find(
        (prospect) => prospect.phone === mission.prospect.phone
      ) || queue[currentIndex]
    );
  }, [dashboard, mission, queue, currentIndex]);

  const phone = mission?.prospect?.phone;

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
    if (!mission || workflowState === null) {
      return null;
    }

    return buildWorkspaceContext({
      mission,
      dashboardProspect: conversationProspect,
      workflowState,
      handlers: {
        onNotes: () => {},
        onSchedule: () => {},
        onReschedule: () => {},
        onSendOnboarding: handlePackageSent
      }
    });
  }, [mission, conversationProspect, workflowState, handlePackageSent]);

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
      loadProspectAtIndex(currentIndex - 1, queue);
    }
  }, [currentIndex, loadProspectAtIndex, queue]);

  const goToNextPriority = useCallback(() => {
    const next = getNextPriorityProspect(queue, currentIndex);

    if (next) {
      loadProspectAtIndex(next.index, queue);
    }
  }, [currentIndex, loadProspectAtIndex, queue]);

  const openWorkspaceForPhone = useCallback(
    (phone) => {
      const index = findQueueIndex(queue, phone);

      loadProspectAtIndex(index, queue);
      setActiveMetricPanel(null);
    },
    [loadProspectAtIndex, queue]
  );

  if (initialLoading || !dashboard || workflowState === null) {
    return <h2>🚀 Loading Atlas...</h2>;
  }

  if (!mission || !workspaceContext) {
    return (
      <div>
        <p>No active conversation found.</p>
      </div>
    );
  }

  const showGate = shouldShowWorkflowGate(
    mission,
    conversationProspect,
    workflowState
  );

  const metrics = buildAgentMetrics(dashboard);

  return (
    <>
      {showGate ? (
        <WorkflowGateModal
          prospectName={mission.prospect.name}
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
          <ConversationPanel lastMessage={conversationProspect?.last_message} />
        </section>
      </div>
    </>
  );
}
