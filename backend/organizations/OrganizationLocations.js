/**
 * Release 1.2 — Organization office locations.
 */

const crypto = require("crypto");

function createOffice(input = {}) {
  if (!input.name) {
    throw new Error("Office requires name");
  }

  return {
    id: input.id || crypto.randomUUID(),
    name: input.name,
    address: input.address || null,
    timeZone: input.timeZone || null,
    workingHours: input.workingHours || { start: null, end: null },
    meetingCapacity: input.meetingCapacity ?? null,
    interviewAvailability: input.interviewAvailability ?? true,
    calendarMapping: input.calendarMapping || null,
    zoomMapping: input.zoomMapping || null,
    defaultLanguage: input.defaultLanguage || null,
    status: input.status || "active"
  };
}

function addOffice(locations = [], officeInput) {
  return [...locations, createOffice(officeInput)];
}

function updateOffice(locations = [], officeId, patch = {}) {
  return locations.map((office) =>
    office.id === officeId ? { ...office, ...patch } : office
  );
}

function findOffice(locations = [], officeId) {
  return locations.find((office) => office.id === officeId) || null;
}

function resolveOfficeForPackage(locations = [], officeId = null) {
  if (officeId) {
    return findOffice(locations, officeId);
  }

  return locations.find((office) => office.status === "active") || locations[0] || null;
}

module.exports = {
  createOffice,
  addOffice,
  updateOffice,
  findOffice,
  resolveOfficeForPackage
};
