/**
 * Qualification completion → INTERVIEW_READY / Schedule Interview (MC save path).
 * Covers the production gap where Complete Qualification vanished without advancing.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { MILESTONES } = require("../core/workflowConstants");
const { validateMilestoneAdvancement } = require("../core/milestoneValidationEngine");
const {
  getQualificationFormGaps,
  resolveRequiredInformationTargetMilestone
} = require("../core/conversationOutcomeEngine");
const { buildProfileFromProspect } = require("../core/informationModel");
const {
  shouldGenerateScheduleInterviewMission,
  hasIncompleteQualification,
  getPrimaryMissionFromContext
} = require("../core/missionEngine");
const { ACTION_IDS } = require("../core/agentActionRegistry");

const COMPLETE_CAPTURE = Object.freeze({
  city: true,
  state: true,
  authorization: true,
  interviewType: true,
  dayPart: true,
  name: false,
  email: false,
  dayPartClarifyAttempts: 0
});

const COMPLETE_FIELDS = Object.freeze({
  city: "Fort Myers",
  state: "FL",
  work_authorization_status: true,
  interview_type: "Zoom",
  preferred_language: "spanish",
  occupation: "Sales"
});

function buildQualifiedProspect(overrides = {}) {
  return {
    id: "prospect-qual-complete-1",
    phone: "+12399990001",
    organization_id: "00000000-0000-4000-8000-000000000001",
    name: "Test Prospect",
    city: "Fort Myers",
    state: "FL",
    work_authorized: true,
    interview_type: "Zoom",
    preferred_language: "spanish",
    occupation: "Sales",
    notes: "QUAL_CAPTURE:{\"city\":true,\"state\":true,\"authorization\":true,\"interviewType\":true,\"dayPart\":true}",
    ...overrides
  };
}

test("incomplete qualification stays QUALIFICATION", () => {
  const prospect = buildQualifiedProspect({
    city: null,
    state: null,
    work_authorized: null,
    interview_type: null,
    notes: null
  });
  const profile = buildProfileFromProspect(prospect);
  const gaps = getQualificationFormGaps(prospect, profile, {
    notes: null,
    captureState: {
      city: false,
      state: false,
      authorization: false,
      interviewType: false,
      dayPart: false,
      name: false,
      email: false,
      dayPartClarifyAttempts: 0
    }
  });

  assert.ok(gaps.length > 0);

  const target = resolveRequiredInformationTargetMilestone({
    prospect,
    fields: { city: "Fort Myers" },
    captureState: {
      city: true,
      state: false,
      authorization: false,
      interviewType: false,
      dayPart: false,
      name: false,
      email: false,
      dayPartClarifyAttempts: 0
    }
  });

  assert.equal(target, MILESTONES.QUALIFICATION);
});

test("final required qualification fields → INTERVIEW_READY target", () => {
  const prospect = buildQualifiedProspect({
    city: null,
    state: null,
    work_authorized: null,
    interview_type: null,
    notes: null,
    occupation: null
  });

  const target = resolveRequiredInformationTargetMilestone({
    prospect: {
      ...prospect,
      city: COMPLETE_FIELDS.city,
      state: COMPLETE_FIELDS.state,
      work_authorized: true,
      interview_type: "Zoom",
      preferred_language: "spanish"
    },
    fields: COMPLETE_FIELDS,
    captureState: COMPLETE_CAPTURE
  });

  assert.equal(target, MILESTONES.INTERVIEW_READY);
});

test("unscheduled INTERVIEW_READY advancement validates without calendar/schedule", () => {
  const result = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.QUALIFICATION,
    targetMilestone: MILESTONES.INTERVIEW_READY,
    prospect: {
      phone: "+12399990001",
      city: "Fort Myers",
      state: "FL",
      work_authorized: true,
      interview_type: "Zoom",
      occupation: "Sales",
      calendar_event_id: null,
      interview_time: null
    },
    capturedFields: {
      city: "Fort Myers",
      state: "FL",
      authorization: true,
      interviewType: "Zoom"
    },
    explicitProfileFields: ["city", "state", "authorization", "interviewType"]
  });

  assert.equal(result.valid, true, JSON.stringify(result.errors || []));
  assert.equal((result.missingFields || []).includes("schedule"), false);
  assert.equal((result.missingFields || []).includes("dayPart"), false);
  assert.equal((result.missingFields || []).includes("occupation"), false);
});

test("no INTERVIEW_READY transition when required fields remain missing", () => {
  const result = validateMilestoneAdvancement({
    currentMilestone: MILESTONES.QUALIFICATION,
    targetMilestone: MILESTONES.INTERVIEW_READY,
    prospect: {
      phone: "+12399990001",
      city: null,
      state: null,
      work_authorized: null,
      interview_type: null
    },
    capturedFields: {
      city: "Fort Myers"
    }
  });

  assert.equal(result.valid, false);
  assert.ok(
    (result.missingFields || []).some((field) =>
      ["state", "authorization", "interviewType"].includes(field)
    )
  );
});

test("work-auth denied stays QUALIFICATION (not interview-ready)", () => {
  const target = resolveRequiredInformationTargetMilestone({
    prospect: buildQualifiedProspect({ work_authorized: false }),
    fields: {
      ...COMPLETE_FIELDS,
      work_authorization_status: false
    },
    captureState: COMPLETE_CAPTURE
  });

  assert.equal(target, MILESTONES.QUALIFICATION);
});

test("Schedule Interview mission appears for INTERVIEW_READY immediately", () => {
  const conversationOutcome = {
    requiredInputs: [],
    workflowRequirements: [{ key: "schedule", label: "Interview not scheduled" }],
    recordedOutcome: null
  };
  const brain = {
    currentStep: "SCHEDULE",
    missingFields: ["schedule"]
  };
  const workflow = { canonicalMilestone: MILESTONES.INTERVIEW_READY };

  assert.equal(
    hasIncompleteQualification({ brain, conversationOutcome }),
    false
  );
  assert.equal(
    shouldGenerateScheduleInterviewMission({
      conversationOutcome,
      agentState: {},
      brain,
      workflow,
      activeAppointment: null
    }),
    true
  );

  const primary = getPrimaryMissionFromContext({
    prospect: buildQualifiedProspect({
      owner_user_id: "agent-1",
      acknowledged_at: "2026-08-01T12:00:00.000Z",
      attention_status: "acknowledged"
    }),
    brain,
    workflow,
    agentState: {},
    conversationOutcome,
    availableActions: [
      { id: ACTION_IDS.SCHEDULE, label: "Schedule Interview", priority: "primary" },
      { id: ACTION_IDS.CLOSE_NOT_INTERESTED, label: "Close", priority: "secondary" }
    ],
    activeAppointment: null
  });

  assert.equal(primary?.missionType, "ScheduleInterview");
  assert.equal(primary?.primaryAction?.id || primary?.primaryActionId, ACTION_IDS.SCHEDULE);
});

test("human-entered qualification values preserved in target resolution", () => {
  const prospect = buildQualifiedProspect({
    city: "Fort Myers",
    state: "FL",
    occupation: "Sales Associate",
    preferred_language: "spanish"
  });

  const target = resolveRequiredInformationTargetMilestone({
    prospect,
    fields: {
      // Partial save — only interview type newly submitted; prior values kept
      interview_type: "Zoom",
      work_authorization_status: true
    },
    captureState: COMPLETE_CAPTURE
  });

  assert.equal(target, MILESTONES.INTERVIEW_READY);

  const profile = buildProfileFromProspect({
    ...prospect,
    interview_type: "Zoom",
    work_authorized: true
  });
  assert.equal(profile.city, "Fort Myers");
  assert.equal(profile.state, "FL");
  assert.equal(profile.occupation, "Sales Associate");
});

test("incomplete requiredInputs still blocks Schedule Interview", () => {
  assert.equal(
    shouldGenerateScheduleInterviewMission({
      conversationOutcome: {
        requiredInputs: [{ key: "city", label: "City" }],
        workflowRequirements: [{ key: "schedule", label: "Interview not scheduled" }]
      },
      agentState: {},
      brain: { missingFields: ["city", "schedule"] },
      workflow: { canonicalMilestone: MILESTONES.QUALIFICATION },
      activeAppointment: null
    }),
    false
  );
});
