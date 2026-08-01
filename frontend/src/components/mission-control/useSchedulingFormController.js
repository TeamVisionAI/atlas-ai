import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  createInitialSchedulingForm,
  normalizeInterviewType
} from "./SchedulingForm";
import { useInterviewAssignmentCandidates } from "./InterviewAssignmentSection";

function resolveInterviewDuration(profile) {
  return (
    profile?.appointmentProfile?.defaults?.recruitingInterviewDurationMinutes ||
    profile?.appointmentProfile?.defaults?.defaultDurationMinutes ||
    30
  );
}

export function useSchedulingFormController({
  active,
  defaultInterviewType = "",
  recruiterName = "",
  translate,
  currentUser = null
}) {
  const [form, setForm] = useState(() => createInitialSchedulingForm());
  const { candidates: assignmentCandidates } = useInterviewAssignmentCandidates(active);
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
  const sessionRef = useRef(false);
  const slotsLoadedForRef = useRef("");

  const selectableDays = useMemo(() => buildSelectableDayOptions(new Date(), 8), [active]);
  const nextWeekStartDateKey = useMemo(() => resolveNextWeekStart(new Date()), [active]);

  const fetchAvailability = useCallback(
    (params) => fetchAppointmentAvailability(params),
    []
  );

  useEffect(() => {
    if (!active) {
      sessionRef.current = false;
      slotsLoadedForRef.current = "";
      return;
    }

    if (sessionRef.current) {
      setForm((current) => ({
        ...current,
        interviewType:
          current.interviewType ||
          (defaultInterviewType ? normalizeInterviewType(defaultInterviewType) : ""),
        recruiter: current.recruiter || recruiterName || ""
      }));
      return;
    }

    sessionRef.current = true;
    setForm(
      createInitialSchedulingForm({
        defaultInterviewType,
        defaultRecruiter: recruiterName,
        defaultInterviewerUserId: currentUser?.id || "",
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
  }, [active, defaultInterviewType, recruiterName, currentUser?.id]);

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
          interviewType,
          dateKey: current.dateKey,
          timeKey: current.timeKey
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
    if (!active || !form.interviewType) {
      return;
    }

    if (slotsLoadedForRef.current === form.interviewType) {
      return;
    }

    slotsLoadedForRef.current = form.interviewType;
    loadSlotsForInterviewType(form.interviewType);
  }, [active, form.interviewType, loadSlotsForInterviewType]);

  const handleInterviewTypeChange = useCallback(() => {
    slotsLoadedForRef.current = "";
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
      setForm((current) => ({
        ...current,
        dateKey,
        timeKey: current.dateKey === dateKey ? current.timeKey : ""
      }));
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

  return {
    form,
    setForm,
    displaySlots,
    loadingSlots,
    loadingExpansion,
    slotsError,
    durationMinutes,
    displayMode,
    viewMode,
    hasMoreInWindow,
    activeDayKey,
    selectableDays,
    nextWeekStartDateKey,
    handleInterviewTypeChange,
    handleShowMoreTimes,
    handleBackToRecommended,
    handleSelectDay,
    handleNextWeek,
    assignmentCandidates,
    currentUser
  };
}
