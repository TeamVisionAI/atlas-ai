import { useState } from "react";
import { Link } from "react-router-dom";
import AtlasButton from "../ui/AtlasButton";
import UniversalNoteButton from "../notes/UniversalNoteButton";
import { resolveAppointmentCardActionPlan } from "../../engines/interviewWorkflowPresentationEngine";
import { buildProspectWorkspaceCommunicationHistoryPath } from "../../utils/prospectRoutes";
import "./AppointmentCardActions.css";

/**
 * Operational actions for an appointment list card (BR-043, BR-045).
 * Presentation only — does not mutate appointments or write Google Calendar.
 */
export default function AppointmentCardActions({
  appointment,
  translate,
  noteSaving = false,
  onAddNote,
  onOpenWorkspace,
  onReschedule,
  onCancel,
  onComplete
}) {
  const plan = resolveAppointmentCardActionPlan(appointment);
  const [copyState, setCopyState] = useState("idle");

  function handleJoinZoom() {
    const url = String(appointment.virtualMeetingUrl || "").trim();

    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleCopyZoomLink() {
    const url = String(appointment.virtualMeetingUrl || "").trim();

    if (!url || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("idle");
    }
  }

  return (
    <div
      className="appointment-card-actions appointments-page__actions"
      data-appointment-id={appointment.id || undefined}
      data-interview-workflow-state={plan.state}
      data-join-zoom-visible={plan.showJoinZoom ? "true" : "false"}
      data-zoom-link-unavailable={plan.showZoomLinkUnavailable ? "true" : "false"}
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

      {plan.showCopyZoomLink ? (
        <AtlasButton
          variant="ghost"
          size="sm"
          className="appointment-card-actions__copy-zoom"
          onClick={handleCopyZoomLink}
        >
          {copyState === "copied"
            ? translate("appointmentsZoomLinkCopied")
            : translate("appointmentsCopyZoomLink")}
        </AtlasButton>
      ) : null}

      {plan.showZoomLinkUnavailable ? (
        <span
          className="appointment-card-actions__zoom-unavailable"
          role="status"
          data-zoom-warning="unavailable"
        >
          {translate("appointmentsZoomLinkUnavailable")}
        </span>
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
          {translate("appointmentsCancelInterview")}
        </AtlasButton>
      ) : null}

      {plan.showCompleteInterview ? (
        <AtlasButton variant="secondary" size="sm" onClick={onComplete}>
          {translate("appointmentsCompleteInterview")}
        </AtlasButton>
      ) : null}
    </div>
  );
}
