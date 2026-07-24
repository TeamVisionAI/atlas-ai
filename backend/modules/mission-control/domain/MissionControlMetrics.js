/**
 * Sprint 15.0 — Mission Control aggregate metrics (read-only projection).
 * No business logic — event-to-counter mapping only.
 */

const {
  LEAD_EVENTS,
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS
} = require("../../business-events/domain/EventTypes");
const { LIFECYCLE_STATES } = require("../../prospects/domain/constants");

const METRIC_KEYS = Object.freeze({
  ACTIVE_PROSPECTS: "activeProspects",
  NEW_LEADS: "newLeads",
  CONTACT_ATTEMPTS: "contactAttempts",
  QUALIFIED_PROSPECTS: "qualifiedProspects",
  SCHEDULED_INTERVIEWS: "scheduledInterviews",
  COMPLETED_INTERVIEWS: "completedInterviews",
  ARCHIVED_PROSPECTS: "archivedProspects"
});

function createEmptyMetrics() {
  return {
    [METRIC_KEYS.ACTIVE_PROSPECTS]: 0,
    [METRIC_KEYS.NEW_LEADS]: 0,
    [METRIC_KEYS.CONTACT_ATTEMPTS]: 0,
    [METRIC_KEYS.QUALIFIED_PROSPECTS]: 0,
    [METRIC_KEYS.SCHEDULED_INTERVIEWS]: 0,
    [METRIC_KEYS.COMPLETED_INTERVIEWS]: 0,
    [METRIC_KEYS.ARCHIVED_PROSPECTS]: 0,
    mergeStatistics: {
      totalMerges: 0,
      mergedProspects: 0
    },
    assignmentMetrics: {
      totalAssignments: 0,
      byAgent: {}
    }
  };
}

function createEmptyProspectState(prospectId, organizationId) {
  return {
    prospectId,
    organizationId,
    isActive: false,
    lifecycleState: null,
    assignedAgentId: null,
    contactAttemptCount: 0,
    isQualified: false,
    hasScheduledInterview: false,
    hasCompletedInterview: false,
    isArchived: false,
    mergedIntoId: null,
    lastEventId: null,
    lastEventAt: null,
    lastEventType: null
  };
}

function resolveLifecycleState(event) {
  return (
    event.metadata?.lifecycleStateAtEvent ||
    event.metadata?.lifecycleState ||
    null
  );
}

function ensureProspectState(readModel, prospectId, organizationId) {
  if (!readModel.prospects[prospectId]) {
    readModel.prospects[prospectId] = createEmptyProspectState(prospectId, organizationId);
  }

  return readModel.prospects[prospectId];
}

function incrementAssignment(metrics, assignedAgentId) {
  metrics.assignmentMetrics.totalAssignments += 1;

  if (assignedAgentId) {
    metrics.assignmentMetrics.byAgent[assignedAgentId] =
      (metrics.assignmentMetrics.byAgent[assignedAgentId] || 0) + 1;
  }
}

function decrementActive(metrics) {
  if (metrics[METRIC_KEYS.ACTIVE_PROSPECTS] > 0) {
    metrics[METRIC_KEYS.ACTIVE_PROSPECTS] -= 1;
  }
}

function incrementActive(metrics) {
  metrics[METRIC_KEYS.ACTIVE_PROSPECTS] += 1;
}

function markQualified(metrics, prospect) {
  if (!prospect.isQualified) {
    prospect.isQualified = true;
    metrics[METRIC_KEYS.QUALIFIED_PROSPECTS] += 1;
  }
}

function markScheduledInterview(metrics, prospect) {
  if (!prospect.hasScheduledInterview) {
    prospect.hasScheduledInterview = true;
    metrics[METRIC_KEYS.SCHEDULED_INTERVIEWS] += 1;
  }
}

function markCompletedInterview(metrics, prospect) {
  if (!prospect.hasCompletedInterview) {
    prospect.hasCompletedInterview = true;
    metrics[METRIC_KEYS.COMPLETED_INTERVIEWS] += 1;
  }
}

function applyLifecycleTransition(metrics, prospect, lifecycleState) {
  if (!lifecycleState) {
    return;
  }

  prospect.lifecycleState = lifecycleState;

  if (lifecycleState === LIFECYCLE_STATES.QUALIFIED) {
    markQualified(metrics, prospect);
  }

  if (lifecycleState === LIFECYCLE_STATES.INTERVIEW_SCHEDULED) {
    markScheduledInterview(metrics, prospect);
  }

  if (lifecycleState === LIFECYCLE_STATES.INTERVIEW_COMPLETED) {
    markCompletedInterview(metrics, prospect);
  }
}

function touchProspect(prospect, event) {
  prospect.lastEventId = event.eventId;
  prospect.lastEventAt = event.timestamp;
  prospect.lastEventType = event.eventType;
}

