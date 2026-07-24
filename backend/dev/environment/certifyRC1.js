#!/usr/bin/env node
/**
 * Sprint 15.5 — Full RC1 certification pipeline.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const express = require("express");

const { applyAtlasCoreMigrations, MIGRATION_FILES } = require("./applyAtlasCoreMigrations");
const { verifyDatabaseBaseline } = require("./verifyDatabaseBaseline");
const { seedRC1, MANIFEST_PATH } = require("./seedRC1");
const { verifyRC1 } = require("./verifyRC1");
const { assertSafeEnvironment } = require("./databaseReset");
const { requireAtlasUser } = require("../../middleware/requireAtlasUser");
const { createProspectModule } = require("../../modules/prospects");
const { createBusinessEventModule } = require("../../modules/business-events");
const { createTimelineModule } = require("../../modules/timeline");
const { createProjectionModule } = require("../../modules/projections");
const { createMissionControlModule } = require("../../modules/mission-control");
const { createExecutiveDashboardModule } = require("../../modules/executive-dashboard");

function runScript(relativePath) {
  const scriptPath = path.join(__dirname, "..", relativePath);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${relativePath} failed`);
  }
}

async function verifyContactForm() {
  runScript("verifyContactForm.js");
}

function createCertificationApp() {
  const businessEventModule = createBusinessEventModule({ registerTimelineSubscriber: false });
  const projectionModule = createProjectionModule({
    publisher: businessEventModule.publisher,
    businessEventRepository: businessEventModule.repository
  });
  const timelineModule = createTimelineModule({
    projectionEngine: projectionModule.engine,
    businessEventRepository: businessEventModule.repository
  });
  const missionControlModule = createMissionControlModule({
    projectionEngine: projectionModule.engine,
    businessEventRepository: businessEventModule.repository
  });
  const executiveDashboardModule = createExecutiveDashboardModule({
    projectionEngine: projectionModule.engine,
    businessEventRepository: businessEventModule.repository
  });
  const prospectModule = createProspectModule({
    businessEventEngine: businessEventModule.prospectAdapter,
    prospectEventsHandler: businessEventModule.prospectEventsHandler
  });

  const app = express();
  app.use(express.json());
  app.use("/api/prospects", prospectModule.routes);
  app.use("/api/mission-control", missionControlModule.routes);
  app.use("/api/executive-dashboard", executiveDashboardModule.routes);
  app.get(
    "/api/prospects/:id/timeline",
    requireAtlasUser,
    timelineModule.prospectTimelineHandler
  );

  return app;
}

async function verifyAuthenticatedApis(manifest) {
  const app = createCertificationApp();
  const bootstrapToken = process.env.ATLAS_BOOTSTRAP_TOKEN;

  if (!bootstrapToken) {
    throw new Error("ATLAS_BOOTSTRAP_TOKEN is required for API certification.");
  }

  const server = app.listen(0);
  const port = server.address().port;
  const headers = { Authorization: `Bearer ${bootstrapToken}` };

  try {
    for (const prospect of manifest.prospects) {
      const prospectResponse = await fetch(`http://127.0.0.1:${port}/api/prospects/${prospect.prospectId}`, {
        headers
      });

      if (!prospectResponse.ok) {
        throw new Error(`Prospect API failed for ${prospect.displayName}: ${prospectResponse.status}`);
      }

      const timelineResponse = await fetch(
        `http://127.0.0.1:${port}/api/prospects/${prospect.prospectId}/timeline`,
        { headers }
      );

      if (!timelineResponse.ok) {
        throw new Error(`Timeline API failed for ${prospect.displayName}: ${timelineResponse.status}`);
      }

      const timelinePayload = await timelineResponse.json();
      if (!timelinePayload.items?.length) {
        throw new Error(`Timeline API returned no items for ${prospect.displayName}`);
      }
    }

    const missionControlResponse = await fetch(`http://127.0.0.1:${port}/api/mission-control/metrics`, {
      headers
    });

    if (!missionControlResponse.ok) {
      throw new Error(`Mission Control API failed: ${missionControlResponse.status}`);
    }

    const executiveSummaryResponse = await fetch(
      `http://127.0.0.1:${port}/api/executive-dashboard/summary`,
      { headers }
    );

    if (!executiveSummaryResponse.ok) {
      throw new Error(`Executive Dashboard summary failed: ${executiveSummaryResponse.status}`);
    }

    const executiveKpisResponse = await fetch(`http://127.0.0.1:${port}/api/executive-dashboard/kpis`, {
      headers
    });

    if (!executiveKpisResponse.ok) {
      throw new Error(`Executive Dashboard KPIs failed: ${executiveKpisResponse.status}`);
    }

    console.log("Authenticated RC1 API smoke test passed.");
    console.log(`  Prospects checked: ${manifest.prospects.length}`);
    console.log("  Mission Control metrics: ok");
    console.log("  Executive Dashboard summary/kpis: ok");
  } finally {
    server.close();
  }
}

async function certifyRC1(options = {}) {
  assertSafeEnvironment();

  const results = {
    certifiedAt: new Date().toISOString().slice(0, 10),
    migrationsApplied: [],
    checks: {}
  };

  if (!options.skipMigrations) {
    console.log("Step 1 — Apply Atlas Core migrations\n");
    results.migrationsApplied = await applyAtlasCoreMigrations();
    results.checks.migrations = "pass";
  }

  console.log("\nStep 2 — Verify database baseline\n");
  await verifyDatabaseBaseline();
  results.checks.databaseBaseline = "pass";

  console.log("\nStep 3 — Seed RC1 demo data\n");
  await seedRC1({ confirm: true });
  results.checks.seed = "pass";

  console.log("\nStep 4 — Verify RC1 data and projections\n");
  await verifyRC1({ skipUnitVerifies: options.skipUnitVerifies });
  results.checks.verifyRc1 = "pass";

  console.log("\nStep 5 — Verify Contact Form\n");
  await verifyContactForm();
  results.checks.contactForm = "pass";

  console.log("\nStep 6 — Verify authenticated APIs\n");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  await verifyAuthenticatedApis(manifest);
  results.checks.authenticatedApis = "pass";

  return results;
}

async function main() {
  const skipMigrations = process.argv.includes("--skip-migrations");
  const skipUnitVerifies = process.argv.includes("--skip-unit-verifies");

  console.log("Sprint 15.5 — RC1 certification\n");

  const results = await certifyRC1({ skipMigrations, skipUnitVerifies });

  console.log("\n====================================");
  console.log("");
  console.log("ATLAS RC1 CERTIFIED");
  console.log("");
  console.log("====================================");
  console.log("");
  console.log(JSON.stringify(results, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("certifyRC1 failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  certifyRC1,
  MIGRATION_FILES
};
