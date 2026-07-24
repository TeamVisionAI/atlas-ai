import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../../../i18n/LanguageContext";
import { useToast } from "../../../components/ui/ToastProvider";
import { WorkspaceSkeleton } from "../../../components/ui/Skeleton";
import ErrorState from "../../../components/ui/ErrorState";
import { buildWorkspaceContext } from "../../../engines/contextEngine";
import {
  createDefaultWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
  shouldShowWorkflowGate
} from "../../../engines/workflowEngine";
import { syncMissionControlWorkflow } from "../../../services/missionControlService";
import JourneyProgress from "../../../components/prospect-workspace/JourneyProgress";
import ActivityFeed from "../../../components/prospect-workspace/ActivityFeed";
import ProspectDetailsPanel from "../../../components/prospect-workspace/ProspectDetailsPanel";
import NextActions from "../../../components/NextActions";
import WorkflowGatePanel from "../../../components/WorkflowGatePanel";
import WorkflowCompleteBanner from "../../../components/WorkflowCompleteBanner";
import ProspectWorkspaceHeader from "../components/ProspectWorkspaceHeader";
import ProspectHeader from "../components/ProspectHeader";
import MissionControlContextPanel from "../components/MissionControlContextPanel";
import ExecutiveDashboardLinks from "../components/ExecutiveDashboardLinks";
import QuickActionsPanel from "../components/QuickActionsPanel";
import {
  useIsDesktop,
  useProspectCore,
  useProspectWorkspace
} from "../hooks/useProspectWorkspace";
import { useMissionControlContext } from "../hooks/useMissionControlContext";
import { useWorkspaceActions } from "../hooks/useWorkspaceActions";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useWorkspaceKeyboardShortcuts } from "../hooks/useWorkspaceKeyboardShortcuts";
import { appPath } from "../../../config/appRoutes";
import "../../../pages/ProspectWorkspace.css";

const ProspectTimelinePanel = lazy(() => import("../components/ProspectTimelinePanel"));

