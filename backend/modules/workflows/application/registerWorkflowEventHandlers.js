/**
 * Sprint 12.2 Phase 3 — Subscribe Workflow Engine to appointment business events.
 */

const { APPOINTMENT_EVENTS } = require("../../business-events/domain/EventTypes");

function registerAppointmentWorkflowHandlers(publisher, engine) {
  if (!publisher || !engine) {
    throw new Error("Workflow handlers require an event publisher and workflow engine.");
  }

  const appointmentEventTypes = Object.values(APPOINTMENT_EVENTS);

  appointmentEventTypes.forEach((eventType) => {
    publisher.subscribe(eventType, async (businessEvent) => {
      await engine.handleEvent(businessEvent);
    });
  });

  return appointmentEventTypes;
}

module.exports = {
  registerAppointmentWorkflowHandlers
};
