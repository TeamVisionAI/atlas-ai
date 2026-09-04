/**
 * BR-228 — WhatsApp voice-note media fetch starvation + connection-aware credentials.
 */

require("dotenv").config();
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createMemoryCommunicationMediaRepository,
  toPublicMedia,
  buildActionableMediaOrFilter,
  rowNeedsPollerWork
} = require("../core/communicationMedia/communicationMediaRepository");
const {
  persistInboundAudioMedia,
  processCommunicationMediaById,
  processPendingWhatsAppMediaFetches,
  processOneCommunicationMediaFetch,
  resolveInboundPhoneNumberId,
  fetchWhatsAppAudioBytes
} = require("../core/communicationMedia/whatsappMediaFetchService");
const { createCommunicationMediaPlayback } = require("../core/communicationMedia/communicationMediaPlaybackService");
const { resolveWhatsAppMediaFetchCredentials } = require("../core/whatsappSendCredentials");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
const recruitingWorkflowHooks = require("../core/recruitingWorkflowHooks");
const { processOneCommunicationMediaTranscript } = require("../core/communicationMedia/whatsappAudioTranscriptService");
const { sanitizeCommunicationsCenterResponse } = require("../core/communicationsCenterSanitizer");
const {
  FETCH_STATUS,
  TRANSCODE_STATUS,
  TRANSCRIPT_STATUS,
  MAX_FETCH_ATTEMPTS,
  FETCH_POLL_BATCH_LIMIT
} = require("../core/communicationMedia/constants");

const TV_ORG = "00000000-0000-4000-8000-000000000001";
const TL_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const PROSPECT_ID = "11111111-1111-4111-8111-111111111111";
const ORG_LINE_PNID = "763909416807598";
const PERSONAL_LINE_PNID = "336196332914297";
const ENV_TV_PNID = "1213865645144311";

function inboundAudio(overrides = {}) {
  return {
    providerMessageId: "wamid.BR228.AUDIO",
    phone: "+17865550100",
    contactName: "Camila",
    messageType: "audio",
    body: "[audio message]",
    timestamp: new Date().toISOString(),
    phoneNumberId: ORG_LINE_PNID,
    media: {
      kind: "audio",
      metaMediaId: "meta-br228-1",
      mimeType: "audio/ogg; codecs=opus",
      isVoiceNote: true,
      sha256: "abc123sha",
      fileSize: 12345
    },
    rawMessage: { type: "audio", audio: { id: "meta-br228-1" } },
    ...overrides
  };
}

function completedRow(index) {
  return {
    id: `completed-${index}`,
    organizationId: TV_ORG,
    prospectId: PROSPECT_ID,
    providerMessageId: `wamid.DONE.${index}`,
    mediaKind: "audio",
    metaMediaId: `meta-done-${index}`,
    fetchStatus: FETCH_STATUS.STORED,
    transcodeStatus: TRANSCODE_STATUS.READY,
    transcriptStatus: TRANSCRIPT_STATUS.READY,
    storagePath: `${TV_ORG}/${PROSPECT_ID}/wamid.DONE.${index}/original.ogg`,
    playbackPath: `${TV_ORG}/${PROSPECT_ID}/wamid.DONE.${index}/playback.mp3`,
    playbackMimeType: "audio/mpeg",
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
  };
}

function pendingRow(overrides = {}) {
  return {
    id: "pending-new",
    organizationId: TV_ORG,
    prospectId: PROSPECT_ID,
    providerMessageId: "wamid.PENDING.NEW",
    mediaKind: "audio",
    metaMediaId: "meta-pending-new",
    mimeType: "audio/ogg; codecs=opus",
    fetchStatus: FETCH_STATUS.PENDING,
    fetchAttempts: 0,
    updatedAt: new Date(Date.UTC(2026, 8, 3, 12, 0, 0)).toISOString(),
    ...overrides
  };
}

