/**
 * Mission Control exports — Sprint 12.5 + Release 1.4.
 */

const { MissionControlService } = require("./MissionControlService");
const { LiveConversationIndex } = require("./LiveConversationIndex");
const { ActivityFeed } = require("./ActivityFeed");
const { MissionEvent } = require("./MissionEvents");
const missionStore = require("./MissionStore");
const {
  createEmptyMissionState,
  touchState,
  upsertConversation,
  closeConversation
} = require("./MissionState");
const { processMissionEvent, getSubscribedEvents } = require("./MissionEventProcessor");
const { calculateMissionMetrics } = require("./MissionMetrics");
const { generateMissionAlerts } = require("./MissionAlerts");
const { calculateMissionHealth, HEALTH } = require("./MissionHealth");
const { buildMissionSnapshot } = require("./MissionSnapshot");
const { filterMissionItems, filterSnapshot } = require("./MissionFilters");
const { formatMissionControl, formatAsJson } = require("./MissionFormatter");
const {
  MissionControlEngine,
  createMissionControlEngine,
  resetMissionControlEngine
} = require("./MissionControlEngine");

function createMissionControlService(options = {}) {
  if (!options.eventBus) {
    throw new Error("MissionControlService requires eventBus");
  }

  return new MissionControlService({
    eventBus: options.eventBus
  });
}

let singleton = null;

function getMissionControlService(eventBus) {
  if (!singleton) {
    singleton = createMissionControlService({ eventBus });
  }

  return singleton;
}

function resetMissionControlService() {
  if (singleton) {
    singleton.unsubscribe();
  }

  singleton = null;
}

module.exports = {
  MissionControlService,
  LiveConversationIndex,
  ActivityFeed,
  MissionEvent,
  missionStore,
  createEmptyMissionState,
  touchState,
  upsertConversation,
  closeConversation,
  processMissionEvent,
  getSubscribedEvents,
  calculateMissionMetrics,
  generateMissionAlerts,
  calculateMissionHealth,
  HEALTH,
  buildMissionSnapshot,
  filterMissionItems,
  filterSnapshot,
  formatMissionControl,
  formatAsJson,
  MissionControlEngine,
  createMissionControlEngine,
  resetMissionControlEngine,
  createMissionControlService,
  getMissionControlService,
  resetMissionControlService
};
