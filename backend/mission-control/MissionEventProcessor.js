/**
 * Release 1.4 — Incremental event processing for Mission State.
 */

const { GatewayEvent } = require("../gateway/GatewayEvents");
const { AgentEvent } = require("../agent/AgentEvents");
const { SessionEvent } = require("../agent/runtime/SessionEvents");
const { WorkflowIntelligenceEvent } = require("../workflows/intelligence/WorkflowEvents");
const { ToolEvent } = require("../agent/tools/ToolEvents");
const { PackageEvent } = require("../packages/teamvision/PackageEvents");
const { OrganizationEvent } = require("../organizations/OrganizationEvents");
const { BriefEvent } = require("../intelligence/BriefEvents");
const { ConnectorEvent } = require("../connectors/shared/ConnectorEvents");
const { AppointmentEvent } = require("../appointments/AppointmentEvents");
const { MeetingEvent } = require("../meetings/MeetingEvents");
const { ProspectEvent } = require("../prospects/prospectEvents");
const {
  touchState,
  upsertConversation,
  closeConversation,
  upsertWorkflow,
  completeWorkflow,
  setConnectorStatus,
  trackPackageActivity,
  recordResponseSample
} = require("./MissionState");
const { buildTimelineEntry } = require("./MissionTimeline");

function organizationIdFromPayload(payload) {
  return payload.organizationId || payload.organization?.id || "default";
}

/**
 * @param {Object} state
 * @param {string} eventName
 * @param {Object} payload
 * @returns {{ state: Object, timelineEntry: Object|null, sideEffects: Object }}
 */
