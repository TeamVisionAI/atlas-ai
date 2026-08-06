import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMUNICATION_ACTION_IDS } from "./communicationActionStateEngine.js";
import {
  buildInterviewModuleCommunicationCards,
  buildWorkspaceGeneralCommunicationCards,
  formatInterviewMeetingTypeLabel,
  formatInterviewOutcomeLabel,
  formatInterviewStatusLabel,
  isAppointmentCommunicationActionId,
  isGeneralWorkspaceCommunicationActionId,
  shouldRenderScheduledInterviewModule,
  WORKSPACE_GENERAL_COMMUNICATION_ORDER,
  INTERVIEW_MODULE_COMMUNICATION_ORDER
} from "./interviewModulePresentation.js";

const translate = (key) => key;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function enabled(id) {
  return {
    id,
    icon: "•",
    title: id,
    subtitle: "hint",
    enabled: true,
    variant: "default"
  };
}

test("workspace general cards keep call/custom/note and exclude appointment sends", () => {
  const cards = buildWorkspaceGeneralCommunicationCards({
    phone: "+15555550100",
    translate,
    includeAddNote: true,
    actions: [
      enabled(COMMUNICATION_ACTION_IDS.CUSTOM),
      enabled(COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS),
      enabled(COMMUNICATION_ACTION_IDS.SEND_OFFICE),
      enabled(COMMUNICATION_ACTION_IDS.SEND_REMINDER)
    ]
  });

  assert.deepEqual(
    cards.map((card) => card.id),
    WORKSPACE_GENERAL_COMMUNICATION_ORDER
  );
  assert.ok(cards.every((card) => isGeneralWorkspaceCommunicationActionId(card.id)));
  assert.ok(
    !cards.some((card) => isAppointmentCommunicationActionId(card.id))
  );
});

test("interview module cards include appointment sends and no general chrome", () => {
  const cards = buildInterviewModuleCommunicationCards({
    phone: "+15555550100",
    translate,
    actions: [
      enabled(COMMUNICATION_ACTION_IDS.CUSTOM),
      enabled(COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS),
      enabled(COMMUNICATION_ACTION_IDS.SEND_OFFICE),
      enabled(COMMUNICATION_ACTION_IDS.SEND_REMINDER),
      enabled(COMMUNICATION_ACTION_IDS.SEND_ZOOM)
    ]
  });

  assert.deepEqual(
    cards.map((card) => card.id),
    INTERVIEW_MODULE_COMMUNICATION_ORDER
  );
  assert.ok(cards.every((card) => isAppointmentCommunicationActionId(card.id)));
});

test("in-person appointment communication order can include office address", () => {
  const cards = buildInterviewModuleCommunicationCards({
    phone: "+15555550100",
    translate,
    actions: [
      enabled(COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS),
      enabled(COMMUNICATION_ACTION_IDS.SEND_OFFICE),
      enabled(COMMUNICATION_ACTION_IDS.SEND_REMINDER)
    ]
  });

  assert.ok(cards.some((card) => card.id === COMMUNICATION_ACTION_IDS.SEND_OFFICE));
});

test("zoom appointment communication order excludes disabled office address", () => {
  const cards = buildInterviewModuleCommunicationCards({
    phone: "+15555550100",
    translate,
    actions: [
      enabled(COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS),
      {
        id: COMMUNICATION_ACTION_IDS.SEND_OFFICE,
        icon: "•",
        title: "office",
        enabled: false
      },
      enabled(COMMUNICATION_ACTION_IDS.SEND_REMINDER),
      enabled(COMMUNICATION_ACTION_IDS.SEND_ZOOM)
    ]
  });

  assert.equal(
    cards.find((card) => card.id === COMMUNICATION_ACTION_IDS.SEND_OFFICE),
    undefined
  );
  assert.ok(cards.some((card) => card.id === COMMUNICATION_ACTION_IDS.SEND_ZOOM));
});

test("labels replace raw enums and null outcomes", () => {
  assert.equal(formatInterviewMeetingTypeLabel("in_person"), "In Person");
  assert.equal(formatInterviewMeetingTypeLabel("zoom"), "Zoom");
  assert.equal(formatInterviewStatusLabel("scheduled"), "Interview Scheduled");
  assert.equal(formatInterviewStatusLabel("completed"), "Interview Completed");
  assert.equal(formatInterviewStatusLabel("cancelled"), "Interview Cancelled");
  assert.equal(formatInterviewOutcomeLabel(null), "Not recorded");
  assert.doesNotMatch(formatInterviewMeetingTypeLabel("in_person"), /in_person/);
});

test("scheduled interview module visibility follows canonical appointment presence", () => {
  assert.equal(shouldRenderScheduledInterviewModule({}), false);
  assert.equal(
    shouldRenderScheduledInterviewModule({
      datetime: "2026-08-07T17:00:00.000Z",
      appointmentId: "2be8f18b-06be-4b2b-b8e0-c4b86d8c384f"
    }),
    true
  );
  assert.equal(
    shouldRenderScheduledInterviewModule({
      appointmentStatus: "cancelled",
      lifecycleState: "cancelled",
      datetime: "2026-08-07T17:00:00.000Z",
      appointmentId: "2be8f18b-06be-4b2b-b8e0-c4b86d8c384f"
    }),
    true
  );
});

test("OperationalWorkspace uses general communication order and gates interview module", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/OperationalWorkspace.jsx"
    ),
    "utf8"
  );
  assert.match(source, /WORKSPACE_GENERAL_COMMUNICATION_ORDER/);
  assert.match(source, /shouldRenderScheduledInterviewModule/);
  assert.match(source, /cardOrder=\{WORKSPACE_GENERAL_COMMUNICATION_ORDER\}/);
});

test("OperationalInterviewPanel hosts appointment communication cards and formatters", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/OperationalInterviewPanel.jsx"
    ),
    "utf8"
  );
  assert.match(source, /buildInterviewModuleCommunicationCards/);
  assert.match(source, /formatInterviewMeetingTypeLabel/);
  assert.match(source, /formatInterviewOutcomeLabel/);
  assert.match(source, /onMissionAction\?\.\(card\.id\)/);
  assert.match(source, /openInterviewDialog\("reschedule"\)/);
  assert.match(source, /openInterviewDialog\("complete"\)/);
  assert.match(source, /openInterviewDialog\("cancel"\)/);
  assert.doesNotMatch(source, /sendTextMessage|createAppointment|upsertCalendar/);
});

test("handlers remain mission-action based; no render-time WhatsApp or appointment writes", () => {
  const interviewPanel = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/OperationalInterviewPanel.jsx"
    ),
    "utf8"
  );
  const workspace = fs.readFileSync(
    path.join(
      __dirname,
      "../features/prospect-workspace/components/OperationalWorkspace.jsx"
    ),
    "utf8"
  );
  assert.match(interviewPanel, /onMissionAction/);
  assert.match(workspace, /onMissionAction=\{onMissionAction\}/);
  assert.doesNotMatch(interviewPanel, /executeCommunicationAction\(/);
  assert.doesNotMatch(workspace, /CommunicationsCenterTimeline/);
});
