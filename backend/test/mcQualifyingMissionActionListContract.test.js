/**
 * Frontend Mission Action list restore for QUALIFYING (Node-runnable light contract).
 * Mirrors buildMissionActionList rules without JSX.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function buildMissionActionListLite(mission, conversationOutcome, workflowGate = null) {
  const actions = [];
  const seen = new Set();
  const panelComms = new Set(["whatsapp", "send_zoom_link", "send_office_location"]);

  function addAction(action) {
    if (!action?.id || seen.has(action.id)) {
      return;
    }
    seen.add(action.id);
    actions.push(action);
  }

  const requiredInputs = conversationOutcome?.requiredInputs || [];
  const exposeQualification = requiredInputs.length > 0;

  if (exposeQualification) {
    addAction({ id: "qualification", label: "Complete Qualification" });
  }

  const showClose =
    !workflowGate?.active &&
    mission?.missionType !== "EnterInterviewOutcome" &&
    (requiredInputs.length > 0 ||
      ["CompleteQualification", "CallProspect", "ReviewProspect", "ScheduleInterview"].includes(
        mission?.missionType
      ) ||
      mission?.workflowState?.canonicalMilestone === "QUALIFICATION");

  if (showClose) {
    addAction({ id: "close_not_interested", label: "Close — Not Interested" });
  }

  if (mission?.primaryAction?.id) {
    addAction(mission.primaryAction);
  }

  for (const action of mission?.secondaryActions || []) {
    addAction(action);
  }

  return actions.filter((action) => {
    if (action.id === "notes" || action.id === "call" || panelComms.has(action.id)) {
      return false;
    }
    if (action.id === "qualification") {
      return exposeQualification;
    }
    return true;
  });
}

test("Flor-shaped QUALIFYING: mission actions include qualify + close, not only comms", () => {
  const actions = buildMissionActionListLite(
    {
      missionType: "CompleteQualification",
      primaryAction: { id: "whatsapp", label: "Send via WhatsApp" },
      secondaryActions: [
        { id: "call", label: "Call prospect" },
        { id: "notes", label: "Add agent notes" }
      ],
      workflowState: { canonicalMilestone: "QUALIFICATION" }
    },
    {
      requiredInputs: [
        { key: "city", label: "City" },
        { key: "work_authorization_status", label: "Work Authorization" }
      ]
    }
  );

  const ids = actions.map((a) => a.id);
  assert.deepEqual(ids.includes("qualification"), true);
  assert.deepEqual(ids.includes("close_not_interested"), true);
  assert.equal(ids.includes("call"), false);
  assert.equal(ids.includes("whatsapp"), false);
  assert.equal(ids.includes("notes"), false);
});

test("occupation-only requiredInputs must not appear after BR-123 (empty → close still available)", () => {
  const actions = buildMissionActionListLite(
    {
      missionType: "CompleteQualification",
      primaryAction: { id: "qualification", label: "Complete Qualification" },
      secondaryActions: [{ id: "close_not_interested", label: "Close — Not Interested" }],
      workflowState: { canonicalMilestone: "QUALIFICATION" }
    },
    { requiredInputs: [] }
  );

  const ids = actions.map((a) => a.id);
  assert.equal(ids.includes("qualification"), false);
  assert.equal(ids.includes("close_not_interested"), true);
});

test("workflow gate hides pre-interview close injection path", () => {
  const actions = buildMissionActionListLite(
    {
      missionType: "CompleteQualification",
      primaryAction: { id: "qualification" },
      workflowState: { canonicalMilestone: "QUALIFICATION" }
    },
    { requiredInputs: [{ key: "city", label: "City" }] },
    { active: true }
  );

  assert.equal(
    actions.some((a) => a.id === "close_not_interested"),
    false
  );
});
