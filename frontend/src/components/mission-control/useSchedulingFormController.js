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
import {
  buildSchedulingAvailabilityFetchKey,
  recordSchedulingAvailabilityFetch,
  resolveAvailabilityFetchReason,
  shouldFetchSchedulingAvailability
} from "./schedulingAvailabilityFetchGate";

function resolveInterviewDuration(profile) {
  return (
    profile?.appointmentProfile?.defaults?.recruitingInterviewDurationMinutes ||
    profile?.appointmentProfile?.defaults?.defaultDurationMinutes ||
    30
  );
}

function isDevInstrumentationEnabled() {
  try {
    return Boolean(import.meta?.env?.DEV) || process.env.NODE_ENV === "test";
  } catch {
    return process.env.NODE_ENV === "test";
  }
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
  const slotsLoadedForKeyRef = useRef("");
  const loadGenerationRef = useRef(0);
  const recruiterNameRef = useRef(recruiterName);
  const translateRef = useRef(translate);

  recruiterNameRef.current = recruiterName;
  translateRef.current = translate;

  const selectableDays = useMemo(() => buildSelectableDayOptions(new Date(), 8), [active]);
  const nextWeekStartDateKey = useMemo(() => resolveNextWeekStart(new Date()), [active]);

  const fetchAvailability = useCallback((params) => {
    if (isDevInstrumentationEnabled()) {
      // Per-day HTTP calls inside a logical load (48h scan may issue 1–N).
      recordSchedulingAvailabilityFetch(
        "http",
        `${params?.date || ""}|${params?.agentId || ""}|${params?.duration || ""}`
      );
    }

    return fetchAppointmentAvailability(params);
  }, []);

  useEffect(() => {
    if (!active) {
      sessionRef.current = false;
      slotsLoadedForKeyRef.current = "";
      loadGenerationRef.current += 1;
      return;
    }

    if (sessionRef.current) {
      const nextInterviewType =
        defaultInterviewType ? normalizeInterviewType(defaultInterviewType) : "";
      const nextRecruiter = recruiterName || "";

      setForm((current) => {
        const interviewType = current.interviewType || nextInterviewType;
        const recruiter = current.recruiter || nextRecruiter;

        if (interviewType === current.interviewType && recruiter === current.recruiter) {
          return current;
        }

        return {
          ...current,
          interviewType,
          recruiter
        };
      });
      return;
    }

    sessionRef.current = true;
    slotsLoadedForKeyRef.current = "";
    setForm(
      createInitialSchedulingForm({
        defaultInterviewType,
        defaultRecruiter: recruiterName,
        defaultInterviewerUserId: "",
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

  const loadSlotsForKey = useCallback(async (fetchKey, interviewType, interviewerUserId) => {
    if (!interviewType) {
      setDisplaySlots([]);
      setWindowSlots([]);
      setSlotsError(null);
      return;
    }

    const generation = ++loadGenerationRef.current;
    const translateFn = translateRef.current;
    const recruiter = recruiterNameRef.current;

    setLoadingSlots(true);
    setSlotsError(null);

    try {
      const profileResult = await fetchAppointmentProfile().catch(() => null);
      if (generation !== loadGenerationRef.current) {
        return;
      }

      const duration = resolveInterviewDuration(profileResult);
      durationRef.current = duration;
      setDurationMinutes(duration);
      setForm((current) => {
        if (
          current.duration === duration &&
          current.interviewType === interviewType &&
          (recruiter ? current.recruiter === recruiter : true)
        ) {
          return current;
        }

        return {
          ...current,
          duration,
          recruiter: recruiter || current.recruiter,
          interviewType
        };
      });

      const availabilityFetcher = (params) =>
        fetchAvailability({
          ...params,
          assignmentMode: interviewerUserId ? "explicit" : "auto",
          ...(interviewerUserId
            ? { agentId: interviewerUserId, interviewerUserId }
            : {})
        });

      const result = await loadInitialSchedulingSlots(availabilityFetcher, duration);

      if (generation !== loadGenerationRef.current) {
        return;
      }

      slotCacheRef.current = result.cacheByDay;
      setWindowSlots(result.windowSlots);
      setViewMode(result.viewMode);
      setHasMoreInWindow(result.hasMoreInWindow);
      setDisplayMode("recommended");
      setActiveDayKey(null);
      setDisplaySlots(result.recommendedSlots);
      slotsLoadedForKeyRef.current = fetchKey;

      if (!result.recommendedSlots.length) {
        setSlotsError(translateFn("missionExecutionNoSlots"));
      }
    } catch (requestError) {
      if (generation !== loadGenerationRef.current) {
        return;
      }

      slotsLoadedForKeyRef.current = "";
      setDisplaySlots([]);
      setWindowSlots([]);
      setSlotsError(requestError?.message || translateFn("missionExecutionSlotsFailed"));
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoadingSlots(false);
      }
    }
  }, [fetchAvailability]);

  const availabilityFetchKey = useMemo(
    () =>
      buildSchedulingAvailabilityFetchKey({
        interviewType: form.interviewType,
        interviewerUserId: form.interviewerUserId,
        interviewerSelection: form.interviewerSelection
      }),
    [form.interviewType, form.interviewerUserId, form.interviewerSelection]
  );

  useEffect(() => {
    if (!active || !availabilityFetchKey) {
      return;
    }

    if (!shouldFetchSchedulingAvailability(slotsLoadedForKeyRef.current, availabilityFetchKey)) {
      return;
    }

    const reason = resolveAvailabilityFetchReason(
      slotsLoadedForKeyRef.current,
      availabilityFetchKey
    );

    if (isDevInstrumentationEnabled()) {
      recordSchedulingAvailabilityFetch(reason, availabilityFetchKey);
      // eslint-disable-next-line no-console
      console.info("[scheduling-availability]", {
        reason,
        key: availabilityFetchKey,
        previousKey: slotsLoadedForKeyRef.current
      });
    }

    // Reserve the key immediately so overlapping effect runs (e.g. dep churn) cannot
    // start a second identical initial load before the async work finishes.
    slotsLoadedForKeyRef.current = availabilityFetchKey;
    slotCacheRef.current = new Map();
    loadSlotsForKey(availabilityFetchKey, form.interviewType, form.interviewerUserId || "");
  }, [active, availabilityFetchKey, form.interviewType, form.interviewerUserId, loadSlotsForKey]);

  const handleInterviewTypeChange = useCallback(() => {
    slotsLoadedForKeyRef.current = "";
    loadGenerationRef.current += 1;
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
        const interviewerUserId = form.interviewerUserId || "";
        const availabilityFetcher = (params) =>
          fetchAvailability({
            ...params,
            assignmentMode: interviewerUserId ? "explicit" : "auto",
          ...(interviewerUserId
            ? { agentId: interviewerUserId, interviewerUserId }
            : {})
          });

        const daySlots = await loadDaySchedulingSlots(
          availabilityFetcher,
          dateKey,
          durationRef.current,
          slotCacheRef.current
        );

        setDisplayMode("day");
        setActiveDayKey(dateKey);
        setDisplaySlots(daySlots);

        if (!daySlots.length) {
          setSlotsError(translateRef.current("missionExecutionNoSlotsDay"));
        }
      } catch (requestError) {
        setSlotsError(
          requestError?.message || translateRef.current("missionExecutionSlotsFailed")
        );
      } finally {
        setLoadingExpansion(false);
      }
    },
    [fetchAvailability, form.interviewerUserId]
  );

  const handleNextWeek = useCallback(async () => {
    setLoadingExpansion(true);
    setSlotsError(null);

    try {
      const weekStart = resolveNextWeekStart(new Date());
      const interviewerUserId = form.interviewerUserId || "";
      const availabilityFetcher = (params) =>
        fetchAvailability({
          ...params,
          assignmentMode: interviewerUserId ? "explicit" : "auto",
          ...(interviewerUserId
            ? { agentId: interviewerUserId, interviewerUserId }
            : {})
        });

      const weekSlots = await loadWeekSchedulingSlots(
        availabilityFetcher,
        weekStart,
        durationRef.current,
        slotCacheRef.current
      );

      setDisplayMode("week");
      setActiveDayKey(null);
      setDisplaySlots(weekSlots);

      if (!weekSlots.length) {
        setSlotsError(translateRef.current("missionExecutionNoSlotsWeek"));
      }
    } catch (requestError) {
      setSlotsError(
        requestError?.message || translateRef.current("missionExecutionSlotsFailed")
      );
    } finally {
      setLoadingExpansion(false);
    }
  }, [fetchAvailability, form.interviewerUserId]);

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
