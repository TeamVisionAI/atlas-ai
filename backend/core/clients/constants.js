/**
 * BR-179 — Client Workspace V1 constants.
 * atlas_agenda_clients remains the canonical client entity.
 */

const CLIENT_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  FOLLOW_UP: "FOLLOW_UP",
  INACTIVE: "INACTIVE"
});

const CLIENT_SCOPES = Object.freeze({
  MINE: "mine",
  TEAM: "team"
});

const CLIENT_HISTORY_TYPES = Object.freeze({
  PROMOTED: "promoted",
  NOTE_ADDED: "note_added",
  STATUS_CHANGED: "status_changed",
  OWNER_CHANGED: "owner_changed"
});

module.exports = {
  CLIENT_STATUSES,
  CLIENT_SCOPES,
  CLIENT_HISTORY_TYPES
};