function createConnectionRepo(connections) {
  const rows = connections.map((row) => ({ ...row }));
  return {
    async findConnectionByPhoneNumberId(phoneNumberId) {
      return (
        rows.find(
          (row) =>
            String(row.phone_number_id) === String(phoneNumberId) &&
            row.status === "connected"
        ) || null
      );
    },
    async getDecryptedAccessToken(organizationId, userId = null) {
      const match = rows.find(
        (row) =>
          String(row.organization_id) === String(organizationId) &&
          (userId
            ? String(row.user_id || "") === String(userId)
            : !row.user_id)
      );
      return match?.accessToken || null;
    }
  };
}

recruitingWorkflowHooks.onMessageReceived = async () => null;

function createPipelineDeps(repository, extras = {}) {
  const claims = extras.claims || new Set();
  return {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: TV_ORG,
      source: "explicit"
    }),
    claimWhatsAppInboundCorrelation: async ({ providerMessageId }) => {
      const key = `claim:${providerMessageId}`;
      if (claims.has(key)) {
        return { claimed: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
      }
      claims.add(key);
      return { claimed: true };
    },
    locateOrCreateWhatsAppProspect: async () => ({
      prospect: {
        id: PROSPECT_ID,
        phone: "+17865550100",
        name: "Camila",
        current_step: "NEW",
        organization_id: TV_ORG
      },
      created: false,
      storagePhone: "+17865550100",
      organizationId: TV_ORG
    }),
    logConversation: async () => ({
      success: true,
      log: { id: "log-br228" }
    }),
    processConversationAfterInbound: async () => ({
      success: true,
      replied: false,
      reason: "AUDIO_STT_PENDING"
    }),
    persistInboundAudioMedia: (input) =>
      persistInboundAudioMedia({ ...input, repository }),
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
    disableFirstReplyRecovery: true,
    communicationMediaRepository: repository,
    scheduleMediaProcessing: extras.scheduleMediaProcessing || ((work) => work()),
    processCommunicationMediaById: extras.processCommunicationMediaById,
    mediaProcessingDependencies: extras.mediaProcessingDependencies || {},
    ...extras.deps
  };
}

test("A. inbound voice note persists meta_media_id", async () => {
  const repository = createMemoryCommunicationMediaRepository();
  const result = await persistInboundAudioMedia({
    organizationId: TV_ORG,
    prospectId: PROSPECT_ID,
    conversationLogId: "log-br228",
    inbound: inboundAudio(),
    repository
  });
  assert.equal(result.inserted, true);
  assert.equal(result.row.meta_media_id, "meta-br228-1");
  assert.equal(result.row.fetch_status, FETCH_STATUS.PENDING);
  assert.equal(result.row.fetch_attempts, 0);
  assert.doesNotMatch(String(result.row.storage_path || ""), /lookaside\.fbsbx\.com|graph\.facebook\.com/);
});

test("B. listPending returns pending even when 40+ completed rows are older", async () => {
  const seed = [
    ...Array.from({ length: 45 }, (_, index) => completedRow(index)),
    pendingRow()
  ];
  const repository = createMemoryCommunicationMediaRepository(seed);
  const pending = await repository.listPending({ limit: 5 });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "pending-new");
  assert.equal(pending[0].fetch_status, FETCH_STATUS.PENDING);

  const filter = buildActionableMediaOrFilter({
    now: Date.parse("2026-09-03T12:00:00.000Z"),
    staleMs: 5 * 60 * 1000
  });
  assert.match(filter, /fetch_status\.eq\.pending/);
  assert.doesNotMatch(filter, /fetch_status\.eq\.stored,transcode_status\.eq\.ready,transcript_status\.eq\.ready/);

  const repoSrc = fs.readFileSync(
    path.join(__dirname, "../core/communicationMedia/communicationMediaRepository.js"),
    "utf8"
  );
  assert.match(repoSrc, /buildActionableMediaOrFilter/);
  assert.match(repoSrc, /\.or\(buildActionableMediaOrFilter/);
});

