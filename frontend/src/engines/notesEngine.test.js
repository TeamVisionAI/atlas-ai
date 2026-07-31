import test from "node:test";
import assert from "node:assert/strict";
import {
  NOTE_ENTITY_TYPES,
  buildAppointmentNoteContext,
  buildFollowUpNoteContext,
  buildMissionNoteContext,
  buildProspectNoteContext,
  resolveNoteContextFromMissionControl,
  resolveNoteContextFromWorkspace
} from "./notesContextEngine.js";

test("buildProspectNoteContext uses phone as entity id", () => {
  const context = buildProspectNoteContext("+15555550100");

  assert.equal(context.entityType, NOTE_ENTITY_TYPES.PROSPECT);
  assert.equal(context.entityId, "+15555550100");
  assert.equal(context.prospectPhone, "+15555550100");
});

test("buildAppointmentNoteContext attaches appointment when present", () => {
  const context = buildAppointmentNoteContext({
    phone: "+15555550100",
    appointmentId: "appt-123"
  });

  assert.equal(context.entityType, NOTE_ENTITY_TYPES.APPOINTMENT);
  assert.equal(context.entityId, "appt-123");
});

test("buildFollowUpNoteContext attaches follow-up id", () => {
  const context = buildFollowUpNoteContext({
    phone: "+15555550100",
    followUpId: "follow-up-1"
  });

  assert.equal(context.entityType, NOTE_ENTITY_TYPES.FOLLOW_UP);
  assert.equal(context.entityId, "follow-up-1");
});

test("buildMissionNoteContext attaches mission id", () => {
  const context = buildMissionNoteContext({
    phone: "+15555550100",
    missionId: "mission-1"
  });

  assert.equal(context.entityType, NOTE_ENTITY_TYPES.MISSION);
  assert.equal(context.entityId, "mission-1");
});

test("resolveNoteContextFromWorkspace prefers appointment attachment", () => {
  const context = resolveNoteContextFromWorkspace({
    phone: "+15555550100",
    interview: { appointmentId: "appt-789" }
  });

  assert.equal(context.entityType, NOTE_ENTITY_TYPES.APPOINTMENT);
  assert.equal(context.appointmentId, "appt-789");
});

test("resolveNoteContextFromMissionControl uses mission when no appointment", () => {
  const context = resolveNoteContextFromMissionControl({
    workspace: { phone: "+15555550100" },
    primaryMission: { id: "mission-42" }
  });

  assert.equal(context.entityType, NOTE_ENTITY_TYPES.MISSION);
  assert.equal(context.missionId, "mission-42");
});

test("resolveNoteContextFromMissionControl keeps appointment over mission", () => {
  const context = resolveNoteContextFromMissionControl({
    workspace: {
      phone: "+15555550100",
      interview: { appointmentId: "appt-789" }
    },
    primaryMission: { id: "mission-42" }
  });

  assert.equal(context.entityType, NOTE_ENTITY_TYPES.APPOINTMENT);
});
