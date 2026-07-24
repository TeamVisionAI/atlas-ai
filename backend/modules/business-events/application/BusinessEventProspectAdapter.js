/**
 * Sprint 14.2 — Prospect Engine adapter for Business Event Service.
 */

const { EventFactory } = require("./EventFactory");

class BusinessEventProspectAdapter {
  /**
   * @param {import('./BusinessEventService').BusinessEventService} businessEventService
   */
  constructor(businessEventService) {
    this.businessEventService = businessEventService;
  }

  /**
   * Compatible with Prospect module businessEventEngine interface.
   * @param {Object} event
   */
  async emit(event) {
    const businessEvent = EventFactory.fromProspectEmit(event);
    const recorded = await this.businessEventService.record(businessEvent);

    return {
      emitted: true,
      event: recorded.toJSON()
    };
  }
}

module.exports = {
  BusinessEventProspectAdapter
};
