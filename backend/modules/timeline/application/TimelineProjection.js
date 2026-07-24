/**
 * Sprint 14.3.1 — Shared Business Event → Timeline projection operation.
 * Used by TimelineProjector (live) and TimelineReplayService (recovery).
 */

const { TimelineEntry } = require("../domain/TimelineEntry");

const PROJECTION_STATUS = Object.freeze({
  IGNORED: "ignored",
  CREATED: "created",
  SKIPPED: "skipped",
  FAILED: "failed"
});

/**
 * @param {Object} businessEvent — BusinessEvent.toJSON() envelope
 * @param {import('../infrastructure/persistence/TimelineRepository').TimelineRepository} repository
 * @returns {Promise<{ status: string, entry?: Object, error?: Error, reason?: string }>}
 */
async function projectBusinessEvent(businessEvent, repository) {
  let entry;

  try {
    entry = TimelineEntry.fromBusinessEvent(businessEvent);
  } catch (error) {
    return {
      status: PROJECTION_STATUS.FAILED,
      error,
      businessEventId: businessEvent?.eventId,
      eventType: businessEvent?.eventType,
      prospectId: businessEvent?.prospectId
    };
  }

  if (!entry) {
    return {
      status: PROJECTION_STATUS.IGNORED,
      reason: "no_prospect_id",
      businessEventId: businessEvent?.eventId,
      eventType: businessEvent?.eventType
    };
  }

  const entryId = entry.toJSON().entryId;

  try {
    const existing = await repository.findById(entryId);

    if (existing) {
      return {
        status: PROJECTION_STATUS.SKIPPED,
        entry: existing,
        businessEventId: businessEvent.eventId
      };
    }

    const saved = await repository.append(entry);

    if (!saved) {
      const failure = new Error("Timeline repository append returned no entry.");
      return {
        status: PROJECTION_STATUS.FAILED,
        error: failure,
        businessEventId: businessEvent.eventId,
        eventType: businessEvent.eventType,
        prospectId: businessEvent.prospectId
      };
    }

    const confirmed = await repository.findById(entryId);

    if (!confirmed) {
      const failure = new Error("Timeline entry not confirmed after append.");
      return {
        status: PROJECTION_STATUS.FAILED,
        error: failure,
        businessEventId: businessEvent.eventId,
        eventType: businessEvent.eventType,
        prospectId: businessEvent.prospectId
      };
    }

    return {
      status: PROJECTION_STATUS.CREATED,
      entry: saved,
      businessEventId: businessEvent.eventId
    };
  } catch (error) {
    return {
      status: PROJECTION_STATUS.FAILED,
      error,
      businessEventId: businessEvent.eventId,
      eventType: businessEvent.eventType,
      prospectId: businessEvent.prospectId
    };
  }
}

/**
 * Deterministic chronological ordering (PROSPECT_TIMELINE.md).
 * @param {Array<{ timestamp: string, eventId: string }>} events
 */
function sortBusinessEventsChronologically(events) {
  return [...events].sort((left, right) => {
    const timeDiff = new Date(left.timestamp) - new Date(right.timestamp);

    if (timeDiff !== 0) {
      return timeDiff;
    }

    return String(left.eventId).localeCompare(String(right.eventId));
  });
}

module.exports = {
  PROJECTION_STATUS,
  projectBusinessEvent,
  sortBusinessEventsChronologically
};
