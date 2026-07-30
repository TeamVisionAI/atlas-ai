import { useMemo } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import ExecutivePanel from "../design-system/ExecutivePanel";
import AtlasButton from "../ui/AtlasButton";
import {
  formatNextWeekLabel,
  formatSchedulingDayLabel,
  formatSchedulingTime12Hour,
  formatSlotButtonLabel,
  groupSlotsByDay,
  isSameSlot
} from "../../utils/schedulingSlotGroups";
import "./SchedulingForm.css";

export const INTERVIEW_TYPE_OPTIONS = Object.freeze([
  { id: "office", icon: "🏢", labelKey: "missionExecutionInterviewTypeOffice" },
  { id: "public_location", icon: "☕", labelKey: "missionExecutionInterviewTypePublicLocation" },
  { id: "zoom", icon: "💻", labelKey: "missionExecutionInterviewTypeZoom" }
]);

export function normalizeInterviewType(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("zoom") || normalized.includes("virtual")) {
    return "zoom";
  }

  if (normalized.includes("public")) {
    return "public_location";
  }

  return "office";
}

export function createInitialSchedulingForm({
  defaultInterviewType = "",
  defaultRecruiter = "",
  defaultDuration = 30
} = {}) {
  return {
    dateKey: "",
    timeKey: "",
    duration: defaultDuration,
    interviewType: defaultInterviewType ? normalizeInterviewType(defaultInterviewType) : "",
    recruiter: defaultRecruiter,
    officeLocation: "",
    notes: ""
  };
}

export function isSchedulingFormValid(form) {
  return Boolean(form?.interviewType && form?.dateKey && form?.timeKey);
}

export function resolveInterviewTypeLabel(interviewType, translate) {
  const option = INTERVIEW_TYPE_OPTIONS.find((item) => item.id === interviewType);
  return option ? `${option.icon} ${translate(option.labelKey)}` : "";
}

function SummaryCard({ label, value }) {
  return (
    <div className="scheduling-form__summary-card">
      <span className="scheduling-form__summary-label">{label}</span>
      <span className="scheduling-form__summary-value">{value}</span>
    </div>
  );
}

function resolveSlotsHeading(displayMode, translate, nextWeekStartDateKey, locale) {
  if (displayMode === "recommended") {
    return translate("missionExecutionRecommendedTimes");
  }

  if (displayMode === "day") {
    return translate("missionExecutionDayTimes");
  }

  if (displayMode === "week") {
    return formatNextWeekLabel(nextWeekStartDateKey, { translate, locale });
  }

  return translate("missionExecutionSelectSlot");
}

