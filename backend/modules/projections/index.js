/**
 * Sprint 14.4 — Projection framework module entry.
 */

const { Projection } = require("./interfaces/Projection");
const { ProjectionEngine } = require("./application/ProjectionEngine");
const { ProjectionRegistry } = require("./application/ProjectionRegistry");
const { ProjectionLifecycle, PROJECTION_STATES } = require("./application/ProjectionLifecycle");

function createProjectionModule(deps = {}) {
  const engine = new ProjectionEngine(deps);

  return {
    engine,
    registry: engine.registry,
    lifecycle: engine.lifecycle
  };
}

module.exports = {
  createProjectionModule,
  Projection,
  ProjectionEngine,
  ProjectionRegistry,
  ProjectionLifecycle,
  PROJECTION_STATES
};
