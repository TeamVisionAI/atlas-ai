#!/usr/bin/env node
/**
 * Sprint 15.4 — Validate Atlas RC1 demo environment.
 */

require("dotenv").config();

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { METRIC_KEYS } = require("../../modules/mission-control/domain/MissionControlMetrics");
const { createEnvironmentModules } = require("./environmentModules");
const { assertSafeEnvironment, assertAtlasCoreTablesReady } = require("./databaseReset");
const { MANIFEST_PATH } = require("./seedRC1");

const VERIFY_SCRIPTS = [
  "verifyProspectEngine.js",
  "verifyBusinessEventEngine.js",
  "verifyTimelineEngine.js",
  "verifyProjectionFramework.js",
  "verifyMissionControlProjection.js",
  "verifyExecutiveDashboardProjection.js"
];

function runVerifyScript(scriptName) {
  const scriptPath = path.join(__dirname, "..", scriptName);
  console.log(`Running ${scriptName}...`);

  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${scriptName} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `RC1 manifest not found at ${MANIFEST_PATH}. Run node backend/dev/environment/seedRC1.js --confirm first.`
    );
  }

  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

async function verifyRc1Data(manifest) {
  const modules = await createEnvironmentModules({ startProjections: false });
  const { prospectModule, timelineModule, missionControlModule, executiveDashboardModule } =
    modules;

  const listed = await prospectModule.service.listProspects({ limit: 50 });

  assert.strictEqual(listed.total, manifest.expected.prospectCount, "RC1 prospect count");
  assert.strictEqual(listed.items.length, manifest.expected.prospectCount, "RC1 prospect list length");

  for (const expected of manifest.prospects) {
    const match = listed.items.find((item) => item.prospectId === expected.prospectId);
    assert(match, `Missing seeded prospect ${expected.displayName}`);
    assert.strictEqual(match.identity.displayName, expected.displayName, "display name");

    const timeline = await timelineModule.service.getByProspect(expected.prospectId, { limit: 50 });
    assert(timeline.items.length >= 2, `${expected.displayName} timeline entries`);

    for (const summary of expected.timelineSummaries) {
      const hasSummary = timeline.items.some(
        (entry) =>
          String(entry.summary || "").toLowerCase().includes(summary.toLowerCase()) ||
          String(entry.eventType || "")
            .toLowerCase()
            .includes(summary.toLowerCase().replace(/\s+/g, "_"))
      );

      assert(hasSummary, `${expected.displayName} missing timeline summary "${summary}"`);
    }

    const events = await modules.businessEventModule.service.listByProspect(expected.prospectId, {
      limit: 50
    });

    assert(events.items.length >= 2, `${expected.displayName} business events`);
  }

  const metrics = await missionControlModule.service.getMetrics();

  assert.strictEqual(
    metrics[METRIC_KEYS.ACTIVE_PROSPECTS],
    manifest.expected.activeProspects,
    "Mission Control active prospects"
  );
  assert.strictEqual(
    metrics[METRIC_KEYS.NEW_LEADS],
    manifest.expected.newLeads,
    "Mission Control new leads"
  );
  assert.strictEqual(
    metrics[METRIC_KEYS.CONTACT_ATTEMPTS],
    manifest.expected.contactAttempts,
    "Mission Control contact attempts"
  );
  assert.strictEqual(
    metrics[METRIC_KEYS.QUALIFIED_PROSPECTS],
    manifest.expected.qualifiedProspects,
    "Mission Control qualified prospects"
  );
  assert.strictEqual(
    metrics[METRIC_KEYS.SCHEDULED_INTERVIEWS],
    manifest.expected.scheduledInterviews,
    "Mission Control scheduled interviews"
  );
  assert.strictEqual(
    metrics[METRIC_KEYS.COMPLETED_INTERVIEWS],
    manifest.expected.completedInterviews,
    "Mission Control completed interviews"
  );
  assert.strictEqual(
    metrics[METRIC_KEYS.ARCHIVED_PROSPECTS],
    manifest.expected.archivedProspects,
    "Mission Control archived prospects"
  );

  const executive = await executiveDashboardModule.service.getReadModel();
  const conversion = executive.metrics.prospectConversion;

  assert.strictEqual(conversion.leadsCreated, 3, "Executive Dashboard leads created");
  assert(conversion.interviewsScheduled >= 2, "Executive Dashboard interviews scheduled");
  assert(conversion.interviewsCompleted >= 1, "Executive Dashboard interviews completed");

  const kpis = await executiveDashboardModule.service.getKpis();
  assert(kpis.kpis, "Executive Dashboard KPI buckets");
  assert(
    executive.metrics.organizationSummary.totalProspectsEver >= 3,
    "Executive Dashboard total prospects"
  );

  const summary = await missionControlModule.service.getSummary();
  assert(summary.activeProspectCount === manifest.expected.activeProspects, "Mission Control summary active count");

  console.log("RC1 data verification passed.");
  console.log(`  Prospects: ${listed.total}`);
  console.log(`  Active prospects: ${metrics[METRIC_KEYS.ACTIVE_PROSPECTS]}`);
  console.log(`  Timeline entries checked for ${manifest.prospects.length} prospects`);
  console.log(`  Executive leads created: ${conversion.leadsCreated}`);
}

async function verifyWorkspaceApis(manifest) {
  const modules = await createEnvironmentModules({ startProjections: false });

  for (const expected of manifest.prospects) {
    const prospect = await modules.prospectModule.service.getProspect(expected.prospectId);
    assert(prospect.prospectId === expected.prospectId, "workspace prospect read");

    const timeline = await modules.timelineModule.service.getByProspect(expected.prospectId, {
      limit: 25
    });

    assert(timeline.items.length > 0, "workspace timeline read");
  }

  await modules.missionControlModule.service.getMetrics();
  await modules.executiveDashboardModule.service.getSummary();
  await modules.executiveDashboardModule.service.getKpis();
  await modules.executiveDashboardModule.service.getTrends();

  console.log("Workspace-equivalent read APIs verified.");
}

async function verifyRC1({ skipUnitVerifies = false } = {}) {
  assertSafeEnvironment();
  await assertAtlasCoreTablesReady();

  if (!skipUnitVerifies) {
    console.log("Sprint 15.4 — RC1 verification\n");

    for (const script of VERIFY_SCRIPTS) {
      runVerifyScript(script);
    }

    console.log("");
  }

  const manifest = loadManifest();
  await verifyRc1Data(manifest);
  await verifyWorkspaceApis(manifest);

  console.log("");
  console.log("====================================");
  console.log("");
  console.log("ATLAS RC1 CERTIFIED");
  console.log("");
  console.log("====================================");
}

async function main() {
  const skipUnitVerifies = process.argv.includes("--rc1-only");

  await verifyRC1({ skipUnitVerifies });
}

if (require.main === module) {
  main().catch((error) => {
    console.error("verifyRC1 failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  verifyRC1
};
