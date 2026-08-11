/**
 * Runtime resolution for Close — Not Interested Mission Action form.
 * Imports the pure resolver (no WhatsApp service deps) and asserts mount wiring.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INLINE_FORM_TYPES,
  INLINE_FORM_BY_ACTION_ID,
  normalizeMissionActionId,
  resolvesToInlineForm,
  isRenderableInlineFormType
} from "./missionActionInlineFormResolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoFrontendSrc = path.resolve(__dirname, "../..");

test("A. QUALIFYING close_not_interested maps in INLINE_FORM_BY_ACTION_ID", () => {
  assert.equal(
    INLINE_FORM_BY_ACTION_ID.close_not_interested,
    INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED
  );
});

test("B. missionActionFormRegistry resolver resolves close_not_interested", () => {
  const formType = resolvesToInlineForm("close_not_interested", {
    missionType: "CompleteQualification",
    primaryAction: { id: "qualification" }
  });

  assert.equal(formType, INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED);
  assert.equal(isRenderableInlineFormType(formType), true);
});

test("B2. normalize returns trimmed/lowercased id (raw-id mismatch fix)", () => {
  assert.equal(normalizeMissionActionId(" close_not_interested "), "close_not_interested");
  assert.equal(normalizeMissionActionId("Close-Not-Interested"), "close_not_interested");
  assert.equal(
    resolvesToInlineForm(" close_not_interested ", { missionType: "CompleteQualification" }),
    INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED
  );
});

test("C. resolved form type is renderable and not interview outcome", () => {
  const formType = resolvesToInlineForm("close_not_interested");
  assert.equal(formType, "close_not_interested");
  assert.notEqual(formType, INLINE_FORM_TYPES.INTERVIEW_OUTCOME);
  assert.equal(isRenderableInlineFormType(formType), true);
});

test("D/E/F/G. click path: null parent formType still resolves; no diagnostic; Close form selected", () => {
  const mission = {
    missionType: "CompleteQualification",
    primaryAction: { id: "qualification" },
    workflowState: { canonicalMilestone: "QUALIFICATION" }
  };

  // Mirrors ExpandableMissionActionCard + MissionActionInlineForm effective resolve.
  function resolveOnClick(parentFormType, actionId) {
    return parentFormType || resolvesToInlineForm(actionId, mission);
  }

  const actionId = "close_not_interested";
  // E. click with parent formType null (the production failure mode)
  const effective = resolveOnClick(null, actionId);

  // F. no diagnostic
  assert.notEqual(effective, null);
  assert.notEqual(effective, undefined);
  assert.equal(Boolean(effective), true);

  // G. Close — Not Interested form type selected (ConversationOutcomeSection branch)
  assert.equal(effective, INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED);
  assert.equal(isRenderableInlineFormType(effective), true);

  // Also proves Mission Action Center key ↔ renderer map
  assert.equal(INLINE_FORM_BY_ACTION_ID[actionId], INLINE_FORM_TYPES.CLOSE_NOT_INTERESTED);
});

test("D2. Mission Action Center style: every list action that is close resolves to a form", () => {
  const mission = {
    missionType: "CompleteQualification",
    primaryAction: { id: "qualification" },
    secondaryActions: [
      { id: "close_not_interested", label: "Close — Not Interested" },
      { id: "call", label: "Call" },
      { id: "whatsapp", label: "WhatsApp" }
    ],
    workflowState: { canonicalMilestone: "QUALIFICATION" }
  };

  const actions = [
    { id: "qualification" },
    { id: "close_not_interested" }
  ];

  for (const action of actions) {
    const formType = resolvesToInlineForm(action.id, mission);
    assert.equal(
      isRenderableInlineFormType(formType),
      true,
      `${action.id} must resolve to a renderable form, got ${formType}`
    );
  }
});

test("H. ConversationOutcomeSection wires saveConversationOutcome (existing path)", () => {
  const sectionPath = path.join(
    repoFrontendSrc,
    "components/mission-control/ConversationOutcomeSection.jsx"
  );
  const source = fs.readFileSync(sectionPath, "utf8");
  assert.match(source, /saveConversationOutcome/);
  assert.match(source, /allowedOutcomes/);
});

test("H2. Inline form uses ConversationOutcomeSection + Not Interested only", () => {
  const formPath = path.join(
    repoFrontendSrc,
    "components/mission-control/MissionActionInlineForm.jsx"
  );
  const source = fs.readFileSync(formPath, "utf8");
  assert.match(source, /ConversationOutcomeSection/);
  assert.match(source, /PRE_INTERVIEW_CLOSE_OUTCOMES/);
  assert.match(source, /Not Interested/);
  assert.match(source, /CLOSE_NOT_INTERESTED/);
  assert.match(source, /resolvesToInlineForm\(actionId/);
});

test("E. ExpandableMissionActionCard resolves formType with || fallback", () => {
  const cardPath = path.join(
    repoFrontendSrc,
    "components/mission-control/ExpandableMissionActionCard.jsx"
  );
  const source = fs.readFileSync(cardPath, "utf8");
  assert.match(source, /formType \|\| resolvesToInlineForm/);
});
