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
  "not_interested",
  "cancelled",
  "rescheduled",
  "other"
];

export default function CompleteAppointmentDialog({ open, appointment, onClose, onSuccess }) {
  const { translate } = useLanguage();
  const [outcome, setOutcome] = useState("follow_up");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setOutcome("follow_up");
      setOutcomeNotes("");
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
      const result = await completeAppointment(appointment.id, { outcome, outcomeNotes });
      onSuccess?.(result?.appointment);
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
      title={translate("appointmentsComplete")}
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
    </AppointmentModalShell>
  );
}
