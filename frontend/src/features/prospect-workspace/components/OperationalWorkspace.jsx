import { memo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import QuickActionsPanel from "./QuickActionsPanel";
import CommunicationActionsPanel from "../../../components/communication/CommunicationActionsPanel";
import OperationalInterviewPanel from "./OperationalInterviewPanel";
import WorkflowGatePanel from "../../../components/WorkflowGatePanel";
import WorkflowCompleteBanner from "../../../components/WorkflowCompleteBanner";

function OperationalWorkspace({
  workspace,
  organizationSettings,
  interview,
  workflow,
  workflowComplete,
  showGate,
  actionError,
  lifecycleBusy,
  pendingActionId,
  scheduleActionBusy = false,
  prospectCoreId,
  userRole,
  onLifecycleAction,
  onMissionAction,
  onGateComplete,
  onAddNote,
  onRefresh,
  noteSaving = false
}) {
  const { translate } = useLanguage();

  return (
    <section
      className="prospect-workspace__operational"
      aria-labelledby="operational-workspace-heading"
    >
      <header className="prospect-workspace__operational-header">
        <h2 id="operational-workspace-heading" className="workspace-eyebrow">
          {translate("workspaceSectionOperationalWorkspace")}
        </h2>
        <p className="prospect-workspace__operational-intro">
          {translate("workspaceOperationalWorkspaceIntro")}
        </p>
      </header>

      <QuickActionsPanel
        embedded
        interview={interview}
        lifecycleBusy={lifecycleBusy}
        pendingActionId={pendingActionId}
        scheduleActionBusy={scheduleActionBusy}
        prospectCoreId={prospectCoreId}
        userRole={userRole}
        onLifecycleAction={onLifecycleAction}
      />

      <div className="prospect-workspace__operational-block prospect-workspace__operational-block--communication">
        {workflowComplete ? (
          <WorkflowCompleteBanner
            message={workflowComplete.message}
            hasNextPriority={false}
            onNextPriority={() => {}}
          />
        ) : null}

        {actionError ? (
          <p className="prospect-workspace__action-error" role="alert">
            {actionError}
          </p>
        ) : null}

        <CommunicationActionsPanel
          workspace={workspace}
          organizationSettings={organizationSettings}
          onAction={onMissionAction}
          onAddNote={onAddNote}
          noteSaving={noteSaving}
          busy={Boolean(pendingActionId) || noteSaving}
        />

        {showGate ? (
          <WorkflowGatePanel
            gate={workspace.workflowGate}
            workflow={workflow}
            prospectName={workspace.identity.name}
            phone={workspace.phone}
            onComplete={onGateComplete}
          />
        ) : null}
      </div>

      <OperationalInterviewPanel
        interview={interview}
        phone={workspace.phone}
        busy={Boolean(pendingActionId) || noteSaving}
        onMissionAction={onMissionAction}
        onRefresh={onRefresh}
      />
    </section>
  );
}

export default memo(OperationalWorkspace);
