/**
 * Milestone 4 — Recruiter Brief builder tests.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildRecruiterBrief, isBlockedLine } = require("../core/recruiterBriefBuilder");

describe("Recruiter Brief builder", () => {
  it("blocks internal workflow and field-name lines", () => {
    assert.equal(isBlockedLine("INTERVIEW_RESULT_PENDING"), true);
    assert.equal(isBlockedLine("Next field: dayPart"), true);
    assert.equal(isBlockedLine("Lead: Maria Cecilia"), true);
    assert.equal(isBlockedLine("Prospect from Miami, FL"), true);
    assert.equal(isBlockedLine("Remaining: city, schedule"), true);
    assert.equal(isBlockedLine("Prospect is qualified and ready to schedule."), false);
  });

  it("returns empty guidance when there is nothing actionable", () => {
    const brief = buildRecruiterBrief({
      primaryMission: null,
      conversationOutcome: { requiredInputs: [] },
      conversationMessages: [],
      agentState: {},
      workflow: {},
      brain: {}
    });

    assert.equal(brief.hasGuidance, false);
    assert.equal(brief.items.length, 0);
  });

  it("coaches dayPart as scheduling preference — never as a field name", () => {
    const brief = buildRecruiterBrief({
      primaryMission: {
        missionType: "CompleteQualification",
        title: "Complete Qualification",
        reason: "Missing required information: dayPart."
      },
      conversationOutcome: { requiredInputs: [] },
      conversationMessages: [],
      agentState: {},
      workflow: {},
      brain: { nextField: "dayPart", missingFields: ["dayPart"] }
    });

    assert.equal(brief.hasGuidance, true);
    assert.match(
      brief.items.join(" "),
      /mornings, afternoons, or evenings work best/i
    );
    assert.doesNotMatch(brief.items.join(" "), /dayPart|Next field/i);
  });

  it("never repeats lead name or location trivia", () => {
    const brief = buildRecruiterBrief({
      primaryMission: {
        title: "Schedule Interview",
        reason: "Prospect is qualified and ready to schedule."
      },
      conversationOutcome: { requiredInputs: [] },
      conversationMessages: [],
      agentState: {},
      workflow: {},
      brain: { nextField: "dayPart" }
    });

    assert.doesNotMatch(brief.items.join(" "), /Lead:|Prospect from Miami/i);
  });

  it("includes interview outcome coaching in natural language", () => {
    const brief = buildRecruiterBrief({
      primaryMission: {
        missionType: "EnterInterviewOutcome",
        title: "Record Interview Outcome",
        reason: "Interview time has passed and outcome is missing."
      },
      conversationOutcome: { requiredInputs: [] },
      conversationMessages: [],
      agentState: {},
      workflow: {},
      brain: {}
    });

    assert.match(brief.items.join(" "), /interview has already taken place/i);
  });
});
