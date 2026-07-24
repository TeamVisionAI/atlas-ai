/**
 * Sprint 15.1 — Shared Business Event → Executive Dashboard projection operation.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");
const { requiresProspectId } = require("../../business-events/domain/EventTypes");

const PROJECTION_STATUS = Object.freeze({
  IGNORED: "ignored",
  CREATED: "created",
  SKIPPED: "skipped",
  FAILED: "failed"
});

/**
 * @param {Object} businessEvent
 * @param {import('../infrastructure/ExecutiveDashboardRepository').ExecutiveDashboardRepository} repository
 * @param {Object} [options]
 * @param {boolean} [options.skipIdempotencyCheck]
 */
async function projectExecutiveDashboardEvent(businessEvent, repository, options = {}) {
  if (!businessEvent?.eventId) {
    return {
      status: PROJECTION_STATUS.FAILED,
      error: new Error("Business event envelope missing eventId.")
    };
  }

  if (requiresProspectId(businessEvent.eventType) && !businessEvent.prospectId) {
    return {
      status: PROJECTION_STATUS.IGNORED,
      reason: "no_prospect_id",
      businessEventId: businessEvent.eventId,
      eventType: businessEvent.eventType
    };
  }

  const organizationId =
    businessEvent.metadata?.organizationId || DEFAULT_ORGANIZATION_ID;

  if (!options.skipIdempotencyCheck) {
    const processed = await repository.isEventProcessed(businessEvent.eventId);

    if (processed) {
      return {
        status: PROJECTION_STATUS.SKIPPED,
        businessEventId: businessEvent.eventId,
        eventType: businessEvent.eventType,
        prospectId: businessEvent.prospectId ?? null
      };
    }
  }

  try {
    await repository.applyEvent(businessEvent, organizationId);

    if (!options.skipIdempotencyCheck) {
      await repository.markEventProcessed(businessEvent.eventId, organizationId);
    }

    return {
      status: PROJECTION_STATUS.CREATED,
      businessEventId: businessEvent.eventId,
      eventType: businessEvent.eventType,
      prospectId: businessEvent.prospectId ?? null
    };
  } catch (error) {
    return {
      status: PROJECTION_STATUS.FAILED,
      error,
      businessEventId: businessEvent.eventId,
      eventType: businessEvent.eventType,
      prospectId: businessEvent.prospectId ?? null
    };
  }
}

module.exports = {
  PROJECTION_STATUS,
  projectExecutiveDashboardEvent
};
