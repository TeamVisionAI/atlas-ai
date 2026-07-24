#!/usr/bin/env node
/**
 * Sprint 15.4 — Official Atlas RC1 demo seed (development only).
 * Uses Prospect Engine + Business Events — never writes projections directly.
 *
 * Sprint 15.5 — Temporary debugging instrumentation in this file only.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { EventFactory } = require("../../modules/business-events/application/EventFactory");
const {
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS,
  LEAD_EVENTS
} = require("../../modules/business-events/domain/EventTypes");
const { LIFECYCLE_STATES } = require("../../modules/prospects/domain/constants");
const { DEFAULT_USER_ID } = require("../../services/atlasUserService");
const { resetDevelopmentDatabase } = require("./databaseReset");
const { replayProjections } = require("./replayProjections");
const { seedAtlasUsers } = require("./seedAtlasUsers");
const { createEnvironmentModules } = require("./environmentModules");
const {
  RC1_AGENT_IDS,
  RC1_EMAIL_DOMAIN,
  RC1_PROSPECTS,
  RC1_TAG,
  DEFAULT_ORGANIZATION_ID
} = require("./constants");

const MANIFEST_PATH = path.join(__dirname, "rc1-manifest.json");

function serializeDebugResult(result) {
  if (result === null) {
    return "null";
  }

  if (result === undefined) {
    return "undefined";
  }

  if (typeof result.toJSON === "function") {
    try {
      return JSON.stringify(result.toJSON(), null, 2);
    } catch (error) {
      return `[toJSON failed: ${error.message}]`;
    }
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch (error) {
    return `[JSON.stringify failed: ${error.message}] type=${typeof result}`;
  }
}

async function debugOperation(operationName, runner) {
  console.log(`${operationName}...`);

  try {
    const result = await runner();
    console.log(`${operationName} complete.`);
    console.log(`[debug] ${operationName} returned:\n${serializeDebugResult(result)}`);
    return result;
  } catch (error) {
    console.error(`[debug] ${operationName} failed.`);
    console.error(`[debug] operation: ${operationName}`);
    console.error(`[debug] message: ${error.message}`);
    console.error(`[debug] stack:\n${error.stack}`);
    throw error;
  }
}

function createTimestampFactory(baseDate = Date.UTC(2026, 6, 24, 14, 0, 0)) {
  let sequence = 0;

  return () => {
    sequence += 1;
    return new Date(baseDate + sequence * 60_000).toISOString();
  };
}

async function recordEvent(service, input, operationName) {
  return debugOperation(operationName, () =>
    service.record(
      EventFactory.create({
        channel: "api",
        version: "1.0",
        organizationId: DEFAULT_ORGANIZATION_ID,
        ...input,
        metadata: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          lifecycleStateAtEvent: input.lifecycleStateAtEvent ?? null,
          summary: input.summary,
          ...(input.metadata || {})
        }
      })
    )
  );
}

async function seedMaria({ prospectService, businessEventService, actor, nextTimestamp }) {
  const spec = RC1_PROSPECTS.maria;

  const created = await debugOperation("Creating Maria (createProspect)", () =>
    prospectService.createProspect(
      {
        displayName: spec.displayName,
        email: spec.email,
        primaryPhone: spec.primaryPhone,
        leadSource: spec.leadSource,
        tags: [RC1_TAG],
        customFields: { rc1Status: spec.statusLabel }
      },
      actor
    )
  );

  await recordEvent(
    businessEventService,
    {
      eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
      prospectId: created.prospectId,
      actor: "ATLAS",
      timestamp: nextTimestamp(),
      summary: "Initial Contact",
      lifecycleStateAtEvent: LIFECYCLE_STATES.CONTACT_ATTEMPTED,
      payload: { direction: "outbound", channel: "whatsapp" }
    },
    "Recording Maria Initial Contact (recordEvent)"
  );

  return {
    key: spec.key,
    prospectId: created.prospectId,
    displayName: spec.displayName,
    email: spec.email,
    phone: spec.primaryPhone,
    timelineSummaries: ["Lead Created", "Initial Contact"]
  };
}

async function seedCarlos({ prospectService, businessEventService, actor, nextTimestamp }) {
  const spec = RC1_PROSPECTS.carlos;

  const created = await debugOperation("Creating Carlos (createProspect)", () =>
    prospectService.createProspect(
      {
        displayName: spec.displayName,
        email: spec.email,
        primaryPhone: spec.primaryPhone,
        leadSource: spec.leadSource,
        tags: [RC1_TAG],
        customFields: { rc1Status: spec.statusLabel }
      },
      actor
    )
  );

  await recordEvent(
    businessEventService,
    {
      eventType: LEAD_EVENTS.PROSPECT_UPDATED,
      prospectId: created.prospectId,
      actor,
      timestamp: nextTimestamp(),
      summary: "Qualified",
      lifecycleStateAtEvent: LIFECYCLE_STATES.QUALIFIED,
      payload: { changedFields: ["status.lifecycleState"] }
    },
    "Recording Carlos Qualified (recordEvent)"
  );

  await debugOperation("Assigning Carlos (assignProspect)", () =>
    prospectService.assignProspect(
      created.prospectId,
      {
        assignedAgentId: spec.assignedAgentId,
        assignmentReason: "RC1 demo assignment"
      },
      actor
    )
  );

  await recordEvent(
    businessEventService,
    {
      eventType: APPOINTMENT_EVENTS.APPOINTMENT_CREATED,
      prospectId: created.prospectId,
      actor: "ATLAS",
      timestamp: nextTimestamp(),
      summary: "Interview Scheduled",
      lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
      payload: { appointmentId: "rc1-carlos-interview", scheduledStart: nextTimestamp() }
    },
    "Recording Carlos Interview Scheduled (recordEvent)"
  );

  await recordEvent(
    businessEventService,
    {
      eventType: APPOINTMENT_EVENTS.REMINDER_SENT,
      prospectId: created.prospectId,
      actor: "ATLAS",
      timestamp: nextTimestamp(),
      summary: "Reminder Sent",
      lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
      payload: { reminderType: "interview" }
    },
    "Recording Carlos Reminder Sent (recordEvent)"
  );

  return {
    key: spec.key,
    prospectId: created.prospectId,
    displayName: spec.displayName,
    email: spec.email,
    phone: spec.primaryPhone,
    assignedAgentId: spec.assignedAgentId,
    timelineSummaries: [
      "Lead Created",
      "Qualified",
      "Prospect assigned",
      "Interview Scheduled",
      "Reminder Sent"
    ]
  };
}

async function seedAndrea({ prospectService, businessEventService, actor, nextTimestamp }) {
  const spec = RC1_PROSPECTS.andrea;

  const created = await debugOperation("Creating Andrea (createProspect)", () =>
    prospectService.createProspect(
      {
        displayName: spec.displayName,
        email: spec.email,
        primaryPhone: spec.primaryPhone,
        leadSource: spec.leadSource,
        tags: [RC1_TAG],
        customFields: { rc1Status: spec.statusLabel }
      },
      actor
    )
  );

  await recordEvent(
    businessEventService,
    {
      eventType: LEAD_EVENTS.PROSPECT_UPDATED,
      prospectId: created.prospectId,
      actor,
      timestamp: nextTimestamp(),
      summary: "Qualified",
      lifecycleStateAtEvent: LIFECYCLE_STATES.QUALIFIED,
      payload: { changedFields: ["status.lifecycleState"] }
    },
    "Recording Andrea Qualified (recordEvent)"
  );

  await debugOperation("Assigning Andrea (assignProspect)", () =>
    prospectService.assignProspect(
      created.prospectId,
      {
        assignedAgentId: spec.assignedAgentId,
        assignmentReason: "RC1 demo assignment"
      },
      actor
    )
  );

  await recordEvent(
    businessEventService,
    {
      eventType: APPOINTMENT_EVENTS.APPOINTMENT_CREATED,
      prospectId: created.prospectId,
      actor: "ATLAS",
      timestamp: nextTimestamp(),
      summary: "Interview Scheduled",
      lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
      payload: { appointmentId: "rc1-andrea-interview", scheduledStart: nextTimestamp() }
    },
    "Recording Andrea Interview Scheduled (recordEvent)"
  );

  await recordEvent(
    businessEventService,
    {
      eventType: APPOINTMENT_EVENTS.INTERVIEW_COMPLETED,
      prospectId: created.prospectId,
      actor,
      timestamp: nextTimestamp(),
      summary: "Interview Completed",
      lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_COMPLETED,
      payload: { outcome: "follow_up" }
    },
    "Recording Andrea Interview Completed (recordEvent)"
  );

  await debugOperation("Archiving Andrea (archiveProspect)", () =>
    prospectService.archiveProspect(created.prospectId, actor)
  );

  return {
    key: spec.key,
    prospectId: created.prospectId,
    displayName: spec.displayName,
    email: spec.email,
    phone: spec.primaryPhone,
    assignedAgentId: spec.assignedAgentId,
    timelineSummaries: [
      "Lead Created",
      "Qualified",
      "Prospect assigned",
      "Interview Scheduled",
      "Interview Completed",
      "Prospect archived"
    ]
  };
}

async function seedRC1({ confirm = false, skipReset = false } = {}) {
  if (!confirm) {
    throw new Error("Refusing to seed RC1 without confirm: true or --confirm flag.");
  }

  if (!skipReset) {
    await debugOperation("Resetting development database (resetDevelopmentDatabase)", () =>
      resetDevelopmentDatabase({ confirm: true })
    );
  }

  await debugOperation("Seeding Atlas default users (seedAtlasUsers)", () => seedAtlasUsers());

  const modules = await debugOperation("Creating environment modules (createEnvironmentModules)", () =>
    createEnvironmentModules({ startProjections: false })
  );

  const actor = `AGENT:${DEFAULT_USER_ID}`;
  const nextTimestamp = createTimestampFactory();

  const prospects = [];

  prospects.push(
    await debugOperation("Seeding Maria (seedMaria)", () =>
      seedMaria({
        prospectService: modules.prospectModule.service,
        businessEventService: modules.businessEventModule.service,
        actor,
        nextTimestamp
      })
    )
  );

  prospects.push(
    await debugOperation("Seeding Carlos (seedCarlos)", () =>
      seedCarlos({
        prospectService: modules.prospectModule.service,
        businessEventService: modules.businessEventModule.service,
        actor,
        nextTimestamp
      })
    )
  );

  prospects.push(
    await debugOperation("Seeding Andrea (seedAndrea)", () =>
      seedAndrea({
        prospectService: modules.prospectModule.service,
        businessEventService: modules.businessEventModule.service,
        actor,
        nextTimestamp
      })
    )
  );

  await debugOperation("Replaying projections (replayProjections)", () => replayProjections());

  const manifest = {
    tag: RC1_TAG,
    emailDomain: RC1_EMAIL_DOMAIN,
    organizationId: DEFAULT_ORGANIZATION_ID,
    agentIds: RC1_AGENT_IDS,
    seededAt: new Date().toISOString(),
    prospects,
    expected: {
      prospectCount: 3,
      activeProspects: 2,
      archivedProspects: 1,
      newLeads: 3,
      contactAttempts: 1,
      qualifiedProspects: 2,
      scheduledInterviews: 2,
      completedInterviews: 1
    }
  };

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return manifest;
}

async function main() {
  console.log("Seeding Atlas RC1 demo data...\n");

  const manifest = await seedRC1({ confirm: process.argv.includes("--confirm") });

  console.log("");
  console.log("RC1 prospects:");
  for (const prospect of manifest.prospects) {
    console.log(`  - ${prospect.displayName} (${prospect.prospectId})`);
  }

  console.log("");
  console.log(`Manifest written to ${MANIFEST_PATH}`);
  console.log("RC1 seed complete.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("seedRC1 failed:", error.message);
    console.error("Pass --confirm to proceed.");
    process.exit(1);
  });
}

module.exports = {
  seedRC1,
  MANIFEST_PATH
};
