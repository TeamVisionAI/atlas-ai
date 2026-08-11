/**
 * BR-044 — Mission Control terminal closed outcome exclusion.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  isTerminalClosedInterviewOutcome,
  isTerminalClosedForMissionControlQueue,
  filterOutTerminalClosedForMissionControl
} = require("../core/missionControlTerminalOutcomeFilter");
const { MILESTONES } = require("../core/workflowConstants");
const { mergeAgentState } = require("../core/agentActionState");

const PHONE_CLOSED = "+17865558001";
const PHONE_NOSHOW = "+17865558002";
const PHONE_RECRUITED = "+17865558003";
const PHONE_CLIENT = "+17865558004";
const PHONE_META = "3055550101";
const PHONE_FOLLOWUP = "+17865558005";

test("A. Not Interested is terminal closed", () => {
  assert.equal(isTerminalClosedInterviewOutcome("Not Interested"), true);
  assert.equal(
    isTerminalClosedForMissionControlQueue({
      prospect: { phone: PHONE_CLOSED, source: "whatsapp" },
      summary: {
        phone: PHONE_CLOSED,
        canonicalMilestone: MILESTONES.CLOSED
      }
    }),
    true
  );
});

test("D/E/F. No Show / Follow Up / Reschedule remain non-terminal", () => {
  assert.equal(isTerminalClosedInterviewOutcome("No Show"), false);
  assert.equal(isTerminalClosedInterviewOutcome("Follow Up Needed"), false);
  assert.equal(isTerminalClosedInterviewOutcome("Reschedule Interview"), false);
  assert.equal(
    isTerminalClosedForMissionControlQueue({
      prospect: { phone: PHONE_NOSHOW, source: "whatsapp" },
      summary: {
        phone: PHONE_NOSHOW,
        canonicalMilestone: MILESTONES.FOLLOW_UP
      },
      agentState: { outcome: "No Show" }
    }),
    false
  );
  assert.equal(
    isTerminalClosedForMissionControlQueue({
      prospect: { phone: PHONE_FOLLOWUP, source: "whatsapp" },
      summary: {
        phone: PHONE_FOLLOWUP,
        canonicalMilestone: MILESTONES.FOLLOW_UP
      },
      agentState: { outcome: "Needs More Time" }
    }),
    false
  );
});

test("B/C. Recruited / Became Client are not terminal-closed for MC filter", () => {
  assert.equal(
    isTerminalClosedForMissionControlQueue({
      prospect: { phone: PHONE_RECRUITED, source: "whatsapp" },
      summary: {
        phone: PHONE_RECRUITED,
        canonicalMilestone: MILESTONES.LICENSING
      },
      agentState: { outcome: "Recruited" }
    }),
    false
  );
  assert.equal(
    isTerminalClosedForMissionControlQueue({
      prospect: { phone: PHONE_CLIENT, source: "whatsapp" },
      summary: {
        phone: PHONE_CLIENT,
        canonicalMilestone: MILESTONES.FAST_START
      },
      agentState: { outcome: "Became Client" }
    }),
    false
  );
});

test("durable appointment not_interested excludes even without agent outcome", async () => {
  const summaries = [
    {
      phone: PHONE_CLOSED,
      canonicalMilestone: MILESTONES.INTERVIEW_RESULT_PENDING,
      missionControlPriority: 1
    }
  ];
  const prospects = [
    {
      phone: PHONE_CLOSED,
      organization_id: "00000000-0000-4000-8000-000000000001",
      source: "whatsapp"
    }
  ];

  const kept = await filterOutTerminalClosedForMissionControl(
    prospects,
    summaries,
    {
      findLatestAppointmentFn: async () => ({
        outcome: "not_interested",
        status: "completed"
      })
    }
  );
  assert.equal(kept.length, 0);
});

test("META_REVIEW demo remains visible even if CLOSED stamped", async () => {
  const kept = await filterOutTerminalClosedForMissionControl(
    [
      {
        phone: PHONE_META,
        source: "META_REVIEW",
        entry_method: "META_REVIEW_DEMO"
      }
    ],
    [
      {
        phone: PHONE_META,
        canonicalMilestone: MILESTONES.CLOSED,
        missionControlPriority: 6
      }
    ],
    { findLatestAppointmentFn: async () => null }
  );
  assert.equal(kept.length, 1);
});

test("queue wiring excludes CLOSED summary via priority engine contract", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../core/missionControlPriorityEngine.js"),
    "utf8"
  );
  assert.match(src, /filterOutTerminalClosedForMissionControl/);
  assert.match(src, /BR-044/);
});

test("milestoneMapper: Became Client + closed catalog outcomes", () => {
  const { mapToCanonicalMilestone } = require("../core/milestoneMapper");
  assert.equal(
    mapToCanonicalMilestone({
      prospect: {},
      currentStep: "CONFIRMED",
      missingFields: [],
      agentState: { outcome: "Became Client" }
    }),
    MILESTONES.FAST_START
  );
  assert.equal(
    mapToCanonicalMilestone({
      prospect: {},
      currentStep: "CONFIRMED",
      missingFields: [],
      agentState: { outcome: "Not Qualified" }
    }),
    MILESTONES.CLOSED
  );
});

test("docs: BR-044 MC terminal queue rules present", () => {
  const docs = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(docs, /Mission Control default queue \(terminal close\)/);
  assert.match(docs, /Not Interested/);
  assert.match(docs, /excluded from default Mission Control/);
});

test("J/K: BR-136 filter + Meta mode files untouched by imports", () => {
  const filterSrc = fs.readFileSync(
    path.join(__dirname, "../core/missionControlTerminalOutcomeFilter.js"),
    "utf8"
  );
  assert.doesNotMatch(filterSrc, /conversationsCenterLifecycle/);
  assert.match(filterSrc, /isMetaReviewDemoProspect/);
  const {
    isExecutionEnabled
  } = require("../core/recruitAiV2/sideEffectAuthorizer");
  assert.equal(isExecutionEnabled(process.env), false);
});

test("agent outcome Not Interested excludes without appointment lookup", async () => {
  mergeAgentState(PHONE_CLOSED, { outcome: "Not Interested" });
  try {
    const kept = await filterOutTerminalClosedForMissionControl(
      [{ phone: PHONE_CLOSED, source: "whatsapp" }],
      [
        {
          phone: PHONE_CLOSED,
          canonicalMilestone: MILESTONES.QUALIFICATION,
          missionControlPriority: 5
        }
      ],
      { findLatestAppointmentFn: async () => null }
    );
    assert.equal(kept.length, 0);
  } finally {
    mergeAgentState(PHONE_CLOSED, { outcome: null });
  }
});
