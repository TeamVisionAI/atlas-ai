/**
 * Sprint 8A.6 — Idempotent events for time-based workflow reconciliation.
 */

const { emit, EVENT_TYPES } = require("./eventEngine");
const { MILESTONES } = require("./workflowConstants");

async function emitTimeReconciliationEvents({
  phone,
  milestoneBefore,
  milestoneAfter,
  ownershipBefore,
  ownershipAfter,
  episodeKey
}) {
  const correlationId = `reconcile:${phone}:${episodeKey}`;
  const base = {
    prospectPhone: phone,
    actor: "SYSTEM",
    milestoneBefore,
    milestoneAfter,
    ownershipBefore,
    ownershipAfter,
    correlationId
  };

  const results = [];

  results.push(
    await emit(EVENT_TYPES.PROSPECT_ADVANCED, {
      ...base,
      payload: {
        reason: "time_based_reconciliation",
        trigger: "interview_timing"
      }
    })
  );

  if (ownershipBefore !== ownershipAfter) {
    results.push(
      await emit(EVENT_TYPES.WORKFLOW_OWNERSHIP_CHANGED, {
        ...base,
        payload: {
          reason: "time_based_reconciliation",
          note: "Ownership updated after interview timing progression"
        }
      })
    );
  }

  if (
    milestoneAfter === MILESTONES.INTERVIEW_RESULT_PENDING ||
    milestoneAfter === MILESTONES.INTERVIEW_COMPLETED
  ) {
    results.push(
      await emit(EVENT_TYPES.INTERVIEW_COMPLETED, {
        ...base,
        payload: { reason: "time_based_reconciliation" }
      })
    );
  }

  if (milestoneAfter === MILESTONES.INTERVIEW_DUE) {
    results.push(
      await emit(EVENT_TYPES.REMINDER_SCHEDULED, {
        ...base,
        payload: { reason: "interview_imminent", source: "time_reconciliation" }
      })
    );
  }

  return results;
}

module.exports = {
  emitTimeReconciliationEvents
};