test("C. webhook immediate processing targets the newly created media id", async () => {
  const repository = createMemoryCommunicationMediaRepository();
  const processed = [];
  const deps = createPipelineDeps(repository, {
    processCommunicationMediaById: async (input) => {
      processed.push(input);
      return { status: FETCH_STATUS.PENDING, id: input.mediaId };
    }
  });
  await processInboundWhatsAppMessage(
    inboundAudio({ providerMessageId: "wamid.BR228.IMMEDIATE", phoneNumberId: ORG_LINE_PNID }),
    deps
  );
  assert.equal(repository._rows.length, 1);
  assert.equal(processed.length, 1);
  assert.equal(processed[0].mediaId, repository._rows[0].id);
  assert.equal(processed[0].organizationId, TV_ORG);
  assert.equal(processed[0].phoneNumberId, ORG_LINE_PNID);
});

test("D/E. org-owned and personal-line fetch use the receiving connection token", async () => {
  const orgRepo = createConnectionRepo([
    {
      organization_id: TV_ORG,
      status: "connected",
      phone_number_id: ORG_LINE_PNID,
      accessToken: "org-line-token"
    },
    {
      organization_id: TV_ORG,
      status: "connected",
      phone_number_id: PERSONAL_LINE_PNID,
      user_id: "agent-personal-1",
      accessToken: "personal-line-token"
    }
  ]);

  const orgCreds = await resolveWhatsAppMediaFetchCredentials({
    organizationId: TV_ORG,
    phoneNumberId: ORG_LINE_PNID,
    connectionRepository: orgRepo
  });
  assert.equal(orgCreds.accessToken, "org-line-token");
  assert.equal(orgCreds.phoneNumberId, ORG_LINE_PNID);

  const personalCreds = await resolveWhatsAppMediaFetchCredentials({
    organizationId: TV_ORG,
    phoneNumberId: PERSONAL_LINE_PNID,
    connectionRepository: orgRepo
  });
  assert.equal(personalCreds.accessToken, "personal-line-token");
  assert.equal(personalCreds.phoneNumberId, PERSONAL_LINE_PNID);

  const seenTokens = [];
  await fetchWhatsAppAudioBytes({
    organizationId: TV_ORG,
    metaMediaId: "meta-org",
    phoneNumberId: ORG_LINE_PNID,
    connectionRepository: orgRepo,
    graphGetJson: async (_url, token) => {
      seenTokens.push(token);
      return { url: "https://lookaside.fbsbx.com/tmp/audio", mime_type: "audio/ogg" };
    },
    downloadBytes: async (url, token) => {
      seenTokens.push(token);
      assert.match(url, /lookaside\.fbsbx\.com/);
      return { buffer: Buffer.from("ogg"), mimeType: "audio/ogg" };
    }
  });
  assert.deepEqual(seenTokens, ["org-line-token", "org-line-token"]);
});

test("F. Team Vision / Team Legacy isolation is fail-closed", async () => {
  const repo = createConnectionRepo([
    {
      organization_id: TV_ORG,
      status: "connected",
      phone_number_id: ENV_TV_PNID,
      accessToken: "team-vision-token"
    },
    {
      organization_id: TL_ORG,
      status: "connected",
      phone_number_id: ORG_LINE_PNID,
      accessToken: "team-legacy-token"
    }
  ]);

  const crossTenant = await resolveWhatsAppMediaFetchCredentials({
    organizationId: TL_ORG,
    phoneNumberId: ENV_TV_PNID,
    connectionRepository: repo
  });
  assert.equal(crossTenant, null);

  const missingPnid = await resolveWhatsAppMediaFetchCredentials({
    organizationId: TL_ORG,
    connectionRepository: repo
  });
  assert.equal(missingPnid, null);

  await assert.rejects(
    () =>
      fetchWhatsAppAudioBytes({
        organizationId: TL_ORG,
        metaMediaId: "meta-tl",
        phoneNumberId: ENV_TV_PNID,
        connectionRepository: repo,
        graphGetJson: async () => {
          throw new Error("must not call Graph with a foreign token");
        }
      }),
    (error) => error.publicCode === "WHATSAPP_CREDENTIALS_MISSING"
  );

  assert.equal(
    await resolveInboundPhoneNumberId(
      { organization_id: TL_ORG, provider_message_id: "wamid.X" },
      {
        findObservabilityByProviderMessageId: async () => ({
          phone_number_id: ENV_TV_PNID,
          organization_id: TV_ORG
        })
      }
    ),
    null
  );
});

