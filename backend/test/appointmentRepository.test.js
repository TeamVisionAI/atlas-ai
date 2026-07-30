const test = require("node:test");
const assert = require("node:assert/strict");
const { coerceAppointmentItems } = require("../core/appointmentCollection");

test("coerceAppointmentItems returns arrays unchanged", () => {
  const rows = [{ id: "a1" }, { id: "a2" }];
  assert.deepEqual(coerceAppointmentItems(rows), rows);
});

test("coerceAppointmentItems extracts items from paginated search results", () => {
  const rows = [{ id: "a1" }];
  assert.deepEqual(coerceAppointmentItems({ items: rows, total: 1 }), rows);
});

test("coerceAppointmentItems supports alternate collection keys", () => {
  assert.deepEqual(coerceAppointmentItems({ list: [{ id: "l1" }] }), [{ id: "l1" }]);
  assert.deepEqual(coerceAppointmentItems({ upcoming: [{ id: "u1" }] }), [{ id: "u1" }]);
});

test("coerceAppointmentItems degrades malformed results to an empty array", () => {
  assert.deepEqual(coerceAppointmentItems(null), []);
  assert.deepEqual(coerceAppointmentItems(undefined), []);
  assert.deepEqual(coerceAppointmentItems({}), []);
  assert.deepEqual(coerceAppointmentItems({ items: null }), []);
});
