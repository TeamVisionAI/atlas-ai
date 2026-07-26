import { useMemo } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import ExecutivePanel from "../design-system/ExecutivePanel";
import AtlasButton from "../ui/AtlasButton";
import "./SchedulingForm.css";

const DURATION_OPTIONS = [30, 45, 60];

function normalizeInterviewType(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("meet")) {
    return "zoom";
  }

  return "office";
}

export function createInitialSchedulingForm({
  defaultInterviewType = "zoom",
  defaultRecruiter = "",
  defaultOfficeLocation = "",
  defaultDuration = 30
} = {}) {
  const today = new Date();
  const dateKey = today.toISOString().slice(0, 10);

  return {
    dateKey,
    timeKey: "",
    duration: defaultDuration,
    interviewType: normalizeInterviewType(defaultInterviewType),
    recruiter: defaultRecruiter,
    officeLocation: defaultOfficeLocation,
    notes: ""
  };
}

export function isSchedulingFormValid(form) {
  if (!form?.dateKey || !form?.timeKey || !form?.interviewType) {
    return false;
  }

  if (form.interviewType === "office" && !String(form.officeLocation || "").trim()) {
    return false;
  }

  return true;
}

export default function SchedulingForm({
  form,
  onChange,
  suggestedSlots = [],
  loadingSlots = false,
  disabled = false
}) {
  const { translate } = useLanguage();

  const interviewTypeLabel = useMemo(
    () => ({
      office: translate("missionExecutionInterviewTypeOffice"),
      zoom: translate("missionExecutionInterviewTypeZoom")
    }),
    [translate]
  );

  function updateField(field, value) {
    onChange({ ...form, [field]: value });
  }

  function applySuggestedSlot(slot) {
    onChange({
      ...form,
      dateKey: slot.dateKey || form.dateKey,
      timeKey: slot.timeKey || slot.time || form.timeKey
    });
  }

  return (
    <ExecutivePanel className="scheduling-form">
      <div className="scheduling-form__grid">
        <label className="scheduling-form__field">
          <span>{translate("missionExecutionInterviewDate")}</span>
          <input
            type="date"
            value={form.dateKey}
            onChange={(event) => updateField("dateKey", event.target.value)}
            disabled={disabled}
            required
          />
        </label>

        <label className="scheduling-form__field">
          <span>{translate("missionExecutionInterviewTime")}</span>
          <input
            type="time"
            value={form.timeKey}
            onChange={(event) => updateField("timeKey", event.target.value)}
            disabled={disabled}
            required
          />
        </label>

        <label className="scheduling-form__field">
          <span>{translate("missionExecutionDuration")}</span>
          <select
            value={form.duration}
            onChange={(event) => updateField("duration", Number(event.target.value))}
            disabled={disabled}
          >
            {DURATION_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {translate("missionEstimatedMinutes", { minutes })}
              </option>
            ))}
          </select>
        </label>

        <label className="scheduling-form__field scheduling-form__field--full">
          <span>{translate("missionExecutionRecruiter")}</span>
          <input
            type="text"
            value={form.recruiter}
            onChange={(event) => updateField("recruiter", event.target.value)}
            placeholder={translate("missionExecutionRecruiterPlaceholder")}
            disabled={disabled}
          />
        </label>
      </div>

      <fieldset className="scheduling-form__fieldset">
        <legend>{translate("missionExecutionInterviewType")}</legend>
        <div className="scheduling-form__radio-row">
          {["office", "zoom"].map((type) => (
            <label key={type} className="scheduling-form__radio">
              <input
                type="radio"
                name="interviewType"
                value={type}
                checked={form.interviewType === type}
                onChange={() => updateField("interviewType", type)}
                disabled={disabled}
              />
              <span>{interviewTypeLabel[type]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {form.interviewType === "office" ? (
        <label className="scheduling-form__field scheduling-form__field--full">
          <span>{translate("missionExecutionOfficeLocation")}</span>
          <input
            type="text"
            value={form.officeLocation}
            onChange={(event) => updateField("officeLocation", event.target.value)}
            disabled={disabled}
            required
          />
        </label>
      ) : null}

      <label className="scheduling-form__field scheduling-form__field--full">
        <span>{translate("missionExecutionNotes")}</span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder={translate("missionExecutionNotesPlaceholder")}
          disabled={disabled}
        />
      </label>

      {loadingSlots ? (
        <p className="scheduling-form__hint">{translate("missionExecutionLoadingSlots")}</p>
      ) : null}

      {suggestedSlots.length ? (
        <div className="scheduling-form__suggestions">
          <p className="scheduling-form__hint">{translate("missionExecutionSuggestedSlots")}</p>
          <div className="scheduling-form__slot-row">
            {suggestedSlots.map((slot) => {
              const slotKey = `${slot.dateKey}-${slot.timeKey || slot.time}`;
              const label = slot.label || `${slot.dateKey} ${slot.timeKey || slot.time}`;

              return (
                <AtlasButton
                  key={slotKey}
                  type="button"
                  variant="secondary"
                  className="scheduling-form__slot-button"
                  disabled={disabled}
                  onClick={() => applySuggestedSlot(slot)}
                >
                  {label}
                </AtlasButton>
              );
            })}
          </div>
        </div>
      ) : null}
    </ExecutivePanel>
  );
}
