/**
 * Sprint 15.1 — Executive Dashboard read model module entry.
 */

const createExecutiveDashboardRoutes = require("./api/executiveDashboard.routes");
const { ExecutiveDashboardService } = require("./application/ExecutiveDashboardService");
const {
  ExecutiveDashboardProjection,
  PROJECTION_NAME
} = require("./application/ExecutiveDashboardProjection");
const { ExecutiveDashboardRepository } = require("./infrastructure/ExecutiveDashboardRepository");
const { ExecutiveDashboardReadModel } = require("./domain/ExecutiveDashboardReadModel");

function createExecutiveDashboardModule(deps = {}) {
  const repository = deps.repository || new ExecutiveDashboardRepository();
  const service = new ExecutiveDashboardService({ repository });
  const executiveDashboardProjection =
    deps.executiveDashboardProjection || new ExecutiveDashboardProjection({ repository });

  return {
    service,
    repository,
    executiveDashboardProjection,
    routes: createExecutiveDashboardRoutes({ service })
  };
}

module.exports = {
  createExecutiveDashboardModule,
  createExecutiveDashboardRoutes,
  ExecutiveDashboardService,
  ExecutiveDashboardProjection,
  ExecutiveDashboardRepository,
  ExecutiveDashboardReadModel,
  PROJECTION_NAME
};
