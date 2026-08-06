/**
 * Communications Center — prospect-id canonical identity + TV-000028 fixture.
 * Read-only; injectable loaders; no production writes.
 */

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCommunicationsCenterTimeline,
  detectInboundFlags,
  detectOutboundFlags,
  filterPhoneKeyedRows,
  maskPhoneLast4,
  maskProviderMessageId
} = require("../core/communicationsCenterReadModel");
const {
  resolveChannelIdentitiesFromProspect,
  publicChannelIdentities,
  collectAuthorizedPhoneVariants
} = require("../core/communicationsCenterIdentity");

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
        organization_id: fixture.identity.organizationId,
        prospect_phone: "+15550007338",
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
        prospect_phone: "+15550007338",
        milestone_before: "INTERVIEW_SCHEDULING",
        milestone_after: "INTERVIEW_SCHEDULING",
        payload: { conversationLogId: "in-t11", bodyPreview: "6?" },
        created_at: "2026-08-06T01:02:52.841Z"
      },
      {
        id: "wf-ownership",
        event_type: "WorkflowOwnershipChanged",
        actor: "SYSTEM",
        prospect_phone: "+15550007338",
        milestone_before: "INTERVIEW_SCHEDULING",
        milestone_after: "INTERVIEW_SCHEDULED",
        payload: { note: "ownership snapshot" },
        created_at: "2026-08-06T01:03:20.000Z"
      }
    ],
    appointments: [
      {
        id: fixture.identity.appointmentId,
        prospectId: fixture.identity.prospectId,
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
  assert.equal(maskPhoneLast4("+13059997338"), "***7338");
  const masked = maskProviderMessageId("wamid.ABCDEFGHIJKLMNOPQRSTUV");
  assert.match(masked, /…/);
  assert.notEqual(masked, "wamid.ABCDEFGHIJKLMNOPQRSTUV");
});

test("channel identities resolve from authorized prospect, not from bare phone auth", () => {
  const identities = resolveChannelIdentitiesFromProspect(
    {
      id: "29853100-f151-4ca8-b07d-624fd20c6685",
      phone: "+15550007338",
      created_at: "2026-07-01T00:00:00.000Z"
    },
    "legacy"
  );

  assert.equal(identities.length, 1);
  assert.equal(identities[0].isCurrent, true);
  assert.equal(identities[0].maskedAddress, "***7338");
  assert.ok(identities[0].normalizedAddress);
  assert.ok(collectAuthorizedPhoneVariants(identities).includes("+15550007338"));
  const published = publicChannelIdentities(identities);
  assert.equal(Object.prototype.hasOwnProperty.call(published[0], "normalizedAddress"), false);
});

test("ambiguous phone-only rows are excluded", () => {
  const stats = {
    authorizedProspectId: "p1",
    ambiguousRecordsExcluded: 0,
    unlinkedRecordsExcluded: 0
  };
  const kept = filterPhoneKeyedRows(
    [
      { id: 1, prospect_phone: "+15550007338", organization_id: null },
      { id: 2, prospect_phone: "+15550009999", organization_id: null }
    ],
    {
      organizationId: "org",
      authorizedPhones: new Set(["+15550007338"]),
      allowNullOrgPhoneFallback: false,
      stats
    }
  );
  assert.equal(kept.length, 0);
  assert.ok(stats.ambiguousRecordsExcluded >= 1);
});

test("flag detectors catch TV-000028 counteroffers and dangerous replies", () => {
  assert.ok(detectInboundFlags("6?").includes("counteroffer"));
  assert.ok(detectInboundFlags("What about 6:30 pm?").includes("counteroffer_630"));
  assert.ok(
    detectOutboundFlags("Missing authenticated agent id for appointment persistence.").includes(
      "internal_error_leaked"
    )
  );
});

