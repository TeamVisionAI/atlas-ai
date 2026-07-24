/**
 * Sprint 14.4 — Projection registry.
 */

const { assertProjection } = require("../interfaces/Projection");

class ProjectionRegistry {
  constructor() {
    this.projections = new Map();
  }

  /**
   * @param {import('../interfaces/Projection').Projection} projection
   */
  register(projection) {
    assertProjection(projection);
    const name = projection.name();

    if (this.projections.has(name)) {
      throw new Error(`Projection already registered: ${name}`);
    }

    this.projections.set(name, projection);
    return projection;
  }

  /**
   * @param {string} name
   */
  unregister(name) {
    return this.projections.delete(name);
  }

  /**
   * @param {string} name
   * @returns {import('../interfaces/Projection').Projection|undefined}
   */
  getProjection(name) {
    return this.projections.get(name);
  }

  /**
   * @returns {import('../interfaces/Projection').Projection[]}
   */
  listProjections() {
    return [...this.projections.values()];
  }
}

module.exports = {
  ProjectionRegistry
};
