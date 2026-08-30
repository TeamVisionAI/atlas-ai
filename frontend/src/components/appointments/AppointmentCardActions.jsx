import { Link } from "react-router-dom";
import AtlasButton from "../ui/AtlasButton";
import UniversalNoteButton from "../notes/UniversalNoteButton";
import { resolveAppointmentCardActionPlan } from "../../engines/interviewWorkflowPresentationEngine";
import { shouldShowLifecycleActions } from "../../engines/appointmentCardPresentation";
import { buildProspectWorkspaceCommunicationHistoryPath } from "../../utils/prospectRoutes";
import "./AppointmentCardActions.css";

/**
 * Operational actions for an appointment list card (BR-043, BR-045, BR-177).
 * Standalone Agenda meetings stay off Prospect/Recruit AI until explicit promotion.
 */
export default function AppointmentCardActions({
  appointment,
  translate,
  noteSaving = false,
  onAddNote,
  onOpenWorkspace,
  onReschedule,
  onCancel,
  onComplete,
  onPromoteRecruit,
  onPromoteClient,
  onOpenClient
}) {
  const plan = resolveAppointmentCardActionPlan(appointment);
  const standaloneAgenda = appointment?.metadata?.standaloneAgenda === true;
  const canMutate = shouldShowLifecycleActions(appointment);
  const promotedRecruit = Boolean(
    appointment?.metadata?.promotedToRecruit || appointment?.prospectId
  );
  const promotedClient = Boolean(appointment?.metadata?.promotedToClient);

  function handleJoinZoom() {
    const url = String(appointment.virtualMeetingUrl || "").trim();

    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (standaloneAgenda) {
    return (
      <div
        className="appointment-card-actions appointments-page__actions"
        data-appointment-id={appointment.id || undefined}
        data-agenda-standalone="true"
        data-action-row-layout="wrap"
      >
        {appointment.virtualMeetingUrl ? (
          <AtlasButton
            variant="primary"
            size="sm"
            className="appointment-card-actions__join-zoom"
            onClick={handleJoinZoom}
          >
            {translate("appointmentsJoinZoom")}
          </AtlasButton>
        ) : null}

        {canMutate ? (
          <AtlasButton variant="secondary" size="sm" onClick={onComplete}>
            {translate("agendaRecordOutcome")}
          </AtlasButton>
        ) : null}

        {canMutate ? (
          <AtlasButton variant="secondary" size="sm" onClick={onReschedule}>
            {translate("appointmentsRescheduleInterview")}
          </AtlasButton>
        ) : null}

        {canMutate ? (
          <AtlasButton
            variant="ghost"
            size="sm"
            className="appointment-card-actions__danger"
            onClick={onCancel}
          >
            {translate("appointmentsCancel")}
          </AtlasButton>
        ) : null}

        {!promotedRecruit ? (
          <AtlasButton variant="secondary" size="sm" onClick={onPromoteRecruit}>
            {translate("agendaPromoteRecruit")}
          </AtlasButton>
        ) : (
          <AtlasButton variant="secondary" size="sm" onClick={onOpenWorkspace}>
            {translate("appointmentsCardWorkspace")}
          </AtlasButton>
        )}

        {!promotedClient ? (
          <AtlasButton variant="secondary" size="sm" onClick={onPromoteClient}>
            {translate("agendaPromoteClient")}
          </AtlasButton>
        ) : (
          <AtlasButton variant="secondary" size="sm" onClick={onOpenClient}>
            {translate("agendaOpenClient")}
          </AtlasButton>
        )}
      </div>
    );
  }

  return (
    <div
      className="appointment-card-actions appointments-page__actions"
      data-appointment-id={appointment.id || undefined}
      data-interview-workflow-state={plan.state}
      data-join-zoom-visible={plan.showJoinZoom ? "true" : "false"}
      data-action-row-layout="wrap"
    >
      {plan.showAddNote ? (
        <UniversalNoteButton size="sm" busy={noteSaving} onClick={onAddNote} />
      ) : null}

      {plan.showOpenWorkspace ? (
        <AtlasButton
          variant={plan.openWorkspacePrimary ? "primary" : "secondary"}
          size="sm"
          onClick={onOpenWorkspace}
        >
          {translate(plan.openWorkspaceLabelKey)}
        </AtlasButton>
      ) : null}

      {plan.showCommunicationHistory ? (
        <Link
          className="appointment-card-actions__link atlas-ui-button atlas-ui-button--secondary atlas-ui-button--sm"
          to={buildProspectWorkspaceCommunicationHistoryPath(appointment.prospectPhone)}
        >
          {translate("appointmentsCommunicationHistory")}
        </Link>
      ) : null}

      {plan.showJoinZoom ? (
        <AtlasButton
          variant="primary"
          size="sm"
          className="appointment-card-actions__join-zoom"
          onClick={handleJoinZoom}
        >
          {translate("appointmentsJoinZoom")}
        </AtlasButton>
      ) : null}

      {plan.showReschedule ? (
        <AtlasButton variant="secondary" size="sm" onClick={onReschedule}>
          {translate("appointmentsRescheduleInterview")}
        </AtlasButton>
      ) : null}

      {plan.showCancel ? (
        <AtlasButton
          variant="ghost"
          size="sm"
          className="appointment-card-actions__danger"
          onClick={onCancel}
        >
          {translate(plan.cancelLabelKey || "appointmentsCancelInterview")}
        </AtlasButton>
      ) : null}

      {plan.showCompleteInterview ? (
        <AtlasButton variant="secondary" size="sm" onClick={onComplete}>
          {translate(plan.completeLabelKey || "appointmentsCompleteInterview")}
        </AtlasButton>
      ) : null}
    </div>
  );
}
