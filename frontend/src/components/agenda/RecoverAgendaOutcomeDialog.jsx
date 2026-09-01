import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AppointmentModalShell, { AppointmentModalActions } from "../appointments/AppointmentModalShell";
import AppointmentErrorCard from "../appointments/AppointmentErrorCard";
import { recoverAgendaOutcome } from "../../services/agendaService";
import { captureAppointmentError } from "../../utils/appointmentErrors";

export default function RecoverAgendaOutcomeDialog({
  open,
  appointment,
  defaultAction = "RECORD_RECRUIT_AND_CLIENT",
  onClose,
  onSuccess
}) {
  const { translate } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recruiterName, setRecruiterName] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (open) {
      setError(null);
      setRecruiterName("");
      setDisplayName(appointment?.metadata?.agendaContactName || "");
    }
  }, [open, appointment]);

  async function submitPreview() {
    if (!appointment) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await recoverAgendaOutcome(appointment.id, {
        action: defaultAction,
        dryRun: true,
        displayName: displayName || undefined,
        recruiter: recruiterName ? { displayName: recruiterName } : undefined
      });
      onSuccess?.(result);
      onClose();
    } catch (requestError) {
      setError(captureAppointmentError("promote", requestError, translate));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppointmentModalShell
      open={open}
      title={translate("agendaRecoverTitle")}
      onClose={onClose}
      footer={
        <AppointmentModalActions
          cancelLabel={translate("appointmentsCancelAction")}
          confirmLabel={translate("agendaRecoverConfirm")}
          loading={loading}
          onCancel={onClose}
          onConfirm={submitPreview}
        />
      }
    >
      {error ? (
        <AppointmentErrorCard
          compact
          title={error.title}
          body={error.body}
          retryLabel={translate("appointmentsRetry")}
          onRetry={submitPreview}
        />
      ) : null}
      <p>{translate("agendaRecoverBody")}</p>
      <p>{translate("agendaRecoverDryRunOnly")}</p>
      <label>
        {translate("agendaRecoverDisplayNameLabel")}
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <label>
        {translate("agendaRecoverRecruiterLabel")}
        <input
          value={recruiterName}
          onChange={(event) => setRecruiterName(event.target.value)}
        />
      </label>
    </AppointmentModalShell>
  );
}
