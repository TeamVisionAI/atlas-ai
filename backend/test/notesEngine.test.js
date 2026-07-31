const test = require("node:test");
const assert = require("node:assert/strict");
const {
  NOTE_ENTITY_TYPES,
  NOTE_VISIBILITY,
  normalizeEntityType,
  normalizeNoteAttachment,
  createNoteRecord,
  buildNoteActionPayload,
  buildPersistedAgentNote
} = require("../core/notesEngine");

test("normalizeEntityType accepts canonical and legacy values", () => {
  assert.equal(normalizeEntityType("prospect"), NOTE_ENTITY_TYPES.PROSPECT);
  assert.equal(normalizeEntityType("Appointment"), NOTE_ENTITY_TYPES.APPOINTMENT);
  assert.equal(normalizeEntityType("follow_up"), NOTE_ENTITY_TYPES.FOLLOW_UP);
});

test("normalizeNoteAttachment defaults to prospect context", () => {
  const result = normalizeNoteAttachment({ prospectPhone: "+15555550100" });

  assert.equal(result.valid, true);
  assert.equal(result.attachment.entityType, NOTE_ENTITY_TYPES.PROSPECT);
  assert.equal(result.attachment.entityId, "+15555550100");
});

test("normalizeNoteAttachment requires appointment id for appointment notes", () => {
  const missing = normalizeNoteAttachment({
    prospectPhone: "+15555550100",
    entityType: NOTE_ENTITY_TYPES.APPOINTMENT
  });

  assert.equal(missing.valid, false);
  assert.equal(missing.error, "APPOINTMENT_ID_REQUIRED");

  const valid = normalizeNoteAttachment({
    prospectPhone: "+15555550100",
    entityType: NOTE_ENTITY_TYPES.APPOINTMENT,
    appointmentId: "appt-123"
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.attachment.entityType, NOTE_ENTITY_TYPES.APPOINTMENT);
  assert.equal(valid.attachment.entityId, "appt-123");
});

test("createNoteRecord includes required note fields", () => {
  const note = createNoteRecord({
    content: "Prospect requested evening appointments.",
    attachment: {
      entityType: NOTE_ENTITY_TYPES.PROSPECT,
      entityId: "+15555550100",
      prospectPhone: "+15555550100"
    },
    organizationId: "org-1",
    authorUserId: "user-1"
  });

  assert.ok(note.noteId);
  assert.equal(note.entityType, NOTE_ENTITY_TYPES.PROSPECT);
  assert.equal(note.entityId, "+15555550100");
  assert.equal(note.organizationId, "org-1");
  assert.equal(note.authorUserId, "user-1");
  assert.ok(note.createdAt);
  assert.equal(note.visibility, NOTE_VISIBILITY.INTERNAL);
  assert.equal(note.content, "Prospect requested evening appointments.");
});

test("buildPersistedAgentNote rejects empty content", () => {
  const built = buildPersistedAgentNote("   ", {
    prospectPhone: "+15555550100"
  });

  assert.equal(built.valid, false);
  assert.equal(built.error, "NOTE_REQUIRED");
});

test("buildPersistedAgentNote returns timeline message and attachment", () => {
  const built = buildPersistedAgentNote(
    "Follow up after interview",
    {
      prospectPhone: "+15555550100",
      entityType: NOTE_ENTITY_TYPES.APPOINTMENT,
      appointmentId: "appt-456"
    },
    {
      organizationId: "org-1",
      authorUserId: "user-1"
    }
  );

  assert.equal(built.valid, true);
  assert.equal(built.note.content, "Follow up after interview");
  assert.equal(built.attachment.entityType, NOTE_ENTITY_TYPES.APPOINTMENT);
  assert.equal(built.timelineMessage, "[Agent note] Follow up after interview");
});

test("buildNoteActionPayload trims text and includes attachment context", () => {
  const built = buildNoteActionPayload("  Follow up after interview  ", {
    prospectPhone: "+15555550100",
    entityType: NOTE_ENTITY_TYPES.APPOINTMENT,
    appointmentId: "appt-456"
  });

  assert.equal(built.valid, true);
  assert.equal(built.payload.text, "Follow up after interview");
  assert.equal(built.payload.context.entityType, NOTE_ENTITY_TYPES.APPOINTMENT);
});
