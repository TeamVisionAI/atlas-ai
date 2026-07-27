import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AppointmentModalShell, { AppointmentModalActions } from "./AppointmentModalShell";
import AppointmentErrorCard from "./AppointmentErrorCard";
import { cancelAppointment } from "../../services/appointmentService";
import { captureAppointmentError } from "../../utils/appointmentErrors";

const REASONS = [
  "prospect_requested",
  "agent_requested",
  "technical_issue",
  "no_show",
  "emergency",
  "other"
];

export default function CancelAppointmentDialog({ open, appointment, onClose, onSuccess }) {
  const { translate } = useLanguage();
  const [reason, setReason] = useState("agent_requested");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setReason("agent_requested");
      setError(null);
    }
  }, [open]);

  async function submitCancel() {
    if (!appointment) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await cancelAppointment(appointment.id, { reason });
      onSuccess?.();
      onClose();
    } catch (requestError) {
      setError(captureAppointmentError("cancel", requestError, translate));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppointmentModalShell
      open={open}
      title={translate("appointmentsCancel")}
      onClose={onClose}
      footer={
        <AppointmentModalActions
          cancelLabel={translate("appointmentsCancelAction")}
          confirmLabel={translate("appointmentsConfirmCancel")}
          loading={loading}
          onCancel={onClose}
          onConfirm={submitCancel}
        />
      }
    >
      {error ? (
        <AppointmentErrorCard
          compact
          title={error.title}
          body={error.body}
          retryLabel={translate("appointmentsRetry")}
          onRetry={submitCancel}
        />
      ) : null}
      <p>{translate("appointmentsCancelConfirmBody")}</p>
      <label htmlFor="cancel-reason">{translate("appointmentsCancelReasonLabel")}</label>
      <select id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
        {REASONS.map((value) => (
          <option key={value} value={value}>
            {translate(`appointmentsRescheduleReason_${value}`)}
          </option>
        ))}
      </select>
    </AppointmentModalShell>
  );
}
