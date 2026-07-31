import { useLanguage } from "../../../i18n/LanguageContext";
import AppointmentModalShell from "../../../components/appointments/AppointmentModalShell";
import SchedulingForm, { isSchedulingFormValid } from "../../../components/mission-control/SchedulingForm";
import { useSchedulingFormController } from "../../../components/mission-control/useSchedulingFormController";
import { isSchedulingSubmitBlocked, resolveProspectEmail } from "../../../utils/prospectEmail";
import AtlasButton from "../../../components/ui/AtlasButton";
import "./ScheduleInterviewDialog.css";

export default function ScheduleInterviewDialog({
  open,
  mode = "schedule",
  prospect,
  recruiterName = "",
  submitting = false,
  error = null,
  onClose,
  onSubmit
}) {
  const { translate } = useLanguage();
  const defaultInterviewType = prospect?.interviewType || "";

  const scheduling = useSchedulingFormController({
    active: open,
    defaultInterviewType,
    recruiterName,
    translate
  });

  const canSubmit =
    isSchedulingFormValid(scheduling.form) &&
    !isSchedulingSubmitBlocked(scheduling.form, prospect) &&
    !submitting &&
    !scheduling.loadingSlots &&
    !scheduling.loadingExpansion;

  function handleSubmit() {
    onSubmit?.({
      ...scheduling.form,
      email: resolveProspectEmail(prospect, scheduling.form.email) || undefined
    });
  }

  const titleKey =
    mode === "reschedule"
      ? "workspaceActionRescheduleInterview"
      : "workspaceActionScheduleInterview";

  return (
    <AppointmentModalShell
      open={open}
      title={translate(titleKey)}
      onClose={onClose}
      layout="scheduling"
      footer={
        <div className="appointment-modal__actions">
          <AtlasButton variant="ghost" onClick={onClose} disabled={submitting}>
            {translate("missionExecutionCancel")}
          </AtlasButton>
          <AtlasButton variant="primary" onClick={handleSubmit} disabled={!canSubmit} busy={submitting}>
            {submitting
              ? translate("missionExecutionScheduling")
              : translate("missionExecutionConfirmSchedule")}
          </AtlasButton>
        </div>
      }
    >
      {scheduling.loadingSlots && !scheduling.displaySlots.length ? (
        <p className="appointment-modal__hint">{translate("missionExecutionLoadingSlots")}</p>
      ) : null}

      <div className="schedule-interview-dialog__content">
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
          presentation="scheduleDialog"
        />

        {error ? (
          <p className="prospect-workspace__action-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </AppointmentModalShell>
  );
}
