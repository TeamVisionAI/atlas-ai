/**
 * Sprint 13.0 — Register workflow definitions by name.
 */

class WorkflowRegistry {
  constructor() {
    /** @type {Map<string, Object>} */
    this._workflows = new Map();
  }

  /**
   * @param {Object} definition
   * @param {string} definition.name
   * @param {string} definition.initialStep
   * @param {Record<string, Function>|Function} [definition.steps]
   * @param {Function} [definition.handleStep]
   */
  register(definition) {
    if (!definition?.name) {
      throw new Error("Workflow definition requires name");
    }

    if (!definition.initialStep) {
      throw new Error(`Workflow "${definition.name}" requires initialStep`);
    }

    const hasSteps = definition.steps && typeof definition.steps === "object";
    const hasHandleStep = typeof definition.handleStep === "function";

    if (!hasSteps && !hasHandleStep) {
      throw new Error(
        `Workflow "${definition.name}" requires steps map or handleStep function`
      );
    }

    this._workflows.set(definition.name, {
      ...definition,
      name: definition.name,
      initialStep: definition.initialStep
    });

    return definition.name;
  }

  /**
   * @param {string} name
   * @returns {Object|null}
   */
  get(name) {
    return this._workflows.get(name) || null;
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this._workflows.has(name);
  }

  /**
   * @returns {string[]}
   */
  list() {
    return Array.from(this._workflows.keys());
  }

  clear() {
    this._workflows.clear();
  }
}

module.exports = {
  WorkflowRegistry
};