test("G. expired Meta media becomes observable failed after retry policy", async () => {
  const repository = createMemoryCommunicationMediaRepository([
    pendingRow({ id: "expired-1", fetchAttempts: MAX_FETCH_ATTEMPTS - 1 })
  ]);
  const result = await processOneCommunicationMediaFetch(repository._rows[0], {
    repository,
    phoneNumberId: ORG_LINE_PNID,
    credentialsResolver: async () => ({ accessToken: "line-token" }),
    graphGetJson: async () => {
      const error = new Error("META_MEDIA_LOOKUP_FAILED");
      error.publicCode = "META_MEDIA_LOOKUP_FAILED";
      error.statusCode = 404;
      throw error;
    }
  });
  assert.equal(result.status, FETCH_STATUS.FAILED);
  assert.equal(repository._rows[0].fetch_status, FETCH_STATUS.FAILED);
  assert.equal(repository._rows[0].fetch_attempts, MAX_FETCH_ATTEMPTS);
  assert.equal(repository._rows[0].fetch_error, "META_MEDIA_LOOKUP_FAILED");
});

test("H. successful fetch stores a private object and playback works", async () => {
  const repository = createMemoryCommunicationMediaRepository([pendingRow({ id: "store-1" })]);
  const result = await processCommunicationMediaById({
    mediaId: "store-1",
    organizationId: TV_ORG,
    phoneNumberId: ORG_LINE_PNID,
    repository,
    credentialsResolver: async () => ({ accessToken: "line-token" }),
    graphGetJson: async () => ({
      url: "https://lookaside.fbsbx.com/tmp/audio",
      mime_type: "audio/mpeg"
    }),
    downloadBytes: async () => ({ buffer: Buffer.from("ID3mp3"), mimeType: "audio/mpeg" }),
    uploadOriginalMedia: async ({ organizationId, prospectId, providerMessageId }) => ({
      storagePath: `${organizationId}/${prospectId}/${providerMessageId}/original.mp3`,
      bucket: "communication-media"
    })
  });
  const row = repository._rows[0];
  assert.equal(result.status, FETCH_STATUS.STORED);
  assert.equal(row.fetch_status, FETCH_STATUS.STORED);
  assert.equal(row.storage_path, `${TV_ORG}/${PROSPECT_ID}/wamid.PENDING.NEW/original.mp3`);
  assert.doesNotMatch(row.storage_path, /lookaside\.fbsbx\.com|graph\.facebook\.com/);
  assert.ok(row.fetch_attempts >= 1);

  const playback = await createCommunicationMediaPlayback({
    organizationId: TV_ORG,
    prospectId: PROSPECT_ID,
    mediaId: "store-1",
    authorizedProspect: { id: PROSPECT_ID, organization_id: TV_ORG },
    repository,
    signUrl: async (storagePath) => {
      assert.equal(storagePath, row.playback_path || row.storage_path);
      return { url: "https://signed.supabase.example/audio", expiresIn: 120 };
    }
  });
  assert.equal(playback.url, "https://signed.supabase.example/audio");
  assert.doesNotMatch(JSON.stringify(playback), /line-token|lookaside\.fbsbx\.com|EAAB/);
});

