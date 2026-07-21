/**
 * Sprint 12.3 — Permanent Atlas prospect identifier generator.
 * Format: ATL-000001, ATL-000002, ...
 */

class AtlasIdGenerator {
  /**
   * @param {import('./ProspectRepository').ProspectRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @returns {Promise<string>}
   */
  async nextId() {
    const sequence = await this.repository.nextSequence();
    return `ATL-${String(sequence).padStart(6, "0")}`;
  }
}

module.exports = {
  AtlasIdGenerator
};
