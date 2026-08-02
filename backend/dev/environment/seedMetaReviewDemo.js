/**
 * Meta App Review — idempotent demo prospect seed.
 * Runs when META_REVIEW_MODE=true; skips if demo prospects already exist.
 *
 * Demo rows are stored in atlas_core_prospects. Legacy `prospects` rows for
 * Dashboard/Mission Control are mirrored when a Meta Review user is created or
 * activated — see metaReviewLegacyProspectBridge.js (LC2 removal target).
 */

const { EventFactory } = require("../../modules/business-events/application/EventFactory");
const {
  COMMUNICATION_EVENTS,
  APPOINTMENT_EVENTS,
  LEAD_EVENTS
} = require("../../modules/business-events/domain/EventTypes");
const { LIFECYCLE_STATES } = require("../../modules/prospects/domain/constants");
const { DEFAULT_USER_ID } = require("../../services/atlasUserService");
const { DEFAULT_ORGANIZATION_ID } = require("../../modules/prospects/domain/constants");
const { isMetaReviewModeEnabled } = require("../../config/metaReviewMode");
const { replayProjections } = require("./replayProjections");

const META_REVIEW_EMAIL_DOMAIN = "prospect.teamvisionfinancial.com";
const LEGACY_MARKER_EMAIL = `maria.gonzalez@demo.teamvision.com`;
const MARKER_EMAIL = `maria.gonzalez@${META_REVIEW_EMAIL_DOMAIN}`;

