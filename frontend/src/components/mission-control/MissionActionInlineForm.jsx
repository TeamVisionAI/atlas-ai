import AtlasButton from "../ui/AtlasButton";
import WorkflowGatePanel from "../WorkflowGatePanel";
import QualificationForm from "./QualificationForm";
import ConversationOutcomeSection from "./ConversationOutcomeSection";
import SchedulingForm, { isSchedulingFormValid } from "./SchedulingForm";
import { isSchedulingSubmitBlocked, resolveProspectEmail } from "../../utils/prospectEmail";
import MissionSemanticSection from "./MissionSemanticSection";
import {
  INLINE_FORM_TYPES,
  resolvesToInlineForm
} from "./missionActionInlineFormResolver";
import { resolveInterviewOutcomeGate } from "./interviewOutcomeGateModel";
import { useSchedulingFormController } from "./useSchedulingFormController";
import "./MissionActionInlineForm.css";

const PRE_INTERVIEW_CLOSE_OUTCOMES = Object.freeze(["Not Interested"]);

function MissionActionFormDiagnostic({ actionId, formType, translate }) {
  return (
    <div className="mission-action-inline-form__diagnostic" role="alert">
      <p>
        {translate("missionActionFormDiagnostic", {
          actionId: actionId || translate("missionActionUnknownAction")
        })}
      </p>
      {formType ? (
        <p className="mission-action-inline-form__diagnostic-meta">
          {translate("missionActionFormDiagnosticType", { formType })}
        </p>
      ) : null}
    </div>
  );
}

function MissionActionSchedulingForm({
  active,
  prospect,
  mission,
  phone,
  recruiterName,
  currentUser,
  submitting,
  error,
  translate,
  onSubmit,
  onCancel
}) {
  const defaultInterviewType = prospect?.interviewType || mission?.prospect?.interviewType || "";

  const scheduling = useSchedulingFormController({
    active,
    defaultInterviewType,
    recruiterName,
    translate,
    currentUser
  });

  const canSubmit =
    isSchedulingFormValid(scheduling.form) &&
    !isSchedulingSubmitBlocked(scheduling.form, prospect) &&
    !submitting &&
    !scheduling.loadingSlots &&
    !scheduling.loadingExpansion;

  function handleScheduleSubmit() {
    console.info("[interviewer-trace]", {
      authenticatedUserId: scheduling.currentUser?.id || currentUser?.id || null,
      authenticatedUserName:
        scheduling.currentUser?.display_name || currentUser?.display_name || null,
      interviewerUserId: scheduling.form.interviewerUserId || null,
      interviewerName: null,
      appointmentId: null,
      source: "scheduleDialog.submit.missionControl"
    });

    onSubmit({
      ...scheduling.form,
      email: resolveProspectEmail(prospect, scheduling.form.email) || undefined
    });
  }

  return (
    <div className="mission-action-inline-form mission-action-inline-form--scheduling">
      {scheduling.loadingSlots && !scheduling.displaySlots.length ? (
        <p className="mission-action-inline-form__status">{translate("missionExecutionLoadingSlots")}</p>
      ) : null}

      <SchedulingForm
        form={scheduling.form}
        onChange={scheduling.setForm}
        prospect={prospect}
        slots={scheduling.displaySlots}
        loadingSlots={scheduling.loadingSlots}
        loadingExpansion={scheduling.loadingExpansion}
        slotsError={scheduling.slotsError}
        disabled={submitting}
        recruiterName={recruiterName || scheduling.form.recruiter}
        currentUser={scheduling.currentUser}
        assignmentCandidates={scheduling.assignmentCandidates}
        durationMinutes={scheduling.durationMinutes}
        displayMode={scheduling.displayMode}
        viewMode={scheduling.viewMode}
        hasMoreInWindow={scheduling.hasMoreInWindow}
        activeDayKey={scheduling.activeDayKey}
        selectableDays={scheduling.selectableDays}
        nextWeekStartDateKey={scheduling.nextWeekStartDateKey}
        onShowMoreTimes={scheduling.handleShowMoreTimes}
        onBackToRecommended={scheduling.handleBackToRecommended}
        onSelectDay={scheduling.handleSelectDay}
        onNextWeek={scheduling.handleNextWeek}
        onInterviewTypeChange={scheduling.handleInterviewTypeChange}
        inline
        useSemanticSections
      />

      {error ? <p className="mission-action-inline-form__error">{error}</p> : null}

      <div className="mission-action-inline-form__actions">
        <AtlasButton variant="ghost" onClick={onCancel} disabled={submitting}>
          {translate("missionExecutionCancel")}
        </AtlasButton>
        <AtlasButton variant="primary" onClick={handleScheduleSubmit} disabled={!canSubmit}>
          {submitting
            ? translate("missionExecutionScheduling")
            : translate("missionExecutionConfirmSchedule")}
        </AtlasButton>
      </div>
    </div>
  );
}