function processMissionEvent(state, eventName, payload = {}) {
  touchState(state, eventName);
  let timelineEntry = null;
  const sideEffects = {
    incrementConversationVolume: false,
    incrementWorkflowVolume: false,
    incrementConnectorEvents: false,
    incrementPackageEvents: false,
    responseLatencyMs: null
  };

  switch (eventName) {
    case GatewayEvent.MESSAGE_RECEIVED:
    case AgentEvent.MESSAGE_RECEIVED:
      upsertConversation(state, payload.conversationId || payload.conversation?.id || `conv-${Date.now()}`, {
        channel: payload.channel || payload.conversation?.channel,
        prospectName: payload.prospectName || payload.prospect?.displayName,
        status: "active",
        waiting: false
      });
      sideEffects.incrementConversationVolume = true;
      timelineEntry = buildTimelineEntry({
        type: "conversation.started",
        summary: "Conversation activity received",
        organizationId: organizationIdFromPayload(payload),
        conversationId: payload.conversationId || payload.conversation?.id,
        metadata: payload
      });
      break;

    case GatewayEvent.MESSAGE_SENT:
    case AgentEvent.RESPONSE_GENERATED:
      if (payload.responseLatencyMs) {
        recordResponseSample(state, payload.responseLatencyMs);
        sideEffects.responseLatencyMs = payload.responseLatencyMs;
      }

      state.agentStatus = {
        available: true,
        lastActivityAt: new Date().toISOString()
      };
      timelineEntry = buildTimelineEntry({
        type: "conversation.updated",
        summary: "Agent response generated",
        organizationId: organizationIdFromPayload(payload),
        conversationId: payload.conversationId
      });
      break;

    case SessionEvent.STARTED:
      upsertConversation(state, payload.conversationId || payload.sessionId, {
        status: "active",
        workflowName: payload.workflowName
      });
      timelineEntry = buildTimelineEntry({
        type: "conversation.started",
        summary: "Conversation started",
        organizationId: organizationIdFromPayload(payload),
        conversationId: payload.conversationId || payload.sessionId
      });
      break;

    case SessionEvent.COMPLETED:
    case SessionEvent.CLOSED:
      closeConversation(state, payload.conversationId || payload.sessionId);
      timelineEntry = buildTimelineEntry({
        type: "conversation.completed",
        summary: "Conversation completed",
        organizationId: organizationIdFromPayload(payload),
        conversationId: payload.conversationId || payload.sessionId
      });
      break;

    case WorkflowIntelligenceEvent.STATE_UPDATED:
      upsertWorkflow(state, payload.workflowId || payload.conversationId || `wf-${Date.now()}`, {
        workflowName: payload.workflowName,
        step: payload.step,
        status: "running"
      });
      sideEffects.incrementWorkflowVolume = true;
      timelineEntry = buildTimelineEntry({
        type: "workflow.updated",
        summary: "Workflow state updated",
        organizationId: organizationIdFromPayload(payload),
        workflowId: payload.workflowId
      });
      break;

    case WorkflowIntelligenceEvent.STEP_COMPLETED:
      upsertWorkflow(state, payload.workflowId || payload.conversationId, {
        step: payload.step,
        status: "running"
      });
      sideEffects.incrementWorkflowVolume = true;
      timelineEntry = buildTimelineEntry({
        type: "workflow.step.completed",
        summary: "Workflow step completed",
        organizationId: organizationIdFromPayload(payload),
        workflowId: payload.workflowId
      });
      break;

    case WorkflowIntelligenceEvent.READY:
      completeWorkflow(state, payload.workflowId || payload.conversationId);
      timelineEntry = buildTimelineEntry({
        type: "workflow.completed",
        summary: "Workflow ready",
        organizationId: organizationIdFromPayload(payload),
        workflowId: payload.workflowId
      });
      break;

    case ToolEvent.FAILED:
      state.workflowFailures += 1;
      state.pendingTasks += 1;
      timelineEntry = buildTimelineEntry({
        type: "workflow.failed",
        summary: "Tool execution failed",
        organizationId: organizationIdFromPayload(payload),
        metadata: payload
      });
      break;

    case AppointmentEvent.SCHEDULED:
      state.appointmentsToday += 1;
      timelineEntry = buildTimelineEntry({
        type: "interview.scheduled",
        summary: "Interview scheduled",
        organizationId: organizationIdFromPayload(payload),
        metadata: payload
      });
      break;

    case MeetingEvent.CREATED:
      state.meetingsToday.scheduled += 1;
      timelineEntry = buildTimelineEntry({
        type: "meeting.created",
        summary: "Meeting created",
        organizationId: organizationIdFromPayload(payload),
        metadata: payload
      });
      break;

    case MeetingEvent.READY:
      state.meetingsToday.running += 1;
      timelineEntry = buildTimelineEntry({
        type: "meeting.running",
        summary: "Meeting ready",
        organizationId: organizationIdFromPayload(payload),
        metadata: payload
      });
      break;

    case PackageEvent.FOLLOWUP_STARTED:
      state.pendingFollowUps += 1;
      trackPackageActivity(state, "teamvision-recruiting", eventName);
      sideEffects.incrementPackageEvents = true;
      timelineEntry = buildTimelineEntry({
        type: "followup.started",
        summary: "Follow-up started",
        organizationId: organizationIdFromPayload(payload)
      });
      break;

    case PackageEvent.FOLLOWUP_COMPLETED:
      state.pendingFollowUps = Math.max(0, state.pendingFollowUps - 1);
      trackPackageActivity(state, "teamvision-recruiting", eventName);
      sideEffects.incrementPackageEvents = true;
      timelineEntry = buildTimelineEntry({
        type: "followup.completed",
        summary: "Follow-up completed",
        organizationId: organizationIdFromPayload(payload)
      });
      break;

    case PackageEvent.LICENSE_STARTED:
      state.licensingPipeline.started += 1;
      trackPackageActivity(state, "teamvision-recruiting", eventName);
      sideEffects.incrementPackageEvents = true;
      timelineEntry = buildTimelineEntry({
        type: "license.started",
        summary: "Licensing started",
        organizationId: organizationIdFromPayload(payload)
      });
      break;

    case PackageEvent.LICENSE_COMPLETED:
      state.licensingPipeline.completed += 1;
      trackPackageActivity(state, "teamvision-recruiting", eventName);
      sideEffects.incrementPackageEvents = true;
      timelineEntry = buildTimelineEntry({
        type: "license.completed",
        summary: "License completed",
        organizationId: organizationIdFromPayload(payload)
      });
      break;

    case PackageEvent.ORIENTATION_COMPLETED:
      state.orientationPipeline.completed += 1;
      trackPackageActivity(state, "teamvision-recruiting", eventName);
      sideEffects.incrementPackageEvents = true;
      timelineEntry = buildTimelineEntry({
        type: "orientation.completed",
        summary: "Orientation completed",
        organizationId: organizationIdFromPayload(payload)
      });
      break;

    case PackageEvent.FASTSTART_COMPLETED:
      state.fastStartProgress.completed += 1;
      trackPackageActivity(state, "teamvision-recruiting", eventName);
      sideEffects.incrementPackageEvents = true;
      timelineEntry = buildTimelineEntry({
        type: "faststart.completed",
        summary: "Fast Start milestone completed",
        organizationId: organizationIdFromPayload(payload)
      });
      break;

    case OrganizationEvent.PACKAGE_INSTALLED:
      state.packages.push({
        packageId: payload.packageId,
        installedAt: new Date().toISOString()
      });
      timelineEntry = buildTimelineEntry({
        type: "package.installed",
        summary: "Package installed",
        organizationId: organizationIdFromPayload(payload),
        metadata: payload
      });
      break;

    case OrganizationEvent.USER_CREATED:
      state.activeUsers.push({
        userId: payload.user?.id || payload.userId,
        name: payload.user?.name,
        role: payload.user?.role
      });
      timelineEntry = buildTimelineEntry({
        type: "organization.user.created",
        summary: "Organization user created",
        organizationId: organizationIdFromPayload(payload),
        metadata: payload
      });
      break;

    case BriefEvent.GENERATED:
      timelineEntry = buildTimelineEntry({
        type: "brief.generated",
        summary: "Daily Brief generated",
        organizationId: organizationIdFromPayload(payload),
        metadata: payload
      });
      break;

    case ConnectorEvent.CONNECTED:
      setConnectorStatus(state, payload.connectorId, {
        health: "connected",
        available: true
      });
      sideEffects.incrementConnectorEvents = true;
      timelineEntry = buildTimelineEntry({
        type: "connector.connected",
        summary: `Connector ${payload.connectorId} connected`,
        organizationId: organizationIdFromPayload(payload),
        connectorId: payload.connectorId
      });
      break;

    case ConnectorEvent.DISCONNECTED:
    case ConnectorEvent.FAILED:
      setConnectorStatus(state, payload.connectorId, {
        health: "unavailable",
        available: false
      });
      sideEffects.incrementConnectorEvents = true;
      timelineEntry = buildTimelineEntry({
        type: "connector.disconnected",
        summary: `Connector ${payload.connectorId} disconnected`,
        organizationId: organizationIdFromPayload(payload),
        connectorId: payload.connectorId
      });
      break;

    case ConnectorEvent.HEALTH_CHANGED:
      setConnectorStatus(state, payload.connectorId, {
        health: payload.health || "unknown",
        available: payload.health === "connected" || payload.health === "healthy"
      });
      sideEffects.incrementConnectorEvents = true;
      timelineEntry = buildTimelineEntry({
        type: "connector.health.changed",
        summary: `Connector ${payload.connectorId} health changed`,
        organizationId: organizationIdFromPayload(payload),
        connectorId: payload.connectorId,
        metadata: payload
      });
      break;

    case ProspectEvent.CREATED:
      timelineEntry = buildTimelineEntry({
        type: "prospect.created",
        summary: "New prospect created",
        organizationId: organizationIdFromPayload(payload),
        metadata: payload
      });
      break;

    default:
      break;
  }

  return { state, timelineEntry, sideEffects };
}

