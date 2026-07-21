/**
 * Sprint 12.4 — In-memory operator persistence.
 */

class OperatorRepository {
  constructor() {
    /** @type {Map<string, Object>} */
    this._operators = new Map();
  }

  /**
   * @param {Object} operator
   */
  async save(operator) {
    this._operators.set(operator.id, operator);
    return operator;
  }

  /**
   * @param {string} operatorId
   */
  async findById(operatorId) {
    return this._operators.get(operatorId) || null;
  }

  /**
   * @returns {Promise<Object[]>}
   */
  async listAll() {
    return Array.from(this._operators.values());
  }
}

module.exports = {
  OperatorRepository
};
