/**
 * Communications Center read model — TV-000028 forensic fixture validation.
 * Read-only; does not call production DB, WhatsApp, or appointment writers.
 */

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCommunicationsCenterTimeline,
  detectInboundFlags,
  detectOutboundFlags,
  maskPhoneLast4,
  maskProviderMessageId
} = require("../core/communicationsCenterReadModel");

const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures/recruitAiV2/tv000028-scheduling-replay.json"
);

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

function fixtureToSyntheticSources(fixture) {
  const logs = [];

  for (const turn of fixture.turns) {
    logs.push({
      id: `in-${turn.id}`,
      prospect_phone: "+15550007338",
      organization_id: null,
      direction: "incoming",
      message: turn.text,
      intent: null,
      current_step: "INTERVIEW_SCHEDULING",
      language: fixture.identity.preferredLanguage,
      created_at: turn.atUtc
    });

    const outbounds = Array.isArray(turn.observedOutbound)
      ? turn.observedOutbound
      : [turn.observedOutbound];

    for (const [index, text] of outbounds.entries()) {
      const created = new Date(
        new Date(turn.atUtc).getTime() + 500 + index * 200
      ).toISOString();

      logs.push({
        id: `out-${turn.id}-${index}`,
        prospect_phone: "+15550007338",
        organization_id: null,
        direction: "outgoing",
        message: text,
        intent: null,
        current_step: "INTERVIEW_SCHEDULING",
        language: /Hola|quedó/i.test(text) ? "spanish" : "english",
        created_at: created
      });
    }
  }

  return {
    logs,
    deliveries: [
      {
        id: "del-1",
        conversation_log_id: "out-t09-0",
        status: "sent_freeform",
        provider_message_id: "wamid.ABCDEFGHIJKLMNOPQRSTUV",
        created_at: "2026-08-06T00:34:25.200Z",
        intent: "scheduling",
        reason: null
      }
    ],
    workflowEvents: [
      {
        id: "wf-1",
        event_type: "MessageReceived",
        actor: "prospect",
        milestone_before: "INTERVIEW_SCHEDULING",
        milestone_after: "INTERVIEW_SCHEDULING",
        payload: { conversationLogId: "in-t11", bodyPreview: "6?" },
        created_at: "2026-08-06T01:02:52.841Z"
      },
      {
        id: "wf-ownership",
        event_type: "WorkflowOwnershipChanged",
        actor: "SYSTEM",
        milestone_before: "INTERVIEW_SCHEDULING",
        milestone_after: "INTERVIEW_SCHEDULED",
        payload: { note: "ownership snapshot" },
        created_at: "2026-08-06T01:03:20.000Z"
      }
    ],
    appointments: [
      {
        id: fixture.identity.appointmentId,
        status: "scheduled",
        meetingType: "in_person",
        startDateTime: "2026-08-07T21:15:00.000Z",
        timezone: fixture.identity.timezone,
        confirmationStatus: "confirmed",
        calendarEventId: "cal-event-masked"
      }
    ],
    businessEvents: [],
    timelineEntries: []
  };
}

test("mask helpers never expose full phone or provider ids", () => {
  assert.equal(maskPhoneLast4("+13059997338"), "+***7338");
  const masked = maskProviderMessageId("wamid.ABCDEFGHIJKLMNOPQRSTUV");
  assert.match(masked, /…/);
  assert.notEqual(masked, "wamid.ABCDEFGHIJKLMNOPQRSTUV");
  assert.ok(!masked.includes("JKLMNOPQRSTUV"));
});

test("flag detectors catch TV-000028 counteroffers and dangerous replies", () => {
  assert.ok(detectInboundFlags("6?").includes("counteroffer"));
  assert.ok(detectInboundFlags("What about 6:30 pm?").includes("counteroffer_630"));
  assert.ok(
    detectOutboundFlags("Missing authenticated agent id for appointment persistence.").includes(
      "internal_error_leaked"
    )
  );
  assert.ok(
    detectOutboundFlags(
      "✅ Your interview is already confirmed. A Team Vision agent will contact you if any adjustment is needed."
    ).includes("post_confirmation_lock")
  );
});