test("I/J. STT failure does not block playback; transcript appears when STT succeeds", async () => {
  const failedRepo = createMemoryCommunicationMediaRepository([
    {
      id: "stt-fail",
      organizationId: TV_ORG,
      prospectId: PROSPECT_ID,
      providerMessageId: "wamid.STT.FAIL",
      mediaKind: "audio",
      fetchStatus: FETCH_STATUS.STORED,
      transcodeStatus: TRANSCODE_STATUS.READY,
      storagePath: `${TV_ORG}/${PROSPECT_ID}/wamid.STT.FAIL/original.ogg`,
      playbackPath: `${TV_ORG}/${PROSPECT_ID}/wamid.STT.FAIL/playback.mp3`,
      playbackMimeType: "audio/mpeg",
      transcriptStatus: TRANSCRIPT_STATUS.PENDING
    }
  ]);
  await processOneCommunicationMediaTranscript(failedRepo._rows[0], {
    repository: failedRepo,
    prospect: { id: PROSPECT_ID, organization_id: TV_ORG, preferred_language: "spanish" },
    downloadStoredMedia: async () => Buffer.from("mp3"),
    transcribeFn: async () => ({ text: "   ", language: "es", provider: "openai" }),
    scheduleSoftAck: () => 0,
    cancelSoftAck: () => {},
    deliverWhatsAppReply: async () => ({ success: true, replied: true })
  });
  const failedPublic = toPublicMedia(failedRepo._rows[0]);
  assert.equal(failedPublic.playbackAvailable, true);
  assert.equal(failedPublic.transcriptStatus, TRANSCRIPT_STATUS.FAILED);
  assert.equal(failedPublic.transcriptText, null);
  const failedPlayback = await createCommunicationMediaPlayback({
    organizationId: TV_ORG,
    prospectId: PROSPECT_ID,
    mediaId: "stt-fail",
    authorizedProspect: { id: PROSPECT_ID, organization_id: TV_ORG },
    repository: failedRepo,
    signUrl: async () => ({ url: "https://signed.example/fail.mp3", expiresIn: 120 })
  });
  assert.equal(failedPlayback.url, "https://signed.example/fail.mp3");

  const readyRepo = createMemoryCommunicationMediaRepository([
    {
      id: "stt-ok",
      organizationId: TV_ORG,
      prospectId: PROSPECT_ID,
      providerMessageId: "wamid.STT.OK",
      mediaKind: "audio",
      fetchStatus: FETCH_STATUS.STORED,
      transcodeStatus: TRANSCODE_STATUS.READY,
      storagePath: `${TV_ORG}/${PROSPECT_ID}/wamid.STT.OK/original.ogg`,
      playbackPath: `${TV_ORG}/${PROSPECT_ID}/wamid.STT.OK/playback.mp3`,
      playbackMimeType: "audio/mpeg",
      transcriptStatus: TRANSCRIPT_STATUS.PENDING
    }
  ]);
  await processOneCommunicationMediaTranscript(readyRepo._rows[0], {
    repository: readyRepo,
    prospect: { id: PROSPECT_ID, organization_id: TV_ORG, preferred_language: "spanish" },
    downloadStoredMedia: async () => Buffer.from("mp3"),
    transcribeFn: async () => ({
      text: "Vivo en Miami",
      language: "es",
      provider: "openai",
      model: "gpt-transcribe"
    }),
    scheduleSoftAck: () => 0,
    cancelSoftAck: () => {},
    attemptLiveV2Authoring: async () => ({ handled: false }),
    deliverWhatsAppReply: async () => ({ success: true, replied: false })
  });
  const readyPublic = toPublicMedia(readyRepo._rows[0]);
  assert.equal(readyPublic.playbackAvailable, true);
  assert.equal(readyPublic.transcriptStatus, TRANSCRIPT_STATUS.READY);
  assert.match(String(readyPublic.transcriptText), /Miami/);
});

