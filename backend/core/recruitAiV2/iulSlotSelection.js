/**
 * BR-210 — IUL WhatsApp interactive slot selection.
 * Reuses BR-157 Cloud API buttons/lists. Opaque IDs only; never infer from labels.
 */

"use strict";

const {
  buildInteractiveFromOptions,
  formatNumberedFallback,
  REPLY_BUTTON_MAX
} = require("../whatsappInteractiveMessage");
const { slotIdentity } = require("../sharedScheduling/sharedSchedulingOffer");

const IUL_SLOT_ID_PREFIX = "IUL_SLOT_";
const IUL_SLOT_MORE_ID = "IUL_SLOT_MORE";
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
  return String(slot?.date || slot?.dateKey || "");
}

function slotTimeKey(slot) {
  return String(slot?.time || slot?.timeKey || "");
}

function formatIulSlotClock(timeKey) {
  const [hRaw, mRaw] = String(timeKey || "").split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw || 0);
  if (!Number.isFinite(hour)) {
    return String(timeKey || "");
  }
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function formatIulSlotButtonTitle(slot, language = "es", { includeWeekday = true } = {}) {
  const clock = formatIulSlotClock(slotTimeKey(slot));
  if (includeWeekday === false) {
    return clock;
  }
  const dateKey = slotDateKey(slot);
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekdayIndex =
    y && m && d ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay() : null;
  const short =
    weekdayIndex == null
      ? ""
      : language === "en"
        ? WEEKDAY_SHORT_EN[weekdayIndex]
        : WEEKDAY_SHORT_ES[weekdayIndex];
  return short ? `${short} ${clock}` : clock;
}

function attachIulSlotSelectionIds(slots = []) {
  return (slots || []).map((slot, index) => ({
    ...slot,
    date: slotDateKey(slot) || slot.date,
    time: slotTimeKey(slot) || slot.time,
    timezone: slot.timezone || null,
    purpose: slot.purpose || "policy_review",
    appointmentType: slot.appointmentType || "policy_review",
    selectionId: slot.selectionId || `${IUL_SLOT_ID_PREFIX}${index}`
  }));
}

function collectIulSlotPool(availability, offered = []) {
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
  (offered || []).forEach(push);
  (read.slots || []).forEach(push);
  if (availability?.alternativeToConstraint === true && !(read.slots || []).length) {
    (read.unconstrainedFutureSlots || []).forEach(push);
  }
  return pool;
}

function chooseIulSlotPresentation(pool = []) {
  const list = Array.isArray(pool) ? pool : [];
  if (list.length > REPLY_BUTTON_MAX) {
    return {
      shown: attachIulSlotSelectionIds(list.slice(0, 10)),
      includeMore: false,
      mode: "list"
    };
  }
  const shown = attachIulSlotSelectionIds(list);
  return {
    shown,
    includeMore: false,
    mode: shown.length <= REPLY_BUTTON_MAX ? "button" : "list"
  };
}

function buildIulSlotOptions(shown, { includeMore = false, language = "es", includeWeekday = true } = {}) {
  const options = (shown || []).map((slot, index) => ({
    id: slot.selectionId || `${IUL_SLOT_ID_PREFIX}${index}`,
    title: formatIulSlotButtonTitle(slot, language, { includeWeekday }),
    label: formatIulSlotButtonTitle(slot, language, { includeWeekday })
  }));
  if (includeMore) {
    options.push({
      id: IUL_SLOT_MORE_ID,
      title: language === "en" ? "More times" : "Más horarios",
      label: language === "en" ? "More times" : "Más horarios"
    });
  }
  return options;
}

function buildIulSlotInteractive(shown, body, extras = {}) {
  const language = extras.language === "en" ? "en" : "es";
  const includeMore = extras.includeMore === true;
  const includeWeekday = extras.includeWeekday !== false;
  const options = buildIulSlotOptions(shown, { includeMore, language, includeWeekday });
  return {
    interactive: buildInteractiveFromOptions({
      body,
      options,
      listButtonText: language === "en" ? "View times" : "Ver horarios",
      listSectionTitle: language === "en" ? "Available times" : "Horarios"
    }),
    fallbackText: formatNumberedFallback(body, options),
    options
  };
}

function resolveIulSlotBySelectionId(selectionId, offered = []) {
  const id = String(selectionId || "").trim();
  if (!id || !id.startsWith(IUL_SLOT_ID_PREFIX) || id === IUL_SLOT_MORE_ID) {
    return null;
  }
  return (offered || []).find((slot) => String(slot.selectionId || "") === id) || null;
}

function isIulSlotMoreId(selectionId) {
  return String(selectionId || "").trim() === IUL_SLOT_MORE_ID;
}

