/**
 * Sprint 15.4 — Wire Atlas modules for development tooling (no server bootstrap).
 */

const { createBusinessEventModule } = require("../../modules/business-events");
const { createProjectionModule } = require("../../modules/projections");
const { createProspectModule } = require("../../modules/prospects");
const { createTimelineModule } = require("../../modules/timeline");
const { createMissionControlModule } = require("../../modules/mission-control");
const { createExecutiveDashboardModule } = require("../../modules/executive-dashboard");

async function createEnvironmentModules({ startProjections = false } = {}) {
  const businessEventModule = createBusinessEventModule({
    registerTimelineSubscriber: false
  });

  const projectionModule = createProjectionModule({
    publisher: businessEventModule.publisher,
    businessEventRepository: businessEventModule.repository
  });

  const timelineModule = createTimelineModule({
    projectionEngine: projectionModule.engine,
    businessEventRepository: businessEventModule.repository
  });

  const missionControlModule = createMissionControlModule({
    projectionEngine: projectionModule.engine,
    businessEventRepository: businessEventModule.repository
  });

  const executiveDashboardModule = createExecutiveDashboardModule({
    projectionEngine: projectionModule.engine,
    businessEventRepository: businessEventModule.repository
  });

  const prospectModule = createProspectModule({
    businessEventEngine: businessEventModule.prospectAdapter,
    prospectEventsHandler: businessEventModule.prospectEventsHandler
  });

  if (startProjections) {
    await projectionModule.engine.register(timelineModule.timelineProjection);
    await projectionModule.engine.register(missionControlModule.missionControlProjection);
    await projectionModule.engine.register(executiveDashboardModule.executiveDashboardProjection);
    projectionModule.engine.start();
  }

  return {
    businessEventModule,
    projectionModule,
    timelineModule,
    missionControlModule,
    executiveDashboardModule,
    prospectModule
  };
}

module.exports = {
  createEnvironmentModules
};
