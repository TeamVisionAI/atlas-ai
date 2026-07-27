import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AppointmentModalShell, { AppointmentModalActions } from "./AppointmentModalShell";
import AppointmentErrorCard from "./AppointmentErrorCard";
import { resolveAppointmentHumanAssist } from "../../services/appointmentService";
import { captureAppointmentError } from "../../utils/appointmentErrors";

export default function ResolveHumanAssistDialog({ open, appointment, onClose, onSuccess }) {
  const { translate } = useLanguage();
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setResolutionNotes("");
      setError(null);
    }
  }, [open]);

  async function submitResolve() {
    if (!appointment) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await resolveAppointmentHumanAssist(appointment.id, {
        resolutionNotes: resolutionNotes || translate("appointmentsAssistResolvedDefault")
      });
      onSuccess?.();
      onClose();
    } catch (requestError) {
      setError(captureAppointmentError("resolve", requestError, translate));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppointmentModalShell
      open={open}
      title={translate("appointmentsResolveAssist")}
      onClose={onClose}
      footer={
        <AppointmentModalActions
          cancelLabel={translate("appointmentsCancelAction")}
          confirmLabel={translate("appointmentsConfirmResolve")}
          loading={loading}
          onCancel={onClose}
          onConfirm={submitResolve}
        />
      }
    >
      {error ? (
        <AppointmentErrorCard
          compact
          title={error.title}
          body={error.body}
          retryLabel={translate("appointmentsRetry")}
          onRetry={submitResolve}
        />
      ) : null}
      <label htmlFor="resolve-notes">{translate("appointmentsResolveAssistPrompt")}</label>
      <textarea
        id="resolve-notes"
        rows={4}
        value={resolutionNotes}
        onChange={(event) => setResolutionNotes(event.target.value)}
      />
    </AppointmentModalShell>
  );
}
