/**
 * Sprint 14.2 — Timeline subscriber placeholder.
 * Receives published events — Timeline Engine implementation comes later.
 */

class TimelineSubscriber {
  /**
   * @param {import('./InProcessEventPublisher').InProcessEventPublisher} publisher
   */
  constructor(publisher) {
    this.publisher = publisher;
    this.received = [];
    this._handler = this.handle.bind(this);
  }

  register() {
    this.publisher.subscribe("*", this._handler);
  }

  unregister() {
    this.publisher.unsubscribe("*", this._handler);
  }

  /**
   * @param {Object} event
   */
  async handle(event) {
    this.received.push(event);

    if (process.env.NODE_ENV !== "production") {
      console.log("[TimelineSubscriber:placeholder]", event.eventType, event.prospectId);
    }
  }
}

module.exports = {
  TimelineSubscriber
};
