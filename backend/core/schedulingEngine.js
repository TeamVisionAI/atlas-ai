const {
  getOfferedDays,
  formatDayLabel,
  formatTimeLabel,
  getInterviewPreferenceQuestion,
  getScheduleQuestion,
  parseInterviewType,
  buildInitialSchedulingState,
  validateScheduleStep,
  handleScheduleTurn,
  buildConfirmationDetails,
  isProspectWorking,
  buildOfferedTimes,
  INTERVIEW_TYPES,
  PHASES
} = require("./interviewScheduling");
const { toDateKey } = require("./capacityEngine");
const { defaultState } = require("./schedulingState");

/*
 * --------------------------------------------------
 * Scheduling Decision Tree
 * --------------------------------------------------
 *
 * 1. Interview Type
 *    - Office
 *    - Zoom
 *
 * 2. Occupation
 *    - Working
 *    - Unemployed
 *
 * 3. Business Hours
 *    - Inside
 *    - Outside
 *
 * 4. Recruiter Presence
 *    - Available
 *    - Busy
 *    - Do Not Schedule
 *    - Vacation
 *
 * 5. Capacity
 *    - Available
 *    - Full
 *
 * 6. Prospect Requested Different Day?
 *    - Search nearest slot
 *
 * 7. Return Scheduling Options
 *
 * --------------------------------------------------
 * Decision tree not implemented yet.
 * getSchedulingOptions() is the single entry point for future branches.
 * --------------------------------------------------
 */

async function getSchedulingOptions({ prospect, interviewType, currentDate = new Date() }) {
  void currentDate;

  const language = prospect?.language === "es" ? "es" : "en";
  const offeredDayDates = getOfferedDays(interviewType);
  const working = isProspectWorking(prospect?.occupation, prospect?.occupation);
  const defaultPeriod = working ? "afterFive" : "morning";

  if (offeredDayDates.length >= 1) {
    const schedule = {
      strategy: "CAPACITY",
      days: offeredDayDates.slice(0, 2).map((date, index) => {
        const dateKey = toDateKey(date);
        const period = index === 0 ? defaultPeriod : working ? "afterFive" : "afternoon";
        const openSlots = buildOfferedTimes(dateKey, interviewType, period);

        return {
          label: formatDayLabel(date, language, index),
          dateKey,
          interviewType,
          openSlots,
          times: openSlots.map((slot) => formatTimeLabel(slot.timeKey, language))
        };
      })
    };

    const { filterScheduleDaysByGoogleCalendar } = require("../appointments/AppointmentEngine");
    const organization = await require("../repositories/jsonOrganizationRepository").findFirstActivatedOrganization();

    return filterScheduleDaysByGoogleCalendar(schedule, organization?.id || null);
  }

  return {
    strategy: "CAPACITY",
    days: []
  };
}

function buildDayQuestionFromSchedule(schedule, language) {
  const labels = schedule.days.map((day, index) => {
    const emoji = index === 0 ? "1️⃣" : "2️⃣";
    return `${emoji} ${day.label}`;
  });

  if (language === "es") {
    const joined = labels.map((item) => item.replace(/^\d️⃣ /, "")).join(" y ");
    return `¡Genial! Tenemos citas de entrevista disponibles ${joined}. ¿Qué día te funciona mejor?\n\n${labels.join("\n\n")}`;
  }

  const joined = labels.map((item) => item.replace(/^\d️⃣ /, "")).join(" and ");
  return `Great! We have interview appointments available ${joined}. Which day works better for you?\n\n${labels.join("\n\n")}`;
}

function buildInitialSchedulingStateFromSchedule(schedule, occupation, interviewType) {
  const offeredDays = schedule.days
    .map((day) => day.dateKey)
    .filter(Boolean);

  if (offeredDays.length) {
    return {
      ...defaultState(),
      phase: PHASES.DAY,
      offeredDays,
      isWorking: isProspectWorking(occupation, occupation)
    };
  }

  return buildInitialSchedulingState(interviewType, occupation);
}

module.exports = {
  getSchedulingOptions,
  buildDayQuestionFromSchedule,
  buildInitialSchedulingStateFromSchedule,
  getInterviewPreferenceQuestion,
  getScheduleQuestion,
  parseInterviewType,
  buildInitialSchedulingState,
  validateScheduleStep,
  handleScheduleTurn,
  buildConfirmationDetails,
  INTERVIEW_TYPES,
  PHASES
};
