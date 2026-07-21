/**
 * Journey #3 — Meeting persistence (JSON file).
 */

const fs = require("fs");
const path = require("path");
const { MEETING_LIFECYCLE } = require("./MeetingLifecycleService");

const STORE_FILE = path.join(__dirname, "../data/meetings.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { meetings: [], activity: [] };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { meetings: [], activity: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function normalizeMeeting(record) {
  return {
    id: record.id,
    appointmentId: record.appointmentId,
    organizationId: record.organizationId || null,
    atlasProspectId: record.atlasProspectId || null,
    prospectName: record.prospectName || "Prospect",
    meetingType: record.meetingType || "office",
    interviewType: record.interviewType || record.meetingType || "office",
    startTime: record.startTime,
    endTime: record.endTime,
    timeZone: record.timeZone || "America/New_York",
    locationName: record.locationName || null,
    address: record.address || null,
    locationLabel: record.locationLabel || null,
    lifecycleStatus: record.lifecycleStatus || MEETING_LIFECYCLE.CONFIRMED,
    calendar: record.calendar || {
      calendarEventId: null,
      calendarProvider: null,
      calendarLink: null,
      status: "pending"
    },
    zoom: record.zoom || {
      meetingId: null,
      joinUrl: null,
      hostUrl: null,
      password: null,
      meetingProvider: null,
      status: "pending"
    },
    reminders: Array.isArray(record.reminders) ? record.reminders : [],
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || new Date().toISOString()
  };
}

async function saveMeeting(meeting) {
  const store = readStore();
  const normalized = normalizeMeeting({
    ...meeting,
    updatedAt: new Date().toISOString()
  });
  store.meetings.push(normalized);
  writeStore(store);
  return normalized;
}

async function updateMeeting(meetingId, patch) {
  const store = readStore();
  const index = store.meetings.findIndex((entry) => entry.id === meetingId);

  if (index === -1) {
    return null;
  }

  store.meetings[index] = normalizeMeeting({
    ...store.meetings[index],
    ...patch,
    updatedAt: new Date().toISOString()
  });
  writeStore(store);
  return store.meetings[index];
}

async function getMeeting(meetingId) {
  const store = readStore();
  const meeting = store.meetings.find((entry) => entry.id === meetingId);
  return meeting ? normalizeMeeting(meeting) : null;
}

async function getMeetingByAppointmentId(appointmentId) {
  const store = readStore();
  const meeting = store.meetings.find((entry) => entry.appointmentId === appointmentId);
  return meeting ? normalizeMeeting(meeting) : null;
}

async function listMeetings() {
  return readStore().meetings.map(normalizeMeeting);
}

async function appendActivity(entry) {
  const store = readStore();
  store.activity.unshift({
    id: crypto.randomUUID(),
    ...entry,
    createdAt: new Date().toISOString()
  });
  store.activity = store.activity.slice(0, 50);
  writeStore(store);
}

async function listActivity(limit = 10) {
  return readStore().activity.slice(0, limit);
}

function clearStore() {
  writeStore({ meetings: [], activity: [] });
}

module.exports = {
  saveMeeting,
  updateMeeting,
  getMeeting,
  getMeetingByAppointmentId,
  listMeetings,
  appendActivity,
  listActivity,
  clearStore
};
