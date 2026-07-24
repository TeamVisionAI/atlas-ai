/**
 * Sprint 15.0 — Mission Control read model module entry.
 */

const createMissionControlRoutes = require("./api/missionControl.routes");
const { MissionControlService } = require("./application/MissionControlService");
const {
  MissionControlProjection,
  PROJECTION_NAME
} = require("./application/MissionControlProjection");
const { MissionControlRepository } = require("./infrastructure/MissionControlRepository");
const { MissionControlReadModel } = require("./domain/MissionControlReadModel");

function createMissionControlModule(deps = {}) {
  const repository = deps.repository || new MissionControlRepository();
  const service = new MissionControlService({ repository });
  const missionControlProjection =
    deps.missionControlProjection || new MissionControlProjection({ repository });

  return {
    service,
    repository,
    missionControlProjection,
    routes: createMissionControlRoutes({ service })
  };
}

module.exports = {
  createMissionControlModule,
  createMissionControlRoutes,
  MissionControlService,
  MissionControlProjection,
  MissionControlRepository,
  MissionControlReadModel,
  PROJECTION_NAME
};
