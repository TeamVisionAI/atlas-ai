/**
 * Dynamic qualification form verification — one form, one save.
 * Run: node backend/dev/verifyQualificationForm.js
 */

require("dotenv").config();

const {
  buildRequiredInputs,
  buildSuggestedQualificationDefaults,
  buildConversationOutcomeReadModel
} = require("../core/conversationOutcomeEngine");
const { buildProfileFromProspect, getMissingFields, deriveDayPartFromTimeKey } = require("../core/informationModel");
const { getPrimaryMissionFromContext } = require("../core/missionEngine");
const { MISSION_TYPES } = require("../core/configuration/missionTypes");
const { parseQualificationCapture } = require("../core/qualificationCaptureState");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyUnqualifiedProspectShowsAllFields() {
  const prospect = {
    phone: "+10000000001",
    city: null,
    state: null,
    occupation: null,
    work_authorized: null,
    preferred_language: null,
    language: "es",
    first_name: "Ana",
    last_name: "Test",
    notes: null
  };
  const profile = buildProfileFromProspect(prospect);
  const inputs = buildRequiredInputs(prospect, profile);
  const keys = inputs.map((row) => row.key);

  assert(keys.includes("city"), `Expected city, got ${JSON.stringify(keys)}`);
  assert(keys.includes("state"), `Expected state with city gap, got ${JSON.stringify(keys)}`);
  assert(
    keys.includes("work_authorization_status"),
    `Expected authorization, got ${JSON.stringify(keys)}`
  );
  assert(keys.includes("occupation"), `Expected occupation, got ${JSON.stringify(keys)}`);
  assert(keys.includes("preferred_language"), `Expected language, got ${JSON.stringify(keys)}`);
  assert(keys.includes("interview_type"), `Expected interview type, got ${JSON.stringify(keys)}`);

  const defaults = buildSuggestedQualificationDefaults(prospect, profile, { language: "es" }, {});

  assert(defaults.preferred_language === "spanish", "WhatsApp language should default preferred language");

  const miamiDefaults = buildSuggestedQualificationDefaults(
    prospect,
    profile,
    { language: "es" },
    { city: "Miami" }
  );
  assert(
    miamiDefaults.interview_type === "office",
    `Local city should default to office interview, got ${miamiDefaults.interview_type}`
  );
  assert(miamiDefaults.state === "FL", "Miami should infer Florida");

  console.log("✓ Unqualified prospect shows full qualification form");
}

function verifyQualifiedProspectHasNoForm() {
  const prospect = {
    phone: "+10000000002",
    city: "Miami",
    state: "FL",
    occupation: "Teacher",
    work_authorized: true,
    interview_type: "In Person",
    preferred_language: "english",
    first_name: "Pedro",
    last_name: "Test",
    notes: null
  };
  const profile = buildProfileFromProspect(prospect);
  profile.interviewType = "In Person";
  const inputs = buildRequiredInputs(prospect, profile);

  assert(inputs.length === 0, `Qualified prospect should have no form fields, got ${JSON.stringify(inputs)}`);

  console.log("✓ Qualified prospect has no qualification form");
}

function verifyReadModelIncludesQualificationForm() {
  const prospect = {
    phone: "+10000000003",
    city: null,
    state: null,
    occupation: null,
    work_authorized: null,
    language: "en",
    first_name: "Juana",
    last_name: "Maria",
    notes: null
  };
  const readModel = buildConversationOutcomeReadModel({
    prospect,
    brain: { language: "en" },
    conversationMessages: []
  });

  assert(readModel.qualificationForm?.requiredInputs?.length > 0, "qualificationForm.requiredInputs populated");
  assert(readModel.suggestedDefaults, "suggestedDefaults returned");
  assert(readModel.fields.interview_type !== undefined, "fields include interview_type default");

  console.log("✓ Read model includes qualificationForm metadata");
}

function verifyScheduleProgressionAfterQualification() {
  const prospect = {
    phone: "+10000000004",
    city: "Miami",
    state: "FL",
    occupation: "Teacher",
    work_authorized: true,
    interview_type: "In Person",
    preferred_language: "english",
    first_name: "Juana",
    last_name: "Maria",
    notes: "QUAL_CAPTURE:{\"city\":true,\"state\":true,\"authorization\":true,\"interviewType\":true,\"dayPart\":true,\"name\":false,\"email\":false}"
  };
  const profile = buildProfileFromProspect(prospect);
  const brainOptions = {
    notes: prospect.notes,
    captureState: parseQualificationCapture(prospect.notes)
  };
  const missingFields = getMissingFields(profile, brainOptions);

  assert(
    missingFields.includes("schedule"),
    `Expected schedule in missingFields after qualification, got ${JSON.stringify(missingFields)}`
  );
  assert(
    !missingFields.includes("dayPart"),
    `dayPart must not block schedule progression, got ${JSON.stringify(missingFields)}`
  );

  const primary = getPrimaryMissionFromContext({
    prospect,
    brain: { currentStep: "SCHEDULE", missingFields },
    agentState: {},
    conversationOutcome: {
      requiredInputs: [],
      workflowRequirements: [{ key: "schedule", label: "Interview not scheduled" }]
    },
    workflow: { canonicalMilestone: "QUALIFICATION" },
    availableActions: [{ id: "schedule", label: "Schedule Interview", priority: "primary" }]
  });

  assert(primary, "Expected Schedule Interview mission after qualification");
  assert(
    primary.missionType === MISSION_TYPES.SCHEDULE_INTERVIEW,
    `Expected Schedule Interview mission, got ${primary.missionType}`
  );

  assert(
    deriveDayPartFromTimeKey("09:30") === "morning",
    "Morning times should derive to morning dayPart"
  );
  assert(
    deriveDayPartFromTimeKey("14:00") === "afternoon",
    "Afternoon times should derive to afternoon dayPart"
  );

  console.log("✓ Qualification completes into Schedule Interview mission");
}

function main() {
  console.log("=== Qualification Form Verification ===");
  verifyUnqualifiedProspectShowsAllFields();
  verifyQualifiedProspectHasNoForm();
  verifyReadModelIncludesQualificationForm();
  verifyScheduleProgressionAfterQualification();
  console.log("\nAll qualification form checks passed.");
}

main();
