/**
 * BR-192 — terminal prospect close cancels open follow-ups.
 * Synthetic fixtures only. No live tenant data, WhatsApp, SMS, or email.
 */

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const {
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_VIEW_STATUSES,
  FOLLOW_UP_CLOSE_REASONS,
  classifyPersistedFollowUp,
  resolveFollowUpCloseReason,
  isTerminalFollowUpMilestone,
  isNonTerminalFollowUpMilestone,
  createMemoryFollowUpStore
} = require("../core/followUps");
const { FOLLOW_UP_FILTERS } = require("../core/followUpsQueueEngine");
const { MILESTONES } = require("../core/workflowConstants");
const followUpApplicationService = require("../application/followUpApplicationService");
const { resolveTargetMilestone } = require("../core/conversationOutcomeEngine");
const { isFollowUpQueueCandidate } = require("../core/followUpsQueueEngine");
const { planStaleFollowUpRepair } = require("../core/followUps/repairStaleClosedProspectFollowUps");

const ORG_A = "21000000-0000-4000-8000-000000000201";
const ORG_B = "21000000-0000-4000-8000-000000000299";
const USER_A = "41000000-0000-4000-8000-000000000201";
const USER_B = "41000000-0000-4000-8000-000000000202";
const PROSPECT_A = "51000000-0000-4000-8000-000000000201";
const PHONE_A = "+15550002201";
const TODAY = "2026-08-31";

function auth(userId = USER_A) {
  return { userId, role: "agent" };
}

function listOpts(overrides = {}) {
  return {
    organizationId: ORG_A,
    authContext: auth(),
    includeLegacy: false,
    reference: new Date("2026-08-31T16:00:00.000Z"),
    ...overrides
  };
}

async function seedOpenFollowUp(overrides = {}) {
  return followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "prospect",
      entityId: PROSPECT_A,
      subjectLabel: "Luis TV",
      subjectPhone: PHONE_A,
      dueDate: TODAY,
      notes: "call back",
      ownerUserId: USER_A,
      ...overrides
    },
    auth()
  );
}

test.beforeEach(() => {
  followUpApplicationService.setStoreForTests(createMemoryFollowUpStore());
});

test.afterEach(() => {
  followUpApplicationService.setStoreForTests(null);
});

test("MC Not Interested maps to CLOSED and cancels the active follow-up", async () => {
  assert.equal(resolveTargetMilestone("Not Interested"), MILESTONES.CLOSED);
  const created = await seedOpenFollowUp();
  const result = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    actorUserId: USER_A,
    targetMilestone: MILESTONES.CLOSED,
    outcome: "Not Interested"
  });
  assert.equal(result.closeReason, FOLLOW_UP_CLOSE_REASONS.NOT_INTERESTED);
  assert.equal(result.cancelledCount, 1);
  const active = await followUpApplicationService.listFollowUps(listOpts());
  assert.equal(active.items.length, 0);
  const completed = await followUpApplicationService.listFollowUps({
    ...listOpts(),
    filter: FOLLOW_UP_FILTERS.COMPLETED
  });
  assert.equal(completed.items.length, 1);
  assert.equal(completed.items[0].id, created.followUp.id);
  assert.equal(completed.items[0].persistedStatus, FOLLOW_UP_STATUSES.CANCELLED);
});

test("Disqualified terminal state removes the active follow-up", async () => {
  await seedOpenFollowUp();
  const result = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.CLOSED,
    outcome: "Not Qualified"
  });
  assert.equal(result.closeReason, FOLLOW_UP_CLOSE_REASONS.DISQUALIFIED);
  assert.equal(result.cancelledCount, 1);
  const active = await followUpApplicationService.listFollowUps(listOpts());
  assert.equal(active.items.length, 0);
});

test("DNC / unsubscribe removes the active follow-up", async () => {
  await seedOpenFollowUp();
  const dnc = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.DO_NOT_CONTACT,
    inboxCloseReason: "DO_NOT_CONTACT"
  });
  assert.equal(dnc.closeReason, FOLLOW_UP_CLOSE_REASONS.DO_NOT_CONTACT);
  assert.equal(dnc.cancelledCount, 1);

  followUpApplicationService.setStoreForTests(createMemoryFollowUpStore());
  await seedOpenFollowUp({ notes: "unsub-case" });
  const unsub = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    outcome: "unsubscribe"
  });
  assert.equal(unsub.closeReason, FOLLOW_UP_CLOSE_REASONS.UNSUBSCRIBE);
  assert.equal(unsub.cancelledCount, 1);
});

test("completed follow-up history remains after a terminal close", async () => {
  const created = await seedOpenFollowUp();
  await followUpApplicationService.completeFollowUp(
    created.followUp.id,
    { organizationId: ORG_A, completionNote: "Reached them last week" },
    auth()
  );
  await seedOpenFollowUp({ notes: "still-open", dueDate: "2026-09-02" });
  await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.CLOSED,
    outcome: "Not Interested"
  });
  const completed = await followUpApplicationService.listFollowUps({
    ...listOpts(),
    filter: FOLLOW_UP_FILTERS.COMPLETED
  });
  const completedRow = completed.items.find((item) => item.id === created.followUp.id);
  assert.ok(completedRow);
  assert.equal(completedRow.persistedStatus, FOLLOW_UP_STATUSES.COMPLETED);
  assert.equal(completedRow.completionNote, "Reached them last week");
  assert.equal(completed.items.length, 2);
});

