import test from "node:test";
import assert from "node:assert/strict";
import {
  canEnableRecruitAiV2,
  recruitAiV2StatusLabel
} from "./recruitAiV2CertificationHelpers.js";

test("enable requires certified and not suspended", () => {
  assert.equal(canEnableRecruitAiV2({ certified: true, suspended: false }), true);
  assert.equal(canEnableRecruitAiV2({ certified: false, suspended: false }), false);
  assert.equal(canEnableRecruitAiV2({ certified: true, suspended: true }), false);
});

test("status labels stay fail-closed", () => {
  assert.equal(recruitAiV2StatusLabel({ suspended: true }), "Suspended — fail closed");
  assert.equal(
    recruitAiV2StatusLabel({ certified: true, enabled: true }),
    "Certified and enabled"
  );
  assert.equal(recruitAiV2StatusLabel({ certified: true }), "Certified — not enabled");
  assert.equal(recruitAiV2StatusLabel({}), "Not certified (default off)");
});
