/**
 * Sprint 15.1 — Executive Dashboard analytical metrics (projection-only).
 */

const {
  LEAD_EVENTS,
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS,
  RECRUITING_EVENTS,
  SALES_EVENTS
} = require("../../business-events/domain/EventTypes");
const { LIFECYCLE_STATES } = require("../../prospects/domain/constants");

const FUNNEL_STAGES = Object.freeze([
  LIFECYCLE_STATES.NEW_LEAD,
  LIFECYCLE_STATES.CONTACT_ATTEMPTED,
  LIFECYCLE_STATES.CONVERSATION_STARTED,
  LIFECYCLE_STATES.QUALIFIED,
  LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
  LIFECYCLE_STATES.INTERVIEW_COMPLETED,
  LIFECYCLE_STATES.CLIENT,
  LIFECYCLE_STATES.RECRUIT,
  LIFECYCLE_STATES.FOLLOW_UP,
  LIFECYCLE_STATES.LOST
]);

function createEmptyTrendBucket() {
  return {
    newLeads: 0,
    contactAttempts: 0,
    assignments: 0,
    interviewsScheduled: 0,
    interviewsCompleted: 0,
    clients: 0,
    recruits: 0
  };
}

function createEmptyKpiBucket() {
  return {
    newLeads: 0,
    assignments: 0,
    interviewsCompleted: 0,
    contactAttempts: 0,
    conversionEvents: 0
  };
}

function createEmptyMetrics() {
  const recruitingFunnel = {};

  for (const stage of FUNNEL_STAGES) {
    recruitingFunnel[stage] = 0;
  }

  return {
    leadSourceDistribution: {},
    recruitingFunnel,
    prospectConversion: {
      leadsCreated: 0,
      qualified: 0,
      interviewsScheduled: 0,
      interviewsCompleted: 0,
      clients: 0,
      recruits: 0,
      rates: {
        leadToQualified: 0,
        qualifiedToInterview: 0,
        interviewToCompletion: 0
      }
    },
    assignmentMetrics: {
      totalAssignments: 0,
      byAgent: {}
    },
    interviewCompletion: {
      scheduled: 0,
      completed: 0,
      completionRate: 0
    },
    productionTrends: {
      daily: {},
      weekly: {},
      monthly: {}
    },
    kpis: {
      daily: {},
      weekly: {},
      monthly: {}
    },
    agentProductivity: {},
    organizationSummary: {
      totalProspectsEver: 0,
      activeProspects: 0,
      totalEventsProcessed: 0,
      lastEventAt: null,
      lastEventType: null
    }
  };
}

function createEmptyProspectState(prospectId, organizationId) {
  return {
    prospectId,
    organizationId,
    leadSource: null,
    isActive: false,
    isArchived: false,
    assignedAgentId: null,
    funnelStagesReached: {},
    reachedQualified: false,
    reachedInterviewScheduled: false,
    reachedInterviewCompleted: false,
    reachedClient: false,
    reachedRecruit: false,
    lifecycleState: null,
    lastEventId: null,
    lastEventAt: null,
    lastEventType: null
  };
}

function getDailyKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getMonthlyKey(timestamp) {
  return getDailyKey(timestamp).slice(0, 7);
}