test("TV-000028 synthetic timeline is prospect-canonical with forensic flags", async () => {
  const fixture = loadFixture();
  const sources = fixtureToSyntheticSources(fixture);
  const identities = resolveChannelIdentitiesFromProspect(
    {
      id: fixture.identity.prospectId,
      phone: "+15550007338",
      created_at: fixture.window.startUtc
    },
    "legacy"
  );

  const timeline = await buildCommunicationsCenterTimeline({
    prospectId: fixture.identity.prospectId,
    organizationId: fixture.identity.organizationId,
    prospectDisplayName: fixture.identity.displayName,
    preferredLanguage: "en",
    channelIdentities: identities,
    publicChannelIdentities: publicChannelIdentities(identities),
    authorizedPhones: collectAuthorizedPhoneVariants(identities),
    phoneFallbackAllowed: true,
    allowNullOrgPhoneFallback: true,
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

  assert.equal(timeline.prospect.id, fixture.identity.prospectId);
  assert.equal(timeline.prospect.displayName, "Juanito Garcia");
  assert.equal(timeline.prospect.currentContact.maskedAddress, "***7338");
  assert.ok(timeline.pagination);
  assert.equal(typeof timeline.dataQuality.legacyPhoneCorrelations, "number");
  assert.ok(timeline.dataQuality.legacyPhoneCorrelations > 0);

  const byText = (text) =>
    timeline.items.find(
      (item) => item.direction === "inbound" && item.content?.text === text
    );

  const six = byText("6?");
  assert.ok(six);
  assert.ok(six.flags.includes("counteroffer"));
  assert.ok(six.flags.includes("ignored_counteroffer"));
  assert.ok(six.flags.includes("legacy_phone_correlation"));
  assert.equal(six.metadata.correlationTier, "authorized_current_phone_fallback");

  assert.ok(byText("What about 6:30 pm?")?.flags.includes("ignored_counteroffer"));
  assert.ok(byText("I prefer at 6")?.flags.includes("ignored_counteroffer"));

  const leak = timeline.items.find((item) =>
    String(item.content?.text || "").includes("authenticated agent id")
  );
  assert.ok(leak?.flags.includes("internal_error_leaked"));

  assert.ok(timeline.items.some((item) => item.flags.includes("dual_confirmation")));
  assert.ok(timeline.items.some((item) => item.flags.includes("no_reschedule_path")));

  const appointment = timeline.items.find((item) => item.category === "appointment");
  assert.equal(appointment.metadata.correlationTier, "explicit_prospect_id");

  assert.ok(
    timeline.gaps.some((gap) => gap.code === "historical_channel_identity_unavailable")
  );

  // Must not require phone as top-level auth key
  assert.equal(Object.prototype.hasOwnProperty.call(timeline, "phone"), false);
});

test("prospect id is required; phone alone cannot build timeline", async () => {
  await assert.rejects(
    () =>
      buildCommunicationsCenterTimeline({
        phone: "+15550007338",
        organizationId: "org"
      }),
    /PROSPECT_ID_REQUIRED/
  );
});

test("route is prospect-id based and never phone-authorizes", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/communicationsCenter.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");

  assert.match(routeSource, /requireProspectAccessById/);
  assert.match(routeSource, /requireAtlasUser/);
  assert.match(routeSource, /organizationGuard/);
  assert.doesNotMatch(routeSource, /requireLegacyProspectAccess\(/);
  assert.doesNotMatch(routeSource, /\/:phone/);
  assert.match(serverSource, /\/api\/prospects\/:id\/communications/);
  assert.doesNotMatch(serverSource, /\/api\/communications-center/);
});

test("communications center does not rewrite Recruit AI engines", () => {
  const readModel = fs.readFileSync(
    path.join(__dirname, "../core/communicationsCenterReadModel.js"),
    "utf8"
  );
  assert.doesNotMatch(readModel, /semanticConversationEngine/);
  assert.doesNotMatch(readModel, /whatsappOutboundPipeline/);
});