export default function SchedulingForm({
  form,
  onChange,
  slots = [],
  loadingSlots = false,
  loadingExpansion = false,
  slotsError = null,
  disabled = false,
  recruiterName = "",
  durationMinutes = 30,
  displayMode = "recommended",
  viewMode = "48h",
  hasMoreInWindow = false,
  activeDayKey = null,
  selectableDays = [],
  nextWeekStartDateKey = "",
  onShowMoreTimes,
  onBackToRecommended,
  onSelectDay,
  onNextWeek,
  onInterviewTypeChange
}) {
  const { translate, language } = useLanguage();
  const locale = language === "es" ? "es-ES" : "en-US";
  const interviewTypeSelected = Boolean(form.interviewType);

  const groupedDays = useMemo(
    () =>
      groupSlotsByDay(slots, {
        translate,
        locale
      }),
    [slots, translate, locale]
  );

  const selectedSlot = useMemo(
    () =>
      slots.find(
        (slot) => slot.dateKey === form.dateKey && slot.timeKey === form.timeKey
      ) || null,
    [slots, form.dateKey, form.timeKey]
  );

  const isLoading = loadingSlots || loadingExpansion;
  const selectedInterviewTypeLabel = resolveInterviewTypeLabel(form.interviewType, translate);
  const selectedDateLabel = form.dateKey
    ? formatSchedulingDayLabel(form.dateKey, new Date(), { translate, locale })
    : "";
  const selectedTimeLabel = form.timeKey
    ? formatSchedulingTime12Hour(form.timeKey, locale)
    : "";

  function updateField(field, value) {
    onChange({ ...form, [field]: value });
  }

  function selectInterviewType(nextType) {
    onInterviewTypeChange?.(nextType);
    onChange({
      ...form,
      interviewType: nextType,
      dateKey: "",
      timeKey: ""
    });
  }

  function selectSlot(slot) {
    onChange({
      ...form,
      dateKey: slot.dateKey,
      timeKey: slot.timeKey,
      duration: slot.durationMinutes || form.duration || durationMinutes
    });
  }

  return (
    <ExecutivePanel className="scheduling-form">
      <section className="scheduling-form__interview-type" aria-labelledby="scheduling-type-heading">
        <h3 id="scheduling-type-heading" className="scheduling-form__slots-title">
          {translate("missionExecutionInterviewType")}
        </h3>
        <div className="scheduling-form__type-grid" role="radiogroup" aria-labelledby="scheduling-type-heading">
          {INTERVIEW_TYPE_OPTIONS.map((option) => {
            const selected = form.interviewType === option.id;

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`scheduling-form__type-option${selected ? " scheduling-form__type-option--selected" : ""}`}
                disabled={disabled}
                onClick={() => selectInterviewType(option.id)}
              >
                <span className="scheduling-form__type-icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span>{translate(option.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {interviewTypeSelected ? (
        <>
          <div className="scheduling-form__summary-grid">
            <SummaryCard
              label={translate("missionExecutionDuration")}
              value={translate("missionEstimatedMinutes", {
                minutes: durationMinutes || form.duration
              })}
            />
            <SummaryCard
              label={translate("missionExecutionInterviewType")}
              value={selectedInterviewTypeLabel}
            />
            <SummaryCard
              label={translate("missionExecutionRecruiter")}
              value={recruiterName || form.recruiter || translate("missionExecutionRecruiterPlaceholder")}
            />
          </div>

          {form.dateKey || form.timeKey ? (
            <div className="scheduling-form__selection" aria-live="polite">
              <SummaryCard
                label={translate("missionExecutionInterviewDate")}
                value={selectedDateLabel || translate("missionExecutionSelectSlot")}
              />
              <SummaryCard
                label={translate("missionExecutionInterviewTime")}
                value={selectedTimeLabel || translate("missionExecutionSelectSlot")}
              />
            </div>
          ) : null}

          <section className="scheduling-form__slots" aria-labelledby="scheduling-slots-heading">
            <div className="scheduling-form__slots-header">
              <h3 id="scheduling-slots-heading" className="scheduling-form__slots-title">
                {resolveSlotsHeading(displayMode, translate, nextWeekStartDateKey, locale)}
              </h3>
              {loadingSlots ? (
                <p className="scheduling-form__hint">{translate("missionExecutionLoadingSlots")}</p>
              ) : null}
              {!loadingSlots && loadingExpansion ? (
                <p className="scheduling-form__hint">{translate("missionExecutionLoadingDay")}</p>
              ) : null}
              {!isLoading && viewMode === "next_available" && displayMode === "recommended" ? (
                <p className="scheduling-form__hint">{translate("missionExecutionNextAvailableHint")}</p>
              ) : null}
            </div>

            {slotsError ? (
              <p className="scheduling-form__error" role="alert">
                {slotsError}
              </p>
            ) : null}

            {!isLoading && !slotsError && groupedDays.length ? (
              <div className="scheduling-form__day-groups">
                {groupedDays.map((day) => (
                  <div key={day.dateKey} className="scheduling-form__day-group">
                    <h4 className="scheduling-form__day-label">{day.label}</h4>
                    <div
                      className="scheduling-form__slot-grid"
                      role="listbox"
                      aria-label={`${day.label} ${translate("appointmentsAvailableSlots")}`}
                    >
                      {day.slots.map((slot) => {
                        const selected = isSameSlot(slot, selectedSlot);

                        return (
                          <button
                            key={`${slot.dateKey}-${slot.timeKey}`}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`scheduling-form__slot${selected ? " scheduling-form__slot--selected" : ""}`}
                            disabled={disabled}
                            onClick={() => selectSlot(slot)}
                          >
                            {formatSlotButtonLabel(slot, locale)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {!isLoading && !slotsError && !groupedDays.length ? (
              <p className="scheduling-form__hint">{translate("missionExecutionNoSlots")}</p>
            ) : null}

            {!isLoading && groupedDays.length ? (
              <div className="scheduling-form__expansion">
                {displayMode === "recommended" && hasMoreInWindow ? (
                  <AtlasButton
                    type="button"
                    variant="secondary"
                    className="scheduling-form__expansion-button"
                    disabled={disabled}
                    onClick={onShowMoreTimes}
                  >
                    {translate("missionExecutionShowMoreTimes")}
                  </AtlasButton>
                ) : null}

                {displayMode !== "recommended" ? (
                  <AtlasButton
                    type="button"
                    variant="ghost"
                    className="scheduling-form__expansion-button"
                    disabled={disabled}
                    onClick={onBackToRecommended}
                  >
                    {translate("missionExecutionBackToRecommended")}
                  </AtlasButton>
                ) : null}
              </div>
            ) : null}
          </section>

          {!loadingSlots ? (
            <section className="scheduling-form__choose-day" aria-labelledby="scheduling-choose-day-heading">
              <h3 id="scheduling-choose-day-heading" className="scheduling-form__slots-title">
                {translate("missionExecutionChooseDay")}
              </h3>
              <div className="scheduling-form__day-picker">
                {selectableDays.map((option) => {
                  const label = formatSchedulingDayLabel(option.dateKey, new Date(), {
                    translate,
                    locale
                  });
                  const isActive = displayMode === "day" && activeDayKey === option.dateKey;

                  return (
                    <AtlasButton
                      key={option.dateKey}
                      type="button"
                      variant={isActive ? "primary" : "secondary"}
                      className="scheduling-form__day-pill"
                      disabled={disabled || loadingExpansion}
                      onClick={() => onSelectDay?.(option.dateKey)}
                    >
                      {label}
                    </AtlasButton>
                  );
                })}
                <AtlasButton
                  type="button"
                  variant="secondary"
                  className="scheduling-form__day-pill"
                  disabled={disabled || loadingExpansion}
                  onClick={onNextWeek}
                >
                  {formatNextWeekLabel(nextWeekStartDateKey, { translate, locale })}
                </AtlasButton>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="scheduling-form__hint">{translate("missionExecutionSelectInterviewTypeFirst")}</p>
      )}

      <details className="scheduling-form__advanced">
        <summary>{translate("missionExecutionAdvanced")}</summary>
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
      </details>
    </ExecutivePanel>
  );
}
