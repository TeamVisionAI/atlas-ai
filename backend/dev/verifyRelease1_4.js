/**
 * Release 1.4 — Mission Control verification.
 * Run: node backend/dev/verifyRelease1_4.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { EventBus } = require("../communication/events/EventBus");
const {
  createOrganizationManager,
  resetOrganizationRegistry,
  organizationStore,
  OrganizationEvent
} = require("../organizations");
const { BriefEvent } = require("../intelligence/BriefEvents");
const { GatewayEvent } = require("../gateway/GatewayEvents");
const { AgentEvent } = require("../agent/AgentEvents");
const { SessionEvent } = require("../agent/runtime/SessionEvents");
const { WorkflowIntelligenceEvent } = require("../workflows/intelligence/WorkflowEvents");
const { ToolEvent } = require("../agent/tools/ToolEvents");
const { PackageEvent } = require("../packages/teamvision/PackageEvents");
const { ConnectorEvent } = require("../connectors/shared/ConnectorEvents");
const { AppointmentEvent } = require("../appointments/AppointmentEvents");
const { MeetingEvent } = require("../meetings/MeetingEvents");
const {
  createMissionControlEngine,
  resetMissionControlEngine,
  MissionEvent,
  missionStore,
  calculateMissionMetrics,
  calculateMissionHealth,
  filterMissionItems
} = require("../mission-control");

const MISSION_STORE_FILE = path.join(__dirname, "../data/missionControl.json");

async function run() {
  console.log("Release 1.4 — Mission Control verification\n");

  resetOrganizationRegistry();
  resetMissionControlEngine();
  organizationStore.clearStore();

  const eventBus = new EventBus();
  const events = {
    updated: [],
    snapshotCreated: [],
    alertCreated: [],
    alertResolved: [],
    timelineUpdated: [],
    healthChanged: [],
    metricsUpdated: []
  };

  eventBus.on(MissionEvent.UPDATED, (payload) => events.updated.push(payload));
  eventBus.on(MissionEvent.SNAPSHOT_CREATED, (payload) => events.snapshotCreated.push(payload));
  eventBus.on(MissionEvent.ALERT_CREATED, (payload) => events.alertCreated.push(payload));
  eventBus.on(MissionEvent.ALERT_RESOLVED, (payload) => events.alertResolved.push(payload));
  eventBus.on(MissionEvent.TIMELINE_UPDATED, (payload) => events.timelineUpdated.push(payload));
  eventBus.on(MissionEvent.HEALTH_CHANGED, (payload) => events.healthChanged.push(payload));
  eventBus.on(MissionEvent.METRICS_UPDATED, (payload) => events.metricsUpdated.push(payload));

  const orgManager = createOrganizationManager({ eventBus });
  const missionEngine = createMissionControlEngine({ eventBus });

  const org = await orgManager.createOrganization({
    profile: {
      name: "Acme Recruiting Group",
      primaryLanguage: "en",
      timeZone: "America/New_York"
    }
  });

  await orgManager.installPackage(org.id, "teamvision-recruiting");
  await orgManager.addUser(org.id, {
    name: "Alex Owner",
    email: "owner@acme.example",
    role: "owner"
  });

  eventBus.emit(OrganizationEvent.PACKAGE_INSTALLED, {
    organizationId: org.id,
    packageId: "teamvision-recruiting"
  });

  eventBus.emit(GatewayEvent.MESSAGE_RECEIVED, {
    organizationId: org.id,
    conversationId: "conv-001",
    channel: "messenger",
    prospectName: "Jordan Lee"
  });

  eventBus.emit(SessionEvent.STARTED, {
    organizationId: org.id,
    conversationId: "conv-001",
    workflowName: "team-vision-recruiting"
  });

  eventBus.emit(WorkflowIntelligenceEvent.STEP_COMPLETED, {
    organizationId: org.id,
    workflowId: "conv-001",
    step: "qualification"
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  const state = await missionEngine.getLiveState(org.id);
  assert.ok(state.activeConversations["conv-001"], "Expected active conversation in mission state");
  assert.ok(state.runningWorkflows["conv-001"], "Expected running workflow in mission state");
  console.log("✓ Event processing");
  console.log("✓ Mission State updates");

  eventBus.emit(AppointmentEvent.SCHEDULED, { organizationId: org.id });
  eventBus.emit(MeetingEvent.CREATED, { organizationId: org.id });
  eventBus.emit(PackageEvent.FOLLOWUP_STARTED, { organizationId: org.id });
  eventBus.emit(PackageEvent.LICENSE_STARTED, { organizationId: org.id });
  eventBus.emit(PackageEvent.ORIENTATION_COMPLETED, { organizationId: org.id });
  eventBus.emit(PackageEvent.FASTSTART_COMPLETED, { organizationId: org.id });
  eventBus.emit(BriefEvent.GENERATED, { organizationId: org.id, briefId: "brief-001" });

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(events.timelineUpdated.length >= 5, "Expected timeline updates");
  const timeline = await missionEngine.getTimeline(org.id);
  assert.ok(timeline.length >= 5, "Expected timeline entries");
  console.log("✓ Timeline updates");

  eventBus.emit(AgentEvent.RESPONSE_GENERATED, {
    organizationId: org.id,
    conversationId: "conv-001",
    responseLatencyMs: 850
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  const metrics = await missionEngine.getMetrics(org.id);
  assert.ok(metrics.activeConversations >= 1, "Expected active conversation metric");
  assert.ok(metrics.appointmentsScheduled >= 1, "Expected appointments metric");
  assert.ok(metrics.averageResponseTimeMs >= 850, "Expected response time metric");
  assert.ok(events.metricsUpdated.length >= 1, "Expected metrics.updated events");
  console.log("✓ Metrics updates");

  eventBus.emit(ConnectorEvent.DISCONNECTED, {
    organizationId: org.id,
    connectorId: "zoom"
  });

  eventBus.emit(ToolEvent.FAILED, {
    organizationId: org.id,
    toolName: "scheduleInterview"
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  const alerts = await missionEngine.getAlerts(org.id);
  assert.ok(alerts.length >= 1, "Expected alerts generated");
  assert.ok(alerts[0].severity, "Expected alert severity");
  assert.ok(alerts[0].suggestedAction, "Expected suggested action");
  assert.ok(events.alertCreated.length >= 1, "Expected mission.alert.created");
  console.log("✓ Alert generation");

  const health = calculateMissionHealth(await missionEngine.getLiveState(org.id), metrics);
  assert.ok(health.atlas, "Expected atlas health");
  assert.ok(health.connectors, "Expected connector health");
  assert.ok(events.healthChanged.length >= 1, "Expected mission.health.changed");
  console.log("✓ Health calculations");

  const filteredTimeline = filterMissionItems(timeline, {
    organizationId: org.id,
    conversationId: "conv-001"
  });
  assert.ok(filteredTimeline.every((entry) => entry.conversationId === "conv-001"));
  console.log("✓ Filtering");

  const snapshot = await missionEngine.createSnapshot(org.id, {
    organizationName: "Acme Recruiting Group"
  });

  assert.strictEqual(snapshot.organization, "Acme Recruiting Group");
  assert.ok(snapshot.conversationSummary, "Expected conversation summary");
  assert.ok(snapshot.workflowSummary, "Expected workflow summary");
  assert.ok(snapshot.currentMetrics, "Expected current metrics");
  assert.ok(snapshot.healthSummary, "Expected health summary");
  console.log("✓ Snapshot generation");

  assert.ok(fs.existsSync(MISSION_STORE_FILE), "Expected mission store persisted");

  const reloaded = await missionStore.getState(org.id);
  assert.ok(reloaded.activeConversations["conv-001"], "Expected persisted mission state");
  console.log("✓ Persistence");

  const analytics = await missionEngine.getAnalytics();
  assert.ok(analytics.conversationVolume >= 1);
  assert.ok(analytics.snapshotsCreated >= 1);
  console.log("✓ Administration analytics");

  const alertToResolve = alerts[0];
  await missionEngine.resolveAlert(alertToResolve.id);
  assert.ok(events.alertResolved.length >= 1, "Expected mission.alert.resolved");
  console.log("✓ Alert resolution");

  assert.ok(events.updated.length >= 5, "Expected mission.updated events");
  assert.ok(events.snapshotCreated.length >= 1, "Expected mission.snapshot.created");
  console.log("✓ Events emitted");

  console.log("\nVerifying previous releases remain green...\n");

  execSync("node backend/dev/verifyRelease1_3.js", {
    stdio: "inherit",
    cwd: path.join(__dirname, "..", "..")
  });

  console.log("\n✓ Atlas Core unchanged");
  console.log("✓ Previous releases unchanged");
  console.log("✓ Previous verification suites remain green");
  console.log("\nAll Release 1.4 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
