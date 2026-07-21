/**
 * Sprint 12.5 — Chronological Mission Control activity log.
 */

const { OwnershipMode } = require("../communication/constants/OwnershipMode");

class ActivityFeed {
  /**
   * @param {number} [maxEntries]
   */
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
    /** @type {Array<Object>} */
    this._entries = [];
  }

  /**
   * @param {Object} entry
   * @param {string} entry.type
   * @param {string} entry.summary
   * @param {string|null} [entry.atlasProspectId]
   * @param {string|null} [entry.conversationId]
   * @param {string|null} [entry.operatorId]
   * @param {string|null} [entry.operatorName]
   * @param {Record<string, unknown>} [entry.metadata]
   * @param {string} [entry.timestamp]
   */
  append(entry) {
    const record = {
      id: `${Date.now()}-${this._entries.length}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      type: entry.type,
      summary: entry.summary,
      atlasProspectId: entry.atlasProspectId || null,
      conversationId: entry.conversationId || null,
      operatorId: entry.operatorId || null,
      operatorName: entry.operatorName || null,
      metadata: entry.metadata || {}
    };

    this._entries.unshift(record);

    if (this._entries.length > this.maxEntries) {
      this._entries.length = this.maxEntries;
    }

    return record;
  }

  /**
   * @param {number} [limit]
   */
  getEntries(limit = 50) {
    return this._entries.slice(0, limit);
  }

  clear() {
    this._entries = [];
  }
}

/**
 * @param {string} ownershipMode
 * @returns {string}
 */
function ownershipLabel(ownershipMode) {
  if (ownershipMode === OwnershipMode.HUMAN) {
    return "Human-owned";
  }

  if (ownershipMode === OwnershipMode.TRANSFER_PENDING) {
    return "Transfer pending";
  }

  return "AI-owned";
}

module.exports = {
  ActivityFeed,
  ownershipLabel
};
