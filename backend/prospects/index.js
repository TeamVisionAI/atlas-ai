/**
 * Sprint 12.3 — Prospect domain public exports.
 */

const { ProspectService } = require("./ProspectService");
const { ProspectRepository } = require("./ProspectRepository");
const { ProspectFactory } = require("./ProspectFactory");
const { AtlasIdGenerator } = require("./AtlasIdGenerator");
const { ProspectEvent } = require("./prospectEvents");

let sharedRepository = null;

function getSharedProspectRepository() {
  if (!sharedRepository) {
    sharedRepository = new ProspectRepository();
  }

  return sharedRepository;
}

function resetSharedProspectRepository() {
  sharedRepository = null;
}

/**
 * @param {Object} [options]
 * @param {import('../communication/events/EventBus').EventBus} [options.eventBus]
 */
function createProspectService(options = {}) {
  const repository = options.repository || getSharedProspectRepository();
  const factory = new ProspectFactory();
  const idGenerator = new AtlasIdGenerator(repository);

  return new ProspectService({
    repository,
    factory,
    idGenerator,
    eventBus: options.eventBus || null
  });
}

module.exports = {
  ProspectService,
  ProspectRepository,
  ProspectFactory,
  AtlasIdGenerator,
  ProspectEvent,
  createProspectService,
  getSharedProspectRepository,
  resetSharedProspectRepository
};
