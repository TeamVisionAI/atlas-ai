/**
 * Universal Notes Engine — context-aware attachment and structured note records.
 * One save path: prospect timeline via Mission Control notes action.
 * Implements universal notes architecture + Sprint 10.2b activity feed.
 */

const crypto = require("crypto");

const NOTE_ENTITY_TYPES = Object.freeze({
  PROSPECT: "Prospect",
  APPOINTMENT: "Appointment",
  FOLLOW_UP: "FollowUp",
  CLIENT: "Client",
  ORIENTATION: "Orientation",
  MISSION: "Mission"
});

const NOTE_VISIBILITY = Object.freeze({
  INTERNAL: "internal"
});

const LEGACY_ENTITY_TYPE_MAP = Object.freeze({
  prospect: NOTE_ENTITY_TYPES.PROSPECT,
  appointment: NOTE_ENTITY_TYPES.APPOINTMENT,
  follow_up: NOTE_ENTITY_TYPES.FOLLOW_UP,
  followup: NOTE_ENTITY_TYPES.FOLLOW_UP,
  client: NOTE_ENTITY_TYPES.CLIENT,
  orientation: NOTE_ENTITY_TYPES.ORIENTATION,
  mission: NOTE_ENTITY_TYPES.MISSION
});

function normalizeEntityType(value) {
  if (!value) {
    return NOTE_ENTITY_TYPES.PROSPECT;
  }

  const raw = String(value).trim();

  if (Object.values(NOTE_ENTITY_TYPES).includes(raw)) {
    return raw;
  }

  return LEGACY_ENTITY_TYPE_MAP[raw.toLowerCase()] || NOTE_ENTITY_TYPES.PROSPECT;
}

function normalizeNoteAttachment(input = {}) {
  const prospectPhone = input.prospectPhone || input.phone || null;
  const entityType = normalizeEntityType(input.entityType);

  if (!prospectPhone) {
    return { valid: false, error: "PROSPECT_PHONE_REQUIRED" };
  }

  const attachment = {
    entityType,
    prospectPhone,
    appointmentId: input.appointmentId || null,
    followUpId: input.followUpId || null,
    clientId: input.clientId || null,
    missionId: input.missionId || null,
    orientationId: input.orientationId || null,
    entityId: input.entityId || null
  };

  if (entityType === NOTE_ENTITY_TYPES.APPOINTMENT) {
    attachment.entityId = attachment.appointmentId || attachment.entityId;

    if (!attachment.entityId) {
      return { valid: false, error: "APPOINTMENT_ID_REQUIRED" };
    }
  } else if (entityType === NOTE_ENTITY_TYPES.FOLLOW_UP) {
    attachment.entityId = attachment.followUpId || attachment.entityId;

    if (!attachment.entityId) {
      return { valid: false, error: "FOLLOW_UP_ID_REQUIRED" };
    }
  } else if (entityType === NOTE_ENTITY_TYPES.CLIENT) {
    attachment.entityId = attachment.clientId || attachment.entityId;

    if (!attachment.entityId) {
      return { valid: false, error: "CLIENT_ID_REQUIRED" };
    }
  } else if (entityType === NOTE_ENTITY_TYPES.ORIENTATION) {
    attachment.entityId = attachment.orientationId || attachment.entityId;

    if (!attachment.entityId) {
      return { valid: false, error: "ORIENTATION_ID_REQUIRED" };
    }
  } else if (entityType === NOTE_ENTITY_TYPES.MISSION) {
    attachment.entityId = attachment.missionId || attachment.entityId;

    if (!attachment.entityId) {
      return { valid: false, error: "MISSION_ID_REQUIRED" };
    }
  } else {
    attachment.entityId = prospectPhone;
    attachment.entityType = NOTE_ENTITY_TYPES.PROSPECT;
  }

  return { valid: true, attachment };
}

function createNoteRecord({ content, attachment, organizationId, authorUserId = null }) {
  return {
    noteId: crypto.randomUUID(),
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    organizationId: organizationId || null,
    authorUserId: authorUserId || null,
    createdAt: new Date().toISOString(),
    visibility: NOTE_VISIBILITY.INTERNAL,
    content: String(content || "").trim(),
    prospectPhone: attachment.prospectPhone
  };
}

function buildNoteActionPayload(text, context = {}) {
  const normalized = normalizeNoteAttachment(context);

  if (!normalized.valid) {
    return { valid: false, error: normalized.error };
  }

  const trimmed = String(text || "").trim();

  return {
    valid: true,
    payload: {
      text: trimmed,
      context: normalized.attachment
    }
  };
}

function buildPersistedAgentNote(text, context = {}, options = {}) {
  const built = buildNoteActionPayload(text, context);

  if (!built.valid) {
    return built;
  }

  if (!built.payload.text) {
    return { valid: false, error: "NOTE_REQUIRED" };
  }

  const note = createNoteRecord({
    content: built.payload.text,
    attachment: built.payload.context,
    organizationId: options.organizationId || null,
    authorUserId: options.authorUserId || null
  });

  return {
    valid: true,
    note,
    attachment: built.payload.context,
    timelineMessage: `[Agent note] ${note.content}`
  };
}

module.exports = {
  NOTE_ENTITY_TYPES,
  NOTE_VISIBILITY,
  normalizeEntityType,
  normalizeNoteAttachment,
  createNoteRecord,
  buildNoteActionPayload,
  buildPersistedAgentNote
};
