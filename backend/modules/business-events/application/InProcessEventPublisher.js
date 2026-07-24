/**
 * Sprint 14.2 — In-process event publisher (RFC-010 principles, no external broker).
 */

class InProcessEventPublisher {
  constructor() {
    this.subscribers = new Map();
    this.wildcardSubscribers = new Set();
  }

  /**
   * @param {string} eventType — use "*" for all events
   * @param {(event: Object) => Promise<void>|void} handler
   */
  subscribe(eventType, handler) {
    if (typeof handler !== "function") {
      throw new Error("Subscriber handler must be a function.");
    }

    if (eventType === "*") {
      this.wildcardSubscribers.add(handler);
      return;
    }

    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    this.subscribers.get(eventType).add(handler);
  }

  /**
   * @param {string} eventType
   * @param {(event: Object) => Promise<void>|void} handler
   */
  unsubscribe(eventType, handler) {
    if (eventType === "*") {
      this.wildcardSubscribers.delete(handler);
      return;
    }

    const handlers = this.subscribers.get(eventType);

    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * @param {import('../../domain/BusinessEvent')} event
   */
  async publish(event) {
    const payload = event.toJSON();
    const handlers = new Set(this.wildcardSubscribers);

    const typeHandlers = this.subscribers.get(payload.eventType);

    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handlers.add(handler);
      }
    }

    for (const handler of handlers) {
      await handler(payload);
    }

    return payload;
  }
}

module.exports = {
  InProcessEventPublisher
};
