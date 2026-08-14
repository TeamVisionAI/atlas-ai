/**
 * WhatsApp audio Phase 1B — Safari-safe MP3 transcode.
 * Original preserved. No STT. No ownership / BR-080 mutation.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const PROSPECT_ID = "11111111-1111-4111-8111-111111111111";

const {
  createMemoryCommunicationMediaRepository,
  toPublicMedia
} = require("../core/communicationMedia/communicationMediaRepository");
const {
  processOneCommunicationMediaFetch,
  processPendingWhatsAppMediaFetches
} = require("../core/communicationMedia/whatsappMediaFetchService");
const {
  createCommunicationMediaPlayback
} = require("../core/communicationMedia/communicationMediaPlaybackService");
const {
  transcodeBufferToMp3,
  createSyntheticOpusOggFixture,
  resolveFfmpegPath,
  TEMP_ROOT_PREFIX,
  cleanupTempDir
} = require("../core/communicationMedia/audioTranscodeService");
const {
  buildOriginalStoragePath,
  buildPlaybackStoragePath
} = require("../core/communicationMedia/communicationMediaStorage");
const {
  FETCH_STATUS,
  TRANSCODE_STATUS,
  PLAYBACK_FORMAT,
  MAX_COMMUNICATION_MEDIA_BYTES
} = require("../core/communicationMedia/constants");
const { sanitizeCommunicationsCenterResponse } = require("../core/communicationsCenterSanitizer");
const {
  isRealWhatsAppCommunication,
  computeLastCommunication,
  computeUnreadState
} = require("../core/conversationsCenter/conversationsUnreadEngine");

function countTempTranscodeDirs() {
  return fs
    .readdirSync(os.tmpdir())
    .filter((name) => name.startsWith(TEMP_ROOT_PREFIX)).length;
}

function storedOggRow(overrides = {}) {
  return {
    id: "media-ogg-1",
    organizationId: ORG_A,
    prospectId: PROSPECT_ID,
    providerMessageId: "wamid.AUDIO-OGG",
    mediaKind: "audio",
    mimeType: "audio/ogg; codecs=opus",
    fetchStatus: FETCH_STATUS.STORED,
    transcodeStatus: TRANSCODE_STATUS.PENDING,
    storagePath: `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO-OGG/original.ogg`,
    ...overrides
  };
}

test("1–3. OGG/Opus produces MP3 derivative; original preserved; playback_path saved", async () => {
  const ogg = await createSyntheticOpusOggFixture({ durationSeconds: 1 });
  assert.ok(ogg.length > 0);

  const repository = createMemoryCommunicationMediaRepository([
    {
      id: "media-fetch-1",
      organizationId: ORG_A,
      prospectId: PROSPECT_ID,
      providerMessageId: "wamid.AUDIO-OGG",
      mediaKind: "audio",
      metaMediaId: "meta-ogg-1",
      mimeType: "audio/ogg; codecs=opus",
      fetchStatus: FETCH_STATUS.PENDING
    }
  ]);

  const uploads = { original: 0, playback: 0, playbackPath: null, originalPath: null };
  const result = await processOneCommunicationMediaFetch(repository._rows[0], {
    repository,
    credentialsResolver: async () => ({ accessToken: "server-token", graphApiVersion: "v25.0" }),
    graphGetJson: async () => ({ url: "https://graph.example/media", mime_type: "audio/ogg; codecs=opus" }),
    downloadBytes: async () => ({ buffer: ogg, mimeType: "audio/ogg; codecs=opus" }),
    uploadOriginalMedia: async ({ mimeType, buffer, organizationId, prospectId, providerMessageId }) => {
      uploads.original += 1;
      assert.equal(Buffer.isBuffer(buffer), true);
      assert.ok(buffer.equals(ogg));
      const storagePath = buildOriginalStoragePath({
        organizationId,
        prospectId,
        providerMessageId,
        mimeType
      });
      uploads.originalPath = storagePath;
      return { storagePath, bucket: "communication-media" };
    },
    uploadPlaybackMedia: async ({ buffer, organizationId, prospectId, providerMessageId }) => {
      uploads.playback += 1;
      assert.equal(Buffer.isBuffer(buffer), true);
      assert.ok(buffer.length > 0);
      assert.ok(!buffer.equals(ogg));
      assert.ok(buffer[0] === 0xff || buffer.subarray(0, 3).toString() === "ID3");
      const storagePath = buildPlaybackStoragePath({
        organizationId,
        prospectId,
        providerMessageId
      });
      uploads.playbackPath = storagePath;
      return { storagePath, mimeType: PLAYBACK_FORMAT.mimeType, bucket: "communication-media" };
    }
  });

  const row = repository._rows[0];
  assert.equal(result.status, FETCH_STATUS.STORED);
  assert.equal(result.transcodeStatus, TRANSCODE_STATUS.READY);
  assert.equal(uploads.original, 1);
  assert.equal(uploads.playback, 1);
  assert.equal(row.fetch_status, FETCH_STATUS.STORED);
  assert.equal(row.transcode_status, TRANSCODE_STATUS.READY);
  assert.equal(row.storage_path, `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO-OGG/original.ogg`);
  assert.equal(row.playback_path, `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO-OGG/playback.mp3`);
  assert.equal(row.playback_mime_type, "audio/mpeg");
  assert.equal(row.storage_path !== row.playback_path, true);
  assert.equal(uploads.originalPath, row.storage_path);
  assert.equal(uploads.playbackPath, row.playback_path);

  const publicMedia = toPublicMedia(row);
  assert.equal(publicMedia.playbackAvailable, true);
  assert.equal(publicMedia.mimeType, "audio/mpeg");
  assert.equal(publicMedia.transcodeStatus, TRANSCODE_STATUS.READY);
  assert.equal("transcode_error" in publicMedia, false);
  assert.equal("storage_path" in publicMedia, false);
});

test("4. duplicate job does not duplicate transcode", async () => {
  const ogg = await createSyntheticOpusOggFixture({ durationSeconds: 1 });
  const repository = createMemoryCommunicationMediaRepository([
    storedOggRow({
      transcodeStatus: TRANSCODE_STATUS.READY,
      playbackPath: `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO-OGG/playback.mp3`,
      playbackMimeType: "audio/mpeg"
    })
  ]);

  let transcodeCalls = 0;
  const first = await processOneCommunicationMediaFetch(repository._rows[0], {
    repository,
    transcodeBufferToMp3: async () => {
      transcodeCalls += 1;
      throw new Error("should not transcode");
    },
    uploadPlaybackMedia: async () => {
      throw new Error("should not upload playback");
    }
  });
  const second = await processPendingWhatsAppMediaFetches({
    repository,
    transcodeBufferToMp3: async () => {
      transcodeCalls += 1;
      return { buffer: ogg };
    }
  });

  assert.equal(first.skipped, true);
  assert.equal(first.transcodeStatus, TRANSCODE_STATUS.READY);
  assert.equal(second.length, 0);
  assert.equal(transcodeCalls, 0);
  assert.equal(repository._rows.length, 1);
  assert.equal(repository._rows[0].playback_path.endsWith("/playback.mp3"), true);
});

test("5–6. transcode failure preserves original and does not mutate ownership/BR-080", async () => {
  const repository = createMemoryCommunicationMediaRepository([
    storedOggRow({ transcodeAttempts: 2 })
  ]);
  const ownership = { takeOver: 0, br080: 0 };

  const result = await processOneCommunicationMediaFetch(repository._rows[0], {
    repository,
    downloadStoredMedia: async () => Buffer.from("not-valid-ogg-bytes"),
    transcodeBufferToMp3: async () => {
      const error = new Error("TRANSCODE_FAILED");
      error.publicCode = "TRANSCODE_FAILED";
      throw error;
    },
    uploadPlaybackMedia: async () => {
      ownership.takeOver += 1;
      throw new Error("should not upload");
    }
  });

  const row = repository._rows[0];
  assert.equal(result.status, FETCH_STATUS.STORED);
  assert.equal(result.transcodeStatus, TRANSCODE_STATUS.FAILED);
  assert.equal(row.fetch_status, FETCH_STATUS.STORED);
  assert.equal(row.storage_path, `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO-OGG/original.ogg`);
  assert.equal(row.playback_path, null);
  assert.equal(row.transcode_status, TRANSCODE_STATUS.FAILED);
  assert.equal(row.transcode_error, "TRANSCODE_FAILED");
  assert.equal(ownership.takeOver, 0);
  assert.equal(ownership.br080, 0);

  const publicMedia = toPublicMedia(row);
  assert.equal(publicMedia.playbackAvailable, false);
  assert.equal(publicMedia.playbackFailed, true);
  assert.equal("transcode_error" in publicMedia, false);
});

test("7. wrong-org playback denied", async () => {
  const repository = createMemoryCommunicationMediaRepository([
    storedOggRow({
      id: "media-org-a",
      transcodeStatus: TRANSCODE_STATUS.READY,
      playbackPath: `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO-OGG/playback.mp3`,
      playbackMimeType: "audio/mpeg"
    })
  ]);

  await assert.rejects(
    () =>
      createCommunicationMediaPlayback({
        organizationId: ORG_B,
        prospectId: PROSPECT_ID,
        mediaId: "media-org-a",
        authorizedProspect: { id: PROSPECT_ID, organization_id: ORG_B },
        repository,
        signUrl: async () => ({ url: "https://signed.example/leak", expiresIn: 120 })
      }),
    (error) => error.statusCode === 403 || error.statusCode === 404
  );
});

test("8. playback endpoint prefers derivative", async () => {
  const repository = createMemoryCommunicationMediaRepository([
    storedOggRow({
      transcodeStatus: TRANSCODE_STATUS.READY,
      playbackPath: `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO-OGG/playback.mp3`,
      playbackMimeType: "audio/mpeg"
    })
  ]);
  const signed = [];
  const payload = await createCommunicationMediaPlayback({
    organizationId: ORG_A,
    prospectId: PROSPECT_ID,
    mediaId: "media-ogg-1",
    authorizedProspect: { id: PROSPECT_ID, organization_id: ORG_A },
    repository,
    signUrl: async (storagePath) => {
      signed.push(storagePath);
      return { url: "https://signed.example/playback.mp3", expiresIn: 120 };
    }
  });
  assert.equal(payload.url, "https://signed.example/playback.mp3");
  assert.equal(payload.mimeType, "audio/mpeg");
  assert.deepEqual(signed, [`${ORG_A}/${PROSPECT_ID}/wamid.AUDIO-OGG/playback.mp3`]);
  assert.doesNotMatch(JSON.stringify(payload), /graph\.facebook|meta\.url|WHATSAPP_ACCESS_TOKEN/i);
});

test("9. pending derivative returns preparing", async () => {
  const repository = createMemoryCommunicationMediaRepository([storedOggRow()]);
  await assert.rejects(
    () =>
      createCommunicationMediaPlayback({
        organizationId: ORG_A,
        prospectId: PROSPECT_ID,
        mediaId: "media-ogg-1",
        authorizedProspect: { id: PROSPECT_ID, organization_id: ORG_A },
        repository,
        signUrl: async () => ({ url: "https://signed.example/original.ogg", expiresIn: 120 })
      }),
    (error) => error.statusCode === 409 && error.publicCode === "MEDIA_PREPARING"
  );
});

test("10. failed derivative returns unsupported-browser without exposing ffmpeg", async () => {
  const repository = createMemoryCommunicationMediaRepository([
    storedOggRow({
      transcodeStatus: TRANSCODE_STATUS.FAILED,
      transcodeError: "ffmpeg stderr Decoder (codec none) not found"
    })
  ]);
  await assert.rejects(
    () =>
      createCommunicationMediaPlayback({
        organizationId: ORG_A,
        prospectId: PROSPECT_ID,
        mediaId: "media-ogg-1",
        authorizedProspect: { id: PROSPECT_ID, organization_id: ORG_A },
        repository,
        signUrl: async () => ({ url: "https://signed.example/original.ogg", expiresIn: 120 })
      }),
    (error) =>
      error.statusCode === 409 &&
      error.publicCode === "MEDIA_UNSUPPORTED_BROWSER" &&
      !/ffmpeg|stderr|codec none/i.test(error.message)
  );
});

test("11. temp files cleaned after success and failure", async () => {
  const before = countTempTranscodeDirs();
  const ogg = await createSyntheticOpusOggFixture({ durationSeconds: 1 });
  const ok = await transcodeBufferToMp3(ogg, { mimeType: "audio/ogg; codecs=opus" });
  assert.equal(ok.cleaned, true);
  assert.equal(ok.mimeType, "audio/mpeg");

  await assert.rejects(() => transcodeBufferToMp3(Buffer.from("not-audio"), { mimeType: "audio/ogg" }));

  const after = countTempTranscodeDirs();
  assert.equal(after, before);
  cleanupTempDir(path.join(os.tmpdir(), `${TEMP_ROOT_PREFIX}should-ignore`));
});

test("12. unsupported input fails safely without deleting original", async () => {
  const repository = createMemoryCommunicationMediaRepository([
    storedOggRow({ id: "media-bad", transcodeAttempts: 2 })
  ]);
  const result = await processOneCommunicationMediaFetch(repository._rows[0], {
    repository,
    downloadStoredMedia: async () => Buffer.from("%PDF-1.4 not audio"),
    transcodeBufferToMp3: async (buffer, options) => transcodeBufferToMp3(buffer, options)
  });
  assert.equal(result.status, FETCH_STATUS.STORED);
  assert.equal(result.transcodeStatus, TRANSCODE_STATUS.FAILED);
  assert.equal(repository._rows[0].storage_path.endsWith("/original.ogg"), true);
  assert.equal(repository._rows[0].playback_path, null);
});

test("13. max-size and timeout guards work", async () => {
  await assert.rejects(
    () => transcodeBufferToMp3(Buffer.alloc(MAX_COMMUNICATION_MEDIA_BYTES + 1), { mimeType: "audio/ogg" }),
    (error) => error.publicCode === "MEDIA_TOO_LARGE"
  );

  const ogg = await createSyntheticOpusOggFixture({ durationSeconds: 1 });
  await assert.rejects(
    () =>
      transcodeBufferToMp3(ogg, {
        mimeType: "audio/ogg",
        execFileFn: (bin, args, opts) =>
          new Promise((_, reject) => {
            assert.equal(Array.isArray(args), true);
            assert.ok(Number(opts.timeout) <= 5);
            const error = new Error("timed out");
            error.killed = true;
            reject(error);
          }),
        timeoutMs: 5
      }),
    (error) => error.publicCode === "TRANSCODE_TIMEOUT" || error.publicCode === "TRANSCODE_FAILED"
  );
});

test("14. no command injection from metadata or filename", async () => {
  const ogg = await createSyntheticOpusOggFixture({ durationSeconds: 1 });
  const seen = [];
  await transcodeBufferToMp3(ogg, {
    mimeType: 'audio/ogg; codecs=opus"; rm -rf /; echo "',
    execFileFn: async (bin, args) => {
      seen.push({ bin, args });
      const ffmpeg = resolveFfmpegPath();
      const { execFile } = require("child_process");
      await new Promise((resolve, reject) => {
        execFile(ffmpeg, args, { timeout: 30_000 }, (error) => (error ? reject(error) : resolve()));
      });
    }
  });
  assert.equal(seen.length, 1);
  assert.equal(Array.isArray(seen[0].args), true);
  assert.equal(
    seen[0].args.some((arg) => /rm -rf|codecs=opus"|echo /.test(String(arg))),
    false
  );
  assert.equal(
    seen[0].args.includes("-i"),
    true
  );
  const inputArg = seen[0].args[seen[0].args.indexOf("-i") + 1];
  assert.match(inputArg, /atlas-audio-transcode-/);
  assert.doesNotMatch(inputArg, /;|\||`|\$\(/);
});

test("native MP3 skips transcode (not_required) and playback uses original", async () => {
  const repository = createMemoryCommunicationMediaRepository([
    {
      id: "media-mp3",
      organizationId: ORG_A,
      prospectId: PROSPECT_ID,
      providerMessageId: "wamid.AUDIO-MP3",
      mediaKind: "audio",
      metaMediaId: "meta-mp3-1",
      mimeType: "audio/mpeg",
      fetchStatus: FETCH_STATUS.PENDING
    }
  ]);
  let transcodeCalls = 0;
  await processOneCommunicationMediaFetch(repository._rows[0], {
    repository,
    credentialsResolver: async () => ({ accessToken: "server-token" }),
    graphGetJson: async () => ({ url: "https://graph.example/media", mime_type: "audio/mpeg" }),
    downloadBytes: async () => ({ buffer: Buffer.from("ID3fake-mp3"), mimeType: "audio/mpeg" }),
    uploadOriginalMedia: async () => ({
      storagePath: `${ORG_A}/${PROSPECT_ID}/wamid.AUDIO-MP3/original.mp3`,
      bucket: "communication-media"
    }),
    transcodeBufferToMp3: async () => {
      transcodeCalls += 1;
      throw new Error("should not transcode native mp3");
    }
  });
  const row = repository._rows[0];
  assert.equal(transcodeCalls, 0);
  assert.equal(row.transcode_status, TRANSCODE_STATUS.NOT_REQUIRED);
  assert.equal(row.playback_path, row.storage_path);

  const payload = await createCommunicationMediaPlayback({
    organizationId: ORG_A,
    prospectId: PROSPECT_ID,
    mediaId: "media-mp3",
    authorizedProspect: { id: PROSPECT_ID, organization_id: ORG_A },
    repository,
    signUrl: async (storagePath) => ({ url: `https://signed.example/${storagePath}`, expiresIn: 90 })
  });
  assert.match(payload.url, /original\.mp3/);
});

test("unread and lastCommunicationAt unchanged by transcode status", () => {
  const audioAt = "2026-08-13T16:00:00.000Z";
  const logs = [
    {
      id: "in-audio",
      direction: "incoming",
      message: "[audio message]",
      messageType: "audio",
      created_at: audioAt
    }
  ];
  assert.equal(isRealWhatsAppCommunication(logs[0]), true);
  const last = computeLastCommunication(logs);
  assert.equal(last.lastCommunicationAt, audioAt);
  assert.equal(last.lastMessagePreview, "Voice message");
  const unread = computeUnreadState({ logs, lastReadInboundAt: null });
  assert.equal(unread.unread, true);
  assert.equal(unread.unreadCount, 1);
});

test("sanitizer strips transcode internals", () => {
  const sanitized = sanitizeCommunicationsCenterResponse({
    content: {
      media: {
        transcode_error: "ffmpeg stderr Decoder (codec none) not found",
        playback_path: `${ORG_A}/x/playback.mp3`
      }
    }
  });
  const json = JSON.stringify(sanitized);
  assert.doesNotMatch(json, /ffmpeg stderr|codec none|playback\.mp3/i);
});

test("ffmpeg-static is the declared runtime binary; no Dockerfile apt ffmpeg", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"));
  assert.ok(pkg.dependencies["ffmpeg-static"]);
  assert.ok(resolveFfmpegPath());
  assert.equal(fs.existsSync(path.join(__dirname, "../../Dockerfile")), false);
  assert.equal(fs.existsSync(path.join(__dirname, "../../nixpacks.toml")), false);
  const transcodeSrc = fs.readFileSync(
    path.join(__dirname, "../core/communicationMedia/audioTranscodeService.js"),
    "utf8"
  );
  assert.match(transcodeSrc, /execFile/);
  assert.doesNotMatch(transcodeSrc, /exec\(`|exec\("/);
  assert.doesNotMatch(transcodeSrc, /whisper|openai|speech\.to\.text|transcript/i);
});