function getWeeklyKey(timestamp) {
  const date = new Date(timestamp);
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getPeriodKeys(timestamp) {
  return {
    daily: getDailyKey(timestamp),
    weekly: getWeeklyKey(timestamp),
    monthly: getMonthlyKey(timestamp)
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

function ensureAgentProductivity(metrics, agentId) {
  if (!agentId) {
    return null;
  }

  if (!metrics.agentProductivity[agentId]) {
    metrics.agentProductivity[agentId] = {
      assignments: 0,
      interviewsCompleted: 0,
      leadsCreated: 0
    };
  }

  return metrics.agentProductivity[agentId];
}

function ensureTrendBucket(store, key) {
  if (!store[key]) {
    store[key] = createEmptyTrendBucket();
  }

  return store[key];
}

function ensureKpiBucket(store, key) {
  if (!store[key]) {
    store[key] = createEmptyKpiBucket();
  }

  return store[key];
}

function incrementLeadSource(metrics, sourceType) {
  const key = sourceType || "unknown";
  metrics.leadSourceDistribution[key] = (metrics.leadSourceDistribution[key] || 0) + 1;
}

function markFunnelStage(metrics, prospect, stage) {
  if (!stage || prospect.funnelStagesReached[stage]) {
    return;
  }

  prospect.funnelStagesReached[stage] = true;

  if (metrics.recruitingFunnel[stage] != null) {
    metrics.recruitingFunnel[stage] += 1;
  }
}

function incrementAssignment(metrics, agentId) {
  metrics.assignmentMetrics.totalAssignments += 1;

  if (agentId) {
    metrics.assignmentMetrics.byAgent[agentId] =
      (metrics.assignmentMetrics.byAgent[agentId] || 0) + 1;

    const agent = ensureAgentProductivity(metrics, agentId);

    if (agent) {
      agent.assignments += 1;
    }
  }
}

function incrementInterviewScheduled(metrics, prospect) {
  if (prospect.reachedInterviewScheduled) {
    return;
  }

  prospect.reachedInterviewScheduled = true;
  metrics.interviewCompletion.scheduled += 1;
  metrics.prospectConversion.interviewsScheduled += 1;
}

function incrementInterviewCompleted(metrics, prospect, agentId) {
  if (!prospect.reachedInterviewCompleted) {
    prospect.reachedInterviewCompleted = true;
    metrics.interviewCompletion.completed += 1;
    metrics.prospectConversion.interviewsCompleted += 1;

    const agent = ensureAgentProductivity(metrics, agentId || prospect.assignedAgentId);

    if (agent) {
      agent.interviewsCompleted += 1;
    }
  }
}

function markQualified(metrics, prospect) {
  if (!prospect.reachedQualified) {
    prospect.reachedQualified = true;
    metrics.prospectConversion.qualified += 1;
  }
}

function markClient(metrics, prospect) {
  if (!prospect.reachedClient) {
    prospect.reachedClient = true;
    metrics.prospectConversion.clients += 1;
  }
}

function markRecruit(metrics, prospect) {
  if (!prospect.reachedRecruit) {
    prospect.reachedRecruit = true;
    metrics.prospectConversion.recruits += 1;
  }
}

function recomputeConversionRates(metrics) {
  const conversion = metrics.prospectConversion;
  const leads = conversion.leadsCreated || 0;
  const qualified = conversion.qualified || 0;
  const scheduled = conversion.interviewsScheduled || 0;
  const completed = conversion.interviewsCompleted || 0;

  conversion.rates.leadToQualified = leads > 0 ? Number((qualified / leads).toFixed(4)) : 0;
  conversion.rates.qualifiedToInterview =
    qualified > 0 ? Number((scheduled / qualified).toFixed(4)) : 0;
  conversion.rates.interviewToCompletion =
    scheduled > 0 ? Number((completed / scheduled).toFixed(4)) : 0;

  const scheduledCount = metrics.interviewCompletion.scheduled || 0;
  const completedCount = metrics.interviewCompletion.completed || 0;
  metrics.interviewCompletion.completionRate =
    scheduledCount > 0 ? Number((completedCount / scheduledCount).toFixed(4)) : 0;
}

function incrementTrends(metrics, event, increments) {
  const keys = getPeriodKeys(event.timestamp || new Date().toISOString());

  for (const [period, periodKey] of Object.entries(keys)) {
    const trendBucket = ensureTrendBucket(metrics.productionTrends[period], periodKey);
    const kpiBucket = ensureKpiBucket(metrics.kpis[period], periodKey);

    for (const [field, amount] of Object.entries(increments.trend || {})) {
      trendBucket[field] = (trendBucket[field] || 0) + amount;
    }

    for (const [field, amount] of Object.entries(increments.kpi || {})) {
      kpiBucket[field] = (kpiBucket[field] || 0) + amount;
    }
  }
}

function applyLifecycleTransition(metrics, prospect, lifecycleState) {
  if (!lifecycleState) {
    return;
  }

  prospect.lifecycleState = lifecycleState;
  markFunnelStage(metrics, prospect, lifecycleState);

  if (lifecycleState === LIFECYCLE_STATES.QUALIFIED) {
    markQualified(metrics, prospect);
  }

  if (lifecycleState === LIFECYCLE_STATES.INTERVIEW_SCHEDULED) {
    incrementInterviewScheduled(metrics, prospect);
  }

  if (lifecycleState === LIFECYCLE_STATES.INTERVIEW_COMPLETED) {
    incrementInterviewCompleted(metrics, prospect);
  }

  if (lifecycleState === LIFECYCLE_STATES.CLIENT) {
    markClient(metrics, prospect);
  }

  if (lifecycleState === LIFECYCLE_STATES.RECRUIT) {
    markRecruit(metrics, prospect);
  }
}

function touchOrganization(metrics, event) {
  metrics.organizationSummary.totalEventsProcessed += 1;
  metrics.organizationSummary.lastEventAt = event.timestamp;
  metrics.organizationSummary.lastEventType = event.eventType;
}

function touchProspect(prospect, event) {
  prospect.lastEventId = event.eventId;
  prospect.lastEventAt = event.timestamp;
  prospect.lastEventType = event.eventType;
}

function applyEventToReadModel(readModel, event) {
  const organizationId = event.metadata?.organizationId || readModel.organizationId;
  readModel.organizationId = organizationId;
  readModel.updatedAt = event.timestamp || new Date().toISOString();

  const metrics = readModel.metrics;
  const lifecycleState = resolveLifecycleState(event);
  touchOrganization(metrics, event);

  switch (event.eventType) {
    case LEAD_EVENTS.PROSPECT_CREATED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      const leadSource = event.payload?.leadSource?.sourceType || "unknown";

      prospect.isActive = true;
      prospect.isArchived = false;
      prospect.leadSource = leadSource;
      metrics.prospectConversion.leadsCreated += 1;
      metrics.organizationSummary.totalProspectsEver += 1;
      metrics.organizationSummary.activeProspects += 1;

      incrementLeadSource(metrics, leadSource);
      applyLifecycleTransition(metrics, prospect, lifecycleState || LIFECYCLE_STATES.NEW_LEAD);

      const creatingAgent = event.payload?.createdBy;
      const agent = ensureAgentProductivity(metrics, creatingAgent);

      if (agent) {
        agent.leadsCreated += 1;
      }

      incrementTrends(metrics, event, {
        trend: { newLeads: 1 },
        kpi: { newLeads: 1 }
      });
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
      incrementTrends(metrics, event, {
        trend: { assignments: 1 },
        kpi: { assignments: 1 }
      });
      touchProspect(prospect, event);
      break;
    }

    case LEAD_EVENTS.PROSPECT_ARCHIVED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);

      if (prospect.isActive) {
        prospect.isActive = false;
        metrics.organizationSummary.activeProspects = Math.max(
          0,
          metrics.organizationSummary.activeProspects - 1
        );
      }

      prospect.isArchived = true;
      touchProspect(prospect, event);
      break;
    }

    case LEAD_EVENTS.PROSPECT_RESTORED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);

      if (!prospect.isActive) {
        prospect.isActive = true;
        metrics.organizationSummary.activeProspects += 1;
      }

      prospect.isArchived = false;
      applyLifecycleTransition(metrics, prospect, lifecycleState);
      touchProspect(prospect, event);
      break;
    }

    case LEAD_EVENTS.PROSPECT_MERGED: {
      const mergedId = event.payload?.mergedId;

      if (mergedId) {
        const mergedProspect = ensureProspectState(readModel, mergedId, organizationId);

        if (mergedProspect.isActive) {
          mergedProspect.isActive = false;
          metrics.organizationSummary.activeProspects = Math.max(
            0,
            metrics.organizationSummary.activeProspects - 1
          );
        }

        touchProspect(mergedProspect, event);
      }

      const survivor = ensureProspectState(
        readModel,
        event.payload?.survivorId || event.prospectId,
        organizationId
      );
      touchProspect(survivor, event);
      break;
    }

    case COMMUNICATION_EVENTS.MESSAGE_SENT:
    case COMMUNICATION_EVENTS.CALL_STARTED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      applyLifecycleTransition(
        metrics,
        prospect,
        lifecycleState || LIFECYCLE_STATES.CONTACT_ATTEMPTED
      );
      incrementTrends(metrics, event, {
        trend: { contactAttempts: 1 },
        kpi: { contactAttempts: 1 }
      });
      touchProspect(prospect, event);
      break;
    }

    case APPOINTMENT_EVENTS.APPOINTMENT_CREATED:
    case APPOINTMENT_EVENTS.APPOINTMENT_RESCHEDULED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      incrementInterviewScheduled(metrics, prospect);
      applyLifecycleTransition(
        metrics,
        prospect,
        lifecycleState || LIFECYCLE_STATES.INTERVIEW_SCHEDULED
      );
      incrementTrends(metrics, event, {
        trend: { interviewsScheduled: 1 },
        kpi: { conversionEvents: 1 }
      });
      touchProspect(prospect, event);
      break;
    }

    case APPOINTMENT_EVENTS.INTERVIEW_COMPLETED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      incrementInterviewCompleted(metrics, prospect, event.actor);
      applyLifecycleTransition(
        metrics,
        prospect,
        lifecycleState || LIFECYCLE_STATES.INTERVIEW_COMPLETED
      );
      incrementTrends(metrics, event, {
        trend: { interviewsCompleted: 1 },
        kpi: { interviewsCompleted: 1, conversionEvents: 1 }
      });
      touchProspect(prospect, event);
      break;
    }

    case RECRUITING_EVENTS.RECRUIT_JOINED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      markRecruit(metrics, prospect);
      applyLifecycleTransition(metrics, prospect, lifecycleState || LIFECYCLE_STATES.RECRUIT);
      incrementTrends(metrics, event, {
        trend: { recruits: 1 },
        kpi: { conversionEvents: 1 }
      });
      touchProspect(prospect, event);
      break;
    }

    case SALES_EVENTS.POLICY_ISSUED:
    case SALES_EVENTS.POLICY_DELIVERED: {
      const prospect = ensureProspectState(readModel, event.prospectId, organizationId);
      markClient(metrics, prospect);
      applyLifecycleTransition(metrics, prospect, lifecycleState || LIFECYCLE_STATES.CLIENT);
      incrementTrends(metrics, event, {
        trend: { clients: 1 },
        kpi: { conversionEvents: 1 }
      });
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

  recomputeConversionRates(metrics);
  return readModel;
}

module.exports = {
  FUNNEL_STAGES,
  createEmptyMetrics,
  createEmptyProspectState,
  createEmptyTrendBucket,
  createEmptyKpiBucket,
  applyEventToReadModel,
  getDailyKey,
  getWeeklyKey,
  getMonthlyKey,
  recomputeConversionRates
};
