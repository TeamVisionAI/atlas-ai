/**
 * Journey #2 — Subscribes to workflow.interviewRequested and books first appointment.
 */

const { WorkflowEvent } = require("../workflows/WorkflowEvents");
const { createFromInterviewRequest } = require("./AppointmentService");

class AppointmentBookingService {
  /**
   * @param {Object} [deps]
   * @param {import('../communication/events/EventBus').EventBus|null} [deps.eventBus]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this._unsubscribers = [];

    if (this.eventBus) {
      this.subscribe(this.eventBus);
    }
  }

  /**
   * @param {import('../communication/events/EventBus').EventBus} eventBus
   */
  subscribe(eventBus) {
    this.unsubscribe();
    this.eventBus = eventBus;
    this._unsubscribers.push(
      eventBus.on(WorkflowEvent.INTERVIEW_REQUESTED, (payload) => this._onInterviewRequested(payload))
    );
  }

  unsubscribe() {
    for (const off of this._unsubscribers) {
      off();
    }

    this._unsubscribers = [];
  }

  async _onInterviewRequested(payload) {
    try {
      await createFromInterviewRequest(payload, this.eventBus);
    } catch (error) {
      console.error("[AppointmentBookingService]", error.message);
    }
  }
}

function createAppointmentBookingService(options = {}) {
  if (!options.eventBus) {
    throw new Error("AppointmentBookingService requires eventBus");
  }

  return new AppointmentBookingService({ eventBus: options.eventBus });
}

let singleton = null;

function resetAppointmentBookingService() {
  if (singleton) {
    singleton.unsubscribe();
  }

  singleton = null;
}

module.exports = {
  AppointmentBookingService,
  createAppointmentBookingService,
  resetAppointmentBookingService
};
