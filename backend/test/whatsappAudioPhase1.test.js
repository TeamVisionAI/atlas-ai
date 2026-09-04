/**
 * WhatsApp audio Phase 0 + Phase 1 — local contract tests.
 * No STT. No ownership / BR-080 / qualification mutation.
 */

require("dotenv").config();
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const PROSPECT_ID = "11111111-1111-4111-8111-111111111111";

const {
  parseWhatsAppWebhookBody,
  extractWhatsAppMedia,
  normalizeMessageBody
} = require("../services/whatsappWebhookParser");
const {
  isRealWhatsAppCommunication,
  isOperationalCommunicationText,
  computeLastCommunication,
  computeUnreadState
} = require("../core/conversationsCenter/conversationsUnreadEngine");
const {
  createMemoryCommunicationMediaRepository,
  toPublicMedia
} = require("../core/communicationMedia/communicationMediaRepository");
const {
  persistInboundAudioMedia,
  processOneCommunicationMediaFetch
} = require("../core/communicationMedia/whatsappMediaFetchService");
const {
  createCommunicationMediaPlayback
} = require("../core/communicationMedia/communicationMediaPlaybackService");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
const recruitingWorkflowHooks = require("../core/recruitingWorkflowHooks");
const { processNormalizedInboundMessage } = require("../core/communicationHub");
const { classifyInboundMedia } = require("../core/recruitAiV2/nonTextMedia");
const { extractInformation } = require("../core/informationExtractor");
const { buildNormalizedMessageFromWhatsApp } = require("../core/channelMessage");
const conversationEngine = require("../core/conversationEngine");
const newLeadAttentionEngine = require("../core/newLeadAttentionEngine");
const { sanitizeCommunicationsCenterResponse } = require("../core/communicationsCenterSanitizer");
const { FETCH_STATUS } = require("../core/communicationMedia/constants");

recruitingWorkflowHooks.onMessageReceived = async () => null;

