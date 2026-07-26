/**
 * Sprint 19 — Conversation controller (HTTP adapter).
 * Domain read-model logic lives in missionControlReadModel.js.
 */

const { getMissionControlState, resolveProspect } = require("../core/missionControlReadModel");

module.exports = {
  getMissionControlState,
  resolveProspect
};
