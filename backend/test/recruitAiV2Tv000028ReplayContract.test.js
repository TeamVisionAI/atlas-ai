/**
 * Recruit AI v2 — TV-000028 forensic replay contract.
 * Does not invoke the conversation engine or send WhatsApp.
 */

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures/recruitAiV2/tv000028-scheduling-replay.json"
);

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

test("TV-000028 fixture identifies the forensic production conversation", () => {
  const fx = loadFixture();
  assert.equal(fx.fixtureId, "tv000028-scheduling-replay");
  assert.equal(fx.identity.prospectId, "29853100-f151-4ca8-b07d-624fd20c6685");
  assert.equal(fx.identity.ownerRepId, "4TJLK");
  assert.equal(fx.identity.phoneMasked, "+***7338");
  assert.match(fx.identity.phoneMasked, /^\+\*\*\*\d{4}$/);
  assert.equal(fx.boundaries.noLiveWhatsApp, true);
  assert.equal(fx.boundaries.metaReviewUntouched, true);
});

test("TV-000028 fixture captures counteroffer and dangerous failure turns", () => {
  const fx = loadFixture();
  const byId = Object.fromEntries(fx.turns.map((t) => [t.id, t]));
  assert.equal(byId.t07.text, "I prefer at 6");
  assert.equal(byId.t07.overallGrade, "incorrect");
  assert.ok(byId.t07.failureTags.includes("ignored_counteroffer"));
  assert.equal(byId.t09.overallGrade, "dangerous");
  assert.ok(byId.t09.failureTags.includes("internal_error_leaked"));
  assert.equal(byId.t11.text, "6?");
  assert.ok(byId.t11.failureTags.includes("repeat_unavailable_slots"));
  assert.equal(byId.t13.overallGrade, "dangerous");
  assert.ok(byId.t13.failureTags.includes("dual_confirmation"));
});

test("TV-000028 v2 expectations forbid diagnostics and premature booking on counteroffers", () => {
  const fx = loadFixture();
  const counter = fx.turns.find((t) => t.id === "t07");
  assert.equal(counter.v2Expected.decision.mayCreateAppointment, false);
  const fail = fx.turns.find((t) => t.id === "t09");
  assert.equal(fail.v2Expected.decision.shouldEscalate, true);
  for (const needle of fail.v2Expected.customerReplyMustNotContain) {
    assert.match(fail.observedOutbound, new RegExp(needle, "i"));
  }
  assert.equal(fx.invariants.mustNotLeakInternalDiagnostics, true);
  assert.equal(fx.invariants.mustNotSendConflictingConfirmations, true);
  assert.equal(fx.invariants.metaReviewFlexibilityDisabled, true);
});

test("architecture docs exist for Recruit AI v2 audit sprint", () => {
  const root = path.join(__dirname, "../../docs/03-engineering/recruit-ai-v2");
  for (const name of [
    "README.md",
    "01_TV000028_FORENSIC_TIMELINE.md",
    "02_COMMUNICATIONS_INVENTORY.md",
    "03_CURRENT_ARCHITECTURE_MAP.md",
    "04_RECRUIT_AI_V2_ARCHITECTURE.md",
    "05_COMMUNICATIONS_CENTER_READ_MODEL.md"
  ]) {
    assert.ok(fs.existsSync(path.join(root, name)), name);
  }
});
