import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import ActionCard from "../../../components/design-system/ActionCard";
import { formatInterviewDateTime } from "../../../adapters/prospectWorkspaceAdapter";
import { buildInterviewAccordionSummary } from "../../../engines/prospectWorkspaceViewModel";
import {
  resolveOperationalInterviewActions
} from "../../../engines/interviewOperationalEngine";
import { fetchAppointment, isActiveAppointment } from "../../../services/appointmentService";
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
  const summary = buildInterviewAccordionSummary(interview, translate);
  const actionVisibility = useMemo(
    () => resolveOperationalInterviewActions(interview),
    [interview]
  );
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

      if (!interview?.appointmentId) {
        return;
      }

      setActionBusy(true);

      try {
        const appointment = await fetchAppointment(interview.appointmentId);

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

  const showActions =
    actionVisibility.showReschedule ||
    actionVisibility.showComplete ||
    actionVisibility.showCancel;

  return (
    <section
      className="prospect-workspace__operational-block prospect-workspace__operational-block--interview"
      aria-labelledby="operational-interview-heading"
    >
      <header className="prospect-workspace__operational-block-header">
        <h3 id="operational-interview-heading" className="prospect-workspace__operational-block-title">
          {translate("workspaceOperationalInterview")}
        </h3>
        <p className="prospect-workspace__operational-block-summary">{summary}</p>
      </header>

      {showActions ? (
        <div className="prospect-workspace__operational-actions">
          {actionVisibility.showReschedule ? (
            <ActionCard
              icon="📅"
              title={translate("missionControlActionReschedule")}
              subtitle={translate("missionControlActionRescheduleSubtitle")}
              disabled={busy || actionBusy}
              onClick={() => openInterviewDialog("reschedule")}
            />
          ) : null}
          {actionVisibility.showComplete ? (
            <ActionCard
              icon="✅"
              title={translate("appointmentsComplete")}
              subtitle={translate("workspaceInterviewCompleteSubtitle")}
              disabled={busy || actionBusy}
              onClick={() => openInterviewDialog("complete")}
            />
          ) : null}
          {actionVisibility.showCancel ? (
            <ActionCard
              icon="✕"
              title={translate("appointmentsCancel")}
              subtitle={translate("workspaceInterviewCancelSubtitle")}
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
