import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AppointmentModalShell, { AppointmentModalActions } from "../appointments/AppointmentModalShell";
import AppointmentErrorCard from "../appointments/AppointmentErrorCard";
import { promoteAgendaToClient, promoteAgendaToRecruit } from "../../services/agendaService";
import { captureAppointmentError } from "../../utils/appointmentErrors";

export default function PromoteAgendaContactDialog({
  open,
  mode = "recruit",
  appointment,
  onClose,
  onSuccess
}) {
  const { translate } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isRecruit = mode === "recruit";

  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  async function submitPromote() {
    if (!appointment) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = isRecruit
        ? await promoteAgendaToRecruit(appointment.id)
        : await promoteAgendaToClient(appointment.id);
      onSuccess?.(result);
      onClose();
    } catch (requestError) {
      setError(captureAppointmentError("promote", requestError, translate));
    } finally {
      setLoading(false);
    }
  }

  const contactName =
    appointment?.metadata?.agendaContactName ||
    appointment?.prospectName ||
    translate("agendaUnknownContact");

  return (
    <AppointmentModalShell
      open={open}
      title={translate(isRecruit ? "agendaPromoteRecruitTitle" : "agendaPromoteClientTitle")}
      onClose={onClose}
      footer={
        <AppointmentModalActions
          cancelLabel={translate("appointmentsCancelAction")}
          confirmLabel={translate(isRecruit ? "agendaPromoteRecruitConfirm" : "agendaPromoteClientConfirm")}
          loading={loading}
          onCancel={onClose}
          onConfirm={submitPromote}
        />
      }
    >
      {error ? (
        <AppointmentErrorCard
          compact
          title={error.title}
          body={error.body}
          retryLabel={translate("appointmentsRetry")}
          onRetry={submitPromote}
        />
      ) : null}
      <p>
        {translate(isRecruit ? "agendaPromoteRecruitBody" : "agendaPromoteClientBody").replace(
          "{name}",
          contactName
        )}
      </p>
    </AppointmentModalShell>
  );
}
