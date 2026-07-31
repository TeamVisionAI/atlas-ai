import AppointmentModalShell from "../appointments/AppointmentModalShell";
import CommunicationPreview from "./CommunicationPreview";
import { useLanguage } from "../../i18n/LanguageContext";

export default function CommunicationPreviewDialog({
  open,
  payload,
  loading = false,
  error = null,
  sending = false,
  copyBusy = false,
  onClose,
  onCopy,
  onSend
}) {
  const { translate } = useLanguage();

  return (
    <AppointmentModalShell
      open={open}
      title={translate("communicationPreviewDialogTitle")}
      onClose={onClose}
      wide
      footer={null}
    >
      <CommunicationPreview
        payload={payload}
        loading={loading}
        error={error}
        sending={sending}
        copyBusy={copyBusy}
        onBack={onClose}
        onCopy={onCopy}
        onSend={onSend}
      />
    </AppointmentModalShell>
  );
}