function isIulSlotMoreLabel(value) {
  const t = fold(value);
  return t === "ver mas horarios" || t === "mas horarios" || t === "more times";
}

function isIulSlotSelectionId(selectionId) {
  const id = String(selectionId || "").trim();
  return id.startsWith(IUL_SLOT_ID_PREFIX) && id !== IUL_SLOT_MORE_ID;
}

function isIulSlotExpired(slot, now = null) {
  const dateKey = slotDateKey(slot);
  const timeKey = slotTimeKey(slot);
  if (!dateKey || !timeKey) {
    return true;
  }
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = timeKey.split(":").map(Number);
  if (!y || !m || !d || !Number.isFinite(hh)) {
    return true;
  }
  const { zonedTimeToUtcMs } = require("../organizationDateWindow");
  const start = zonedTimeToUtcMs(
    y,
    m,
    d,
    hh,
    Number.isFinite(mm) ? mm : 0,
    0,
    0,
    slot.timezone || "America/New_York"
  );
  const nowMs = now ? new Date(now).getTime() : Date.now();
  return !Number.isFinite(start) || start <= nowMs;
}

function parseIulFreeTextSlot(text, offered = []) {
  const t = fold(text);
  if (!t || !offered.length) {
    return null;
  }
  if (/^(si|yes|ok|okay|claro|perfecto|perfect)$/.test(t) && offered.length === 1) {
    return offered[0];
  }
  const hourMatch = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  for (const slot of offered) {
    const time = slotTimeKey(slot);
    const date = slotDateKey(slot);
    if (time && t.includes(fold(time))) {
      return slot;
    }
    if (date && t.includes(fold(date))) {
      return slot;
    }
    const title = fold(formatIulSlotButtonTitle(slot, "es"));
    if (title && t.includes(title)) {
      return slot;
    }
    if (hourMatch) {
      const hour = Number(hourMatch[1]);
      const minute = hourMatch[2] ? Number(hourMatch[2]) : 0;
      const meridiem = hourMatch[3] || "";
      let hour24 = hour;
      if (meridiem === "pm" && hour < 12) hour24 = hour + 12;
      if (meridiem === "am" && hour === 12) hour24 = 0;
      const slotHour = Number(String(time).split(":")[0]);
      const slotMinute = Number(String(time).split(":")[1] || 0);
      if (slotHour === hour24 && slotMinute === minute) {
        return slot;
      }
      if (!meridiem && (slotHour === hour || slotHour === hour + 12) && slotMinute === minute) {
        return slot;
      }
    }
  }
  return null;
}

function rejectIdsForShown(shown = []) {
  return (shown || []).map((slot) => slotIdentity(slot)).filter((id) => id && id !== "|");
}

function excludeRejectedSlots(slots = [], rejectIds = []) {
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
 * BR-213 — More pages unused real slots across dates.
 * Strategy: earliest unused, then earliest unused on each later date,
 * then remaining chronological only if the page is still short.
 * Never re-picks a previously shown identity. Does not monopolize one
 * date when later valid dates exist.
 */
function selectIulCrossDatePage(slots = [], { maxCandidates = 2, rejectIds = [] } = {}) {
  const unused = excludeRejectedSlots(slots, rejectIds);
  const ordered = [...unused].sort((a, b) => {
    const dateCmp = String(a.date || a.dateKey || "").localeCompare(
      String(b.date || b.dateKey || "")
    );
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return String(a.time || a.timeKey || "").localeCompare(String(b.time || b.timeKey || ""));
  });
  if (!ordered.length) {
    return [];
  }
  const limit = Math.max(1, Number(maxCandidates) || 2);
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

  push(ordered[0]);
  const firstDate = String(ordered[0].date || ordered[0].dateKey || "");
  const dates = [];
  for (const slot of ordered) {
    const date = String(slot.date || slot.dateKey || "");
    if (date && !dates.includes(date)) {
      dates.push(date);
    }
  }
  for (const date of dates) {
    if (date === firstDate) {
      continue;
    }
    const next = ordered.find((slot) => String(slot.date || slot.dateKey || "") === date);
    push(next);
  }
  for (const slot of ordered) {
    push(slot);
  }
  return picked;
}

module.exports = {
  IUL_SLOT_ID_PREFIX,
  IUL_SLOT_MORE_ID,
  slotIdentity,
  formatIulSlotClock,
  formatIulSlotButtonTitle,
  attachIulSlotSelectionIds,
  collectIulSlotPool,
  chooseIulSlotPresentation,
  buildIulSlotInteractive,
  resolveIulSlotBySelectionId,
  isIulSlotMoreId,
  isIulSlotMoreLabel,
  isIulSlotSelectionId,
  isIulSlotExpired,
  parseIulFreeTextSlot,
  rejectIdsForShown,
  excludeRejectedSlots,
  selectIulCrossDatePage
};
