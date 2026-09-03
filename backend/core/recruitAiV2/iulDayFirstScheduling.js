/**
 * BR-220 — IUL day-first compact scheduling UX.
 * Decision helpers only: available days, compact :00-first pages, same-day More.
 * Does not book. Does not change BR-219 create/deferred confirmation.
 */

"use strict";

const {
  buildInteractiveFromOptions,
  formatNumberedFallback
} = require("../whatsappInteractiveMessage");
const { WEEKDAY_LABELS } = require("./dateResolution");
const { slotIdentity } = require("../sharedScheduling/sharedSchedulingOffer");
const { MAX_EXPANSION_DAYS } = require("./schedulingAvailabilityReader");

const IUL_DAY_ID_PREFIX = "IUL_DAY_";
const IUL_DAY_CHANGE_ID = "IUL_DAY_CHANGE";
const IUL_DAYPART_CHANGE_ID = "IUL_DAYPART_CHANGE";
/** Inclusive calendar days from org-local today; matches the rolling reader cap. */
const IUL_DAY_QUERY_HORIZON_DAYS = MAX_EXPANSION_DAYS;
const FIRST_PAGE_MAX_TIMES = 3;
const WEEKDAY_SHORT_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAY_SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slotDateKey(slot) {
  return String(slot?.date || slot?.dateKey || "").trim();
}

function slotTimeKey(slot) {
  return String(slot?.time || slot?.timeKey || "").trim();
}

