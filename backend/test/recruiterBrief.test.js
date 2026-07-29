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
    assert.equal(isBlockedLine("Remaining: city, schedule"), true);
    assert.equal(isBlockedLine("Prospect from Miami, FL"), true);
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

  it("uses mission reason and human-readable missing information", () => {
    const brief = buildRecruiterBrief({
      primaryMission: {
        title: "Complete Qualification",
        reason: "Missing required information: City, State."
      },
      conversationOutcome: {
        requiredInputs: [{ key: "city", label: "City" }]
      },
      conversationMessages: [],
      agentState: {},
      workflow: {},
      brain: {}
    });

    assert.equal(brief.hasGuidance, true);
    assert.match(brief.items.join(" "), /Missing required information/i);
    assert.match(brief.items.join(" "), /City/i);
    assert.doesNotMatch(brief.items.join(" "), /dayPart|INTERVIEW_RESULT_PENDING/i);
  });

  it("includes follow-up guidance in natural language", () => {
    const brief = buildRecruiterBrief({
      primaryMission: {
        title: "Follow Up",
        reason: "Follow-up date has arrived — contact the prospect now."
      },
      conversationOutcome: { requiredInputs: [] },
      conversationMessages: [],
      agentState: {
        outcome: "Needs More Time",
        followUpDate: "2020-01-01",
        followUpTime: "09:00"
      },
      workflow: { canonicalMilestone: "FOLLOW_UP" },
      brain: {}
    });

    assert.equal(brief.hasGuidance, true);
    assert.match(brief.items.join(" "), /Follow-up date has arrived/i);
  });

  it("includes recent conversation insight without enum leakage", () => {
    const brief = buildRecruiterBrief({
      primaryMission: {
        title: "Contact Prospect",
        reason: "Prospect needs recruiter contact to continue."
      },
      conversationOutcome: { requiredInputs: [] },
      conversationMessages: [
        { direction: "incoming", text: "Hola, me interesa la oportunidad." }
      ],
      agentState: {},
      workflow: {},
      brain: { intent: "AVAILABLE" }
    });

    assert.match(brief.items.join(" "), /Prospect recently said/i);
    assert.match(brief.items.join(" "), /availability/i);
  });
});
