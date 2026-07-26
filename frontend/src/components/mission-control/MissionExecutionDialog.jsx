import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AtlasButton from "../ui/AtlasButton";
import SchedulingForm, {
  createInitialSchedulingForm,
  isSchedulingFormValid
} from "./SchedulingForm";
import { fetchMissionControlAvailability } from "../../services/missionControlService";
import "../../styles/atlas-ui.css";
import "./MissionExecutionDialog.css";

export default function MissionExecutionDialog({
  open,
  phone,
  mission,
  prospect,
  organizationSettings,
  submitting = false,
  error = null,
  onClose,
  onSubmit
}) {
  const { translate } = useLanguage();
  const [form, setForm] = useState(() => createInitialSchedulingForm());
  const [suggestedSlots, setSuggestedSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const defaultInterviewType = useMemo(() => {
    return prospect?.interviewType || mission?.prospect?.interviewType || "Zoom";
  }, [prospect, mission]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(
      createInitialSchedulingForm({
        defaultInterviewType,
        defaultOfficeLocation: organizationSettings?.office?.fullAddress || "",
        defaultDuration: 30
      })
    );
    setSuggestedSlots([]);
  }, [open, defaultInterviewType, organizationSettings]);

  useEffect(() => {
    if (!open || !phone || !form.dateKey) {
      return;
    }

    let cancelled = false;

    async function loadSlots() {
      setLoadingSlots(true);

      try {
        const result = await fetchMissionControlAvailability(phone, {
          date: form.dateKey,
          duration: form.duration,
          appointmentType: "interview"
        });

        if (!cancelled) {
          setSuggestedSlots(result?.slots || []);
        }
      } catch {
        if (!cancelled) {
          setSuggestedSlots([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      }
    }

    loadSlots();

    return () => {
      cancelled = true;
    };
  }, [open, phone, form.dateKey, form.duration]);

  if (!open) {
    return null;
  }

  const canSubmit = isSchedulingFormValid(form) && !submitting;

  return (
    <div className="mission-execution-dialog__backdrop" role="presentation" onClick={onClose}>
      <div
        className="mission-execution-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-execution-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mission-execution-dialog__header">
          <p className="mission-execution-dialog__eyebrow">{translate("todaysMission")}</p>
          <h2 id="mission-execution-title" className="mission-execution-dialog__title">
            {mission?.title || translate("missionControlActionSchedule")}
          </h2>
          <p className="mission-execution-dialog__subtitle">
            {prospect?.name ? `${prospect.name} · ${prospect.phone || phone}` : phone}
          </p>
        </header>

        <SchedulingForm
          form={form}
          onChange={setForm}
          suggestedSlots={suggestedSlots}
          loadingSlots={loadingSlots}
          disabled={submitting}
        />

        {error ? <p className="mission-execution-dialog__error">{error}</p> : null}

        <div className="mission-execution-dialog__actions">
          <AtlasButton variant="ghost" onClick={onClose} disabled={submitting}>
            {translate("missionExecutionCancel")}
          </AtlasButton>
          <AtlasButton variant="primary" onClick={() => onSubmit(form)} disabled={!canSubmit}>
            {submitting
              ? translate("missionExecutionScheduling")
              : translate("missionExecutionConfirmSchedule")}
          </AtlasButton>
        </div>
      </div>
    </div>
  );
}