test("duplicate close is idempotent", async () => {
  await seedOpenFollowUp();
  const first = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.CLOSED,
    outcome: "Not Interested"
  });
  const second = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.CLOSED,
    outcome: "Not Interested"
  });
  assert.equal(first.cancelledCount, 1);
  assert.equal(second.cancelledCount, 0);
  const completed = await followUpApplicationService.listFollowUps({
    ...listOpts(),
    filter: FOLLOW_UP_FILTERS.COMPLETED
  });
  assert.equal(completed.items.length, 1);
  const cancelEvents = (completed.items[0].history || []).filter((entry) => entry.type === "cancelled");
  assert.equal(cancelEvents.length, 1);
  assert.equal(cancelEvents[0].reason, FOLLOW_UP_CLOSE_REASONS.NOT_INTERESTED);
});

test("normal active prospect keeps the follow-up", async () => {
  await seedOpenFollowUp();
  const skipped = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.FOLLOW_UP,
    outcome: "Needs More Time"
  });
  assert.equal(skipped.cancelledCount, 0);
  assert.equal(skipped.reason, "NOT_TERMINAL");
  const scheduled = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED
  });
  assert.equal(scheduled.cancelledCount, 0);
  const active = await followUpApplicationService.listFollowUps(listOpts());
  assert.equal(active.items.length, 1);
  assert.equal(active.items[0].status, FOLLOW_UP_VIEW_STATUSES.DUE_TODAY);
});

test("cross-tenant records stay untouched", async () => {
  await seedOpenFollowUp();
  await seedOpenFollowUp({
    organizationId: ORG_B,
    notes: "other-org",
    ownerUserId: USER_B
  });
  const result = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.CLOSED,
    outcome: "Not Interested"
  });
  assert.equal(result.cancelledCount, 1);
  const otherOrg = await followUpApplicationService.listFollowUps({
    ...listOpts(),
    organizationId: ORG_B,
    authContext: auth(USER_B)
  });
  assert.equal(otherOrg.items.length, 1);
  assert.equal(otherOrg.items[0].persistedStatus, FOLLOW_UP_STATUSES.OPEN);
});

test("reopening a prospect does not recreate the cancelled follow-up", async () => {
  const created = await seedOpenFollowUp();
  await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.CLOSED,
    outcome: "Not Interested"
  });
  const afterReopenAdvance = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.QUALIFICATION
  });
  assert.equal(afterReopenAdvance.cancelledCount, 0);
  const active = await followUpApplicationService.listFollowUps(listOpts());
  assert.equal(active.items.length, 0);
  const completed = await followUpApplicationService.listFollowUps({
    ...listOpts(),
    filter: FOLLOW_UP_FILTERS.COMPLETED
  });
  assert.equal(completed.items[0].id, created.followUp.id);
});

test("active query excludes cancelled/completed and does not treat due date as active", () => {
  assert.equal(
    classifyPersistedFollowUp({ status: "CANCELLED", dueDate: TODAY }, { today: TODAY }).viewStatus,
    FOLLOW_UP_VIEW_STATUSES.COMPLETED
  );
  assert.equal(
    classifyPersistedFollowUp({ status: "COMPLETED", dueDate: TODAY }, { today: TODAY }).viewStatus,
    FOLLOW_UP_VIEW_STATUSES.COMPLETED
  );
  assert.equal(
    classifyPersistedFollowUp({ status: "OPEN", dueDate: TODAY }, { today: TODAY }).viewStatus,
    FOLLOW_UP_VIEW_STATUSES.DUE_TODAY
  );
  assert.equal(
    isFollowUpQueueCandidate({ canonicalMilestone: MILESTONES.CLOSED }, { followUpDate: TODAY }),
    false
  );
  assert.equal(
    isFollowUpQueueCandidate({ canonicalMilestone: MILESTONES.DO_NOT_CONTACT }, { followUpDate: TODAY }),
    false
  );
});

test("agenda/client follow-ups are not cancelled when a prospect is closed", async () => {
  await followUpApplicationService.createManualFollowUp(
    {
      organizationId: ORG_A,
      entityType: "agenda_contact",
      entityId: "contact-luis",
      subjectLabel: "Luis TV",
      subjectPhone: PHONE_A,
      dueDate: TODAY,
      notes: "agenda-keep"
    },
    auth()
  );
  await seedOpenFollowUp();
  const result = await followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    subjectPhone: PHONE_A,
    targetMilestone: MILESTONES.CLOSED,
    outcome: "Not Interested"
  });
  assert.equal(result.cancelledCount, 1);
  const active = await followUpApplicationService.listFollowUps(listOpts());
  assert.equal(active.items.length, 1);
  assert.equal(active.items[0].entityType, "agenda_contact");
});

