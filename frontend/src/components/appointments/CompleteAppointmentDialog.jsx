import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AppointmentModalShell, { AppointmentModalActions } from "./AppointmentModalShell";
import AppointmentErrorCard from "./AppointmentErrorCard";
import { completeAppointment } from "../../services/appointmentService";
import { captureAppointmentError } from "../../utils/appointmentErrors";

const OUTCOMES = [
  "recruited",
  "client",
  "follow_up",
  "no_show",
  "cancelled",
  "not_interested",
  "rescheduled",
  "other"
];

export default function CompleteAppointmentDialog({
  open,
  appointment,
  onClose,
  onSuccess,
  onClientConversionRequired
}) {
  const { translate } = useLanguage();
  const [outcome, setOutcome] = useState("follow_up");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setOutcome("follow_up");
      setOutcomeNotes("");
      setFollowUpDate("");
      setFollowUpTime("");
      setError(null);
    }
  }, [open]);

  async function submitComplete() {
    if (!appointment) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await completeAppointment(appointment.id, {
        outcome,
        outcomeNotes,
        followUpDate: followUpDate || undefined,
        followUpTime: followUpTime || undefined,
        futureReminder: outcome === "not_interested" ? followUpDate || undefined : undefined
      });
      const saved = result?.appointment || result;
      if (
        outcome === "client" &&
        saved?.metadata?.standaloneAgenda === true &&
        saved?.metadata?.clientConversionStatus !== "complete"
      ) {
        onSuccess?.(saved);
        onClientConversionRequired?.(saved);
        return;
      }
      onSuccess?.(saved);
      onClose();
    } catch (requestError) {
      setError(captureAppointmentError("complete", requestError, translate));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppointmentModalShell
      open={open}
      title={translate("workflowGateTitle")}
      onClose={onClose}
      footer={
        <AppointmentModalActions
          cancelLabel={translate("appointmentsCancelAction")}
          confirmLabel={translate("appointmentsConfirmComplete")}
          loading={loading}
          onCancel={onClose}
          onConfirm={submitComplete}
        />
      }
    >
      {error ? (
        <AppointmentErrorCard
          compact
          title={error.title}
          body={error.body}
          retryLabel={translate("appointmentsRetry")}
          onRetry={submitComplete}
        />
      ) : null}
      <label htmlFor="complete-outcome">{translate("appointmentsOutcomeLabel")}</label>
      <select id="complete-outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
        {OUTCOMES.map((value) => (
          <option key={value} value={value}>
            {translate(`appointmentsOutcome_${value}`)}
          </option>
        ))}
      </select>
      <label htmlFor="complete-notes">{translate("appointmentsOutcomeNotesLabel")}</label>
      <textarea
        id="complete-notes"
        rows={3}
        value={outcomeNotes}
        onChange={(event) => setOutcomeNotes(event.target.value)}
      />
      {outcome === "follow_up" || outcome === "no_show" || outcome === "not_interested" ? (
        <>
          <label htmlFor="complete-follow-up-date">
            {outcome === "not_interested"
              ? translate("appointmentsFutureReminder")
              : translate("appointmentsFollowUpDate")}
          </label>
          <input
            id="complete-follow-up-date"
            type="date"
            value={followUpDate}
            onChange={(event) => setFollowUpDate(event.target.value)}
          />
          {outcome !== "not_interested" ? (
            <>
              <label htmlFor="complete-follow-up-time">{translate("appointmentsFollowUpTime")}</label>
              <input
                id="complete-follow-up-time"
                type="time"
                value={followUpTime}
                onChange={(event) => setFollowUpTime(event.target.value)}
              />
            </>
          ) : null}
        </>
      ) : null}
    </AppointmentModalShell>
  );
}
