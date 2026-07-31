require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  selectActivePersistedAppointmentForProspect
} = require("../core/appointmentListQuery");

test("selectActivePersistedAppointmentForProspect prefers upcoming active persisted appointment", () => {
  const now = Date.now();
  const selected = selectActivePersistedAppointmentForProspect([
    {
      id: "appt-past",
      status: "confirmed",
      startDateTime: new Date(now - 60_000).toISOString()
    },
    {
      id: "appt-upcoming",
      status: "confirmed",
      startDateTime: new Date(now + 60 * 60_000).toISOString()
    }
  ]);

  assert.equal(selected.id, "appt-upcoming");
});

test("selectActivePersistedAppointmentForProspect ignores terminal appointments", () => {
  const selected = selectActivePersistedAppointmentForProspect([
    {
      id: "appt-cancelled",
      status: "cancelled",
      startDateTime: new Date(Date.now() + 60_000).toISOString()
    }
  ]);

  assert.equal(selected, null);
});
