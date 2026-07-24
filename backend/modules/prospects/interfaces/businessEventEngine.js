/**
 * Sprint 14.1 — Business Event Engine placeholder (fallback when module not wired).
 * Sprint 14.2 — replace with BusinessEventProspectAdapter from business-events module.
 */

class BusinessEventEnginePlaceholder {
  /**
   * @param {Object} event
   */
  async emit(event) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[BusinessEventEngine:placeholder]", event.eventType, event.prospectId);
    }

    return {
      emitted: true,
      placeholder: true,
      event
    };
  }
}

module.exports = {
  BusinessEventEnginePlaceholder
};
