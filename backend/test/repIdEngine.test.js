const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeRepId,
  isValidRepId,
  REP_ID_LENGTH
} = require("../core/repIdEngine");

test("normalizeRepId uppercases valid alphanumeric values", () => {
  assert.equal(normalizeRepId("4tjlk"), "4TJLK");
  assert.equal(normalizeRepId("  ab12c  "), "AB12C");
});

test("normalizeRepId allows null and blank when nullable", () => {
  assert.equal(normalizeRepId(null), null);
  assert.equal(normalizeRepId(undefined), null);
  assert.equal(normalizeRepId(""), null);
  assert.equal(normalizeRepId("   "), null);
});

test("normalizeRepId rejects invalid formats", () => {
  assert.throws(() => normalizeRepId("ABC"), (error) => error.publicCode === "INVALID_REP_ID");
  assert.throws(() => normalizeRepId("ABCDEF"), (error) => error.publicCode === "INVALID_REP_ID");
  assert.throws(() => normalizeRepId("AB-12"), (error) => error.publicCode === "INVALID_REP_ID");
  assert.throws(
    () => normalizeRepId("", { allowNull: false }),
    (error) => error.publicCode === "INVALID_REP_ID"
  );
});

test("isValidRepId validates five-character uppercase alphanumeric Rep IDs", () => {
  assert.equal(isValidRepId("4TJLK"), true);
  assert.equal(isValidRepId("4tjlk"), true);
  assert.equal(isValidRepId("TOOSHORT"), false);
  assert.equal(isValidRepId(null), false);
  assert.equal(REP_ID_LENGTH, 5);
});
