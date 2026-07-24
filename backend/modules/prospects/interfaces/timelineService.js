/**
 * Sprint 14.1 — Timeline Service placeholder.
 * TODO: Replace with append-only timeline store (PROSPECT_TIMELINE.md).
 */

class TimelineServicePlaceholder {
  /**
   * @param {Object} entry
   * @param {string} entry.prospectId
   * @param {string} entry.eventType
   * @param {string} entry.summary
   * @param {Object} [entry.payload]
   */
  async append(entry) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[TimelineService:placeholder]", entry.eventType, entry.prospectId);
    }

    return {
      appended: true,
      placeholder: true,
      entry
    };
  }
}

module.exports = {
  TimelineServicePlaceholder
};
