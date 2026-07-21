/**
 * Journey #5 Increment 2 — Agent workflow contract registry.
 * Separate from Sprint 13 execution WorkflowRegistry.
 */

const { validateContract, BUILTIN_WORKFLOWS } = require("./WorkflowContracts");

class WorkflowRegistry {
  constructor() {
    /** @type {Map<string, Object>} */
    this._contracts = new Map();

    for (const contract of BUILTIN_WORKFLOWS) {
      this.register(contract);
    }
  }

  /**
   * @param {Object} contract
   */
  register(contract) {
    validateContract(contract);
    this._contracts.set(contract.name, contract);
    return contract.name;
  }

  /**
   * @param {string} name
   * @returns {Object|null}
   */
  get(name) {
    return this._contracts.get(name) || null;
  }

  /**
   * @returns {string[]}
   */
  list() {
    return Array.from(this._contracts.keys());
  }

  clear() {
    this._contracts.clear();
  }
}

let singleton = null;

function getWorkflowRegistry() {
  if (!singleton) {
    singleton = new WorkflowRegistry();
  }

  return singleton;
}

function resetWorkflowRegistry() {
  singleton = null;
}

module.exports = {
  WorkflowRegistry,
  getWorkflowRegistry,
  resetWorkflowRegistry
};