function weekdayIndexFromDateKey(dateKey) {
  const [y, m, d] = String(dateKey || "").split("-").map(Number);
  if (!y || !m || !d) {
    return null;
  }
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function isIulDaySelectionId(selectionId) {
  return /^IUL_DAY_\d{4}-\d{2}-\d{2}$/.test(String(selectionId || "").trim());
}

function isIulDayChangeId(selectionId) {
  return String(selectionId || "").trim() === IUL_DAY_CHANGE_ID;
}

function isIulDaypartChangeId(selectionId) {
  return String(selectionId || "").trim() === IUL_DAYPART_CHANGE_ID;
}

function parseIulDaySelectionId(selectionId) {
  const raw = String(selectionId || "").trim();
  const match = raw.match(/^IUL_DAY_(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : null;
}

function iulDaySelectionId(dateKey) {
  return `${IUL_DAY_ID_PREFIX}${dateKey}`;
}

function formatIulDayTitle(dateKey, language = "es") {
  const weekdayIndex = weekdayIndexFromDateKey(dateKey);
  const dayNum = String(dateKey || "").split("-")[2];
  if (weekdayIndex == null || !dayNum) {
    return String(dateKey || "");
  }
  const short =
    language === "en" ? WEEKDAY_SHORT_EN[weekdayIndex] : WEEKDAY_SHORT_ES[weekdayIndex];
  return `${short} ${Number(dayNum)}`;
}

function formatIulWeekdayPhrase(dateKey, language = "es") {
  const weekdayIndex = weekdayIndexFromDateKey(dateKey);
  if (weekdayIndex == null) {
    return language === "en" ? "that day" : "ese día";
  }
  if (language === "en") {
    return WEEKDAY_LABELS.en[weekdayIndex];
  }
  return `el ${WEEKDAY_LABELS.es[weekdayIndex]}`;
}

function formatIulDayPartForSlots(dayPart, language = "es") {
  const part = String(dayPart || "").toLowerCase();
  if (language === "en") {
    if (part === "afternoon") return "afternoon";
    if (part === "evening") return "evening";
    return "morning";
  }
  if (part === "afternoon") return "por la tarde";
  if (part === "evening") return "por la noche";
  return "por la mañana";
}

function classifyIulSlotDayPart(slot) {
  const time = slotTimeKey(slot);
  if (!time) {
    return null;
  }
  if (time < "12:00") {
    return "morning";
  }
  if (time < "17:00") {
    return "afternoon";
  }
  return "evening";
}

function slotMatchesIulDayPart(slot, dayPart) {
  const time = slotTimeKey(slot);
  const part = String(dayPart || "").toLowerCase();
  if (!time || !part) {
    return true;
  }
  if (part === "morning") {
    return time >= "09:00" && time <= "12:00";
  }
  if (part === "afternoon") {
    return time >= "12:00" && time <= "17:00";
  }
  if (part === "evening") {
    return time >= "17:00";
  }
  return true;
}

function sortSlotsChronologically(slots = []) {
  return [...(slots || [])].sort((a, b) => {
    const dateCmp = slotDateKey(a).localeCompare(slotDateKey(b));
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return slotTimeKey(a).localeCompare(slotTimeKey(b));
  });
}

function filterSlotsByDate(slots = [], dateKey) {
  const key = String(dateKey || "").trim();
  if (!key) {
    return Array.isArray(slots) ? slots : [];
  }
  return (slots || []).filter((slot) => slotDateKey(slot) === key);
}

function filterSlotsByDayPart(slots = [], dayPart) {
  const part = String(dayPart || "").toLowerCase();
  if (!part) {
    return Array.isArray(slots) ? slots : [];
  }
  return (slots || []).filter((slot) => slotMatchesIulDayPart(slot, part));
}

function collectAvailableDays(slots = []) {
  const seen = new Set();
  const days = [];
  for (const slot of sortSlotsChronologically(slots)) {
    const dateKey = slotDateKey(slot);
    if (!dateKey || seen.has(dateKey)) {
      continue;
    }
    seen.add(dateKey);
    days.push({
      dateKey,
      selectionId: iulDaySelectionId(dateKey),
      title: formatIulDayTitle(dateKey, "es")
    });
  }
  return days;
}

function dayPartsOnDate(slots = [], dateKey) {
  const onDate = filterSlotsByDate(slots, dateKey);
  const present = [];
  if (onDate.some((slot) => classifyIulSlotDayPart(slot) === "morning")) {
    present.push("morning");
  }
  if (onDate.some((slot) => classifyIulSlotDayPart(slot) === "afternoon")) {
    present.push("afternoon");
  }
  if (onDate.some((slot) => classifyIulSlotDayPart(slot) === "evening") && !present.includes("afternoon")) {
    present.push("afternoon");
  }
  return present;
}

function isFullHourSlot(slot) {
  const [, minute] = slotTimeKey(slot).split(":");
  return String(minute || "00") === "00";
}

function excludeRejected(slots = [], rejectIds = []) {
  const rejected = new Set((rejectIds || []).map((id) => String(id)));
  if (!rejected.size) {
    return Array.isArray(slots) ? slots : [];
  }
  return (slots || []).filter((slot) => {
    const id = slotIdentity(slot);
    return id && id !== "|" && !rejected.has(id);
  });
}

/**
 * First page: chronological, prefer :00 starts, max 3 actual times.
 * Fill with :30 (or other remaining) when fewer than 3 full-hour options exist.
 */
function selectIulCompactTimePage(slots = [], { rejectIds = [], maxTimes = FIRST_PAGE_MAX_TIMES } = {}) {
  const unused = sortSlotsChronologically(excludeRejected(slots, rejectIds));
  const limit = Math.max(1, Number(maxTimes) || FIRST_PAGE_MAX_TIMES);
  const fullHour = unused.filter(isFullHourSlot);
  const remainder = unused.filter((slot) => !isFullHourSlot(slot));
  const picked = [];
  const seen = new Set();
  const push = (slot) => {
    const id = slotIdentity(slot);
    if (!id || id === "|" || seen.has(id) || picked.length >= limit) {
      return;
    }
    seen.add(id);
    picked.push(slot);
  };
  fullHour.forEach(push);
  remainder.forEach(push);
  const shown = sortSlotsChronologically(picked);
  const remaining = unused.filter((slot) => !seen.has(slotIdentity(slot)));
  return {
    shown,
    remaining,
    includeMore: remaining.length > 0
  };
}

/**
 * More pages remaining unused slots for the same day + daypart, chronological.
 * Does not re-apply :00 preference (those were already offered).
 */
function selectIulMoreTimesPage(slots = [], { rejectIds = [], maxTimes = FIRST_PAGE_MAX_TIMES } = {}) {
  const unused = sortSlotsChronologically(excludeRejected(slots, rejectIds));
  const limit = Math.max(1, Number(maxTimes) || FIRST_PAGE_MAX_TIMES);
  const shown = unused.slice(0, limit);
  const remaining = unused.slice(limit);
  return {
    shown,
    remaining,
    includeMore: remaining.length > 0
  };
}

function buildIulDayOptions(days = [], language = "es") {
  return (days || []).map((day) => {
    const dateKey = day.dateKey || day;
    return {
      id: day.selectionId || iulDaySelectionId(dateKey),
      title: formatIulDayTitle(dateKey, language),
      label: formatIulDayTitle(dateKey, language)
    };
  });
}

function buildIulDayInteractive(days, body, { language = "es" } = {}) {
  const options = buildIulDayOptions(days, language);
  return {
    interactive: buildInteractiveFromOptions({
      body,
      options,
      listButtonText: language === "en" ? "View days" : "Ver días",
      listSectionTitle: language === "en" ? "Available days" : "Días"
    }),
    fallbackText: formatNumberedFallback(body, options),
    options
  };
}

function buildIulExhaustedOptions(language = "es") {
  return [
    {
      id: IUL_DAY_CHANGE_ID,
      title: language === "en" ? "Another day" : "Otro día",
      label: language === "en" ? "Choose another day" : "Elegir otro día"
    },
    {
      id: IUL_DAYPART_CHANGE_ID,
      title: language === "en" ? "Change time" : "Cambiar horario",
      label: language === "en" ? "Change morning/afternoon" : "Cambiar mañana o tarde"
    }
  ];
}

function buildIulExhaustedInteractive(body, { language = "es" } = {}) {
  const options = buildIulExhaustedOptions(language);
  return {
    interactive: buildInteractiveFromOptions({
      body,
      options,
      listButtonText: language === "en" ? "View options" : "Ver opciones",
      listSectionTitle: language === "en" ? "Options" : "Opciones"
    }),
    fallbackText: formatNumberedFallback(body, options),
    options
  };
}

function parseIulDayFromText(text, days = []) {
  const folded = fold(text);
  if (!folded || !days.length) {
    return null;
  }
  const iso = folded.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    return days.find((day) => day.dateKey === iso[1]) || null;
  }
  for (const day of days) {
    const title = fold(formatIulDayTitle(day.dateKey, "es"));
    const titleEn = fold(formatIulDayTitle(day.dateKey, "en"));
    if (folded === title || folded === titleEn || folded.includes(title) || folded.includes(titleEn)) {
      return day;
    }
    const weekdayEs = fold(WEEKDAY_LABELS.es[weekdayIndexFromDateKey(day.dateKey)] || "");
    const weekdayEn = fold(WEEKDAY_LABELS.en[weekdayIndexFromDateKey(day.dateKey)] || "");
    const dayNum = String(Number(String(day.dateKey).split("-")[2]));
    if (weekdayEs && folded.includes(weekdayEs) && (!folded.match(/\d/) || folded.includes(dayNum))) {
      return day;
    }
    if (weekdayEn && folded.includes(weekdayEn) && (!folded.match(/\d/) || folded.includes(dayNum))) {
      return day;
    }
  }
  return null;
}

function looksLikeChangeDay(text) {
  const t = fold(text);
  return t === "otro dia" || t === "another day" || t === "choose another day";
}

function looksLikeChangeDayPart(text) {
  const t = fold(text);
  return (
    t === "cambiar horario" ||
    t === "change time" ||
    t === "cambiar manana o tarde" ||
    t === "change morning/afternoon"
  );
}

function collectHorizonSlots(availability) {
  const read = availability?.readResult || {};
  const pool = [];
  const seen = new Set();
  const push = (slot) => {
    const id = slotIdentity(slot);
    if (!id || id === "|" || seen.has(id)) {
      return;
    }
    seen.add(id);
    pool.push(slot);
  };
  (availability?.offeredSlots || []).forEach(push);
  (read.slots || []).forEach(push);
  (read.unconstrainedFutureSlots || []).forEach(push);
  (availability?.nearestAlternatives || []).forEach(push);
  return sortSlotsChronologically(pool);
}

function resetIulDayFirstFacts(knownFacts = {}) {
  return {
    ...knownFacts,
    iulSelectedDate: null,
    iulSelectedDayPart: null,
    iulReviewDayPart: null,
    reviewPreferredDayPart: null,
    preferredDayPart: null,
    reviewProposedDate: null,
    reviewProposedTime: null,
    iulShownSlotKeys: [],
    iulSlotPool: [],
    iulIncludeMoreSlots: false,
    iulDaypartSearchAttempted: false,
    iulSchedulingUnavailable: false,
    iulBookingPending: false
  };
}

module.exports = {
  IUL_DAY_ID_PREFIX,
  IUL_DAY_CHANGE_ID,
  IUL_DAYPART_CHANGE_ID,
  IUL_DAY_QUERY_HORIZON_DAYS,
  FIRST_PAGE_MAX_TIMES,
  isIulDaySelectionId,
  isIulDayChangeId,
  isIulDaypartChangeId,
  parseIulDaySelectionId,
  iulDaySelectionId,
  formatIulDayTitle,
  formatIulWeekdayPhrase,
  formatIulDayPartForSlots,
  classifyIulSlotDayPart,
  slotMatchesIulDayPart,
  sortSlotsChronologically,
  filterSlotsByDate,
  filterSlotsByDayPart,
  collectAvailableDays,
  dayPartsOnDate,
  isFullHourSlot,
  selectIulCompactTimePage,
  selectIulMoreTimesPage,
  buildIulDayInteractive,
  buildIulExhaustedInteractive,
  parseIulDayFromText,
  looksLikeChangeDay,
  looksLikeChangeDayPart,
  collectHorizonSlots,
  resetIulDayFirstFacts
};
