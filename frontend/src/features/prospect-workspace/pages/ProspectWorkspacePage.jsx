import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWorkspace } from "../../../contexts/WorkspaceContext";
import { useLanguage } from "../../../i18n/LanguageContext";
import { useToast } from "../../../components/ui/ToastProvider";
import { WorkspaceSkeleton } from "../../../components/ui/Skeleton";
import ErrorState from "../../../components/ui/ErrorState";
import { buildWorkspaceContext } from "../../../engines/contextEngine";
import {
  createDefaultWorkflowState,
  loadWorkflowState,
  saveWorkflowState
} from "../../../engines/workflowEngine";
import JourneyProgress from "../../../components/prospect-workspace/JourneyProgress";
import ProspectDetailsPanel from "../../../components/prospect-workspace/ProspectDetailsPanel";
import ProspectWorkspaceHeader from "../components/ProspectWorkspaceHeader";
import ProspectHeader from "../components/ProspectHeader";
import OperationalWorkspace from "../components/OperationalWorkspace";
import CommunicationHistorySection from "../components/CommunicationHistorySection";
import ProspectCoachPanel from "../components/ProspectCoachPanel";
import ExecutiveInsightsSection from "../components/ExecutiveInsightsSection";
import {
  useIsDesktop,
  useProspectCore,
  useProspectWorkspace
} from "../hooks/useProspectWorkspace";
import { useMissionControlContext } from "../hooks/useMissionControlContext";
import { useWorkspaceActions } from "../hooks/useWorkspaceActions";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { usePromptDialog } from "../../../hooks/usePromptDialog";
import { useUniversalNote } from "../../../hooks/useUniversalNote";
import { useCommunicationPreview } from "../../../hooks/useCommunicationPreview";
import { useNativeInterviewWhatsApp } from "../../../hooks/useNativeInterviewWhatsApp";
import CommunicationPreviewDialog from "../../../components/communication/CommunicationPreviewDialog";
import { resolveNoteContextFromWorkspace } from "../../../engines/notesEngine";
import { useWorkspaceKeyboardShortcuts } from "../hooks/useWorkspaceKeyboardShortcuts";
import { appPath } from "../../../config/appRoutes";
import ProspectEditorDrawer from "../components/ProspectEditorDrawer";
import ScheduleInterviewDialog from "../components/ScheduleInterviewDialog";
import RescheduleAppointmentDialog from "../../../components/appointments/RescheduleAppointmentDialog";
import "../../../pages/ProspectWorkspace.css";

