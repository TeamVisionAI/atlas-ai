/**
 * Journey #2 — In-memory appointment store (JSON file fallback).
 */

const fs = require("fs");
const path = require("path");

const STORE_FILE = path.join(__dirname, "../data/appointments.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { appointments: [], activity: [] };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { appointments: [], activity: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function normalizeAppointment(record) {
  return {
    id: record.id,
    organizationId: record.organizationId || null,
    atlasProspectId: record.atlasProspectId || null,
    prospectName: record.prospectName || "Prospect",
    interviewType: record.interviewType || "office",
    startTime: record.startTime,
    endTime: record.endTime,
    timeZone: record.timeZone || "America/New_York",
    locationLabel: record.locationLabel || null,
    status: record.status || "scheduled",
    calendarEventId: record.calendarEventId || null,
    workflowId: record.workflowId || null,
    confirmation: record.confirmation || null,
    createdAt: record.createdAt || new Date().toISOString()
  };
}

async function saveAppointment(appointment) {
  const store = readStore();
  const normalized = normalizeAppointment(appointment);
  store.appointments.push(normalized);
  writeStore(store);
  return normalized;
}

async function updateAppointment(appointmentId, patch) {
  const store = readStore();
  const index = store.appointments.findIndex((entry) => entry.id === appointmentId);

  if (index === -1) {
    return null;
  }

  store.appointments[index] = normalizeAppointment({
    ...store.appointments[index],
    ...patch
  });
  writeStore(store);
  return store.appointments[index];
}

async function saveConfirmation(appointmentId, confirmation) {
  return updateAppointment(appointmentId, {
    confirmation,
    status: "confirmed"
  });
}

async function getConfirmation(appointmentId) {
  const store = readStore();
  const appointment = store.appointments.find((entry) => entry.id === appointmentId);
  return appointment?.confirmation || null;
}

async function listAppointments() {
  return readStore().appointments.map(normalizeAppointment);
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
  writeStore({ appointments: [], activity: [] });
}

module.exports = {
  saveAppointment,
  updateAppointment,
  saveConfirmation,
  getConfirmation,
  listAppointments,
  appendActivity,
  listActivity,
  clearStore
};
