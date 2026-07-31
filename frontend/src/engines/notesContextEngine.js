/**
 * Universal note attachment context — no network or modal dependencies.
 */

export const NOTE_ENTITY_TYPES = Object.freeze({
  PROSPECT: "Prospect",
  APPOINTMENT: "Appointment",
  FOLLOW_UP: "FollowUp",
  CLIENT: "Client",
  ORIENTATION: "Orientation",
  MISSION: "Mission"
});

export function buildProspectNoteContext(phone) {
  return {
    entityType: NOTE_ENTITY_TYPES.PROSPECT,
    entityId: phone,
    prospectPhone: phone
  };
}

export function buildAppointmentNoteContext({ phone, appointmentId }) {
  if (!appointmentId) {
    return buildProspectNoteContext(phone);
  }

  return {
    entityType: NOTE_ENTITY_TYPES.APPOINTMENT,
    entityId: appointmentId,
    prospectPhone: phone,
    appointmentId
  };
}

export function buildFollowUpNoteContext({ phone, followUpId }) {
  if (!followUpId) {
    return buildProspectNoteContext(phone);
  }

  return {
    entityType: NOTE_ENTITY_TYPES.FOLLOW_UP,
    entityId: followUpId,
    prospectPhone: phone,
    followUpId
  };
}

export function buildMissionNoteContext({ phone, missionId }) {
  if (!missionId) {
    return buildProspectNoteContext(phone);
  }

  return {
    entityType: NOTE_ENTITY_TYPES.MISSION,
    entityId: missionId,
    prospectPhone: phone,
    missionId
  };
}

export function buildClientNoteContext({ phone, clientId }) {
  if (!clientId) {
    return buildProspectNoteContext(phone);
  }

  return {
    entityType: NOTE_ENTITY_TYPES.CLIENT,
    entityId: clientId,
    prospectPhone: phone,
    clientId
  };
}

export function resolveNoteContextFromWorkspace(workspace) {
  const phone = workspace?.phone || workspace?.prospect?.phone || null;

  if (!phone) {
    return null;
  }

  const appointmentId = workspace?.interview?.appointmentId || null;

  if (appointmentId) {
    return buildAppointmentNoteContext({ phone, appointmentId });
  }

  return buildProspectNoteContext(phone);
}

export function resolveNoteContextFromMissionControl({ workspace, primaryMission }) {
  const base = resolveNoteContextFromWorkspace(workspace);

  if (!base) {
    return null;
  }

  if (base.entityType === NOTE_ENTITY_TYPES.APPOINTMENT) {
    return base;
  }

  const missionId = primaryMission?.id || primaryMission?.missionId || null;

  if (missionId) {
    return buildMissionNoteContext({ phone: base.prospectPhone, missionId });
  }

  return base;
}
