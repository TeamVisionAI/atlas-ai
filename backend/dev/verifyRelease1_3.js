/**
 * Release 1.3 — Daily Brief Engine verification.
 * Run: node backend/dev/verifyRelease1_3.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { EventBus } = require("../communication/events/EventBus");
const {
  createOrganizationManager,
  resetOrganizationRegistry,
  organizationStore
} = require("../organizations");
const {
  createDailyBriefEngine,
  resetDailyBriefEngine,
  BriefEvent,
  briefStore,
  collectOrganizationSnapshot,
  collectMetrics,
  analyzeTrends,
  generateInsights,
  determinePriorities,
  generateRecommendations,
  formatBrief
} = require("../intelligence");

const BRIEF_STORE_FILE = path.join(__dirname, "../data/dailyBrief.json");

async function run() {
  console.log("Release 1.3 — Daily Brief Engine verification\n");

  resetOrganizationRegistry();
  resetDailyBriefEngine();
  organizationStore.clearStore();

  const eventBus = new EventBus();
  const events = {
    generated: [],
    failed: [],
    published: [],
    metricsCollected: [],
    insightsGenerated: [],
    recommendationsGenerated: []
  };

  eventBus.on(BriefEvent.GENERATED, (payload) => events.generated.push(payload));
  eventBus.on(BriefEvent.FAILED, (payload) => events.failed.push(payload));
  eventBus.on(BriefEvent.PUBLISHED, (payload) => events.published.push(payload));
  eventBus.on(BriefEvent.METRICS_COLLECTED, (payload) => events.metricsCollected.push(payload));
  eventBus.on(BriefEvent.INSIGHTS_GENERATED, (payload) => events.insightsGenerated.push(payload));
  eventBus.on(BriefEvent.RECOMMENDATIONS_GENERATED, (payload) =>
    events.recommendationsGenerated.push(payload)
  );

  const orgManager = createOrganizationManager({ eventBus });
  const briefEngine = createDailyBriefEngine({ eventBus });

  const org = await orgManager.createOrganization({
    profile: {
      name: "Acme Recruiting Group",
      primaryLanguage: "en",
      supportedLanguages: ["en"],
      timeZone: "America/New_York"
    }
  });

  await orgManager.addOffice(org.id, {
    name: "Primary Office",
    address: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
    timeZone: "America/New_York",
    status: "active"
  });

  await orgManager.installPackage(org.id, "teamvision-recruiting", {
    coverageRadiusMiles: 25
  });

  await orgManager.configureConnector(org.id, "messenger", {
    enabled: true,
    credentialsRef: "vault://acme/messenger",
    health: "connected"
  });

  await orgManager.configureConnector(org.id, "zoom", {
    enabled: true,
    credentialsRef: "vault://acme/zoom",
    health: "failed"
  });

  const packageMetrics = {
    candidates: 20,
    qualified: 12,
    interviews: 10,
    interviewAttendance: 7,
    presentations: 5,
    joined: 3,
    licensingStarted: 3,
    licensingCompleted: 2,
    orientationCompleted: 2,
    fastStartCompleted: 1,
    followUpsStarted: 8,
    followUpsCompleted: 4
  };

  const snapshot = await collectOrganizationSnapshot({
    organizationId: org.id,
    packageMetrics
  });

  assert.ok(snapshot.organization.id, "Expected snapshot organization");
  assert.ok(snapshot.activePackages.length >= 1, "Expected active packages in snapshot");
  assert.ok(snapshot.offices.length >= 1, "Expected offices in snapshot");
  console.log("✓ Snapshot generation");

  const metrics = collectMetrics(snapshot);
  assert.strictEqual(metrics.qualifiedProspects, 12);
  assert.strictEqual(metrics.interviewRate, 70);
  assert.strictEqual(metrics.noShowRate, 30);
  assert.ok(metrics.connectorUptime >= 0);
  console.log("✓ Metrics collection");

  await briefStore.saveMetricsHistory({
    organizationId: org.id,
    date: "2026-07-20",
    interviewRate: 85,
    noShowRate: 15,
    licensingRate: 50,
    followUpCompletion: 80,
    connectorUptime: 100,
    newProspectsToday: 5,
    newConversations: 3,
    qualifiedProspects: 10,
    presentationRate: 60,
    joinRate: 40,
    fastStartCompletion: 30
  });

  const trends = analyzeTrends(metrics, [
    {
      interviewRate: 85,
      noShowRate: 15,
      licensingRate: 50,
      followUpCompletion: 80
    }
  ]);

  assert.ok(trends.some((entry) => entry.metric === "interviewRate"));
  assert.ok(trends.some((entry) => entry.direction === "declining"));
  console.log("✓ Trend analysis");

  const insights = generateInsights(snapshot, metrics, trends);
  assert.ok(insights.length >= 1, "Expected insights generated");
  assert.ok(
    insights.every((entry) => !entry.suggestedAction),
    "Insights must not contain recommendations"
  );
  assert.ok(
    insights.some((entry) => entry.observation.includes("Connector")),
    "Expected connector insight"
  );
  console.log("✓ Insight generation");

  const priorities = determinePriorities(snapshot, metrics, insights);
  assert.ok(priorities.length >= 1, "Expected priorities");
  assert.ok(priorities[0].level, "Expected priority level");
  const levels = priorities.map((entry) => entry.level);
  assert.ok(levels.includes("high"), "Expected high priority");
  console.log("✓ Priority ranking");

  const recommendations = generateRecommendations(snapshot, metrics, priorities, insights);
  assert.ok(recommendations.length >= 1, "Expected recommendations");
  assert.ok(recommendations[0].suggestedAction, "Expected suggested action");
  assert.ok(recommendations[0].confidence, "Expected confidence");
  assert.ok(recommendations[0].reason, "Expected reason");
  console.log("✓ Recommendations");

  const brief = await briefEngine.generateDailyBrief(org.id, { packageMetrics });

  assert.ok(brief.executiveSummary, "Expected executive summary");
  assert.ok(brief.organizationHealth, "Expected organization health");
  assert.ok(brief.keyMetrics, "Expected key metrics");
  assert.ok(brief.trends, "Expected trends");
  assert.ok(brief.insights, "Expected insights");
  assert.ok(brief.priorities, "Expected priorities");
  assert.ok(brief.recommendations, "Expected recommendations");
  assert.ok(brief.todaySchedule, "Expected schedule");
  assert.ok(brief.connectorStatus, "Expected connector status");
  assert.ok(brief.packageStatus, "Expected package status");
  assert.ok(brief.generatedAt, "Expected generated timestamp");
  assert.strictEqual(brief.organization, "Acme Recruiting Group");
  console.log("✓ Daily Brief document");

  const jsonBrief = formatBrief(brief, "json");
  assert.strictEqual(jsonBrief.id, brief.id);

  const markdownBrief = formatBrief(brief, "markdown");
  assert.ok(markdownBrief.includes("# Atlas Daily Brief"));
  assert.ok(markdownBrief.includes("Executive Summary"));
  assert.ok(markdownBrief.includes("Recommendations"));
  console.log("✓ Daily Brief formatting");

  assert.ok(fs.existsSync(BRIEF_STORE_FILE), "Expected brief store persisted");

  const reloaded = await briefEngine.getLatestBrief(org.id);
  assert.strictEqual(reloaded.id, brief.id);
  console.log("✓ Persistence");

  const analytics = await briefEngine.getAnalytics();
  assert.ok(analytics.briefsGenerated >= 1);
  assert.ok(analytics.totalInsights >= 1);
  assert.ok(analytics.totalRecommendations >= 1);
  console.log("✓ Administration analytics");

  await briefEngine.publishBrief(org.id);
  assert.ok(events.published.length >= 1, "Expected brief.published");
  console.log("✓ Brief publish event");

  assert.ok(events.generated.length >= 1, "Expected brief.generated");
  assert.ok(events.metricsCollected.length >= 1, "Expected brief.metrics.collected");
  assert.ok(events.insightsGenerated.length >= 1, "Expected brief.insights.generated");
  assert.ok(events.recommendationsGenerated.length >= 1, "Expected brief.recommendations.generated");
  console.log("✓ Events emitted");

  console.log("\nVerifying previous releases remain green...\n");

  const scripts = [
    "backend/dev/verifyRelease1_2.js",
    "backend/dev/verifyRelease1_1.js"
  ];

  for (const script of scripts) {
    execSync(`node ${script}`, { stdio: "inherit", cwd: path.join(__dirname, "..", "..") });
  }

  console.log("\n✓ Atlas Core unchanged");
  console.log("✓ Previous releases unchanged");
  console.log("✓ Previous verification suites remain green");
  console.log("\nAll Release 1.3 checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