const META_REVIEW_PROSPECTS = Object.freeze([
  {
    key: "maria",
    displayName: "Maria Gonzalez",
    email: `maria.gonzalez@${META_REVIEW_EMAIL_DOMAIN}`,
    primaryPhone: "3055550101",
    tags: ["Life Insurance", "Needs Follow-up"],
    leadSource: { sourceType: "social", sourceName: "Facebook Lead Ad" },
    events: [
      {
        eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
        summary: "Initial WhatsApp Contact",
        lifecycleStateAtEvent: LIFECYCLE_STATES.CONTACT_ATTEMPTED,
        payload: { direction: "outbound", channel: "whatsapp" }
      },
      {
        eventType: COMMUNICATION_EVENTS.MESSAGE_RECEIVED,
        summary: "Prospect Replied",
        lifecycleStateAtEvent: LIFECYCLE_STATES.CONTACT_ATTEMPTED,
        payload: { direction: "inbound", channel: "whatsapp" }
      },
      {
        eventType: LEAD_EVENTS.PROSPECT_UPDATED,
        summary: "Follow-up Scheduled",
        lifecycleStateAtEvent: LIFECYCLE_STATES.QUALIFIED,
        payload: { changedFields: ["status.lifecycleState"] }
      },
      {
        eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
        summary: "WhatsApp Reminder Sent",
        lifecycleStateAtEvent: LIFECYCLE_STATES.QUALIFIED,
        payload: { direction: "outbound", channel: "whatsapp", template: "interview_reminder" }
      },
      {
        eventType: LEAD_EVENTS.PROSPECT_UPDATED,
        summary: "Agent Note Added",
        lifecycleStateAtEvent: LIFECYCLE_STATES.QUALIFIED,
        payload: { note: "Interested in part-time recruiting opportunity." }
      }
    ]
  },
  {
    key: "carlos",
    displayName: "Carlos Rodriguez",
    email: `carlos.rodriguez@${META_REVIEW_EMAIL_DOMAIN}`,
    primaryPhone: "3055550102",
    tags: ["Recruiting", "Appointment Scheduled", "VIP"],
    leadSource: { sourceType: "referral", sourceName: "Agent Referral" },
    events: [
      {
        eventType: LEAD_EVENTS.PROSPECT_UPDATED,
        summary: "Qualified",
        lifecycleStateAtEvent: LIFECYCLE_STATES.QUALIFIED,
        payload: { changedFields: ["status.lifecycleState"] }
      },
      {
        eventType: APPOINTMENT_EVENTS.APPOINTMENT_CREATED,
        summary: "Interview Scheduled",
        lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
        payload: { appointmentId: "review-carlos-interview" }
      },
      {
        eventType: APPOINTMENT_EVENTS.REMINDER_SENT,
        summary: "WhatsApp Reminder Sent",
        lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
        payload: { reminderType: "interview", channel: "whatsapp" }
      },
      {
        eventType: APPOINTMENT_EVENTS.APPOINTMENT_COMPLETED,
        summary: "Appointment Completed",
        lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_COMPLETED,
        payload: { outcome: "completed" }
      },
      {
        eventType: LEAD_EVENTS.PROSPECT_UPDATED,
        summary: "Agent Note Added",
        lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_COMPLETED,
        payload: { note: "Strong candidate for field trainer track." }
      }
    ]
  },
  {
    key: "sofia",
    displayName: "Sofia Martinez",
    email: `sofia.martinez@${META_REVIEW_EMAIL_DOMAIN}`,
    primaryPhone: "3055550103",
    tags: ["Referral", "Life Insurance"],
    leadSource: { sourceType: "website", sourceName: "Careers Page" },
    events: [
      {
        eventType: COMMUNICATION_EVENTS.MESSAGE_RECEIVED,
        summary: "Prospect Replied",
        lifecycleStateAtEvent: LIFECYCLE_STATES.CONTACT_ATTEMPTED,
        payload: { direction: "inbound", channel: "whatsapp" }
      },
      {
        eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
        summary: "WhatsApp Reminder Sent",
        lifecycleStateAtEvent: LIFECYCLE_STATES.CONTACT_ATTEMPTED,
        payload: { direction: "outbound", channel: "whatsapp" }
      },
      {
        eventType: LEAD_EVENTS.PROSPECT_UPDATED,
        summary: "Qualified",
        lifecycleStateAtEvent: LIFECYCLE_STATES.QUALIFIED,
        payload: { changedFields: ["status.lifecycleState"] }
      },
      {
        eventType: APPOINTMENT_EVENTS.APPOINTMENT_CREATED,
        summary: "Follow-up Scheduled",
        lifecycleStateAtEvent: LIFECYCLE_STATES.INTERVIEW_SCHEDULED,
        payload: { appointmentId: "review-sofia-follow-up" }
      }
    ]
  },
  {
    key: "james",
    displayName: "James Wilson",
    email: `james.wilson@${META_REVIEW_EMAIL_DOMAIN}`,
    primaryPhone: "3055550104",
    tags: ["Recruiting"],
    leadSource: { sourceType: "event", sourceName: "Job Fair Miami" },
    events: [
      {
        eventType: COMMUNICATION_EVENTS.MESSAGE_SENT,
        summary: "Initial WhatsApp Contact",
        lifecycleStateAtEvent: LIFECYCLE_STATES.CONTACT_ATTEMPTED,
        payload: { direction: "outbound", channel: "whatsapp" }
      },
      {
        eventType: LEAD_EVENTS.PROSPECT_UPDATED,
        summary: "Agent Note Added",
        lifecycleStateAtEvent: LIFECYCLE_STATES.CONTACT_ATTEMPTED,
        payload: { note: "Requested information about licensing support." }
      }
    ]
  }
]);

function createTimestampFactory({ daysAgo = 1, hoursOffset = 10 } = {}) {
  const base = Date.now() - daysAgo * 24 * 60 * 60 * 1000 + hoursOffset * 60 * 60 * 1000;
  let sequence = 0;

  return () => {
    sequence += 1;
    return new Date(base + sequence * 90 * 60_000).toISOString();
  };
}

async function recordEvent(businessEventService, input, nextTimestamp) {
  return businessEventService.record(
    EventFactory.create({
      channel: "api",
      version: "1.0",
      organizationId: DEFAULT_ORGANIZATION_ID,
      ...input,
      timestamp: input.timestamp || nextTimestamp(),
      metadata: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        lifecycleStateAtEvent: input.lifecycleStateAtEvent ?? null,
        summary: input.summary,
        ...(input.metadata || {})
      }
    })
  );
}