export default function MissionActionInlineForm({
  actionId,
  formType,
  active = true,
  phone,
  prospect,
  mission,
  conversationOutcome,
  workflowGate,
  rawWorkflowGate = null,
  recruiterName = "",
  currentUser = null,
  submitting = false,
  error = null,
  translate,
  onScheduleSubmit,
  onOutcomeComplete,
  onQualificationSaved,
  onQualificationDraftChange,
  onCancel
}) {
  // Defensive re-resolve: parent may pass null if an older chunk / raw-id mismatch
  // left formType unset while actionId is still close_not_interested.
  const effectiveFormType = formType || resolvesToInlineForm(actionId, mission);

  if (!effectiveFormType) {
    return (
      <MissionActionFormDiagnostic
        actionId={actionId}
        formType={effectiveFormType}
        translate={translate}
      />
    );
  }

  if (effectiveFormType === INLINE_FORM_TYPES.SCHEDULING) {
    return (
      <MissionActionSchedulingForm
        active={active}
        prospect={prospect}
        mission={mission}
        phone={phone}
        recruiterName={recruiterName}
        currentUser={currentUser}
        submitting={submitting}
        error={error}
        translate={translate}
        onSubmit={onScheduleSubmit}
        onCancel={onCancel}
      />
    );
  }

  if (effectiveFormType === INLINE_FORM_TYPES.INTERVIEW_OUTCOME) {
    const resolvedGate = resolveInterviewOutcomeGate({
      workflowGate,
      rawWorkflowGate,
      translate,
      mission
    });

    return (
      <div className="mission-action-inline-form mission-action-inline-form--outcome">
        <MissionSemanticSection variant="outcome">
          <WorkflowGatePanel
            gate={resolvedGate}
            prospectName={prospect?.name}
            phone={phone}
            inline
            useSemanticSections
            onComplete={onOutcomeComplete}
          />
        </MissionSemanticSection>
        <div className="mission-action-inline-form__actions">
          <AtlasButton variant="ghost" onClick={onCancel} disabled={submitting}>
            {translate("missionExecutionCancel")}
          </AtlasButton>
        </div>
      </div>
    );
  }

  if (effectiveFormType === INLINE_FORM_TYPES.QUALIFICATION) {
    if (!conversationOutcome?.requiredInputs?.length) {
      return (
        <MissionActionFormDiagnostic
          actionId={actionId || "qualification"}
          formType={effectiveFormType}
          translate={translate}
        />
      );
    }

    return (
      <div className="mission-action-inline-form mission-action-inline-form--qualification">
        <MissionSemanticSection variant="required">
          <QualificationForm
            phone={phone}
            conversationOutcome={conversationOutcome}
            disabled={submitting}
            inline
            onSaved={onQualificationSaved}
            onDraftActiveChange={onQualificationDraftChange}
          />
        </MissionSemanticSection>
        <div className="mission-action-inline-form__actions">
          <AtlasButton variant="ghost" onClick={onCancel} disabled={submitting}>
            {translate("missionExecutionCancel")}
          </AtlasButton>
        </div>
      </div>
    );
  }

  if (effectiveFormType === INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED) {
    return (
      <div className="mission-action-inline-form mission-action-inline-form--close">
        <MissionSemanticSection variant="outcome">
          <ConversationOutcomeSection
            phone={phone}
            conversationOutcome={conversationOutcome}
            disabled={submitting}
            onSaved={onQualificationSaved}
            allowedOutcomes={PRE_INTERVIEW_CLOSE_OUTCOMES}
            defaultOutcome="Not Interested"
            title={translate("missionActionCloseNotInterested")}
            description={translate("missionActionCloseNotInterestedDescription")}
          />
        </MissionSemanticSection>
        <div className="mission-action-inline-form__actions">
          <AtlasButton variant="ghost" onClick={onCancel} disabled={submitting}>
            {translate("missionExecutionCancel")}
          </AtlasButton>
        </div>
      </div>
    );
  }

  return (
    <MissionActionFormDiagnostic
      actionId={actionId}
      formType={effectiveFormType}
      translate={translate}
    />
  );
}
