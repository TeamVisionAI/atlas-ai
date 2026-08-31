/**
 * BR-162 — ordered interviewer pool capacity (not a global timestamp block).
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ASSIGNMENT_MODES,
  appointmentBelongsToInterviewer,
  mergePooledSlots,
  normalizeInterviewerPool,
  resolveAssignmentMode
} = require("../core/interviewerPoolEngine");
const { getAvailableSlots } = require("../services/appointmentSchedulingEngine");

const ANA = "ana-user";
const NIOVEL = "niovel-user";
const ORG = "tenant-a";
const LEGACY_ORG = "tenant-legacy";
const NOW_MS = Date.parse("2026-08-27T15:00:00.000Z");

function profileFor(userId, start = "09:00", end = "20:30") {
  return {
    timezone: "America/New_York",
    appointmentProfile: {
      workingSchedule: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        enabled: dayOfWeek >= 1 && dayOfWeek <= 5,
        blocks: [{ start, end }]
      })),
      defaults: {
        timezone: "America/New_York",
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minimumBookingLeadMinutes: 0,
        recruitingInterviewDurationMinutes: 30
      }
    }
  };
}

function rayAtFive(interviewerUserId, agentId = interviewerUserId) {
  return {
    id: "ray-5pm",
    interviewerUserId,
    agentId,
    startDateTime: "2026-08-27T21:00:00.000Z",
    endDateTime: "2026-08-27T21:30:00.000Z"
  };
}

function deps({
  appointments = [],
  googleBusyByUser = {},
  icloudBusyByUser = {},
  pool = null
} = {}) {
  return {
    nowMs: NOW_MS,
    getAppointmentProfileFn: async (userId) => profileFor(userId),
    getSchedulingSettingsFn: async () => ({
      respectPersonalCalendar: true,
      interviewerPool: normalizeInterviewerPool(
        pool || {
          enabled: true,
          members: [
            { userId: ANA, role: "primary", order: 1, displayName: "Ana Perez" },
            { userId: NIOVEL, role: "overflow", order: 2, displayName: "Niovel Perez" }
          ]
        }
      )
    }),
    searchAppointmentsFn: async () => ({ items: appointments }),
    queryFreeBusyFn: async (_org, _min, _max, _tz, userId) =>
      (googleBusyByUser[userId] || []).map((period) => ({
        start: Date.parse(period.start),
        end: Date.parse(period.end),
        source: "google_calendar"
      })),
    queryIcloudBusyFn: async (_org, _min, _max, _tz, userId) =>
      (icloudBusyByUser[userId] || []).map((period) => ({
        start: Date.parse(period.start),
        end: Date.parse(period.end),
        source: "icloud_calendar"
      }))
  };
}

async function slotsFor(options) {
  return getAvailableSlots({
    organizationId: options.organizationId || ORG,
    agentId: options.agentId || ANA,
    date: "2026-08-27",
    durationMinutes: 30,
    maxResults: 50,
    assignmentMode: options.assignmentMode,
    interviewerUserId: options.interviewerUserId,
    dependencies: deps(options)
  });
}

function hasFive(result) {
  return (result.slots || []).some((slot) => slot.timeKey === "17:00");
}

function five(result) {
  return (result.slots || []).find((slot) => slot.timeKey === "17:00");
}

test("pool assign Ana when both free", async () => {
  const result = await slotsFor({ assignmentMode: ASSIGNMENT_MODES.AUTO });
  assert.equal(hasFive(result), true);
  assert.equal(five(result).assignedInterviewerUserId, ANA);
});

test("pool assign Niovel when Ana busy", async () => {
  const result = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.AUTO,
    appointments: [rayAtFive(ANA)]
  });
  assert.equal(hasFive(result), true);
  assert.equal(five(result).assignedInterviewerUserId, NIOVEL);
});

test("pool assign Ana when Niovel busy", async () => {
  const result = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.AUTO,
    appointments: [rayAtFive(NIOVEL)]
  });
  assert.equal(hasFive(result), true);
  assert.equal(five(result).assignedInterviewerUserId, ANA);
});

test("both busy hides the slot", async () => {
  const result = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.AUTO,
    appointments: [rayAtFive(ANA, ANA), { ...rayAtFive(NIOVEL, NIOVEL), id: "other" }]
  });
  assert.equal(hasFive(result), false);
});

test("Ray at 5 PM assigned Ana leaves Genesis 5 PM via Niovel", async () => {
  const result = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.AUTO,
    appointments: [rayAtFive(ANA, NIOVEL)]
  });
  assert.equal(five(result).assignedInterviewerUserId, NIOVEL);
});

test("Ray assigned Niovel leaves Genesis 5 PM via Ana", async () => {
  const result = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.AUTO,
    appointments: [rayAtFive(NIOVEL, NIOVEL)]
  });
  assert.equal(five(result).assignedInterviewerUserId, ANA);
});

test("explicit Ana hides her busy 5 PM even if Niovel is free", async () => {
  const result = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.EXPLICIT,
    interviewerUserId: ANA,
    appointments: [rayAtFive(ANA)]
  });
  assert.equal(hasFive(result), false);
});

test("explicit Niovel hides her busy 5 PM even if Ana is free", async () => {
  const result = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.EXPLICIT,
    interviewerUserId: NIOVEL,
    appointments: [rayAtFive(NIOVEL)]
  });
  assert.equal(hasFive(result), false);
});

test("auto shows pooled availability", async () => {
  const result = await slotsFor({ assignmentMode: ASSIGNMENT_MODES.AUTO });
  assert.equal(result.assignmentMode, ASSIGNMENT_MODES.AUTO);
  assert.equal(hasFive(result), true);
});

test("personal Google busy follows the assigned interviewer only", async () => {
  const anaBusy = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.EXPLICIT,
    interviewerUserId: ANA,
    googleBusyByUser: {
      [ANA]: [{ start: "2026-08-27T21:00:00.000Z", end: "2026-08-27T21:30:00.000Z" }]
    }
  });
  const niovelFree = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.EXPLICIT,
    interviewerUserId: NIOVEL,
    googleBusyByUser: {
      [ANA]: [{ start: "2026-08-27T21:00:00.000Z", end: "2026-08-27T21:30:00.000Z" }]
    }
  });
  assert.equal(hasFive(anaBusy), false);
  assert.equal(hasFive(niovelFree), true);
});

test("Team Legacy without a pool stays single-interviewer", async () => {
  const result = await slotsFor({
    organizationId: LEGACY_ORG,
    assignmentMode: null,
    appointments: [rayAtFive(ANA)],
    pool: { enabled: false, members: [] }
  });
  assert.equal(hasFive(result), false);
  assert.equal(resolveAssignmentMode({ poolEnabled: false }), ASSIGNMENT_MODES.EXPLICIT);
});

test("no third booking when both interviewers are occupied", async () => {
  const result = await slotsFor({
    assignmentMode: ASSIGNMENT_MODES.AUTO,
    appointments: [
      rayAtFive(ANA, ANA),
      { ...rayAtFive(NIOVEL, NIOVEL), id: "genesis" }
    ]
  });
  assert.equal(hasFive(result), false);
  assert.equal(
    appointmentBelongsToInterviewer({ interviewerUserId: ANA, agentId: NIOVEL }, ANA),
    true
  );
  assert.equal(
    mergePooledSlots([
      { member: { userId: ANA }, slots: [{ dateKey: "2026-08-27", timeKey: "17:00" }] },
      { member: { userId: NIOVEL }, slots: [{ dateKey: "2026-08-27", timeKey: "17:00" }] }
    ])[0].assignedInterviewerUserId,
    ANA
  );
});