function getSubscribedEvents() {
  return [
    GatewayEvent.MESSAGE_RECEIVED,
    GatewayEvent.MESSAGE_SENT,
    AgentEvent.MESSAGE_RECEIVED,
    AgentEvent.RESPONSE_GENERATED,
    SessionEvent.STARTED,
    SessionEvent.COMPLETED,
    SessionEvent.CLOSED,
    WorkflowIntelligenceEvent.STATE_UPDATED,
    WorkflowIntelligenceEvent.STEP_COMPLETED,
    WorkflowIntelligenceEvent.READY,
    ToolEvent.FAILED,
    AppointmentEvent.SCHEDULED,
    MeetingEvent.CREATED,
    MeetingEvent.READY,
    PackageEvent.FOLLOWUP_STARTED,
    PackageEvent.FOLLOWUP_COMPLETED,
    PackageEvent.LICENSE_STARTED,
    PackageEvent.LICENSE_COMPLETED,
    PackageEvent.ORIENTATION_COMPLETED,
    PackageEvent.FASTSTART_COMPLETED,
    OrganizationEvent.PACKAGE_INSTALLED,
    OrganizationEvent.USER_CREATED,
    BriefEvent.GENERATED,
    ConnectorEvent.CONNECTED,
    ConnectorEvent.DISCONNECTED,
    ConnectorEvent.FAILED,
    ConnectorEvent.HEALTH_CHANGED,
    ProspectEvent.CREATED
  ];
}

module.exports = {
  processMissionEvent,
  getSubscribedEvents,
  organizationIdFromPayload
};