test("TV-000028 synthetic timeline exposes forensic failure flags chronologically", async () => {
  const fixture = loadFixture();
  const sources = fixtureToSyntheticSources(fixture);

  const timeline = await buildCommunicationsCenterTimeline({
    phone: "+15550007338",
    organizationId: fixture.identity.organizationId,
    prospectId: fixture.identity.prospectId,
    prospectDisplayName: fixture.identity.displayName,
    timezone: fixture.identity.timezone,
    loaders: {
      loadConversationLogs: async () => sources.logs,
      loadOutboundDeliveries: async () => sources.deliveries,
      loadWorkflowEvents: async () => sources.workflowEvents,
      loadAppointments: async () => sources.appointments,
      loadBusinessEvents: async () => ({ rows: sources.businessEvents, gap: null }),
      loadTimelineEntries: async () => ({ rows: sources.timelineEntries, gap: null })
    }
  });

  assert.equal(timeline.phoneMasked, "+***7338");
  assert.equal(timeline.prospectId, fixture.identity.prospectId);
  assert.ok(timeline.items.length > 0);

  const byText = (text) =>
    timeline.items.find(
      (item) => item.direction === "inbound" && item.content?.text === text
    );

  const six = byText("6?");
  assert.ok(six, "expected inbound 6?");
  assert.ok(six.flags.includes("counteroffer"));
  assert.ok(six.flags.includes("ignored_counteroffer"));

  const sixThirty = byText("What about 6:30 pm?");
  assert.ok(sixThirty);
  assert.ok(sixThirty.flags.includes("ignored_counteroffer"));

  const preferSix = byText("I prefer at 6");
  assert.ok(preferSix);
  assert.ok(preferSix.flags.includes("ignored_counteroffer"));

  const leak = timeline.items.find((item) =>
    String(item.content?.text || "").includes("authenticated agent id")
  );
  assert.ok(leak);
  assert.ok(leak.flags.includes("internal_error_leaked"));
  assert.equal(leak.delivery.status, "sent_freeform");
  assert.ok(leak.delivery.providerMessageId);

  const dual = timeline.items.filter((item) =>
    item.flags.includes("dual_confirmation")
  );
  assert.ok(dual.length >= 1, "expected dual confirmation flag");

  const lock = timeline.items.find((item) =>
    item.flags.includes("no_reschedule_path")
  );
  assert.ok(lock);

  const postConfirm = byText("What about 6?");
  assert.ok(postConfirm);
  assert.ok(
    postConfirm.flags.includes("ignored_counteroffer") ||
      postConfirm.flags.includes("no_reschedule_path_candidate")
  );

  // Message mirror workflow event linked to a log must not duplicate content.
  assert.equal(
    timeline.items.filter((item) => item.id === "workflow:wf-1").length,
    0
  );
  assert.ok(
    timeline.items.some((item) => item.id === "workflow:wf-ownership"),
    "non-mirror workflow events remain"
  );

  assert.ok(
    timeline.items.some(
      (item) =>
        item.category === "appointment" &&
        item.appointment.appointmentId === fixture.identity.appointmentId
    )
  );

  assert.ok(
    timeline.gaps.some((gap) => gap.code === "conversation_logs_missing_organization_id")
  );
  assert.ok(timeline.gaps.some((gap) => gap.code === "atlas_business_events_empty"));

  // Chronological ascending order
  for (let i = 1; i < timeline.items.length; i += 1) {
    const prev = new Date(timeline.items[i - 1].timestampUtc).getTime();
    const curr = new Date(timeline.items[i].timestampUtc).getTime();
    assert.ok(prev <= curr);
  }

  // Contract shape sample
  const sample = six;
  for (const key of [
    "id",
    "eventType",
    "category",
    "timestampUtc",
    "timestampLocal",
    "timezone",
    "source",
    "actor",
    "direction",
    "channel",
    "content",
    "delivery",
    "ai",
    "workflow",
    "appointment",
    "flags",
    "metadata"
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(sample, key), key);
  }

  assert.equal(sample.eventType, "message.inbound");
  assert.equal(sample.timezone, "America/New_York");
});

test("communications center route uses legacy prospect access stack", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/communicationsCenter.js"),
    "utf8"
  );
  assert.match(routeSource, /requireAtlasUser/);
  assert.match(routeSource, /organizationGuard/);
  assert.match(routeSource, /requireLegacyProspectAccess/);
  assert.match(routeSource, /isProductionProspect/);
  assert.doesNotMatch(routeSource, /createAppointment|sendTextMessage|supabase\.from/);
});

test("communications center does not rewrite Recruit AI engines", () => {
  const readModel = fs.readFileSync(
    path.join(__dirname, "../core/communicationsCenterReadModel.js"),
    "utf8"
  );
  assert.doesNotMatch(readModel, /semanticConversationEngine/);
  assert.doesNotMatch(readModel, /whatsappOutboundPipeline/);
  assert.doesNotMatch(readModel, /businessRulesEngine/);
});
