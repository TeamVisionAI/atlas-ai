const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyFollowUpStatus,
  parseFollowUpAtMs,
  isFollowUpQueueCandidate,
  compareFollowUpItems,
  matchesSearch
} = require("../core/followUpsQueueEngine");
const { MILESTONES } = require("../core/workflowConstants");

test("parseFollowUpAtMs parses date and time", () => {
  const ms = parseFollowUpAtMs("2026-08-01", "14:30");
  assert.ok(ms);
  assert.equal(new Date(ms).getHours(), 14);
});

test("classifyFollowUpStatus marks overdue follow-ups without date", () => {
  assert.equal(
    classifyFollowUpStatus({
      canonicalMilestone: MILESTONES.FOLLOW_UP,
      followUpAtMs: null,
      priorityTier: "FOLLOW_UP_DUE"
    }),
    "overdue"
  );
});

test("classifyFollowUpStatus marks completed when milestone advanced", () => {
  assert.equal(
    classifyFollowUpStatus({
      canonicalMilestone: MILESTONES.ORIENTATION,
      followUpAtMs: Date.parse("2026-07-01T10:00:00"),
      priorityTier: "MONITORING"
    }),
    "completed"
  );
});

test("isFollowUpQueueCandidate includes active follow-up milestone", () => {
  assert.equal(
    isFollowUpQueueCandidate(
      { canonicalMilestone: MILESTONES.FOLLOW_UP, missionControlPriorityTier: "FOLLOW_UP_DUE" },
      { outcome: "Thinking About It", followUpDate: "2026-08-05" }
    ),
    true
  );
});

test("compareFollowUpItems sorts by due date ascending", () => {
  const sorted = [
    { phone: "b", followUpAtMs: 200, missionControlPriority: 4 },
    { phone: "a", followUpAtMs: 100, missionControlPriority: 4 }
  ].sort((a, b) => compareFollowUpItems(a, b, "due-date"));

  assert.equal(sorted[0].phone, "a");
});

test("matchesSearch finds prospect by follow-up reason", () => {
  assert.equal(
    matchesSearch(
      { name: "Maria", phone: "+1", followUpReason: "No Show", representativeName: null },
      "no show"
    ),
    true
  );
});
