/**
 * Sprint 14.1 — Atlas Core Prospect Engine module entry.
 * Domain-Driven Design: domain · application · infrastructure · api
 */

const createProspectRoutes = require("./api/prospect.routes");
const {
  ProspectApplicationService,
  ProspectService
} = require("./application/ProspectApplicationService");
const { ProspectRepository } = require("./infrastructure/persistence/SupabaseProspectRepository");
const { Prospect } = require("./domain/Prospect");
const { BusinessEventEnginePlaceholder } = require("./interfaces/businessEventEngine");
const { TimelineServicePlaceholder } = require("./interfaces/timelineService");

function createProspectModule(deps = {}) {
  const repository = deps.repository || new ProspectRepository();
  const businessEventEngine =
    deps.businessEventEngine || new BusinessEventEnginePlaceholder();

  const service = new ProspectApplicationService({
    repository,
    businessEventEngine
  });

  return {
    service,
    repository,
    businessEventEngine,
    routes: createProspectRoutes({
      service,
      prospectEventsHandler: deps.prospectEventsHandler
    })
  };
}

module.exports = {
  createProspectModule,
  createProspectRoutes,
  ProspectApplicationService,
  ProspectService,
  ProspectRepository,
  Prospect,
  BusinessEventEnginePlaceholder,
  TimelineServicePlaceholder
};