async function seedProspectSpec({ spec, prospectService, businessEventService, actor, nextTimestamp }) {
  const created = await prospectService.createProspect(
    {
      displayName: spec.displayName,
      email: spec.email,
      primaryPhone: spec.primaryPhone,
      leadSource: spec.leadSource,
      tags: spec.tags,
      customFields: { sourceChannel: "WhatsApp" }
    },
    actor
  );

  for (const eventSpec of spec.events) {
    await recordEvent(
      businessEventService,
      {
        eventType: eventSpec.eventType,
        prospectId: created.prospectId,
        actor: eventSpec.actor || "ATLAS",
        summary: eventSpec.summary,
        lifecycleStateAtEvent: eventSpec.lifecycleStateAtEvent,
        payload: eventSpec.payload || {}
      },
      nextTimestamp
    );
  }

  return {
    key: spec.key,
    prospectId: created.prospectId,
    displayName: spec.displayName,
    phone: spec.primaryPhone
  };
}

async function refreshLegacyDemoTags(prospectRepository, prospectService) {
  const markerEmails = [LEGACY_MARKER_EMAIL, MARKER_EMAIL];
  let refreshed = 0;

  for (const spec of META_REVIEW_PROSPECTS) {
    const existing = await prospectRepository.findByEmail(spec.email);

    if (!existing) {
      continue;
    }

    const currentTags = existing.toJSON?.().tags || existing.tags || [];

    if (currentTags.includes("meta-review")) {
      await prospectService.updateProspect(
        existing.prospectId,
        { tags: spec.tags },
        { userId: DEFAULT_USER_ID, displayName: "Atlas Meta Review Seed" }
      );
      refreshed += 1;
    }
  }

  for (const email of markerEmails) {
    const legacy = await prospectRepository.findByEmail(email);

    if (!legacy) {
      continue;
    }

    const spec = META_REVIEW_PROSPECTS.find((entry) => entry.email === email) ||
      META_REVIEW_PROSPECTS.find((entry) => entry.key === "maria");
    const currentTags = legacy.toJSON?.().tags || legacy.tags || [];

    if (spec && (currentTags.includes("meta-review") || email === LEGACY_MARKER_EMAIL)) {
      await prospectService.updateProspect(
        legacy.prospectId,
        { tags: spec.tags },
        { userId: DEFAULT_USER_ID, displayName: "Atlas Meta Review Seed" }
      );
      refreshed += 1;
    }
  }

  return refreshed;
}

async function ensureMetaReviewDemoData({ prospectService, businessEventService, prospectRepository }) {
  if (!isMetaReviewModeEnabled()) {
    return { skipped: true, reason: "META_REVIEW_MODE disabled" };
  }

  const existing =
    (await prospectRepository.findByEmail(MARKER_EMAIL)) ||
    (await prospectRepository.findByEmail(LEGACY_MARKER_EMAIL));

  if (existing) {
    const refreshed = await refreshLegacyDemoTags(prospectRepository, prospectService);

    return {
      skipped: true,
      reason: "Demo data already present",
      markerEmail: existing.toJSON?.().contact?.email || MARKER_EMAIL,
      refreshedTags: refreshed
    };
  }

  const actor = { userId: DEFAULT_USER_ID, displayName: "Atlas Meta Review Seed" };
  const nextTimestamp = createTimestampFactory({ daysAgo: 1, hoursOffset: 9 });
  const prospects = [];

  for (const spec of META_REVIEW_PROSPECTS) {
    prospects.push(
      await seedProspectSpec({
        spec,
        prospectService,
        businessEventService,
        actor,
        nextTimestamp
      })
    );
  }

  await replayProjections();

  console.log(`[meta-review] Seeded ${prospects.length} demo prospects.`);

  return {
    skipped: false,
    prospects
  };
}

module.exports = {
  META_REVIEW_PROSPECTS,
  MARKER_EMAIL,
  ensureMetaReviewDemoData,
  refreshLegacyDemoTags
};
