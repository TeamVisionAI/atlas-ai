/**
 * Sprint 12.5 — Mission Control public exports.
 */

const { MissionControlService } = require("./MissionControlService");
const { LiveConversationIndex } = require("./LiveConversationIndex");
const { ActivityFeed } = require("./ActivityFeed");

/**
 * @param {Object} [options]
 * @param {import('../communication/events/EventBus').EventBus} options.eventBus
 */
function createMissionControlService(options = {}) {
  if (!options.eventBus) {
    throw new Error("MissionControlService requires eventBus");
  }

  return new MissionControlService({
    eventBus: options.eventBus
  });
}

let singleton = null;

/**
 * @param {import('../communication/events/EventBus').EventBus} eventBus
 */
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
  createMissionControlService,
  getMissionControlService,
  resetMissionControlService
};
