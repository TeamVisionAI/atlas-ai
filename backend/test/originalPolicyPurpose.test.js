/**
 * BR-143 C — originalPolicyPurpose classifier.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ORIGINAL_POLICY_PURPOSE,
  classifyOriginalPolicyPurpose
} = require("../core/recruitAiV2/originalPolicyPurpose");

test("maps family protection", () => {
  const r = classifyOriginalPolicyPurpose("Para proteger a mi familia");
  assert.equal(r.category, ORIGINAL_POLICY_PURPOSE.FAMILY_PROTECTION);
  assert.match(r.raw, /proteger a mi familia/i);
  assert.equal(r.forced, false);
});

test("unsure is explicit; unclear does not invent a category", () => {
  assert.equal(
    classifyOriginalPolicyPurpose("no sé").category,
    ORIGINAL_POLICY_PURPOSE.UNSURE
  );
  const unclear = classifyOriginalPolicyPurpose("mmm");
  assert.equal(unclear.category, null);
  assert.equal(unclear.forced, false);
});
