/**
 * Sprint 14.2 — Atlas Business Event Engine module entry.
 */

const createBusinessEventRoutes = require("./api/businessEvent.routes");
const { createProspectEventsHandler } = require("./api/businessEvent.routes");
const { BusinessEventService } = require("./application/BusinessEventService");
const { InProcessEventPublisher } = require("./application/InProcessEventPublisher");
const { TimelineSubscriber } = require("./application/TimelineSubscriber");
const { BusinessEventProspectAdapter } = require("./application/BusinessEventProspectAdapter");
const { EventFactory } = require("./application/EventFactory");
const { SupabaseBusinessEventRepository } = require("./infrastructure/persistence/SupabaseBusinessEventRepository");
const { BusinessEvent } = require("./domain/BusinessEvent");
const EventTypes = require("./domain/EventTypes");
const EventVersion = require("./domain/EventVersion");

function createBusinessEventModule(deps = {}) {
  const publisher = deps.publisher || new InProcessEventPublisher();
  const repository = deps.repository || new SupabaseBusinessEventRepository();
  const service = new BusinessEventService({ repository, publisher });
  const timelineSubscriber = deps.timelineSubscriber || new TimelineSubscriber(publisher);

  if (deps.registerTimelineSubscriber !== false) {
    timelineSubscriber.register();
  }

  const prospectAdapter = new BusinessEventProspectAdapter(service);

  return {
    service,
    publisher,
    repository,
    timelineSubscriber,
    prospectAdapter,
    routes: createBusinessEventRoutes({ service }),
    prospectEventsHandler: createProspectEventsHandler({ service })
  };
}

module.exports = {
  createBusinessEventModule,
  createBusinessEventRoutes,
  createProspectEventsHandler,
  BusinessEventService,
  BusinessEvent,
  BusinessEventProspectAdapter,
  EventFactory,
  EventVersion,
  InProcessEventPublisher,
  TimelineSubscriber,
  SupabaseBusinessEventRepository,
  EventTypes
};
