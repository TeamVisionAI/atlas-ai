/**
 * Sprint 16.1 — Canonical Business Event emission for autonomous recruiting workflow.
 */

const { EventFactory } = require("../modules/business-events/application/EventFactory");
const {
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS,
  LEAD_EVENTS
} = require("../modules/business-events/domain/EventTypes");
const { LIFECYCLE_STATES } = require("../modules/prospects/domain/constants");
const { getRecruitingWorkflowDeps, isRecruitingWorkflowReady } = require("./recruitingWorkflowRegistry");
const { findCoreProspectIdByPhone } = require("./recruitingProspectBridge");

async function resolveProspectId(phone, prospectId) {
  if (prospectId) {
    return prospectId;
  }

  return findCoreProspectIdByPhone(phone);
}

async function recordBusinessEvent(input) {
  if (!isRecruitingWorkflowReady()) {
    return null;
  }

  const prospectId = await resolveProspectId(input.phone, input.prospectId);

  if (!prospectId) {
    return null;
  }

  const { businessEventService } = getRecruitingWorkflowDeps();
  const base = {
    prospectId,
    actor: input.actor || "ATLAS",
    channel: input.channel || "whatsapp",
    organizationId: input.organizationId,
    lifecycleStateAtEvent: input.lifecycleStateAtEvent ?? null,
    summary: input.summary,
    payload: input.payload || {},
    timestamp: input.timestamp,
    correlationId: input.correlationId ?? null
  };

  let event;

  switch (input.eventType) {
    case COMMUNICATION_EVENTS.MESSAGE_RECEIVED:
      event = EventFactory.create({
        ...base,
        eventType: COMMUNICATION_EVENTS.MESSAGE_RECEIVED,
        metadata: {
          organizationId: input.organizationId,
          lifecycleStateAtEvent: input.lifecycleStateAtEvent,
          summary: input.summary || "Message received"
        }
      });
      break;

    case COMMUNICATION_EVENTS.MESSAGE_SENT:
      event = EventFactory.create({
        ...base,
        eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
        metadata: {
          organizationId: input.organizationId,
          lifecycleStateAtEvent: input.lifecycleStateAtEvent,
          summary: input.summary || "Message sent"
        }
      });
      break;

    case APPOINTMENT_EVENTS.APPOINTMENT_CREATED:
      event = EventFactory.create({
        ...base,
        eventType: APPOINTMENT_EVENTS.APPOINTMENT_CREATED,
        metadata: {
          organizationId: input.organizationId,
          lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
          summary: input.summary || "Interview scheduled"
        }
      });
      break;

    case LEAD_EVENTS.PROSPECT_UPDATED:
      event = EventFactory.prospectUpdated({
        ...base,
        changedFields: input.changedFields || [],
        summary: input.summary
      });
      break;

    default:
      event = EventFactory.create({
        ...base,
        eventType: input.eventType,
        metadata: {
          organizationId: input.organizationId,
          lifecycleStateAtEvent: input.lifecycleStateAtEvent,
          summary: input.summary || input.eventType
        }
      });
  }

  return businessEventService.record(event);
}

module.exports = {
  recordBusinessEvent
};
