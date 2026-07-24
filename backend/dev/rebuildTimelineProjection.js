#!/usr/bin/env node
/**
 * Sprint 14.3.1 / 14.4 — Rebuild Timeline projection from persisted Business Events.
 */

require("dotenv").config();

const { createBusinessEventModule } = require("../modules/business-events");
const { createProjectionModule } = require("../modules/projections");
const { createTimelineModule } = require("../modules/timeline");
const { TimelineReplayService } = require("../modules/timeline/application/TimelineReplayService");

function parseArgs(argv) {
  const options = {
    prospectId: null,
    from: null,
    to: null,
    confirmFullReplay: false,
    organizationId: null
  };

  for (const arg of argv) {
    if (arg === "--confirm-full-replay") {
      options.confirmFullReplay = true;
      continue;
    }

    if (arg.startsWith("--prospect-id=")) {
      options.prospectId = arg.slice("--prospect-id=".length);
      continue;
    }

    if (arg.startsWith("--from=")) {
      options.from = arg.slice("--from=".length);
      continue;
    }

    if (arg.startsWith("--to=")) {
      options.to = arg.slice("--to=".length);
      continue;
    }

    if (arg.startsWith("--organization-id=")) {
      options.organizationId = arg.slice("--organization-id=".length);
    }
  }

  return options;
}

function printUsage() {
  console.log(`Rebuild Timeline projection from persisted Business Events.

Options:
  --confirm-full-replay     Required when replaying all events
  --prospect-id=<uuid>      Replay one prospect only
  --from=<iso-date>         Optional start timestamp filter
  --to=<iso-date>           Optional end timestamp filter
  --organization-id=<uuid>  Optional organization filter
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  if (!options.prospectId && !options.confirmFullReplay) {
    console.error(
      "Refusing full replay without --confirm-full-replay. Provide --prospect-id=<uuid> for scoped replay."
    );
    printUsage();
    process.exit(1);
  }

  const businessEventModule = createBusinessEventModule({
    registerTimelineSubscriber: false
  });

  const projectionModule = createProjectionModule({
    publisher: businessEventModule.publisher,
    businessEventRepository: businessEventModule.repository
  });

  const timelineModule = createTimelineModule({
    projectionEngine: projectionModule.engine,
    businessEventRepository: businessEventModule.repository
  });

  await projectionModule.engine.register(timelineModule.timelineProjection);

  const replayService = new TimelineReplayService({
    projectionEngine: projectionModule.engine,
    timelineProjection: timelineModule.timelineProjection,
    businessEventRepository: businessEventModule.repository,
    timelineRepository: timelineModule.repository
  });

  const scope = options.prospectId
    ? `prospect ${options.prospectId}`
    : "ALL persisted Business Events";

  console.log(`Rebuilding Timeline projection for ${scope}...`);
  console.log("Business Events are never deleted. Timeline append is idempotent.\n");

  const summary = await replayService.replay({
    prospectId: options.prospectId,
    from: options.from,
    to: options.to,
    organizationId: options.organizationId
  });

  console.log("Replay summary:");
  console.log(`  eventsRead:      ${summary.eventsRead}`);
  console.log(`  entriesCreated:  ${summary.entriesCreated}`);
  console.log(`  entriesSkipped:  ${summary.entriesSkipped}`);
  console.log(`  entriesIgnored:  ${summary.entriesIgnored}`);
  console.log(`  failures:        ${summary.failures.length}`);

  if (summary.failures.length > 0) {
    console.error("\nProjection failures:");
    for (const failure of summary.failures) {
      console.error(
        `  - eventId=${failure.eventId} eventType=${failure.eventType} prospectId=${failure.prospectId} message=${failure.message}`
      );
    }

    process.exit(1);
  }

  console.log("\nTimeline projection rebuild completed successfully.");
}

main().catch((error) => {
  console.error("rebuildTimelineProjection failed:", error.message);
  process.exit(1);
});
