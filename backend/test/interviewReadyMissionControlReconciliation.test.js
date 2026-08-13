/**
 * Durable INTERVIEW_READY vs derived Mission Control projection.
 * Stale QUAL_CAPTURE must not keep Complete Qualification when milestone is READY.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { MILESTONES } = require("../core/workflowConstants");
const { ACTION_IDS } = require("../core/agentActionRegistry");
const { resolveAvailableActions } = require("../core/agentActionEngine");
const {
  buildConversationOutcomeReadModel,
  getQualificationFormGaps
} = require("../core/conversationOutcomeEngine");
const { buildProfileFromProspect, getMissingFields } = require("../core/informationModel");
const { parseQualificationCapture } = require("../core/qualificationCaptureState");
const {
  hasIncompleteQualification,
  shouldGenerateScheduleInterviewMission,
  getPrimaryMissionFromContext
} = require("../core/missionEngine");
const { buildRecruiterBrief } = require("../core/recruiterBriefBuilder");

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_ID = "agent-owner-1";

const STALE_CAPTURE_NOTES =
  'QUAL_CAPTURE:{"city":true,"state":true,"authorization":false,"interviewType":true,"dayPart":true,"name":false,"email":false,"dayPartClarifyAttempts":0}';

function buildInterviewReadyProspect(overrides = {}) {
  return {
    id: "prospect-ir-recon-1",
    phone: "+13055550199",
    organization_id: ORG_ID,
    owner_user_id: OWNER_ID,
    name: "Ready Prospect",
    city: "Miami",
    state: "FL",
    work_authorized: true,
    interview_type: "In Person",
    preferred_language: "spanish",
    occupation: "Sales",
    current_step: "WORK_AUTHORIZATION",
    notes: STALE_CAPTURE_NOTES,
    acknowledged_at: "2026-08-01T12:00:00.000Z",
    attention_status: "acknowledged",
    ...overrides
  };
}

function heidyShapedBrain() {
  return {
    currentStep: "WORK_AUTHORIZATION",
    missingFields: ["authorization"],
    nextField: "authorization",
    interviewType: "In Person"
  };
}

function projectMissionControl({
  prospect,
  workflow,
  brain,
  conversationOutcome,
  activeAppointment = null,
  agentState = {}
}) {
  const availableActions = resolveAvailableActions({
    prospect,
    currentStep: brain.currentStep,
    missingFields: brain.missingFields,
    interviewType: brain.interviewType,
    agentState,
    organizationSettings: {},
    canonicalMilestone: workflow.canonicalMilestone
  }).filter((action) => !(activeAppointment && action.id === ACTION_IDS.SCHEDULE));

  const primaryMission = getPrimaryMissionFromContext({
    prospect,
    brain,
    workflow,
    agentState,
    conversationOutcome,
    availableActions,
    activeAppointment
  });

  const recruiterBrief = buildRecruiterBrief({
    primaryMission,
    conversationOutcome,
    conversationMessages: [],
    agentState,
    workflow,
    brain
  });

  return { availableActions, primaryMission, recruiterBrief };
}

test("1. INTERVIEW_READY + no interview → Schedule Interview mission and brief", () => {
  const prospect = buildInterviewReadyProspect();
  const workflow = { canonicalMilestone: MILESTONES.INTERVIEW_READY };
  const brain = heidyShapedBrain();
  const conversationOutcome = buildConversationOutcomeReadModel({
    prospect,
    brain,
    workflow
  });

  assert.equal(conversationOutcome.requiredInputs.length, 0);
  assert.equal(
    hasIncompleteQualification({ brain, conversationOutcome, workflow }),
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

  const { availableActions, primaryMission, recruiterBrief } = projectMissionControl({
    prospect,
    workflow,
    brain,
    conversationOutcome
  });

  assert.equal(primaryMission?.missionType, "ScheduleInterview");
  assert.equal(
    primaryMission?.primaryAction?.id || primaryMission?.primaryActionId,
    ACTION_IDS.SCHEDULE
  );
  assert.ok(availableActions.some((action) => action.id === ACTION_IDS.SCHEDULE));
  assert.equal(
    availableActions.some((action) => action.id === ACTION_IDS.COMPLETE_QUALIFICATION),
    false
  );
  assert.equal(
    recruiterBrief.items.some((item) => /complete qualification/i.test(item)),
    false
  );
  assert.ok(
    recruiterBrief.items.some((item) => /ready to schedule/i.test(item))
  );
});

test("2. QUALIFICATION + missing required fields stays Complete Qualification", () => {
  const prospect = buildInterviewReadyProspect({
    city: null,
    state: null,
    work_authorized: null,
    interview_type: null,
    notes: null,
    current_step: "CITY"
  });
  const workflow = { canonicalMilestone: MILESTONES.QUALIFICATION };
  const brain = {
    currentStep: "CITY",
    missingFields: ["city", "state", "authorization", "interviewType"],
    nextField: "city",
    interviewType: null
  };
  const conversationOutcome = buildConversationOutcomeReadModel({
    prospect,
    brain,
    workflow
  });

  assert.ok(conversationOutcome.requiredInputs.length > 0);
  assert.equal(
    hasIncompleteQualification({ brain, conversationOutcome, workflow }),
    true
  );
  assert.equal(
    shouldGenerateScheduleInterviewMission({
      conversationOutcome,
      agentState: {},
      brain,
      workflow,
      activeAppointment: null
    }),
    false
  );

  const { availableActions, primaryMission, recruiterBrief } = projectMissionControl({
    prospect,
    workflow,
    brain,
    conversationOutcome
  });

  assert.equal(primaryMission?.missionType, "CompleteQualification");
  assert.ok(
    availableActions.some((action) => action.id === ACTION_IDS.COMPLETE_QUALIFICATION)
  );
  assert.equal(
    availableActions.some((action) => action.id === ACTION_IDS.SCHEDULE),
    false
  );
  assert.ok(
    recruiterBrief.items.some(
      (item) => /authorization|city|qualification/i.test(item)
    )
  );
});

test("3. pre-PR-131 INTERVIEW_READY reconcilies on MC read without Save", () => {
  const prospect = buildInterviewReadyProspect({
    current_step: "WORK_AUTHORIZATION",
    notes: STALE_CAPTURE_NOTES
  });
  const workflow = { canonicalMilestone: MILESTONES.INTERVIEW_READY };
  const brain = heidyShapedBrain();

  const profile = buildProfileFromProspect(prospect);
  const captureState = parseQualificationCapture(prospect.notes);
  const brainGaps = getMissingFields(profile, { notes: prospect.notes, captureState });
  const formGaps = getQualificationFormGaps(prospect, profile, {
    notes: prospect.notes,
    captureState
  });

  assert.ok(
    brainGaps.includes("authorization"),
    "stale QUAL_CAPTURE still marks authorization missing on the conversation brain"
  );
  assert.equal(
    formGaps.includes("authorization"),
    false,
    "durable work_authorized remains complete on the qualification form"
  );

  const conversationOutcome = buildConversationOutcomeReadModel({
    prospect,
    brain,
    workflow
  });

  assert.equal(
    conversationOutcome.requiredInputs.length,
    0,
    "fresh MC read alone clears requiredInputs"
  );

  const { primaryMission } = projectMissionControl({
    prospect,
    workflow,
    brain,
    conversationOutcome
  });

  assert.equal(primaryMission?.missionType, "ScheduleInterview");
});

test("4. INTERVIEW_READY + scheduled interview keeps schedule-suppressed behavior", () => {
  const prospect = buildInterviewReadyProspect({
    calendar_event_id: "cal-evt-1"
  });
  const workflow = { canonicalMilestone: MILESTONES.INTERVIEW_READY };
  const brain = heidyShapedBrain();
  const conversationOutcome = buildConversationOutcomeReadModel({
    prospect,
    brain,
    workflow
  });
  const activeAppointment = {
    id: "appt-1",
    organizationId: ORG_ID,
    start: "2026-08-20T15:00:00.000Z"
  };

  assert.equal(
    shouldGenerateScheduleInterviewMission({
      conversationOutcome,
      agentState: {},
      brain,
      workflow,
      activeAppointment
    }),
    false
  );
  assert.equal(
    hasIncompleteQualification({ brain, conversationOutcome, workflow, activeAppointment }),
    false
  );

  const { availableActions, primaryMission } = projectMissionControl({
    prospect,
    workflow,
    brain,
    conversationOutcome,
    activeAppointment
  });

  assert.notEqual(primaryMission?.missionType, "ScheduleInterview");
  assert.notEqual(primaryMission?.missionType, "CompleteQualification");
  assert.equal(
    availableActions.some((action) => action.id === ACTION_IDS.SCHEDULE),
    false
  );
});

test("5. human-entered qualification values are preserved", () => {
  const prospect = buildInterviewReadyProspect({
    city: "Miami",
    state: "FL",
    work_authorized: true,
    interview_type: "In Person",
    occupation: "Sales Associate",
    notes: STALE_CAPTURE_NOTES
  });
  const notesBefore = prospect.notes;
  const workflow = { canonicalMilestone: MILESTONES.INTERVIEW_READY };
  const brain = heidyShapedBrain();

  buildConversationOutcomeReadModel({ prospect, brain, workflow });
  projectMissionControl({
    prospect,
    workflow,
    brain,
    conversationOutcome: buildConversationOutcomeReadModel({ prospect, brain, workflow })
  });

  const profile = buildProfileFromProspect(prospect);
  assert.equal(profile.city, "Miami");
  assert.equal(profile.state, "FL");
  assert.equal(profile.authorization, true);
  assert.equal(profile.interviewType, "In Person");
  assert.equal(profile.occupation, "Sales Associate");
  assert.equal(prospect.notes, notesBefore);
  assert.equal(prospect.work_authorized, true);
});

test("6. tenant / ownership fields are unchanged by projection", () => {
  const prospect = buildInterviewReadyProspect();
  const workflow = { canonicalMilestone: MILESTONES.INTERVIEW_READY };
  const brain = heidyShapedBrain();
  const conversationOutcome = buildConversationOutcomeReadModel({
    prospect,
    brain,
    workflow
  });

  projectMissionControl({ prospect, workflow, brain, conversationOutcome });

  assert.equal(prospect.organization_id, ORG_ID);
  assert.equal(prospect.owner_user_id, OWNER_ID);
  assert.equal(prospect.phone, "+13055550199");
});