test("K. text / image / document inbound does not persist audio media or schedule fetch", async () => {
  const repository = createMemoryCommunicationMediaRepository();
  const processed = [];
  const deps = createPipelineDeps(repository, {
    processConversationAfterInbound: async () => ({ success: true, replied: false }),
    processCommunicationMediaById: async (input) => {
      processed.push(input);
      return input;
    }
  });

  for (const inbound of [
    {
      providerMessageId: "wamid.TEXT",
      phone: "+17865550100",
      messageType: "text",
      body: "Hola",
      phoneNumberId: ORG_LINE_PNID
    },
    {
      providerMessageId: "wamid.IMAGE",
      phone: "+17865550100",
      messageType: "image",
      body: "[image]",
      phoneNumberId: ORG_LINE_PNID,
      media: { kind: "image", metaMediaId: "img-1", mimeType: "image/jpeg" }
    },
    {
      providerMessageId: "wamid.DOC",
      phone: "+17865550100",
      messageType: "document",
      body: "[document]",
      phoneNumberId: ORG_LINE_PNID,
      media: { kind: "document", metaMediaId: "doc-1", mimeType: "application/pdf" }
    }
  ]) {
    const persist = await persistInboundAudioMedia({
      organizationId: TV_ORG,
      prospectId: PROSPECT_ID,
      inbound,
      repository
    });
    assert.equal(persist, null);
    await processInboundWhatsAppMessage(inbound, deps);
  }
  assert.equal(repository._rows.length, 0);
  assert.equal(processed.length, 0);
});

test("L. public / browser payloads never include Meta tokens or temp URLs", () => {
  const repository = createMemoryCommunicationMediaRepository([
    {
      id: "public-1",
      organizationId: TV_ORG,
      prospectId: PROSPECT_ID,
      providerMessageId: "wamid.PUBLIC",
      mediaKind: "audio",
      metaMediaId: "secret-meta-id",
      fetchStatus: FETCH_STATUS.STORED,
      transcodeStatus: TRANSCODE_STATUS.READY,
      storagePath: `${TV_ORG}/${PROSPECT_ID}/wamid.PUBLIC/original.ogg`,
      playbackPath: `${TV_ORG}/${PROSPECT_ID}/wamid.PUBLIC/playback.mp3`,
      fetchError: "Graph 190 EAABSECRET",
      transcriptStatus: TRANSCRIPT_STATUS.READY,
      transcriptText: "Hola"
    }
  ]);
  const publicMedia = toPublicMedia(repository._rows[0]);
  const json = JSON.stringify(publicMedia);
  assert.doesNotMatch(json, /EAABSECRET|secret-meta-id|lookaside|access_token|storage_path/i);
  assert.equal(publicMedia.playbackAvailable, true);

  const sanitized = sanitizeCommunicationsCenterResponse({
    content: {
      text: "[audio message]",
      media: {
        id: "public-1",
        access_token: "EAABSECRET",
        meta_media_id: "secret-meta-id",
        storage_path: `${TV_ORG}/x/original.ogg`
      }
    }
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /EAABSECRET|secret-meta-id/);

  const bubble = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/components/communication/CommunicationAudioBubble.jsx"),
    "utf8"
  );
  assert.match(bubble, /communications\/media\/.*playback/);
  assert.doesNotMatch(bubble, /WHATSAPP_ACCESS_TOKEN|graph\.facebook\.com|lookaside/);
});

test("M. completed rows are not repeatedly polled; poller batch stays conservative", async () => {
  const repository = createMemoryCommunicationMediaRepository(
    Array.from({ length: 12 }, (_, index) => completedRow(index))
  );
  const now = Date.parse("2026-09-03T12:00:00.000Z");
  const pending = await repository.listPending({ limit: 40, now });
  assert.equal(pending.length, 0);
  assert.equal(
    repository._rows.every((row) => rowNeedsPollerWork(row, now, 5 * 60 * 1000) === false),
    true
  );

  let fetches = 0;
  const results = await processPendingWhatsAppMediaFetches({
    repository,
    credentialsResolver: async () => {
      fetches += 1;
      return { accessToken: "must-not-run" };
    }
  });
  assert.equal(results.length, 0);
  assert.equal(fetches, 0);
  assert.equal(FETCH_POLL_BATCH_LIMIT, 5);

  const pollerSrc = fs.readFileSync(
    path.join(__dirname, "../core/communicationMedia/whatsappMediaFetchService.js"),
    "utf8"
  );
  assert.match(pollerSrc, /FETCH_POLL_BATCH_LIMIT/);
  assert.match(pollerSrc, /processCommunicationMediaById/);
});
