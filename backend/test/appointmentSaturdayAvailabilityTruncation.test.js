/**
 * Saturday / reschedule availability must not truncate a full working day.
 * Canonical engine: appointmentSchedulingEngine.getAvailableSlots (Sprint 22).
 */

require("dotenv").config();

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  getAvailableSlots,
  generateTimeKeys
} = require("../services/appointmentSchedulingEngine");
const {
  FULL_DAY_MAX_SLOT_RESULTS
} = require("../core/configuration/appointmentDomain");

const AGENT = "00000000-0000-4000-8000-0000000000aa";
const ORG = "00000000-0000-4000-8000-000000000001";
const NOW_MS = Date.parse("2026-08-14T12:00:00-04:00");

function weekSchedule(enabledDay, start, end) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: dayOfWeek === enabledDay,
    blocks: dayOfWeek === enabledDay ? [{ start, end }] : []
  }));
}

function profileFor(enabledDay, start, end) {
  return {
    appointmentProfile: {
      workingSchedule: weekSchedule(enabledDay, start, end),
      defaults: {
        defaultDurationMinutes: 30,
        recruitingInterviewDurationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        timezone: "America/New_York"
      }
    },
    timezone: "America/New_York"
  };
}

function toGoogleBusyRanges(periods) {
  return periods.map((period) => ({
    start: typeof period.start === "number" ? period.start : Date.parse(period.start),
    end: typeof period.end === "number" ? period.end : Date.parse(period.end),
    source: "google_calendar"
  }));
}

function deps({ appointments = [], googleBusy = [] } = {}) {
  return {
    nowMs: NOW_MS,
    getAppointmentProfileFn: async () => profileFor(6, "09:00", "21:00"),
    getSchedulingSettingsFn: async () => ({ respectPersonalCalendar: true }),
    searchAppointmentsFn: async () => ({ items: appointments }),
    queryFreeBusyFn: async () => toGoogleBusyRanges(googleBusy)
  };
}

