const fs = require("fs");
const path = require("path");

const TIME_ZONE = "America/New_York";
const MAX_CAPACITY = 2;
const CAPACITY_FILE = path.join(__dirname, "../data/capacity.json");
const SCHEDULING_WINDOW_START_MINUTES = 9 * 60;
const SCHEDULING_WINDOW_END_MINUTES = 20 * 60 + 30;
const SLOT_INTERVAL_MINUTES = 15;

const bookings = new Map();

function ensureDataDir() {
  const dir = path.dirname(CAPACITY_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildSlotKey(dateKey, timeKey, interviewType) {
  return `${dateKey}|${timeKey}|${interviewType}`;
}

function toDateKey(date) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadCapacity() {
  ensureDataDir();

  if (!fs.existsSync(CAPACITY_FILE)) {
    return;
  }

  try {
    const raw = fs.readFileSync(CAPACITY_FILE, "utf8");
    const parsed = JSON.parse(raw);

    Object.entries(parsed).forEach(([key, count]) => {
      bookings.set(key, count);
    });
  } catch (error) {
    console.error("Failed to load capacity data:", error.message);
  }
}

function saveCapacity() {
  ensureDataDir();
  const payload = Object.fromEntries(bookings.entries());
  fs.writeFileSync(CAPACITY_FILE, JSON.stringify(payload, null, 2));
}

function getBookedCount(dateKey, timeKey, interviewType) {
  return bookings.get(buildSlotKey(dateKey, timeKey, interviewType)) || 0;
}

function getSlotAvailability(dateKey, timeKey, interviewType) {
  const booked = getBookedCount(dateKey, timeKey, interviewType);

  return {
    dateKey,
    timeKey,
    interviewType,
    capacity: MAX_CAPACITY,
    booked,
    available: Math.max(MAX_CAPACITY - booked, 0),
    isOpen: booked < MAX_CAPACITY
  };
}

function bookSlot(dateKey, timeKey, interviewType) {
  const key = buildSlotKey(dateKey, timeKey, interviewType);
  const booked = getBookedCount(dateKey, timeKey, interviewType);

  if (booked >= MAX_CAPACITY) {
    return {
      success: false,
      reason: "FULL"
    };
  }

  bookings.set(key, booked + 1);
  saveCapacity();

  return {
    success: true,
    availability: getSlotAvailability(dateKey, timeKey, interviewType)
  };
}

function releaseSlot(dateKey, timeKey, interviewType) {
  const key = buildSlotKey(dateKey, timeKey, interviewType);
  const booked = getBookedCount(dateKey, timeKey, interviewType);

  if (booked <= 0) {
    return false;
  }

  bookings.set(key, booked - 1);
  saveCapacity();
  return true;
}

function releaseSlotByIso(startTimeISO, interviewType) {
  if (!startTimeISO) {
    return false;
  }

  const date = new Date(startTimeISO);
  const dateKey = toDateKey(date);
  const timeKey = formatTimeKey(date.getHours(), date.getMinutes());
  return releaseSlot(dateKey, timeKey, interviewType);
}

function formatTimeKey(hour, minute = 0) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeKeyToMinutes(timeKey) {
  const [hour, minute] = String(timeKey).split(":").map(Number);
  return hour * 60 + minute;
}

function generateSchedulingWindowSlots() {
  const slots = [];

  for (
    let minutes = SCHEDULING_WINDOW_START_MINUTES;
    minutes <= SCHEDULING_WINDOW_END_MINUTES;
    minutes += SLOT_INTERVAL_MINUTES
  ) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    slots.push(formatTimeKey(hour, minute));
  }

  return slots;
}

function isWithinSchedulingWindow(hour, minute = 0) {
  const total = hour * 60 + minute;
  return (
    total >= SCHEDULING_WINDOW_START_MINUTES &&
    total <= SCHEDULING_WINDOW_END_MINUTES
  );
}

function snapToSchedulingWindow(hour, minute = 0) {
  const total = hour * 60 + minute;
  const snapped =
    Math.round(total / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
  const clamped = Math.max(
    SCHEDULING_WINDOW_START_MINUTES,
    Math.min(SCHEDULING_WINDOW_END_MINUTES, snapped)
  );

  return {
    hour: Math.floor(clamped / 60),
    minute: clamped % 60,
    timeKey: formatTimeKey(Math.floor(clamped / 60), clamped % 60)
  };
}

function findClosestOpenSlots({
  dateKey,
  hour,
  minute = 0,
  interviewType,
  maxResults = 2
}) {
  const snapped = snapToSchedulingWindow(hour, minute);
  const requestedMinutes = snapped.hour * 60 + snapped.minute;

  const candidates = generateSchedulingWindowSlots()
    .map((timeKey) => {
      const slotMinutes = timeKeyToMinutes(timeKey);
      const availability = getSlotAvailability(dateKey, timeKey, interviewType);

      return {
        dateKey,
        timeKey,
        interviewType,
        availability,
        distance: Math.abs(slotMinutes - requestedMinutes)
      };
    })
    .filter((slot) => slot.availability.isOpen)
    .sort((left, right) => left.distance - right.distance);

  const exact = candidates.find((slot) => slot.distance === 0);

  return {
    exact: Boolean(exact),
    requestedTimeKey: snapped.timeKey,
    slots: (exact ? [exact] : candidates.slice(0, maxResults)).map((slot) => ({
      dateKey: slot.dateKey,
      timeKey: slot.timeKey,
      interviewType: slot.interviewType
    }))
  };
}

function getOpenSlotsForRange(dateKey, interviewType, candidateTimes, maxResults = 2) {
  return candidateTimes
    .map((timeKey) => ({
      timeKey,
      availability: getSlotAvailability(dateKey, timeKey, interviewType)
    }))
    .filter((slot) => slot.availability.isOpen)
    .slice(0, maxResults);
}

function hasCapacityOnDay(dateKey, interviewType, candidateTimes) {
  return candidateTimes.some((timeKey) =>
    getSlotAvailability(dateKey, timeKey, interviewType).isOpen
  );
}

function getOpenSlotsForPeriod(dateKey, interviewType, candidateTimes) {
  return getOpenSlotsForRange(dateKey, interviewType, candidateTimes, 2);
}

loadCapacity();

module.exports = {
  TIME_ZONE,
  MAX_CAPACITY,
  SCHEDULING_WINDOW_START_MINUTES,
  SCHEDULING_WINDOW_END_MINUTES,
  SLOT_INTERVAL_MINUTES,
  buildSlotKey,
  toDateKey,
  formatTimeKey,
  timeKeyToMinutes,
  generateSchedulingWindowSlots,
  isWithinSchedulingWindow,
  snapToSchedulingWindow,
  findClosestOpenSlots,
  getBookedCount,
  getSlotAvailability,
  bookSlot,
  releaseSlot,
  releaseSlotByIso,
  hasCapacityOnDay,
  getOpenSlotsForPeriod,
  getOpenSlotsForRange
};
