import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import ActionCard from "../../../components/design-system/ActionCard";
import { formatInterviewDateTime } from "../../../adapters/prospectWorkspaceAdapter";
import {
  resolveInterviewWorkflowStateLabelKey,
  resolveOperationalInterviewActionPlan
} from "../../../engines/interviewWorkflowPresentationEngine";
import { buildInterviewAccordionSummary } from "../../../engines/prospectWorkspaceViewModel";
import { resolveOperationalInterviewActions } from "../../../engines/interviewOperationalEngine";
import { fetchAppointment, isActiveAppointment } from "../../../services/appointmentService";
import { resolvePersistedAppointmentId } from "../../../engines/appointmentIdEngine.js";
import RescheduleAppointmentDialog from "../../../components/appointments/RescheduleAppointmentDialog";
import CancelAppointmentDialog from "../../../components/appointments/CancelAppointmentDialog";
import CompleteAppointmentDialog from "../../../components/appointments/CompleteAppointmentDialog";

export default function OperationalInterviewPanel({
  interview,
  phone,
  busy = false,
  onMissionAction,
  onRefresh
}) {
  const { translate } = useLanguage();
  const actionVisibility = useMemo(
    () => resolveOperationalInterviewActions(interview),
    [interview]
  );
  const actionPlan = useMemo(
    () => resolveOperationalInterviewActionPlan(interview, actionVisibility),
    [interview, actionVisibility]
  );
  const summary = buildInterviewAccordionSummary(interview, translate, actionPlan.state);
  const stateLabel = translate(resolveInterviewWorkflowStateLabelKey(actionPlan.state));
  const [dialog, setDialog] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const closeDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const handleDialogSuccess = useCallback(async () => {
    closeDialog();
    await onRefresh?.();
  }, [closeDialog, onRefresh]);

  const openInterviewDialog = useCallback(
    async (type) => {
      setActionError(null);

      if (!actionVisibility.useAppointmentDialogs) {
        if (type === "reschedule") {
          await onMissionAction?.("reschedule");
        }

        return;
      }

      const appointmentId = resolvePersistedAppointmentId(interview?.appointmentId);

      if (!appointmentId) {
        return;
      }

      setActionBusy(true);

      try {
        const appointment = await fetchAppointment(appointmentId);

        if (!isActiveAppointment(appointment)) {
          setActionError(translate("workspaceInterviewActionUnavailable"));
          return;
        }

        setDialog({ type, appointment });
      } catch (error) {
        console.error(error);
        setActionError(translate("workspaceInterviewActionUnavailable"));
      } finally {
        setActionBusy(false);
      }
    },
    [actionVisibility.useAppointmentDialogs, interview?.appointmentId, onMissionAction, translate]
  );

  return (
    <section
      className="prospect-workspace__operational-block prospect-workspace__operational-block--interview"
      aria-labelledby="operational-interview-heading"
      data-interview-workflow-state={actionPlan.state}
    >
      <header className="prospect-workspace__operational-block-header">
        <h3 id="operational-interview-heading" className="prospect-workspace__operational-block-title">
          {translate("workspaceOperationalInterview")}
        </h3>
        {actionPlan.state !== "none" ? (
          <p className="prospect-workspace__operational-block-state">{stateLabel}</p>
        ) : null}
        <p className="prospect-workspace__operational-block-summary">{summary}</p>
      </header>

      {actionPlan.showRecordOutcomeHint ? (
        <p className="prospect-workspace__operational-block-hint">
          {translate("workspaceInterviewRecordOutcomeHint")}
        </p>
      ) : null}

      {actionPlan.showPanelActions ? (
        <div className="prospect-workspace__operational-actions">
          {actionPlan.showReschedule ? (
            <ActionCard
              icon="📅"
              title={translate("appointmentsRescheduleInterview")}
              subtitle={translate("missionControlActionRescheduleSubtitle")}
              disabled={busy || actionBusy}
              onClick={() => openInterviewDialog("reschedule")}
            />
          ) : null}
          {actionPlan.showComplete ? (
            <ActionCard
              icon="✅"
              title={translate("appointmentsCompleteInterview")}
              subtitle={translate("workspaceInterviewCompleteSubtitle")}
              variant="accent"
              disabled={busy || actionBusy}
              onClick={() => openInterviewDialog("complete")}
            />
          ) : null}
          {actionPlan.showCancel ? (
            <ActionCard
              icon="❌"
              title={translate("appointmentsCancelInterview")}
              subtitle={translate("workspaceInterviewCancelSubtitle")}
              className="action-card--danger"
              disabled={busy || actionBusy}
              onClick={() => openInterviewDialog("cancel")}
            />
          ) : null}
        </div>
      ) : null}

      {actionError ? (
        <p className="prospect-workspace__action-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <dl className="prospect-details__list prospect-workspace__interview-details">
        <div>
          <dt>{translate("workspaceDetailsInterviewWhen")}</dt>
          <dd>
            {interview?.datetime
              ? formatInterviewDateTime(interview.datetime)
              : translate("workspaceInterviewSummaryNone")}
          </dd>
        </div>
        <div>
          <dt>{translate("workspaceDetailsInterviewType")}</dt>
          <dd>{interview?.type || "—"}</dd>
        </div>
        <div>
          <dt>{translate("workspaceDetailsInterviewInterviewer")}</dt>
          <dd>{interview?.interviewerName || "—"}</dd>
        </div>
        <div>
          <dt>{translate("workspaceDetailsInterviewOutcome")}</dt>
          <dd>{interview?.outcome || "—"}</dd>
        </div>
        {interview?.gateActive ? (
          <div>
            <dt>{translate("workspaceDetailsInterviewGate")}</dt>
            <dd>{translate("workspaceDetailsInterviewGateActive")}</dd>
          </div>
        ) : null}
      </dl>

      <RescheduleAppointmentDialog
        open={dialog?.type === "reschedule"}
        appointment={dialog?.appointment}
        onClose={closeDialog}
        onSuccess={handleDialogSuccess}
      />
      <CancelAppointmentDialog
        open={dialog?.type === "cancel"}
        appointment={dialog?.appointment}
        onClose={closeDialog}
        onSuccess={handleDialogSuccess}
      />
      <CompleteAppointmentDialog
        open={dialog?.type === "complete"}
        appointment={dialog?.appointment}
        onClose={closeDialog}
        onSuccess={handleDialogSuccess}
      />
    </section>
  );
}