describe("reschedule / Saturday availability truncation", () => {
  test("legacy maxResults=8 reproduces 9 AM–1 PM cap", async () => {
    const result = await getAvailableSlots({
      agentId: AGENT,
      organizationId: ORG,
      date: "2026-08-15",
      durationMinutes: 30,
      maxResults: 8,
      dependencies: deps()
    });
    const keys = result.slots.map((slot) => slot.timeKey);
    assert.deepEqual(keys, [
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "12:30"
    ]);
    assert.ok(!keys.includes("15:00"));
    assert.ok(!keys.includes("20:30"));
  });

  test("legacy maxResults=8 + busy 12:30 matches production Reschedule list ending at 1 PM", async () => {
    const result = await getAvailableSlots({
      agentId: AGENT,
      organizationId: ORG,
      date: "2026-08-15",
      durationMinutes: 30,
      maxResults: 8,
      dependencies: deps({
        googleBusy: [
          {
            start: "2026-08-15T16:30:00.000Z",
            end: "2026-08-15T17:00:00.000Z"
          }
        ]
      })
    });
    assert.deepEqual(
      result.slots.map((slot) => slot.timeKey),
      ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "13:00"]
    );
  });

  test("A. Saturday 9 AM–9 PM empty calendar includes afternoon/evening", async () => {
    const result = await getAvailableSlots({
      agentId: AGENT,
      organizationId: ORG,
      date: "2026-08-15",
      durationMinutes: 30,
      dependencies: deps()
    });
    const keys = result.slots.map((slot) => slot.timeKey);
    assert.equal(result.timezone, "America/New_York");
    assert.ok(keys.includes("09:00"));
    assert.ok(keys.includes("13:00"));
    assert.ok(keys.includes("15:00"));
    assert.ok(keys.includes("18:00"));
    assert.ok(keys.includes("20:30"));
    assert.equal(keys[keys.length - 1], "20:30");
    assert.ok(keys.length > 8);
    assert.ok(keys.length <= FULL_DAY_MAX_SLOT_RESULTS);
  });

  test("B. busy 3–4 PM hides 3:00/3:30 but later slots remain", async () => {
    const busyStart = Date.parse("2026-08-15T15:00:00-04:00");
    const busyEnd = Date.parse("2026-08-15T16:00:00-04:00");
    const result = await getAvailableSlots({
      agentId: AGENT,
      organizationId: ORG,
      date: "2026-08-15",
      durationMinutes: 30,
      dependencies: deps({
        googleBusy: [{ start: new Date(busyStart).toISOString(), end: new Date(busyEnd).toISOString() }]
      })
    });
    const keys = result.slots.map((slot) => slot.timeKey);
    assert.ok(!keys.includes("15:00"));
    assert.ok(!keys.includes("15:30"));
    assert.ok(keys.includes("14:30"));
    assert.ok(keys.includes("16:00"));
    assert.ok(keys.includes("20:30"));
  });

  test("C. rescheduling a 3 PM appointment does not hide later slots", async () => {
    const appointment = {
      id: "c419ef2d-4f03-49b1-b4ab-b8efe460d468",
      startDateTime: "2026-08-15T19:00:00.000Z",
      endDateTime: "2026-08-15T19:30:00.000Z"
    };
    const ownBusy = {
      start: appointment.startDateTime,
      end: appointment.endDateTime
    };
    const truncated = await getAvailableSlots({
      agentId: AGENT,
      organizationId: ORG,
      date: "2026-08-15",
      durationMinutes: 30,
      maxResults: 8,
      dependencies: deps({
        appointments: [appointment],
        googleBusy: [ownBusy]
      })
    });
    assert.ok(!truncated.slots.some((slot) => slot.timeKey === "16:00"));

    const result = await getAvailableSlots({
      agentId: AGENT,
      organizationId: ORG,
      date: "2026-08-15",
      durationMinutes: 30,
      excludeAppointmentId: appointment.id,
      dependencies: deps({
        appointments: [appointment],
        googleBusy: [ownBusy]
      })
    });
    const keys = result.slots.map((slot) => slot.timeKey);
    assert.ok(keys.includes("15:00"), "own 3 PM slot may be reused while rescheduling");
    assert.ok(keys.includes("16:00"));
    assert.ok(keys.includes("20:30"));
  });

  test("D. Mission Control and Reschedule share appointmentSchedulingEngine", () => {
    const mcLoader = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/utils/schedulingSlotLoader.js"),
      "utf8"
    );
    const rescheduleUi = fs.readFileSync(
      path.join(
        __dirname,
        "../../frontend/src/components/appointments/RescheduleAppointmentDialog.jsx"
      ),
      "utf8"
    );
    const mcController = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/components/mission-control/useSchedulingFormController.js"),
      "utf8"
    );
    const appointmentController = fs.readFileSync(
      path.join(__dirname, "../controllers/appointmentController.js"),
      "utf8"
    );
    assert.match(mcController, /fetchAppointmentAvailability/);
    assert.match(rescheduleUi, /fetchAppointmentAvailability/);
    assert.match(mcLoader, /SCHEDULING_DAY_FETCH_MAX = 48/);
    assert.match(appointmentController, /FULL_DAY_MAX_SLOT_RESULTS/);
    assert.match(appointmentController, /excludeAppointmentId/);
  });

  test("E. default result cap does not drop later-day slots", async () => {
    const result = await getAvailableSlots({
      agentId: AGENT,
      organizationId: ORG,
      date: "2026-08-15",
      durationMinutes: 30,
      dependencies: deps()
    });
    assert.equal(result.slots.length, generateTimeKeys(540, 1260, 30).length);
    assert.equal(result.slots[result.slots.length - 1].timeKey, "20:30");
  });

  test("F. Sunday 1 PM–9 PM behaves correctly", async () => {
    const result = await getAvailableSlots({
      agentId: AGENT,
      organizationId: ORG,
      date: "2026-08-16",
      durationMinutes: 30,
      dependencies: {
        ...deps(),
        getAppointmentProfileFn: async () => profileFor(0, "13:00", "21:00")
      }
    });
    const keys = result.slots.map((slot) => slot.timeKey);
    assert.equal(keys[0], "13:00");
    assert.ok(keys.includes("17:00"));
    assert.equal(keys[keys.length - 1], "20:30");
    assert.ok(!keys.includes("09:00"));
  });

  test("G. timezone remains America/New_York", async () => {
    const result = await getAvailableSlots({
      agentId: AGENT,
      organizationId: ORG,
      date: "2026-08-15",
      durationMinutes: 30,
      dependencies: deps()
    });
    const threePm = result.slots.find((slot) => slot.timeKey === "15:00");
    assert.ok(threePm);
    assert.equal(threePm.timezone, "America/New_York");
    assert.equal(threePm.startTimeISO, "2026-08-15T19:00:00.000Z");
  });
});
