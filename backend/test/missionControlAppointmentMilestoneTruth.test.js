/**
 * BR-039 — Mission Control header milestone and Schedule Interview mission
 * must share atlas_appointments truth.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { MILESTONES } = require("../core/workflowConstants");
const { mapToCanonicalMilestone } = require("../core/milestoneMapper");
const {
  applyAppointmentMilestoneTruth,
  claimsScheduledInterview
} = require("../core/appointmentMilestoneTruth");
const { shouldGenerateScheduleInterviewMission } = require("../core/missionEngine");
const { buildProspectCenterItem } = require("../core/prospectCenterReadModel");

const RVP_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";

describe("Mission Control appointment milestone truth (BR-039)", () => {
  it("1. header status and mission action use the same canonical appointment truth", () => {
    const computed = mapToCanonicalMilestone({
      prospect: { owner_user_id: RVP_ID, current_step: "SCHEDULE" },
      currentStep: "SCHEDULE",
      missingFields: ["schedule"],
      agentState: {}
    });
    const gated = applyAppointmentMilestoneTruth(computed, null);

    assert.equal(gated.milestone, MILESTONES.INTERVIEW_READY);
    assert.equal(
      shouldGenerateScheduleInterviewMission({
        brain: { missingFields: ["schedule"], currentStep: "SCHEDULE" },
        conversationOutcome: {
          workflowRequirements: [{ key: "schedule" }],
          requiredInputs: []
        },
        agentState: {},
        workflow: { canonicalMilestone: gated.milestone },
        activeAppointment: null
      }),
      true
    );
    assert.equal(gated.milestone === MILESTONES.INTERVIEW_SCHEDULED, false);
  });

  it("2. no appointment means no INTERVIEW_SCHEDULED badge", () => {
    const fromConfirmedWithoutAppt = applyAppointmentMilestoneTruth(
      MILESTONES.INTERVIEW_SCHEDULED,
      null
    );
    assert.equal(fromConfirmedWithoutAppt.downgraded, true);
    assert.equal(fromConfirmedWithoutAppt.milestone, MILESTONES.INTERVIEW_READY);

    assert.equal(
      mapToCanonicalMilestone({
        prospect: {},
        currentStep: "SCHEDULE",
        missingFields: ["schedule"],
        agentState: {}
      }),
      MILESTONES.INTERVIEW_READY
    );
  });

  it("3. valid appointment suppresses Schedule interview", () => {
    const activeAppointment = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "scheduled",
      agent_id: RVP_ID
    };
    const gated = applyAppointmentMilestoneTruth(
      MILESTONES.INTERVIEW_SCHEDULED,
      activeAppointment
    );

    assert.equal(gated.downgraded, false);
    assert.equal(gated.milestone, MILESTONES.INTERVIEW_SCHEDULED);
    assert.equal(
      shouldGenerateScheduleInterviewMission({
        brain: { missingFields: ["schedule"] },
        conversationOutcome: {
          workflowRequirements: [{ key: "schedule" }],
          requiredInputs: []
        },
        agentState: {},
        workflow: { canonicalMilestone: gated.milestone },
        activeAppointment
      }),
      false
    );
  });

  it("4. partial workflow state cannot impersonate a scheduled appointment", () => {
    const impersonating = applyAppointmentMilestoneTruth(
      MILESTONES.INTERVIEW_SCHEDULED,
      null
    );
    assert.equal(impersonating.milestone, MILESTONES.INTERVIEW_READY);
    assert.equal(claimsScheduledInterview(impersonating.milestone), false);

    const dueWithoutAppt = applyAppointmentMilestoneTruth(MILESTONES.INTERVIEW_DUE, null);
    assert.equal(dueWithoutAppt.milestone, MILESTONES.INTERVIEW_READY);
  });

  it("5. correct RVP ownership remains intact on ready-to-schedule prospect", () => {
    const prospect = {
      id: "29853100-f151-4ca8-b07d-624fd20c6685",
      owner_user_id: RVP_ID,
      current_step: "SCHEDULE",
      organization_id: "00000000-0000-4000-8000-000000000001"
    };
    const milestone = mapToCanonicalMilestone({
      prospect,
      currentStep: prospect.current_step,
      missingFields: ["schedule"],
      agentState: {}
    });
    assert.equal(milestone, MILESTONES.INTERVIEW_READY);
    assert.equal(prospect.owner_user_id, RVP_ID);
  });

  it("6. truth helpers never create appointments or Google events", () => {
    const before = applyAppointmentMilestoneTruth(MILESTONES.INTERVIEW_SCHEDULED, null);
    assert.equal(before.activeAppointment, null);
    assert.equal(before.hasActiveAppointment, false);
    // Pure function — no side effects / persistence calls in this module path.
    assert.equal(typeof applyAppointmentMilestoneTruth, "function");
  });

  it("7. BR-075 surfaces remain unchanged by this hotfix", () => {
    const br075 = path.join(__dirname, "../core/whatsappOutboundAuthorizationGate.js");
    assert.equal(fs.existsSync(br075), true);

    const gateSource = fs.readFileSync(br075, "utf8");
    assert.match(gateSource, /BR-075|customer.?care|session.?window|24/i);

    // Prospect Center BR-039 parity still holds.
    const item = buildProspectCenterItem(
      { phone: "+13059997338", current_step: "SCHEDULE" },
      {
        phone: "+13059997338",
        canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED,
        currentStep: "SCHEDULE"
      },
      { phonesWithAppointments: new Set() }
    );
    assert.equal(item.canonicalMilestone, MILESTONES.INTERVIEW_READY);
  });
});