export default function ProspectWorkspacePage() {
  const { phone: routePhone } = useParams();
  const navigate = useNavigate();
  const { translate } = useLanguage();
  const showToast = useToast();
  const { user } = useWorkspace();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { prompt, promptDialog } = usePromptDialog();
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
  const [activityRefreshSignal, setActivityRefreshSignal] = useState(0);

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

  const { openAddNote, noteDialog, saving: noteSaving } = useUniversalNote({
    getContext: () => resolveNoteContextFromWorkspace(workspace),
    onSaved: async () => {
      await refreshWorkspace();
      setActivityRefreshSignal((current) => current + 1);
      showToast.showSuccess(translate("workspaceToastActionCompleted"));
    },
    onError: (message) => showToast.showError(message)
  });

  const communicationPreview = useCommunicationPreview({
    translate,
    showToast,
    onRecorded: refreshWorkspace
  });

  const nativeInterviewWhatsApp = useNativeInterviewWhatsApp({
    translate,
    showToast,
    onRecorded: refreshWorkspace
  });

  const actions = useWorkspaceActions({
    workspace,
    prospectCoreId,
    refreshWorkspace,
    translate,
    showToast,
    confirm,
    prompt,
    communicationPreview,
    nativeInterviewWhatsApp
  });

  useWorkspaceKeyboardShortcuts({
    enabled: Boolean(workspace),
    onRefresh: handleRefresh,
    onToggleTimeline: () => timelineRef.current?.toggle?.(),
    onNavigateBack: () => navigate(appPath())
  });

  const handleGateOutcome = useCallback(
    async (formState, result) => {
      if (!workspace?.phone) {
        return;
      }

      const agentOutcome = result?.missionControl?.brain?.outcome ?? result?.outcome ?? null;
      const saved = saveWorkflowState(workspace.phone, {
        ...loadWorkflowState(workspace.phone),
        outcome: agentOutcome,
        orientationDate: formState?.orientationDate || null,
        orientationTime: formState?.orientationTime || null,
        orientationScheduled: Boolean(formState?.orientationDate && formState?.orientationTime),
        followUpDate: formState?.followUpDate || null,
        followUpTime: formState?.followUpTime || null
      });
      setWorkflowState(saved);

      await refreshWorkspace();
      setActivityRefreshSignal((current) => current + 1);

      if (
        (result?.outcome === "Recruited" || result?.outcome === "Orientation Scheduled") &&
        saved.orientationScheduled
      ) {
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

  const showGate = Boolean(workspace?.workflowGate?.active);

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
    <div
      className="prospect-workspace"
      aria-busy={refreshing || undefined}
      data-prospect-id={prospectCoreId || undefined}
    >
      {confirmDialog}
      {promptDialog}
      {noteDialog}

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

      <OperationalWorkspace
        workspace={workspace}
        organizationSettings={organizationSettings}
        interview={workspace.interview}
        workflow={payload?.workflow}
        workflowComplete={workflowComplete}
        showGate={showGate}
        actionError={actions.actionError}
        lifecycleBusy={actions.lifecycleBusy}
        pendingActionId={actions.pendingActionId}
        scheduleActionBusy={actions.scheduleActionBusy}
        prospectCoreId={prospectCoreId}
        userRole={user?.role}
        onLifecycleAction={actions.handleLifecycleAction}
        onMissionAction={actions.handleMissionAction}
        onGateComplete={handleGateOutcome}
        onAddNote={openAddNote}
        onRefresh={refreshWorkspace}
        noteSaving={noteSaving}
        customWhatsAppComposerOpen={actions.customWhatsAppComposerOpen}
        onCloseCustomWhatsAppComposer={actions.closeCustomWhatsAppComposer}
        onCustomWhatsAppSuccessToast={showToast?.showSuccess}
        onCustomWhatsAppErrorToast={showToast?.showError}
        onCustomWhatsAppSent={async () => {
          await refreshWorkspace();
          setActivityRefreshSignal((n) => n + 1);
        }}
        interviewComposerSession={nativeInterviewWhatsApp.composerSession}
        onCloseInterviewComposer={nativeInterviewWhatsApp.closeComposer}
        onInterviewComposerSent={async () => {
          nativeInterviewWhatsApp.closeComposer();
          await refreshWorkspace();
          setActivityRefreshSignal((n) => n + 1);
        }}
        interviewTemplateSession={nativeInterviewWhatsApp.templateSession}
        interviewTemplateBusy={nativeInterviewWhatsApp.busy}
        interviewTemplateError={nativeInterviewWhatsApp.error}
        onCloseInterviewTemplate={nativeInterviewWhatsApp.closeTemplateSession}
        onConfirmInterviewTemplate={nativeInterviewWhatsApp.confirmApprovedTemplateSend}
        onInterviewComposerSuccessToast={showToast?.showSuccess}
        onInterviewComposerErrorToast={showToast?.showError}
      />

      <CommunicationHistorySection
        phone={workspace.phone}
        conversation={workspace.conversation}
        activityPreview={payload?.activityPreview || []}
        prospectCoreId={prospectCoreId}
        organizationId={
          user?.organization_id ||
          organizationSettings?.organizationId ||
          organizationSettings?.id ||
          null
        }
        timelineRef={timelineRef}
        activityRefreshSignal={activityRefreshSignal}
      />

      <section
        className="prospect-workspace__reference-section"
        aria-labelledby="prospect-information-heading"
      >
        <h2 id="prospect-information-heading" className="workspace-eyebrow">
          {translate("workspaceSectionProspectInformation")}
        </h2>
        <ProspectDetailsPanel
          interview={workspace.interview}
          status={workspace.status}
          capture={workspace.capture}
          owner={workspace.owner}
          collapsible={!isDesktop}
          includeInterview={false}
          includeCoach={false}
          onCommunicationLanguageChange={actions.handleCommunicationLanguageChange}
          communicationLanguageSaving={actions.communicationLanguageSaving}
          communicationLanguageError={actions.communicationLanguageError}
        />
      </section>

      <ProspectCoachPanel collapsible={!isDesktop} />

      <ExecutiveInsightsSection
        prospectContext={prospectContext}
        missionControlLoading={missionControlLoading}
        missionControlError={missionControlError}
        prospectCoreId={prospectCoreId}
      />

      <ProspectEditorDrawer
        open={actions.prospectEditorOpen}
        workspace={workspace}
        translate={translate}
        onClose={actions.handleProspectEditorClose}
        onSaved={actions.handleProspectEditorSaved}
      />

      <ScheduleInterviewDialog
        open={Boolean(actions.scheduleDialog)}
        mode={actions.scheduleDialog?.mode || "schedule"}
        prospect={workspace.prospect}
        recruiterName={user?.display_name || workspace.owner?.name || ""}
        currentUser={user}
        submitting={actions.scheduleSubmitting}
        error={actions.scheduleError}
        onClose={actions.handleScheduleDialogClose}
        onSubmit={actions.handleScheduleInterviewSubmit}
      />

      <RescheduleAppointmentDialog
        open={Boolean(actions.rescheduleAppointment)}
        appointment={actions.rescheduleAppointment}
        onClose={actions.handleRescheduleDialogClose}
        onSuccess={actions.handleRescheduleDialogSuccess}
      />

      <CommunicationPreviewDialog
        open={communicationPreview.open}
        payload={communicationPreview.payload}
        loading={communicationPreview.loading}
        error={communicationPreview.error}
        sending={communicationPreview.sending}
        copyBusy={communicationPreview.copyBusy}
        onClose={communicationPreview.closePreview}
        onCopy={communicationPreview.copyPreviewMessage}
        onSend={communicationPreview.confirmSend}
      />
    </div>
  );
}
