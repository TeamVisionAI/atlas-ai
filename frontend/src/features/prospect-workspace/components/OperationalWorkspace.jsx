import { memo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import QuickActionsPanel from "./QuickActionsPanel";
import CommunicationActionsPanel from "../../../components/communication/CommunicationActionsPanel";
import HumanWhatsAppComposer from "../../../components/communication/HumanWhatsAppComposer";
import InterviewWhatsAppTemplateConfirm from "../../../components/communication/InterviewWhatsAppTemplateConfirm";
import OperationalInterviewPanel from "./OperationalInterviewPanel";
import WorkflowGatePanel from "../../../components/WorkflowGatePanel";
import WorkflowCompleteBanner from "../../../components/WorkflowCompleteBanner";
import { WORKSPACE_GENERAL_COMMUNICATION_ORDER } from "../../../engines/communicationActionCenterPresentation";
import { shouldRenderScheduledInterviewModule } from "../../../engines/interviewModulePresentation";

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
  noteSaving = false,
  customWhatsAppComposerOpen = false,
  onCloseCustomWhatsAppComposer = null,
  onCustomWhatsAppSent = null,
  onCustomWhatsAppSuccessToast = null,
  onCustomWhatsAppErrorToast = null,
  interviewComposerSession = null,
  onCloseInterviewComposer = null,
  onInterviewComposerSent = null,
  onInterviewComposerSuccessToast = null,
  onInterviewComposerErrorToast = null,
  interviewTemplateSession = null,
  interviewTemplateBusy = false,
  interviewTemplateError = null,
  onCloseInterviewTemplate = null,
  onConfirmInterviewTemplate = null
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
          cardOrder={WORKSPACE_GENERAL_COMMUNICATION_ORDER}
        />

        {customWhatsAppComposerOpen ? (
          <HumanWhatsAppComposer
            phone={workspace?.phone}
            workspace={workspace}
            variant="inline"
            testId="workspace-custom-whatsapp-composer"
            onClose={onCloseCustomWhatsAppComposer}
            onSuccessToast={onCustomWhatsAppSuccessToast}
            onErrorToast={onCustomWhatsAppErrorToast}
            onSent={onCustomWhatsAppSent}
          />
        ) : null}

        {interviewComposerSession ? (
          <HumanWhatsAppComposer
            phone={interviewComposerSession.phone || workspace?.phone}
            workspace={workspace}
            initialMessage={interviewComposerSession.message}
            variant="inline"
            titleKey={interviewComposerSession.titleKey}
            testId="workspace-interview-whatsapp-composer"
            requiresHumanOwnership={
              interviewComposerSession.requiresHumanOwnership !== false
            }
            sendVia={interviewComposerSession.sendVia || "human_reply"}
            appointmentId={interviewComposerSession.appointmentId || null}
            customerCareWindow={interviewComposerSession.customerCareWindow}
            onClose={onCloseInterviewComposer}
            onSuccessToast={onInterviewComposerSuccessToast}
            onErrorToast={onInterviewComposerErrorToast}
            onSent={onInterviewComposerSent}
          />
        ) : null}

        {interviewTemplateSession ? (
          <InterviewWhatsAppTemplateConfirm
            session={interviewTemplateSession}
            busy={interviewTemplateBusy}
            error={interviewTemplateError}
            onCancel={onCloseInterviewTemplate}
            onConfirm={onConfirmInterviewTemplate}
          />
        ) : null}

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

      {shouldRenderScheduledInterviewModule(interview) ? (
        <OperationalInterviewPanel
          interview={interview}
          phone={workspace.phone}
          workspace={workspace}
          organizationSettings={organizationSettings}
          busy={Boolean(pendingActionId) || noteSaving}
          onMissionAction={onMissionAction}
          onRefresh={onRefresh}
        />
      ) : null}
    </section>
  );
}

export default memo(OperationalWorkspace);