export default function ProspectWorkspacePage() {
  const { phone: routePhone } = useParams();
  const navigate = useNavigate();
  const { translate } = useLanguage();
  const showToast = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const isDesktop = useIsDesktop();
  const timelineRef = useRef(null);
  const phone = decodeURIComponent(routePhone || "");

  const {
    payload,
    workspace,
    organizationSettings,
    loading,
    loadError,
    refreshWorkspace
  } = useProspectWorkspace(phone);

  const { prospectCore, prospectCoreId } = useProspectCore(workspace?.phone || phone, {
    enabled: Boolean(workspace?.phone) && !loading
  });

  const { prospectContext, loading: missionControlLoading, error: missionControlError } =
    useMissionControlContext(prospectCoreId, {
      enabled: Boolean(workspace) && !loading
    });

  const [workflowState, setWorkflowState] = useState(null);
  const [workflowComplete, setWorkflowComplete] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!workspace?.phone) {
      setWorkflowState(null);
      return;
    }

    setWorkflowState(loadWorkflowState(workspace.phone) || createDefaultWorkflowState());
  }, [workspace?.phone]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await refreshWorkspace();
      showToast.showSuccess(translate("workspaceToastRefreshed"));
    } catch (error) {
      console.error(error);
      showToast.showError(translate("workspaceLoadError"));
    } finally {
      setRefreshing(false);
    }
  }, [refreshWorkspace, showToast, translate]);

  const actions = useWorkspaceActions({
    workspace,
    prospectCoreId,
    refreshWorkspace,
    translate,
    showToast,
    confirm
  });

  useWorkspaceKeyboardShortcuts({
    enabled: Boolean(workspace),
    onRefresh: handleRefresh,
    onToggleTimeline: () => timelineRef.current?.toggle?.(),
    onNavigateBack: () => navigate(appPath())
  });

  const handleGateOutcome = useCallback(
    async (localState) => {
      if (!workspace?.phone) {
        return;
      }

      const saved = saveWorkflowState(workspace.phone, localState);
      setWorkflowState(saved);

      try {
        await syncMissionControlWorkflow(workspace.phone, saved);
      } catch (error) {
        console.error(error);
      }

      await refreshWorkspace();

      if (saved.outcome === "Recruited" && saved.orientationScheduled) {
        setWorkflowComplete({
          message: translate("missionControlOrientationReady")
        });
      }

      showToast.showSuccess(translate("workspaceToastActionCompleted"));
    },
    [workspace?.phone, refreshWorkspace, showToast, translate]
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
        onAction: actions.handleMissionAction,
        onOrganizationResourceMissing: actions.handleOrganizationResourceMissing
      }
    });
  }, [workspace, organizationSettings, workflowState, translate, actions]);

  const showGate =
    workspace?.workflowGate?.active ??
    (workspace && workflowState
      ? shouldShowWorkflowGate(workspace, null, workflowState)
      : false);

  if (loading) {
    return <WorkspaceSkeleton />;
  }

  if (loadError) {
    return (
      <div className="prospect-workspace">
        <ErrorState
          title={translate(loadError.key)}
          body={translate("workspacePanelErrorHint")}
          retryLabel={translate("workspaceRetry")}
          onRetry={handleRefresh}
        />
      </div>
    );
  }

  if (!workspace || !workspaceContext) {
    return (
      <div className="prospect-workspace">
        <ErrorState
          title={translate("workspaceNotFound")}
          body={translate("workspacePanelEmptyHint")}
          retryLabel={translate("workspaceRetry")}
          onRetry={() => navigate(appPath("prospect-center"))}
        />
      </div>
    );
  }

  return (
    <div className="prospect-workspace" aria-busy={refreshing || undefined}>
      {confirmDialog}
      <p className="prospect-workspace__shortcuts-hint">{translate("workspaceKeyboardHint")}</p>

      <ProspectWorkspaceHeader
        phone={workspace.phone}
        onOpenMissionControl={(targetPhone) =>
          navigate(`/mission-control?phone=${encodeURIComponent(targetPhone)}`)
        }
      />

      <ProspectHeader
        identity={workspace.identity}
        status={workspace.status}
        owner={workspace.owner}
        capture={workspace.capture}
        prospectCore={prospectCore}
      />

      <JourneyProgress journey={workspace.journey} />

      <div className="prospect-workspace__insights">
        <MissionControlContextPanel
          prospectContext={prospectContext}
          loading={missionControlLoading}
          error={missionControlError}
        />
        <ExecutiveDashboardLinks prospectCoreId={prospectCoreId} />
      </div>

      <QuickActionsPanel
        lifecycleBusy={actions.lifecycleBusy}
        pendingActionId={actions.pendingActionId}
        prospectCoreId={prospectCoreId}
        onLifecycleAction={actions.handleLifecycleAction}
      >
        {workflowComplete ? (
          <WorkflowCompleteBanner
            message={workflowComplete.message}
            hasNextPriority={false}
            onNextPriority={() => {}}
          />
        ) : null}

        {actions.actionError ? (
          <p className="prospect-workspace__action-error" role="alert">
            {actions.actionError}
          </p>
        ) : null}

        {showGate ? (
          <WorkflowGatePanel
            gate={workspace.workflowGate}
            workflow={payload?.workflow}
            prospectName={workspace.identity.name}
            phone={workspace.phone}
            onComplete={handleGateOutcome}
          />
        ) : (
          <NextActions actions={workspaceContext.nextActions} />
        )}
      </QuickActionsPanel>

      <div className="prospect-workspace__columns">
        <div className="prospect-workspace__main-column">
          <Suspense fallback={<WorkspaceSkeleton />}>
            <ProspectTimelinePanel ref={timelineRef} prospectCoreId={prospectCoreId} />
          </Suspense>
          <ActivityFeed
            phone={workspace.phone}
            previewItems={payload?.activityPreview || []}
            onNoteAdded={refreshWorkspace}
          />
        </div>
        <ProspectDetailsPanel
          interview={workspace.interview}
          status={workspace.status}
          capture={workspace.capture}
          owner={workspace.owner}
          collapsible={!isDesktop}
          onCommunicationLanguageChange={actions.handleCommunicationLanguageChange}
          communicationLanguageSaving={actions.communicationLanguageSaving}
          communicationLanguageError={actions.communicationLanguageError}
        />
      </div>
    </div>
  );
}