test("generic CLOSED is prospect_closed; explicit Not Interested stays not_interested", () => {
  assert.equal(
    resolveFollowUpCloseReason({ targetMilestone: MILESTONES.CLOSED }),
    FOLLOW_UP_CLOSE_REASONS.CLOSED
  );
  assert.equal(FOLLOW_UP_CLOSE_REASONS.CLOSED, "prospect_closed");
  assert.equal(
    resolveFollowUpCloseReason({ targetMilestone: MILESTONES.CLOSED, outcome: "Not Interested" }),
    FOLLOW_UP_CLOSE_REASONS.NOT_INTERESTED
  );
  assert.equal(FOLLOW_UP_CLOSE_REASONS.NOT_INTERESTED, "prospect_closed_not_interested");
});

test("close-reason mapping covers Atlas terminal statuses", () => {
  assert.equal(
    resolveFollowUpCloseReason({ targetMilestone: MILESTONES.CLOSED }),
    FOLLOW_UP_CLOSE_REASONS.CLOSED
  );
  assert.equal(
    resolveFollowUpCloseReason({ targetMilestone: MILESTONES.CLOSED, outcome: "Not Interested" }),
    FOLLOW_UP_CLOSE_REASONS.NOT_INTERESTED
  );
  assert.equal(
    resolveFollowUpCloseReason({ targetMilestone: MILESTONES.CLOSED, outcome: "Not Qualified" }),
    FOLLOW_UP_CLOSE_REASONS.DISQUALIFIED
  );
  assert.equal(
    resolveFollowUpCloseReason({ targetMilestone: MILESTONES.DO_NOT_CONTACT }),
    FOLLOW_UP_CLOSE_REASONS.DO_NOT_CONTACT
  );
  assert.equal(
    resolveFollowUpCloseReason({ outcome: "unsubscribe" }),
    FOLLOW_UP_CLOSE_REASONS.UNSUBSCRIBE
  );
  assert.equal(isTerminalFollowUpMilestone(MILESTONES.CLOSED), true);
  assert.equal(isNonTerminalFollowUpMilestone(MILESTONES.INTERVIEW_SCHEDULED), true);
  assert.equal(isNonTerminalFollowUpMilestone(MILESTONES.FOLLOW_UP), true);
});

test("shared close path and conversation DNC hook cancel follow-ups", () => {
  const advancement = fs.readFileSync(
    path.join(__dirname, "../core/humanAdvancementEngine.js"),
    "utf8"
  );
  const conversationClose = fs.readFileSync(
    path.join(__dirname, "../core/conversationsCenter/conversationsCenterOwnershipService.js"),
    "utf8"
  );
  const outcomeEngine = fs.readFileSync(
    path.join(__dirname, "../core/conversationOutcomeEngine.js"),
    "utf8"
  );
  assert.match(advancement, /cancelOpenFollowUpsForClosedProspect/);
  assert.match(advancement, /MILESTONES\.CLOSED/);
  assert.match(advancement, /MILESTONES\.DO_NOT_CONTACT/);
  assert.match(conversationClose, /cancelOpenFollowUpsForClosedProspect/);
  assert.match(conversationClose, /DO_NOT_CONTACT/);
  assert.match(outcomeEngine, /case "Not Interested"/);
  assert.match(outcomeEngine, /return MILESTONES\.CLOSED/);
});

test("stale repair plans cancel for terminal prospects and keeps BR-178 recycle", async () => {
  const report = await planStaleFollowUpRepair({
    organizationId: ORG_A,
    listOpenFollowUps: async () => [
      {
        id: "fu-stale",
        status: FOLLOW_UP_STATUSES.OPEN,
        entityType: "prospect",
        entityId: PROSPECT_A,
        subjectPhone: PHONE_A,
        sourceEvent: "manual"
      },
      {
        id: "fu-recycle",
        status: FOLLOW_UP_STATUSES.OPEN,
        entityType: "prospect",
        entityId: PROSPECT_A,
        subjectPhone: PHONE_A,
        sourceEvent: "outcome:not_interested"
      },
      {
        id: "fu-active",
        status: FOLLOW_UP_STATUSES.OPEN,
        entityType: "prospect",
        entityId: "other",
        subjectPhone: "+15550002999",
        sourceEvent: "manual"
      }
    ],
    loadProspect: async ({ subjectPhone }) => {
      if (subjectPhone === PHONE_A) {
        return { workflow_state: { canonicalMilestone: MILESTONES.CLOSED } };
      }
      return { workflow_state: { canonicalMilestone: MILESTONES.FOLLOW_UP } };
    }
  });
  assert.equal(report.stale.length, 1);
  assert.equal(report.stale[0].id, "fu-stale");
  assert.equal(report.keptRecycle.length, 1);
  assert.equal(report.keptRecycle[0].id, "fu-recycle");
});
