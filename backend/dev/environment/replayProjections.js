#!/usr/bin/env node
/**
 * Sprint 15.4 — Rebuild Timeline, Mission Control, and Executive Dashboard
 * from persisted Business Events using the Projection Framework.
 */

require("dotenv").config();

const { assertSafeEnvironment, assertAtlasCoreTablesReady, deleteAllRows } = require("./databaseReset");
const { createEnvironmentModules } = require("./environmentModules");
const { DEV_TABLES } = require("./constants");

async function loadEventsChronologically(projectionEngine, filters = {}) {
  return projectionEngine.loadEventsChronologically(filters);
}

async function replayProjections(options = {}) {
  assertSafeEnvironment();
  await assertAtlasCoreTablesReady();

  const modules = await createEnvironmentModules({ startProjections: false });
  const { projectionModule, timelineModule, missionControlModule, executiveDashboardModule } =
    modules;

  const filters = {
    prospectId: options.prospectId || null,
    from: options.from || null,
    to: options.to || null,
    organizationId: options.organizationId || null
  };

  const events = await loadEventsChronologically(projectionModule.engine, filters);

  if (options.clearTimeline !== false) {
    await deleteAllRows(DEV_TABLES.timelineEntries);
  }

  const timelineSummary = await timelineModule.timelineProjection.replay(events);

  if (timelineSummary.failures?.length) {
    throw new Error(
      `Timeline replay failed (${timelineSummary.failures.length} failure(s)).`
    );
  }

  console.log("Timeline rebuilt");

  const missionSummary = await missionControlModule.missionControlProjection.replay(events, {
    rebuild: true
  });

  if (missionSummary.failures?.length) {
    throw new Error(
      `Mission Control replay failed (${missionSummary.failures.length} failure(s)).`
    );
  }

  console.log("Mission Control rebuilt");

  const executiveSummary = await executiveDashboardModule.executiveDashboardProjection.replay(
    events,
    { rebuild: true }
  );

  if (executiveSummary.failures?.length) {
    throw new Error(
      `Executive Dashboard replay failed (${executiveSummary.failures.length} failure(s)).`
    );
  }

  console.log("Executive Dashboard rebuilt");

  return {
    eventsRead: events.length,
    timelineSummary,
    missionSummary,
    executiveSummary
  };
}

async function main() {
  await replayProjections();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("replayProjections failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  replayProjections
};
