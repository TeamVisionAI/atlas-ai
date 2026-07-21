/**
 * Sprint 12.1 — In-process communication event bus.
 * Analytics and dashboard consumers subscribe in future sprints.
 */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  /**
   * @param {string} eventName
   * @param {Function} handler
   * @returns {() => void} unsubscribe
   */
  on(eventName, handler) {
    if (typeof handler !== "function") {
      throw new Error("EventBus handler must be a function");
    }

    if (!this._handlers.has(eventName)) {
      this._handlers.set(eventName, new Set());
    }

    this._handlers.get(eventName).add(handler);

    return () => {
      this._handlers.get(eventName)?.delete(handler);
    };
  }

  /**
   * @param {string} eventName
   * @param {Record<string, unknown>} payload
   */
  emit(eventName, payload = {}) {
    const handlers = this._handlers.get(eventName);

    if (!handlers?.size) {
      return;
    }

    for (const handler of handlers) {
      try {
        handler({ eventName, ...payload, emittedAt: new Date().toISOString() });
      } catch (error) {
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            component: "EVENT_BUS",
            message: "Handler error",
            eventName,
            error: error.message
          })
        );
      }
    }
  }
}

module.exports = {
  EventBus
};
