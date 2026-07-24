/**
 * Sprint 14.3 — Atlas Timeline Engine module entry.
 * Sprint 14.4 — Timeline projection registered via ProjectionEngine.
 */

const createTimelineRoutes = require("./api/timeline.routes");
const { createProspectTimelineHandler } = require("./api/timeline.routes");
const { TimelineService } = require("./application/TimelineService");
const {
  TimelineProjection,
  TimelineProjector,
  PROJECTION_NAME
} = require("./application/TimelineProjector");
const { TimelineReplayService } = require("./application/TimelineReplayService");
const { TimelineRepository } = require("./infrastructure/persistence/TimelineRepository");
const { TimelineEntry } = require("./domain/TimelineEntry");

function createTimelineModule(deps = {}) {
  const repository = deps.repository || new TimelineRepository();
  const service = new TimelineService({ repository });
  const timelineProjection = deps.timelineProjection || new TimelineProjection({ repository });
  const projector = timelineProjection;

  const replayService = new TimelineReplayService({
    projectionEngine: deps.projectionEngine,
    timelineProjection,
    businessEventRepository: deps.businessEventRepository,
    timelineRepository: repository
  });

  return {
    service,
    repository,
    projector,
    timelineProjection,
    replayService,
    routes: createTimelineRoutes({ service }),
    prospectTimelineHandler: createProspectTimelineHandler({ service })
  };
}

module.exports = {
  createTimelineModule,
  createTimelineRoutes,
  createProspectTimelineHandler,
  TimelineService,
  TimelineProjection,
  TimelineProjector,
  TimelineReplayService,
  TimelineRepository,
  TimelineEntry,
  PROJECTION_NAME
};