/**
 * Pure event application — mutates readModel in place.
 * @param {Object} readModel
 * @param {Object} event — BusinessEvent.toJSON()
 */
function applyEventToReadModel(readModel, event) {
  const organizationId = event.metadata?.organizationId || readModel.organizationId;
  readModel.organizationId = organizationId;
  readModel.updatedAt = event.timestamp || new Date().toISOString();

  const metrics = readModel.metrics;
  const lifecycleState = resolveLifecycleState(event);

  switch (event.eventType) {
    case LEAD_EVENTS.PROSPECT_CREATED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      prospect.isActive = true;
      prospect.isArchived = false;
      prospect.mergedIntoId = null;
      metrics[METRIC_KEYS.NEW_LEADS] += 1;
      incrementActive(metrics);
      applyLifecycleTransition(metrics, prospect, lifecycleState || LIFECYCLE_STATES.NEW_LEAD);
      touchProspect(prospect, event);
      break;
    }

    case LEAD_EVENTS.PROSPECT_UPDATED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      applyLifecycleTransition(metrics, prospect, lifecycleState);
      touchProspect(prospect, event);
      break;
    }

    case LEAD_EVENTS.PROSPECT_ASSIGNED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      prospect.assignedAgentId = event.payload?.assignedAgentId || null;
      incrementAssignment(metrics, prospect.assignedAgentId);
      applyLifecycleTransition(metrics, prospect, lifecycleState);
      touchProspect(prospect, event);
      break;
    }

    case LEAD_EVENTS.PROSPECT_ARCHIVED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);

      if (prospect.isActive) {
        prospect.isActive = false;
        decrementActive(metrics);
      }

      if (!prospect.isArchived) {
        prospect.isArchived = true;
        metrics[METRIC_KEYS.ARCHIVED_PROSPECTS] += 1;
      }

      touchProspect(prospect, event);
      break;
    }

    case LEAD_EVENTS.PROSPECT_RESTORED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);

      if (prospect.isArchived) {
        prospect.isArchived = false;
        metrics[METRIC_KEYS.ARCHIVED_PROSPECTS] = Math.max(
          0,
          metrics[METRIC_KEYS.ARCHIVED_PROSPECTS] - 1
        );
      }

      if (!prospect.isActive) {
        prospect.isActive = true;
        incrementActive(metrics);
      }

      applyLifecycleTransition(metrics, prospect, lifecycleState);
      touchProspect(prospect, event);
      break;
    }

    case LEAD_EVENTS.PROSPECT_MERGED: {
      metrics.mergeStatistics.totalMerges += 1;
      metrics.mergeStatistics.mergedProspects += 1;

      const mergedId = event.payload?.mergedId;
      const survivorId = event.payload?.survivorId || event.prospectId;

      if (mergedId) {
        const mergedProspect = ensureProspectState(readModel, mergedId, organizationId);

        if (mergedProspect.isActive) {
          mergedProspect.isActive = false;
          decrementActive(metrics);
        }

        mergedProspect.mergedIntoId = survivorId;
        touchProspect(mergedProspect, event);
      }

      const survivor = ensureProspectState(readModel, survivorId, organizationId);
      touchProspect(survivor, event);
      break;
    }

    case COMMUNICATION_EVENTS.MESSAGE_SENT:
    case COMMUNICATION_EVENTS.CALL_STARTED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      prospect.contactAttemptCount += 1;
      metrics[METRIC_KEYS.CONTACT_ATTEMPTS] += 1;
      applyLifecycleTransition(metrics, prospect, lifecycleState || LIFECYCLE_STATES.CONTACT_ATTEMPTED);
      touchProspect(prospect, event);
      break;
    }

    case APPOINTMENT_EVENTS.APPOINTMENT_CREATED:
    case APPOINTMENT_EVENTS.APPOINTMENT_RESCHEDULED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      markScheduledInterview(metrics, prospect);
      applyLifecycleTransition(
        metrics,
        prospect,
        lifecycleState || LIFECYCLE_STATES.INTERVIEW_SCHEDULED
      );
      touchProspect(prospect, event);
      break;
    }

    case APPOINTMENT_EVENTS.INTERVIEW_COMPLETED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      markCompletedInterview(metrics, prospect);
      applyLifecycleTransition(
        metrics,
        prospect,
        lifecycleState || LIFECYCLE_STATES.INTERVIEW_COMPLETED
      );
      touchProspect(prospect, event);
      break;
    }

    default: {
      if (event.prospectId) {
        const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
        applyLifecycleTransition(metrics, prospect, lifecycleState);
        touchProspect(prospect, event);
      }
      break;
    }
  }

  return readModel;
}

module.exports = {
  METRIC_KEYS,
  createEmptyMetrics,
  createEmptyProspectState,
  applyEventToReadModel
};