function audioWebhook({ wamid = "wamid.AUDIO1", mediaId = "media-1" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "123" },
              contacts: [{ profile: { name: "Camila" }, wa_id: "17865550100" }],
              messages: [
                {
                  from: "17865550100",
                  id: wamid,
                  timestamp: "1755090000",
                  type: "audio",
                  audio: {
                    id: mediaId,
                    mime_type: "audio/ogg; codecs=opus",
                    voice: true,
                    sha256: "abc123sha",
                    file_size: 12345
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function inboundAudio(overrides = {}) {
  return {
    providerMessageId: "wamid.AUDIO1",
    phone: "+17865550100",
    contactName: "Camila",
    messageType: "audio",
    body: "[audio message]",
    timestamp: new Date().toISOString(),
    media: {
      kind: "audio",
      metaMediaId: "media-1",
      mimeType: "audio/ogg; codecs=opus",
      isVoiceNote: true,
      sha256: "abc123sha",
      fileSize: 12345
    },
    rawMessage: { type: "audio", audio: { id: "media-1" } },
    ...overrides
  };
}

function createPipelineHarness(repository) {
  const attention = { ai: 0, human: 0 };
  return {
    attention,
    deps: {
      resolveWhatsAppInboundOrganizationId: async () => ({
        organizationId: ORG_A,
        source: "explicit"
      }),
      claimWhatsAppInboundCorrelation: async ({ providerMessageId }) => {
        const key = `claim:${providerMessageId}`;
        if (createPipelineHarness._claims.has(key)) {
          return { claimed: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
        }
        createPipelineHarness._claims.add(key);
        return { claimed: true };
      },
      locateOrCreateWhatsAppProspect: async () => ({
        prospect: {
          id: PROSPECT_ID,
          phone: "+17865550100",
          name: "Camila",
          current_step: "NEW",
          organization_id: ORG_A,
          city: "Miami",
          state: "FL"
        },
        created: false,
        storagePhone: "+17865550100",
        organizationId: ORG_A
      }),
      logConversation: async () => ({
        success: true,
        log: { id: "log-audio-1" }
      }),
      processConversationAfterInbound: async () => ({
        success: true,
        replied: false,
        reason: "AUDIO_STT_PENDING"
      }),
      persistInboundAudioMedia: (input) =>
        persistInboundAudioMedia({ ...input, repository }),
      communicationMediaRepository: repository,
      scheduleMediaProcessing: () => {},
      campaignIntakeAttributionService: {
        lookupInboundMatch: async () => ({ matched: false })
      },
      prospectHasDeliveredAutomatedOutbound: async () => false,
      prospectHasAutomatedOutboundReply: async () => false,
      reactivateWindowExpiredConversation: async () => null,
      scheduleInboundBurstAggregation: async ({ inbound }) => ({
        inbound,
        burst: false
      }),
      disableFirstReplyRecovery: true
    }
  };
}
createPipelineHarness._claims = new Set();

test("1. audio webhook parser extracts media metadata", () => {
  const messages = parseWhatsAppWebhookBody(audioWebhook());
  assert.equal(messages.length, 1);
  const [message] = messages;
  assert.equal(message.messageType, "audio");
  assert.equal(message.body, "[audio message]");
  assert.equal(message.providerMessageId, "wamid.AUDIO1");
  assert.equal(message.phone, "+17865550100");
  assert.ok(message.rawMessage);
  assert.deepEqual(extractWhatsAppMedia(message.rawMessage), {
    kind: "audio",
    metaMediaId: "media-1",
    mimeType: "audio/ogg; codecs=opus",
    isVoiceNote: true,
    sha256: "abc123sha",
    fileSize: 12345
  });
  assert.equal(message.media.metaMediaId, "media-1");
  assert.doesNotMatch(JSON.stringify(message), /access_token|Bearer /i);
});

test("2. audio remains idempotent on duplicate wamid", async () => {
  createPipelineHarness._claims = new Set();
  const repository = createMemoryCommunicationMediaRepository();
  const { deps } = createPipelineHarness(repository);
  const first = await processInboundWhatsAppMessage(inboundAudio(), deps);
  const second = await processInboundWhatsAppMessage(inboundAudio(), deps);
  assert.equal(first.success, true);
  assert.equal(first.skipped, false);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(repository._rows.length, 1);
});

test("3. structured media record is org-scoped", async () => {
  const repository = createMemoryCommunicationMediaRepository();
  const result = await persistInboundAudioMedia({
    organizationId: ORG_A,
    prospectId: PROSPECT_ID,
    conversationLogId: "log-1",
    inbound: inboundAudio(),
    repository
  });
  assert.equal(result.inserted, true);
  assert.equal(result.row.organization_id, ORG_A);
  assert.equal(result.row.prospect_id, PROSPECT_ID);
  assert.equal(result.row.media_kind, "audio");
  assert.equal(result.row.fetch_status, FETCH_STATUS.PENDING);
  const publicMedia = toPublicMedia(result.row);
  assert.equal(publicMedia.playbackAvailable, false);
  assert.equal("fetch_error" in publicMedia, false);
  assert.equal("storage_path" in publicMedia, false);
  assert.equal("meta_media_id" in publicMedia, false);
});

test("4–8. audio counts as real communication, unread, lastCommunicationAt, friendly preview; operational still hidden", () => {
  const audioAt = "2026-08-13T16:00:00.000Z";
  const textAt = "2026-08-13T15:00:00.000Z";
  const blockedAt = "2026-08-13T17:00:00.000Z";
  const logs = [
    {
      id: "in-text",
      direction: "incoming",
      message: "Hola",
      created_at: textAt
    },
    {
      id: "in-audio",
      direction: "incoming",
      message: "[audio message]",
      messageType: "audio",
      created_at: audioAt
    },
    {
      id: "out-blocked",
      direction: "outgoing",
      message: "[whatsapp_outbound:blocked_template_missing] intent=HUMAN_COMPOSER_REPLY",
      intent: "WHATSAPP_OUTBOUND_BLOCKED_TEMPLATE_MISSING",
      created_at: blockedAt
    }
  ];

  assert.equal(isOperationalCommunicationText("[audio message]"), false);
  assert.equal(isRealWhatsAppCommunication(logs[1]), true);
  assert.equal(isRealWhatsAppCommunication(logs[2]), false);

  const last = computeLastCommunication(logs);
  assert.equal(last.lastCommunicationAt, audioAt);
  assert.equal(last.lastMessagePreview, "Voice message");
  assert.equal(last.lastMessagePreviewKind, "voice_message");
  assert.equal(last.lastDirection, "inbound");

  const unread = computeUnreadState({ logs, lastReadInboundAt: textAt });
  assert.equal(unread.unread, true);
  assert.equal(unread.unreadCount, 1);

  const afterRead = computeUnreadState({ logs, lastReadInboundAt: audioAt });
  assert.equal(afterRead.unread, false);
});

test("9–10. no qualification mutation; legacy CE does not interpret audio placeholder", async () => {
  const extracted = extractInformation("[audio message]", {});
  assert.equal(extracted.city, undefined);
  assert.equal(extracted.state, undefined);
  assert.equal(extracted.authorization, undefined);

  assert.equal(
    classifyInboundMedia({ text: "[audio message]", messageType: "audio" }).isNonTextMedia,
    true
  );

  let ceCalled = false;
  const originalHandle = conversationEngine.handleIncomingMessage;
  conversationEngine.handleIncomingMessage = async () => {
    ceCalled = true;
    return { reply: "¿En qué ciudad estás?" };
  };

  try {
    const result = await processNormalizedInboundMessage(
      buildNormalizedMessageFromWhatsApp(inboundAudio(), "+17865550100"),
      {
        prospect: {
          id: PROSPECT_ID,
          phone: "+17865550100",
          organization_id: ORG_A,
          name: "Camila",
          current_step: "NEW"
        },
        env: {
          RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "false",
          RECRUIT_AI_V2_EXECUTION_ENABLED: "false"
        }
      }
    );
    assert.equal(ceCalled, false);
    assert.equal(result.success, true);
    assert.equal(result.replied, false);
    assert.equal(result.reason, "AUDIO_STT_PENDING");
  } finally {
    conversationEngine.handleIncomingMessage = originalHandle;
  }
});

test("11. media fetch credentials stay server-side", () => {
  const fetchSrc = fs.readFileSync(
    path.join(__dirname, "../core/communicationMedia/whatsappMediaFetchService.js"),
    "utf8"
  );
  const playbackRoute = fs.readFileSync(
    path.join(__dirname, "../routes/communicationMedia.js"),
    "utf8"
  );
  const bubble = fs.readFileSync(
    path.join(
      __dirname,
      "../../frontend/src/components/communication/CommunicationAudioBubble.jsx"
    ),
    "utf8"
  );
  assert.match(fetchSrc, /resolveWhatsAppMediaFetchCredentials/);
  assert.match(fetchSrc, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(playbackRoute, /WHATSAPP_ACCESS_TOKEN|accessToken/);
  assert.doesNotMatch(bubble, /WHATSAPP_ACCESS_TOKEN|graph\.facebook\.com/);
});

test("12–13. signed URL access is org guarded; wrong-org denied", async () => {
  const repository = createMemoryCommunicationMediaRepository([
    {
      id: "media-stored-1",
      organizationId: ORG_A,
      prospectId: PROSPECT_ID,
      providerMessageId: "wamid.AUDIO1",
      mediaKind: "audio",
      fetchStatus: FETCH_STATUS.STORED,
      transcodeStatus: "ready",
      storagePath: `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO1/original.ogg`,
      playbackPath: `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO1/playback.mp3`,
      playbackMimeType: "audio/mpeg",
      mimeType: "audio/ogg"
    }
  ]);

  const signedPaths = [];
  const ok = await createCommunicationMediaPlayback({
    organizationId: ORG_A,
    prospectId: PROSPECT_ID,
    mediaId: "media-stored-1",
    authorizedProspect: { id: PROSPECT_ID, organization_id: ORG_A },
    repository,
    signUrl: async (storagePath) => {
      signedPaths.push(storagePath);
      return { url: "https://signed.example/audio", expiresIn: 120 };
    }
  });
  assert.equal(ok.url, "https://signed.example/audio");
  assert.equal(ok.expiresIn, 120);
  assert.equal(ok.mimeType, "audio/mpeg");
  assert.deepEqual(signedPaths, [`${ORG_A}/${PROSPECT_ID}/wamid.AUDIO1/playback.mp3`]);
  assert.doesNotMatch(JSON.stringify(ok), /WHATSAPP_ACCESS_TOKEN|Bearer /);

  await assert.rejects(
    () =>
      createCommunicationMediaPlayback({
        organizationId: ORG_B,
        prospectId: PROSPECT_ID,
        mediaId: "media-stored-1",
        authorizedProspect: { id: PROSPECT_ID, organization_id: ORG_B },
        repository,
        signUrl: async () => ({ url: "https://signed.example/audio", expiresIn: 120 })
      }),
    (error) => error.statusCode === 403 || error.statusCode === 404
  );
});

test("14. failed media fetch does not change ownership", async () => {
  const repository = createMemoryCommunicationMediaRepository([
    {
      id: "media-fail-1",
      organizationId: ORG_A,
      prospectId: PROSPECT_ID,
      providerMessageId: "wamid.AUDIO-FAIL",
      mediaKind: "audio",
      metaMediaId: "meta-fail",
      fetchStatus: FETCH_STATUS.PENDING,
      fetchAttempts: 4
    }
  ]);
  const ownership = { takeOver: 0, attention: 0 };
  const result = await processOneCommunicationMediaFetch(repository._rows[0], {
    repository,
    credentialsResolver: async () => null,
    graphGetJson: async () => {
      ownership.takeOver += 1;
      return {};
    }
  });
  assert.equal(result.status, FETCH_STATUS.FAILED);
  assert.equal(repository._rows[0].fetch_status, FETCH_STATUS.FAILED);
  assert.equal(ownership.takeOver, 0);
  assert.equal(repository._rows[0].fetch_error, "WHATSAPP_CREDENTIALS_MISSING");
});

test("15. BR-080 unaffected by audio persist + no-reply hub", async () => {
  createPipelineHarness._claims = new Set();
  const repository = createMemoryCommunicationMediaRepository();
  const { deps } = createPipelineHarness(repository);
  const originalAi = newLeadAttentionEngine.markAiResponding;
  const originalHuman = newLeadAttentionEngine.markHumanAttentionRequired;
  let ai = 0;
  let human = 0;
  newLeadAttentionEngine.markAiResponding = async () => {
    ai += 1;
  };
  newLeadAttentionEngine.markHumanAttentionRequired = async () => {
    human += 1;
  };
  try {
    const result = await processInboundWhatsAppMessage(inboundAudio({ providerMessageId: "wamid.BR080" }), deps);
    assert.equal(result.success, true);
    assert.equal(ai, 0);
    assert.equal(human, 0);
  } finally {
    newLeadAttentionEngine.markAiResponding = originalAi;
    newLeadAttentionEngine.markHumanAttentionRequired = originalHuman;
  }
});

test("sanitizer strips media secrets from communications payload", () => {
  const sanitized = sanitizeCommunicationsCenterResponse({
    content: {
      text: "[audio message]",
      media: {
        id: "media-1",
        fetch_error: "Graph 190 invalid token abc",
        transcode_error: "ffmpeg stderr codec not found xyz",
        storage_path: `${ORG_A}/x/original.ogg`,
        meta_media_id: "secret-media",
        access_token: "EAABSECRET"
      }
    }
  });
  const json = JSON.stringify(sanitized);
  assert.doesNotMatch(json, /EAABSECRET/);
  assert.doesNotMatch(json, /invalid token/);
  assert.doesNotMatch(json, /ffmpeg stderr|codec not found/i);
});

test("normalizeMessageBody keeps audio placeholder compatibility", () => {
  assert.equal(normalizeMessageBody({ type: "audio" }), "[audio message]");
});

test("migration 039 is additive org-scoped private media", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/migrations/039_communication_media.sql"),
    "utf8"
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS communication_media/);
  assert.match(sql, /organization_id UUID NOT NULL/);
  assert.match(sql, /communication-media/);
  assert.match(sql, /public = false/);
  assert.match(sql, /transcript_status/);
  assert.match(sql, /transcode_status/);
  assert.match(sql, /playback_mime_type/);
  assert.doesNotMatch(sql, /whisper|openai|speech.to.text/i);
  assert.match(sql, /communication_media_deny_anon/);
});

test("playback route uses atlas user + org + prospect guards", () => {
  const route = fs.readFileSync(
    path.join(__dirname, "../routes/communicationMedia.js"),
    "utf8"
  );
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.match(route, /requireAtlasUser/);
  assert.match(route, /organizationGuard/);
  assert.match(route, /requireProspectAccessById/);
  assert.match(server, /communications\/media\/:mediaId\/playback/);
});
