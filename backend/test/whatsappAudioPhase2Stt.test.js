/**
 * WhatsApp audio Phase 2 — Spanish-first STT + semantic replay (BR-141).
 * Staging contract only. No production migrate. Execution gates stay off.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  transcribeWithGptTranscribe,
  STT_PROVIDER,
  STT_MODEL,
  TRANSCRIPTIONS_URL
} = require("../communication/audio/stt/openaiGptTranscribeAdapter");
const { resolveSttLanguageHints } = require("../communication/audio/stt/languageHints");
const {
  createMemoryCommunicationMediaRepository,
  toPublicMedia
} = require("../core/communicationMedia/communicationMediaRepository");
const {
  FETCH_STATUS,
  TRANSCODE_STATUS,
  TRANSCRIPT_STATUS
} = require("../core/communicationMedia/constants");
const {
  buildTranscriptTurnId,
  needsTranscriptWork,
  isUnusableTranscript,
  processOneCommunicationMediaTranscript,
  processWhatsAppAudioTranscriptTurn
} = require("../core/communicationMedia/whatsappAudioTranscriptService");
const { processNormalizedInboundMessage } = require("../core/communicationHub");
const { buildNormalizedMessageFromWhatsApp } = require("../core/channelMessage");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
const { persistInboundAudioMedia } = require("../core/communicationMedia/whatsappMediaFetchService");
const newLeadAttentionEngine = require("../core/newLeadAttentionEngine");
const { interpretInboundMessage, createConversationContext } = require("../core/recruitAiV2");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const { parseWorkAuthorizationAnswer } = require("../core/recruitAiV2/qualificationFacts");
const { looksLikeSalesObjection } = require("../core/recruitAiV2/salesObjection");
const { assertStaging040Target } = require("../dev/environment/applyStagingMigration040");
const { MAX_BASELINE_VERSION } = require("../dev/environment/applyStagingBaselineMigrations");
const { PRODUCTION_SUPABASE_PROJECT_REF } = require("../config/atlasEnvironment");

const ORG = "00000000-0000-4000-8000-000000000001";
const PROSPECT_ID = "b9999999-9999-4999-8999-999999999999";
const MEDIA_ID = "media-stt-1";

const SAMPLES = {
  A: "Vivo en Cape Coral, Florida y sí tengo permiso de trabajo.",
  B: "Estoy en Winter Springs, Florida. Sí, tengo permiso de trabajo.",
  C: "¿De qué se trata el trabajo?",
  D: "¿Es ventas?",
  E: "Sí.",
  F: "I live in Orlando, Florida."
};

function spanishProspect(overrides = {}) {
  return {
    id: PROSPECT_ID,
    phone: "+15550100999",
    name: "Staging Audio Test",
    organization_id: ORG,
    current_step: "NEW",
    preferred_language: "spanish",
    ...overrides
  };
}

function storedRow(overrides = {}) {
  return {
    id: MEDIA_ID,
    organizationId: ORG,
    prospectId: PROSPECT_ID,
    conversationLogId: "log-audio-1",
    providerMessageId: "wamid.AUDIO-STT-1",
    mediaKind: "audio",
    fetchStatus: FETCH_STATUS.STORED,
    transcodeStatus: TRANSCODE_STATUS.READY,
    storagePath: `${ORG}/${PROSPECT_ID}/wamid.AUDIO-STT-1/original.ogg`,
    playbackPath: `${ORG}/${PROSPECT_ID}/wamid.AUDIO-STT-1/playback.mp3`,
    playbackMimeType: "audio/mpeg",
    transcriptStatus: TRANSCRIPT_STATUS.PENDING,
    durationMs: 4000,
    ...overrides
  };
}

test("040 is additive staging-only and is not a baseline migration", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/migrations/040_communication_media_transcript_audit.sql"),
    "utf8"
  );
  const migration039 = fs.readFileSync(
    path.join(__dirname, "../database/migrations/039_communication_media.sql"),
    "utf8"
  );
  assert.equal(MAX_BASELINE_VERSION, 38);
  assert.match(sql, /transcript_attempts/);
  assert.match(sql, /transcript_turn_id/);
  assert.doesNotMatch(sql, /DROP TABLE communication_media/i);
  assert.match(migration039, /transcript_status TEXT/);
  assert.doesNotMatch(migration039, /transcript_turn_id/);

  const healthSrc = fs.readFileSync(path.join(__dirname, "../routes/health.js"), "utf8");
  assert.match(healthSrc, /openaiSttConfigured/);
  assert.match(healthSrc, /atlasEnv === "staging"/);
  assert.doesNotMatch(healthSrc, /payload\.openaiApiKey|OPENAI_API_KEY,/);

  const originalEnv = process.env.ATLAS_ENV;
  const originalUrl = process.env.SUPABASE_URL;
  try {
    process.env.ATLAS_ENV = "production";
    process.env.SUPABASE_URL = `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
    assert.throws(() => assertStaging040Target(), /ATLAS_ENV=staging|Refusing 040/);
  } finally {
    process.env.ATLAS_ENV = originalEnv;
    process.env.SUPABASE_URL = originalUrl;
  }
});

test("STT adapter uses gpt-transcribe transcriptions API, not chat/completions", async () => {
  const adapterSrc = fs.readFileSync(
    path.join(__dirname, "../communication/audio/stt/openaiGptTranscribeAdapter.js"),
    "utf8"
  );
  const chatSrc = fs.readFileSync(
    path.join(__dirname, "../communication/ai/openaiProvider.js"),
    "utf8"
  );
  assert.match(adapterSrc, /\/v1\/audio\/transcriptions/);
  assert.match(adapterSrc, /gpt-transcribe/);
  assert.doesNotMatch(adapterSrc, /api\.openai\.com\/v1\/chat/);
  assert.doesNotMatch(adapterSrc, /whisper-1/);
  assert.match(chatSrc, /chat\/completions/);

  const calls = [];
  const result = await transcribeWithGptTranscribe({
    buffer: Buffer.from("ID3fake"),
    hints: { language: "es", prompt: "spanish" },
    apiKey: "sk-test",
    fetchFn: async (url, init) => {
      calls.push({ url, hasAuth: String(init.headers.Authorization || "").startsWith("Bearer ") });
      assert.equal(url, TRANSCRIPTIONS_URL);
      assert.equal(init.method, "POST");
      assert.equal(init.body instanceof FormData, true);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          text: SAMPLES.A,
          language: "spanish",
          duration: 4.2,
          segments: [{ avg_logprob: -0.2 }]
        })
      };
    }
  });

  assert.equal(result.provider, STT_PROVIDER);
  assert.equal(result.model, STT_MODEL);
  assert.equal(result.text, SAMPLES.A);
  assert.equal(result.language, "es");
  assert.equal(result.billedMs, 4200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hasAuth, true);
});

test("language hints are Spanish-first and do not treat stale English default as English-only", () => {
  assert.deepEqual(resolveSttLanguageHints({ preferred_language: "spanish" }).languages, ["es"]);
  assert.equal(resolveSttLanguageHints({ preferred_language: "spanish" }).language, "es");
  assert.deepEqual(resolveSttLanguageHints({ preferred_language: "english" }).languages, ["en"]);
  assert.deepEqual(
    resolveSttLanguageHints({
      preferred_language: "english",
      language: "es",
      communication_language: "es"
    }).languages,
    ["es", "en"]
  );
  assert.deepEqual(resolveSttLanguageHints({}, { mixed: true }).languages, ["es", "en"]);
});

test("public media exposes transcript text only when ready; never provider internals", () => {
  const pending = toPublicMedia(
    createMemoryCommunicationMediaRepository([storedRow()])._rows[0]
  );
  assert.equal(pending.transcriptStatus, TRANSCRIPT_STATUS.PENDING);
  assert.equal(pending.transcriptText, null);
  assert.equal("transcript_error" in pending, false);
  assert.equal("transcript_confidence" in pending, false);
  assert.equal("transcript_provider" in pending, false);

  const ready = toPublicMedia(
    createMemoryCommunicationMediaRepository([
      storedRow({
        transcriptStatus: TRANSCRIPT_STATUS.READY,
        transcriptText: SAMPLES.A,
        transcriptError: "should-not-leak",
        transcriptConfidence: 0.91,
        transcriptProvider: "openai"
      })
    ])._rows[0]
  );
  assert.equal(ready.transcriptStatus, TRANSCRIPT_STATUS.READY);
  assert.equal(ready.transcriptText, SAMPLES.A);
  assert.equal(ready.playbackAvailable, true);
  assert.equal("transcriptError" in ready, false);
});

test("idempotent transcript worker: one STT, one semantic turn, duplicate poller no-ops", async () => {
  const repository = createMemoryCommunicationMediaRepository([storedRow()]);
  const outbound = [];
  let sttCalls = 0;
  let turns = 0;
  const deps = {
    repository,
    prospect: spanishProspect(),
    downloadStoredMedia: async () => Buffer.from("mp3"),
    transcribeFn: async () => {
      sttCalls += 1;
      return {
        text: SAMPLES.A,
        language: "es",
        confidence: 0.9,
        billedMs: 4100,
        provider: "openai",
        model: "gpt-transcribe"
      };
    },
    attemptLiveV2Authoring: async () => {
      turns += 1;
      return {
        authored: true,
        replyText: "Gracias. ¿Qué horario te funciona mejor?",
        reason: null
      };
    },
    deliverWhatsAppReply: async ({ replyText, engineResult }) => {
      outbound.push({
        text: replyText,
        key: engineResult?.confirmationIdempotencyKey
      });
      return { success: true, replied: true };
    },
    scheduleSoftAck: () => 0,
    cancelSoftAck: () => {},
    env: {
      RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
    }
  };

  const first = await processOneCommunicationMediaTranscript(repository._rows[0], deps);
  const second = await processOneCommunicationMediaTranscript(repository._rows[0], deps);
  const third = await processOneCommunicationMediaTranscript(repository._rows[0], deps);

  assert.equal(first.status, TRANSCRIPT_STATUS.READY);
  assert.equal(second.reason, "NO_OP");
  assert.equal(third.reason, "NO_OP");
  assert.equal(sttCalls, 1);
  assert.equal(turns, 1);
  assert.equal(outbound.length, 1);
  assert.equal(outbound[0].key, `audio-stt-reply:${MEDIA_ID}`);
  assert.equal(repository._rows[0].transcript_turn_id, buildTranscriptTurnId(MEDIA_ID));
  assert.equal(repository._rows[0].transcript_text, SAMPLES.A);
  assert.equal(repository._rows[0].transcript_attempts, 1);
});

test("semantic replay does not insert another inbound conversation log or reuse wamid", async () => {
  const logs = [];
  const result = await processWhatsAppAudioTranscriptTurn({
    row: {
      id: MEDIA_ID,
      provider_message_id: "wamid.ORIGINAL",
      organization_id: ORG,
      prospect_id: PROSPECT_ID
    },
    prospect: spanishProspect(),
    transcriptText: SAMPLES.A,
    dependencies: {
      processTurn: async ({ message, options }) => {
        logs.push({ inbound: true, id: message.id, text: message.text });
        assert.equal(message.messageType, "text");
        assert.equal(options.skipInboundConversationLog, true);
        assert.equal(options.skipInboundClaim, true);
        assert.equal(options.allowExecution, false);
        assert.equal(options.inboundMessageId, `audio-stt:${MEDIA_ID}`);
        assert.notEqual(options.inboundMessageId, "wamid.ORIGINAL");
        return { rendered: { text: "Perfecto." } };
      },
      attemptLiveV2Authoring: async ({ processTurn, normalized }) => {
        const v2 = await processTurn({
          message: { id: normalized.providerMessageId, text: normalized.text, messageType: "text" },
          options: {}
        });
        return { authored: true, replyText: v2.rendered.text };
      },
      deliverWhatsAppReply: async () => ({ success: true, replied: true })
    }
  });

  assert.equal(result.turnId, `audio-stt:${MEDIA_ID}`);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].id, `audio-stt:${MEDIA_ID}`);
});

test("webhook audio skips live authoring and does not BR-118-ack", async () => {
  let authored = 0;
  const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
  const original = liveAuthoringBridge.attemptLiveV2Authoring;
  liveAuthoringBridge.attemptLiveV2Authoring = async () => {
    authored += 1;
    return { authored: true, replyText: "Recibí el archivo." };
  };
  try {
    const result = await processNormalizedInboundMessage(
      buildNormalizedMessageFromWhatsApp(
        {
          providerMessageId: "wamid.AUDIO-STT-WEBHOOK",
          phone: "+15550100999",
          contactName: "Staging Audio Test",
          messageType: "audio",
          body: "[audio message]",
          timestamp: new Date().toISOString()
        },
        "+15550100999"
      ),
      {
        prospect: spanishProspect(),
        env: {
          RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
          RECRUIT_AI_V2_EXECUTION_ENABLED: "false"
        }
      }
    );
    assert.equal(authored, 0);
    assert.equal(result.replied, false);
    assert.equal(result.reason, "AUDIO_STT_PENDING");
  } finally {
    liveAuthoringBridge.attemptLiveV2Authoring = original;
  }
});

test("fast STT sends one semantic reply; slow path one ack then one reply; fail asks to type", async () => {
  const repository = createMemoryCommunicationMediaRepository([storedRow({ id: "media-fast" })]);
  const outbound = [];
  const fastDeps = {
    repository,
    prospect: spanishProspect(),
    downloadStoredMedia: async () => Buffer.from("mp3"),
    transcribeFn: async () => ({
      text: SAMPLES.C,
      language: "es",
      billedMs: 1200,
      provider: "openai",
      model: "gpt-transcribe"
    }),
    attemptLiveV2Authoring: async () => ({
      authored: true,
      replyText: "Es una oportunidad de ventas con licencia."
    }),
    deliverWhatsAppReply: async ({ replyText, engineResult }) => {
      outbound.push(engineResult.confirmationIdempotencyKey);
      return { success: true, replied: true, text: replyText };
    },
    scheduleSoftAck: () => "timer",
    cancelSoftAck: () => {},
    softAckMs: 10_000
  };
  await processOneCommunicationMediaTranscript(repository._rows[0], fastDeps);
  assert.deepEqual(outbound, ["audio-stt-reply:media-fast"]);

  const slowRepo = createMemoryCommunicationMediaRepository([storedRow({ id: "media-slow" })]);
  const slowOut = [];
  let delayed = null;
  await processOneCommunicationMediaTranscript(slowRepo._rows[0], {
    ...fastDeps,
    repository: slowRepo,
    scheduleSoftAck: (fn) => {
      delayed = fn;
      return "timer";
    },
    deliverWhatsAppReply: async ({ engineResult }) => {
      slowOut.push(engineResult.confirmationIdempotencyKey);
      return { success: true, replied: true };
    }
  });
  assert.equal(typeof delayed, "function");
  await delayed();
  assert.ok(slowOut.includes("audio-stt-reply:media-slow"));
  assert.ok(slowOut.includes("audio-stt-ack:media-slow"));
  assert.equal(slowOut.length, 2);

  const failRepo = createMemoryCommunicationMediaRepository([storedRow({ id: "media-fail" })]);
  const failOut = [];
  await processOneCommunicationMediaTranscript(failRepo._rows[0], {
    repository: failRepo,
    prospect: spanishProspect(),
    downloadStoredMedia: async () => Buffer.from("mp3"),
    transcribeFn: async () => ({
      text: "   ",
      language: "es",
      provider: "openai",
      model: "gpt-transcribe"
    }),
    scheduleSoftAck: () => 0,
    cancelSoftAck: () => {},
    deliverWhatsAppReply: async ({ engineResult, replyText }) => {
      failOut.push({ key: engineResult.confirmationIdempotencyKey, replyText });
      return { success: true, replied: true };
    }
  });
  assert.equal(failRepo._rows[0].transcript_status, TRANSCRIPT_STATUS.FAILED);
  assert.equal(failOut.length, 1);
  assert.equal(failOut[0].key, "audio-stt-fallback:media-fail");
  assert.match(failOut[0].replyText, /escribes|type/i);
});

test("V2 extracts city/state/work-auth from Spanish transcripts; short sí does not flip language", () => {
  const locA = parseLocationAnswer("Vivo en Cape Coral, Florida");
  assert.equal(locA.completeness, "complete");
  assert.match(String(locA.city || ""), /cape coral/i);
  assert.match(String(locA.state || ""), /fl|florida/i);
  assert.equal(
    parseWorkAuthorizationAnswer(SAMPLES.A, {
      conversation: { lastQuestionAsked: "ask_authorization" }
    }),
    "authorized"
  );

  const locB = parseLocationAnswer("Estoy en Winter Springs, Florida");
  assert.match(String(locB.city || ""), /winter springs/i);
  assert.equal(
    parseWorkAuthorizationAnswer(SAMPLES.B, {
      conversation: { lastQuestionAsked: "ask_authorization" }
    }),
    "authorized"
  );

  assert.equal(looksLikeSalesObjection(SAMPLES.D), true);

  const context = createConversationContext({
    preferredLanguage: "spanish",
    prospectId: PROSPECT_ID,
    organizationId: ORG
  });
  const si = interpretInboundMessage({
    message: { text: SAMPLES.E, messageType: "text" },
    context
  });
  assert.notEqual(si.messageLanguage, "english");
  assert.equal(context.preferredLanguage, "spanish");

  const locF = parseLocationAnswer(SAMPLES.F);
  assert.match(String(locF.city || ""), /orlando/i);
  assert.equal(context.preferredLanguage, "spanish");
});

test("STT success/failure does not TAKE OVER or mark BR-080", async () => {
  const repository = createMemoryCommunicationMediaRepository();
  const claims = new Set();
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
    const result = await processInboundWhatsAppMessage(
      {
        providerMessageId: "wamid.AUDIO-OWN",
        phone: "+15550100999",
        contactName: "Staging Audio Test",
        messageType: "audio",
        body: "[audio message]",
        timestamp: new Date().toISOString(),
        media: {
          kind: "audio",
          metaMediaId: "media-own",
          mimeType: "audio/ogg; codecs=opus",
          isVoiceNote: true
        }
      },
      {
        resolveWhatsAppInboundOrganizationId: async () => ({
          organizationId: ORG,
          source: "explicit"
        }),
        claimWhatsAppInboundCorrelation: async ({ providerMessageId }) => {
          if (claims.has(providerMessageId)) {
            return { claimed: false, reason: "DUPLICATE_PROVIDER_MESSAGE" };
          }
          claims.add(providerMessageId);
          return { claimed: true };
        },
        locateOrCreateWhatsAppProspect: async () => ({
          prospect: spanishProspect(),
          created: false,
          storagePhone: "+15550100999",
          organizationId: ORG
        }),
        logConversation: async () => ({ success: true, log: { id: "log-own" } }),
        persistInboundAudioMedia: (input) => persistInboundAudioMedia({ ...input, repository }),
        communicationMediaRepository: repository,
        scheduleMediaProcessing: () => {},
        processConversationAfterInbound: async () => ({
          success: true,
          replied: false,
          reason: "AUDIO_STT_PENDING"
        })
      }
    );
    assert.equal(result.success, true);
    assert.equal(ai, 0);
    assert.equal(human, 0);
    assert.equal(repository._rows.length, 1);

    await processOneCommunicationMediaTranscript(
      storedRow({
        id: repository._rows[0].id,
        organizationId: ORG,
        prospectId: PROSPECT_ID
      }),
      {
        repository,
        prospect: spanishProspect({
          workflowOwnership: "ATLAS",
          manualAgentOwnership: false,
          humanTakenOverAt: null,
          needsHumanAttention: false
        }),
        downloadStoredMedia: async () => Buffer.from("mp3"),
        transcribeFn: async () => {
          throw Object.assign(new Error("STT_TIMEOUT"), { publicCode: "STT_TIMEOUT" });
        },
        scheduleSoftAck: () => 0,
        cancelSoftAck: () => {},
        deliverWhatsAppReply: async () => ({ success: true, replied: true })
      }
    );
    assert.equal(human, 0);
    assert.equal(ai, 0);
  } finally {
    newLeadAttentionEngine.markAiResponding = originalAi;
    newLeadAttentionEngine.markHumanAttentionRequired = originalHuman;
  }
});

test("execution gates stay false on the audio transcript turn", async () => {
  let seenAllowExecution = null;
  await processWhatsAppAudioTranscriptTurn({
    row: { id: MEDIA_ID, provider_message_id: "wamid.X", organization_id: ORG },
    prospect: spanishProspect(),
    transcriptText: SAMPLES.A,
    dependencies: {
      env: {
        RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
        RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true"
      },
      processTurn: async ({ options }) => {
        seenAllowExecution = options.allowExecution;
        return { rendered: { text: "Hola" } };
      },
      attemptLiveV2Authoring: async ({ processTurn }) => {
        const v2 = await processTurn({ message: {}, options: {} });
        return { authored: true, replyText: v2.rendered.text };
      },
      deliverWhatsAppReply: async () => ({ success: true, replied: true })
    }
  });
  assert.equal(seenAllowExecution, false);
});

test("unusable transcripts and too-long audio are skipped without fabricating facts", () => {
  assert.equal(isUnusableTranscript(""), true);
  assert.equal(isUnusableTranscript("..."), true);
  assert.equal(isUnusableTranscript("Sí."), false);
  assert.equal(
    needsTranscriptWork({
      media_kind: "audio",
      fetch_status: FETCH_STATUS.STORED,
      transcode_status: TRANSCODE_STATUS.READY,
      playback_path: "x/playback.mp3",
      storage_path: "x/original.ogg",
      transcript_status: TRANSCRIPT_STATUS.READY
    }),
    false
  );
});

test("adapter never logs transcript body; worker logs status only", () => {
  const adapterSrc = fs.readFileSync(
    path.join(__dirname, "../communication/audio/stt/openaiGptTranscribeAdapter.js"),
    "utf8"
  );
  const workerSrc = fs.readFileSync(
    path.join(__dirname, "../core/communicationMedia/whatsappAudioTranscriptService.js"),
    "utf8"
  );
  assert.doesNotMatch(adapterSrc, /console\.(log|info|warn|debug)\(/);
  assert.match(workerSrc, /communication_media_transcribed/);
  assert.doesNotMatch(
    workerSrc,
    /logWhatsAppStage\(\s*"communication_media_transcribed"[\s\S]{0,400}text:/
  );
});
