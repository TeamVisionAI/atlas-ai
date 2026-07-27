import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AtlasButton from "../ui/AtlasButton";
import SchedulingForm, {
  createInitialSchedulingForm,
  isSchedulingFormValid
} from "./SchedulingForm";
import {
  fetchAppointmentAvailability,
  fetchAppointmentProfile
} from "../../services/appointmentService";
import {
  buildSelectableDayOptions,
  loadDaySchedulingSlots,
  loadInitialSchedulingSlots,
  loadWeekSchedulingSlots,
  pickRecommendedSlots,
  resolveNextWeekStart
} from "../../utils/schedulingSlotLoader";
import "../../styles/atlas-ui.css";
import "./MissionExecutionDialog.css";

function resolveInterviewDuration(profile) {
  return (
    profile?.appointmentProfile?.defaults?.recruitingInterviewDurationMinutes ||
    profile?.appointmentProfile?.defaults?.defaultDurationMinutes ||
    30
  );
}

export default function MissionExecutionDialog({
  open,
  phone,
  mission,
  prospect,
  recruiterName = "",
  submitting = false,
  error = null,
  onClose,
  onSubmit
}) {
  const { translate } = useLanguage();
  const [form, setForm] = useState(() => createInitialSchedulingForm());
  const [displaySlots, setDisplaySlots] = useState([]);
  const [windowSlots, setWindowSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingExpansion, setLoadingExpansion] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [displayMode, setDisplayMode] = useState("recommended");
  const [viewMode, setViewMode] = useState("48h");
  const [hasMoreInWindow, setHasMoreInWindow] = useState(false);
  const [activeDayKey, setActiveDayKey] = useState(null);

  const slotCacheRef = useRef(new Map());
  const durationRef = useRef(30);

  const defaultInterviewType = useMemo(() => {
    return prospect?.interviewType || mission?.prospect?.interviewType || "";
  }, [prospect, mission]);

  const selectableDays = useMemo(() => buildSelectableDayOptions(new Date(), 8), [open]);
  const nextWeekStartDateKey = useMemo(() => resolveNextWeekStart(new Date()), [open]);

  const fetchAvailability = useCallback(
    (params) => fetchAppointmentAvailability(params),
    []
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(
      createInitialSchedulingForm({
        defaultInterviewType,
        defaultRecruiter: recruiterName,
        defaultDuration: 30
      })
    );
    setDisplaySlots([]);
    setWindowSlots([]);
    setSlotsError(null);
    setDisplayMode("recommended");
    setViewMode("48h");
    setHasMoreInWindow(false);
    setActiveDayKey(null);
    slotCacheRef.current = new Map();
  }, [open, defaultInterviewType, recruiterName]);

  const loadSlotsForInterviewType = useCallback(
    async (interviewType) => {
      if (!interviewType) {
        setDisplaySlots([]);
        setWindowSlots([]);
        setSlotsError(null);
        return;
      }

      setLoadingSlots(true);
      setSlotsError(null);

      try {
        const profileResult = await fetchAppointmentProfile().catch(() => null);
        const duration = resolveInterviewDuration(profileResult);
        durationRef.current = duration;
        setDurationMinutes(duration);
        setForm((current) => ({
          ...current,
          duration,
          recruiter: recruiterName || current.recruiter,
          interviewType
        }));

        const result = await loadInitialSchedulingSlots(fetchAvailability, duration);

        slotCacheRef.current = result.cacheByDay;
        setWindowSlots(result.windowSlots);
        setViewMode(result.viewMode);
        setHasMoreInWindow(result.hasMoreInWindow);
        setDisplayMode("recommended");
        setActiveDayKey(null);
        setDisplaySlots(result.recommendedSlots);

        if (!result.recommendedSlots.length) {
          setSlotsError(translate("missionExecutionNoSlots"));
        }
      } catch (requestError) {
        setDisplaySlots([]);
        setWindowSlots([]);
        setSlotsError(requestError?.message || translate("missionExecutionSlotsFailed"));
      } finally {
        setLoadingSlots(false);
      }
    },
    [fetchAvailability, recruiterName, translate]
  );

  useEffect(() => {
    if (!open || !form.interviewType) {
      return;
    }

    loadSlotsForInterviewType(form.interviewType);
  }, [open, form.interviewType, loadSlotsForInterviewType]);

  const handleInterviewTypeChange = useCallback(() => {
    setDisplaySlots([]);
    setWindowSlots([]);
    setDisplayMode("recommended");
    setActiveDayKey(null);
    setHasMoreInWindow(false);
    slotCacheRef.current = new Map();
  }, []);

  const handleShowMoreTimes = useCallback(() => {
    setDisplayMode("window");
    setActiveDayKey(null);
    setDisplaySlots(windowSlots);
  }, [windowSlots]);

  const handleBackToRecommended = useCallback(() => {
    setDisplayMode("recommended");
    setActiveDayKey(null);
    setDisplaySlots(pickRecommendedSlots(windowSlots));
  }, [windowSlots]);

  const handleSelectDay = useCallback(
    async (dateKey) => {
      setLoadingExpansion(true);
      setSlotsError(null);

      try {
        const daySlots = await loadDaySchedulingSlots(
          fetchAvailability,
          dateKey,
          durationRef.current,
          slotCacheRef.current
        );

        setDisplayMode("day");
        setActiveDayKey(dateKey);
        setDisplaySlots(daySlots);

        if (!daySlots.length) {
          setSlotsError(translate("missionExecutionNoSlotsDay"));
        }
      } catch (requestError) {
        setSlotsError(requestError?.message || translate("missionExecutionSlotsFailed"));
      } finally {
        setLoadingExpansion(false);
      }
    },
    [fetchAvailability, translate]
  );

  const handleNextWeek = useCallback(async () => {
    setLoadingExpansion(true);
    setSlotsError(null);

    try {
      const weekStart = resolveNextWeekStart(new Date());
      const weekSlots = await loadWeekSchedulingSlots(
        fetchAvailability,
        weekStart,
        durationRef.current,
        slotCacheRef.current
      );

      setDisplayMode("week");
      setActiveDayKey(null);
      setDisplaySlots(weekSlots);

      if (!weekSlots.length) {
        setSlotsError(translate("missionExecutionNoSlotsWeek"));
      }
    } catch (requestError) {
      setSlotsError(requestError?.message || translate("missionExecutionSlotsFailed"));
    } finally {
      setLoadingExpansion(false);
    }
  }, [fetchAvailability, translate]);

  if (!open) {
    return null;
  }

  const canSubmit =
    isSchedulingFormValid(form) && !submitting && !loadingSlots && !loadingExpansion;

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
          slots={displaySlots}
          loadingSlots={loadingSlots}
          loadingExpansion={loadingExpansion}
          slotsError={slotsError}
          disabled={submitting}
          recruiterName={recruiterName || form.recruiter}
          durationMinutes={durationMinutes}
          displayMode={displayMode}
          viewMode={viewMode}
          hasMoreInWindow={hasMoreInWindow}
          activeDayKey={activeDayKey}
          selectableDays={selectableDays}
          nextWeekStartDateKey={nextWeekStartDateKey}
          onShowMoreTimes={handleShowMoreTimes}
          onBackToRecommended={handleBackToRecommended}
          onSelectDay={handleSelectDay}
          onNextWeek={handleNextWeek}
          onInterviewTypeChange={handleInterviewTypeChange}
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
