/**
 * Async Meta media fetch + Safari-safe MP3 transcode + Phase 2 STT (BR-140 / BR-141).
 * One poller lifecycle. Original always preserved.
 * Failure updates media status only — never ownership, BR-080, or TAKE OVER.
 */

"use strict";

const { resolveWhatsAppSendCredentials } = require("../whatsappSendCredentials");
const { logWhatsAppStage } = require("../whatsappStructuredLogger");
const {
  FETCH_STATUS,
  TRANSCODE_STATUS,
  MAX_FETCH_ATTEMPTS,
  MAX_TRANSCODE_ATTEMPTS,
  MAX_COMMUNICATION_MEDIA_BYTES,
  FETCH_LOCK_STALE_MS,
  PLAYBACK_FORMAT,
  TRANSCRIPT_STATUS
} = require("./constants");
const {
  isAllowedAudioMime,
  baseMime,
  uploadOriginalMedia,
  uploadPlaybackMedia,
  downloadStoredMedia
} = require("./communicationMediaStorage");
const {
  transcodeBufferToMp3,
  isBrowserNativeAudioMime
} = require("./audioTranscodeService");
const { getCommunicationMediaRepository } = require("./communicationMediaRepository");

function backoffMs(attempts) {
  const exponent = Math.max(0, Number(attempts) || 0);
  return Math.min(15_000 * 2 ** exponent, 15 * 60 * 1000);
}

function publicStatusError(code, fallback) {
  return String(code || fallback).slice(0, 80);
}

function isFetchComplete(row) {
  return row?.fetch_status === FETCH_STATUS.STORED && Boolean(row.storage_path);
}

function isTranscodeComplete(row) {
  const status = String(row?.transcode_status || TRANSCODE_STATUS.PENDING);
  if (status === TRANSCODE_STATUS.READY && row.playback_path) {
    return true;
  }
  if (
    status === TRANSCODE_STATUS.NOT_REQUIRED &&
    (row.playback_path || row.storage_path)
  ) {
    return true;
  }
  return false;
}

async function defaultGraphGetJson(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("META_MEDIA_LOOKUP_FAILED");
    error.publicCode = "META_MEDIA_LOOKUP_FAILED";
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

async function defaultDownloadBytes(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const error = new Error("META_MEDIA_DOWNLOAD_FAILED");
    error.publicCode = "META_MEDIA_DOWNLOAD_FAILED";
    error.statusCode = response.status;
    throw error;
  }
  const mimeType = response.headers.get("content-type");
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType };
}

async function fetchWhatsAppAudioBytes({
  organizationId,
  metaMediaId,
  credentialsResolver = resolveWhatsAppSendCredentials,
  graphGetJson = defaultGraphGetJson,
  downloadBytes = defaultDownloadBytes
}) {
  if (!metaMediaId) {
    const error = new Error("META_MEDIA_ID_MISSING");
    error.publicCode = "META_MEDIA_ID_MISSING";
    throw error;
  }

  const credentials = await credentialsResolver(organizationId);
  if (!credentials?.accessToken) {
    const error = new Error("WHATSAPP_CREDENTIALS_MISSING");
    error.publicCode = "WHATSAPP_CREDENTIALS_MISSING";
    throw error;
  }

  const version = credentials.graphApiVersion || "v25.0";
  const lookupUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(metaMediaId)}`;
  const meta = await graphGetJson(lookupUrl, credentials.accessToken);
  const mediaUrl = meta?.url;
  if (!mediaUrl) {
    const error = new Error("META_MEDIA_URL_MISSING");
    error.publicCode = "META_MEDIA_URL_MISSING";
    throw error;
  }

  const downloaded = await downloadBytes(mediaUrl, credentials.accessToken);
  return {
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType || meta.mime_type || null,
    sha256: meta.sha256 || null,
    fileSize: meta.file_size != null ? Number(meta.file_size) : downloaded.buffer.length,
    source: credentials.source || "server"
  };
}

async function markTranscodeNotRequired(repository, row) {
  await repository.update(row.id, row.organization_id, {
    transcodeStatus: TRANSCODE_STATUS.NOT_REQUIRED,
    transcodeError: null,
    playbackPath: row.playback_path || row.storage_path,
    playbackMimeType: row.playback_mime_type || row.mime_type || null
  });
  return {
    status: FETCH_STATUS.STORED,
    transcodeStatus: TRANSCODE_STATUS.NOT_REQUIRED,
    skipped: false,
    id: row.id
  };
}

async function processOneCommunicationMediaTranscode(row, dependencies = {}) {
  const repository =
    dependencies.repository || getCommunicationMediaRepository(dependencies);
  const organizationId = row.organization_id;
  const attempts = Number(row.transcode_attempts || 0);

  if (!isFetchComplete(row)) {
    return {
      status: row.fetch_status,
      skipped: true,
      reason: "ORIGINAL_NOT_STORED",
      id: row.id
    };
  }

  if (isTranscodeComplete(row)) {
    return {
      status: FETCH_STATUS.STORED,
      transcodeStatus: row.transcode_status,
      skipped: true,
      id: row.id
    };
  }

  if (isBrowserNativeAudioMime(row.mime_type)) {
    return markTranscodeNotRequired(repository, row);
  }

  if (attempts >= MAX_TRANSCODE_ATTEMPTS) {
    await repository.update(row.id, organizationId, {
      transcodeStatus: TRANSCODE_STATUS.FAILED,
      transcodeError: publicStatusError("MAX_TRANSCODE_ATTEMPTS", "MAX_TRANSCODE_ATTEMPTS"),
      transcodeAttempts: attempts
    });
    return {
      status: FETCH_STATUS.STORED,
      transcodeStatus: TRANSCODE_STATUS.FAILED,
      reason: "MAX_TRANSCODE_ATTEMPTS",
      id: row.id
    };
  }

  await repository.update(row.id, organizationId, {
    transcodeStatus: TRANSCODE_STATUS.PROCESSING,
    transcodeAttempts: attempts,
    transcodeError: null
  });

  try {
    let originalBuffer = dependencies.originalBuffer || null;
    if (!originalBuffer) {
      const downloader = dependencies.downloadStoredMedia || downloadStoredMedia;
      originalBuffer = await downloader(row.storage_path);
    }

    const transcodeFn = dependencies.transcodeBufferToMp3 || transcodeBufferToMp3;
    const derivative = await transcodeFn(originalBuffer, {
      mimeType: row.mime_type,
      ffmpegPath: dependencies.ffmpegPath,
      execFileFn: dependencies.execFileFn,
      timeoutMs: dependencies.transcodeTimeoutMs
    });

    const uploader = dependencies.uploadPlaybackMedia || uploadPlaybackMedia;
    const stored = await uploader({
      organizationId,
      prospectId: row.prospect_id,
      providerMessageId: row.provider_message_id,
      buffer: derivative.buffer
    });

    await repository.update(row.id, organizationId, {
      transcodeStatus: TRANSCODE_STATUS.READY,
      transcodeAttempts: attempts + 1,
      transcodeError: null,
      playbackPath: stored.storagePath,
      playbackMimeType: stored.mimeType || PLAYBACK_FORMAT.mimeType,
      transcriptStatus: TRANSCRIPT_STATUS.PENDING
    });

    logWhatsAppStage("communication_media_transcoded", {
      organizationId,
      prospectId: row.prospect_id || null,
      providerMessageId: row.provider_message_id,
      mediaKind: row.media_kind
    });

    const transcoded = {
      status: FETCH_STATUS.STORED,
      transcodeStatus: TRANSCODE_STATUS.READY,
      id: row.id
    };
    const transcript = await maybeProcessTranscript(row, { ...dependencies, repository });
    return transcript ? { ...transcoded, transcript } : transcoded;
  } catch (error) {
    const nextAttempts = attempts + 1;
    const terminal = nextAttempts >= MAX_TRANSCODE_ATTEMPTS;
    await repository.update(row.id, organizationId, {
      transcodeStatus: terminal ? TRANSCODE_STATUS.FAILED : TRANSCODE_STATUS.PENDING,
      transcodeAttempts: nextAttempts,
      transcodeError: publicStatusError(error.publicCode || "TRANSCODE_FAILED", "TRANSCODE_FAILED")
    });

    logWhatsAppStage("communication_media_transcode_failed", {
      level: "warn",
      organizationId,
      prospectId: row.prospect_id || null,
      providerMessageId: row.provider_message_id,
      attempts: nextAttempts,
      terminal,
      code: error.publicCode || null
    });

    const failed = {
      status: FETCH_STATUS.STORED,
      transcodeStatus: terminal ? TRANSCODE_STATUS.FAILED : TRANSCODE_STATUS.PENDING,
      reason: error.publicCode || "TRANSCODE_FAILED",
      id: row.id,
      retryAfterMs: terminal ? null : backoffMs(nextAttempts)
    };
    if (terminal) {
      const transcript = await maybeProcessTranscript(row, { ...dependencies, repository });
      return transcript ? { ...failed, transcript } : failed;
    }
    return failed;
  }
}

async function maybeProcessTranscript(row, dependencies = {}) {
  const repository =
    dependencies.repository || getCommunicationMediaRepository(dependencies);
  const skipAutomaticStt =
    !dependencies.transcribeFn &&
    dependencies.enableStt !== true &&
    (dependencies.skipTranscript === true ||
      repository?.backend === "memory" ||
      process.env.ATLAS_COMMUNICATION_MEDIA_BACKEND === "memory");
  if (skipAutomaticStt) {
    return null;
  }
  const {
    needsTranscriptWork,
    processOneCommunicationMediaTranscript
  } = require("./whatsappAudioTranscriptService");
  const current =
    (await repository.findById(row.id, row.organization_id)) || row;
  if (
    !needsTranscriptWork(current, {
      now: dependencies.now || Date.now(),
      staleMs: dependencies.staleMs || FETCH_LOCK_STALE_MS
    })
  ) {
    return null;
  }
  return processOneCommunicationMediaTranscript(current, {
    ...dependencies,
    repository
  });
}

async function processOneCommunicationMediaFetch(row, dependencies = {}) {
  const repository =
    dependencies.repository || getCommunicationMediaRepository(dependencies);
  const organizationId = row.organization_id;
  const attempts = Number(row.fetch_attempts || 0);

  if (isFetchComplete(row)) {
    if (isTranscodeComplete(row)) {
      const transcript = await maybeProcessTranscript(row, { ...dependencies, repository });
      return {
        status: FETCH_STATUS.STORED,
        transcodeStatus: row.transcode_status,
        skipped: true,
        id: row.id,
        transcript
      };
    }
    return processOneCommunicationMediaTranscode(row, { ...dependencies, repository });
  }

  if (attempts >= MAX_FETCH_ATTEMPTS) {
    await repository.update(row.id, organizationId, {
      fetchStatus: FETCH_STATUS.FAILED,
      fetchError: publicStatusError("MAX_ATTEMPTS", "MAX_ATTEMPTS"),
      fetchAttempts: attempts
    });
    const failed = { status: FETCH_STATUS.FAILED, reason: "MAX_ATTEMPTS", id: row.id };
    const transcript = await maybeProcessTranscript(row, { ...dependencies, repository });
    return transcript ? { ...failed, transcript } : failed;
  }

  await repository.update(row.id, organizationId, {
    fetchStatus: FETCH_STATUS.FETCHING,
    fetchAttempts: attempts,
    fetchError: null
  });

  try {
    const fetched = await fetchWhatsAppAudioBytes({
      organizationId,
      metaMediaId: row.meta_media_id,
      credentialsResolver: dependencies.credentialsResolver,
      graphGetJson: dependencies.graphGetJson,
      downloadBytes: dependencies.downloadBytes
    });

    const mimeType = fetched.mimeType || row.mime_type;
    if (!isAllowedAudioMime(mimeType)) {
      throw Object.assign(new Error("MEDIA_TYPE_INVALID"), {
        publicCode: "MEDIA_TYPE_INVALID"
      });
    }
    if (!fetched.buffer || fetched.buffer.length > MAX_COMMUNICATION_MEDIA_BYTES) {
      throw Object.assign(new Error("MEDIA_TOO_LARGE"), {
        publicCode: "MEDIA_TOO_LARGE"
      });
    }

    const uploader = dependencies.uploadOriginalMedia || uploadOriginalMedia;
    const stored = await uploader({
      organizationId,
      prospectId: row.prospect_id,
      providerMessageId: row.provider_message_id,
      mimeType: baseMime(mimeType),
      buffer: fetched.buffer
    });

    const nativePlayback = isBrowserNativeAudioMime(mimeType);
    await repository.update(row.id, organizationId, {
      fetchStatus: FETCH_STATUS.STORED,
      fetchAttempts: attempts + 1,
      fetchError: null,
      storagePath: stored.storagePath,
      mimeType,
      fileSize: fetched.fileSize || fetched.buffer.length,
      sha256: fetched.sha256 || row.sha256,
      transcodeStatus: nativePlayback
        ? TRANSCODE_STATUS.NOT_REQUIRED
        : TRANSCODE_STATUS.PENDING,
      playbackPath: nativePlayback ? stored.storagePath : null,
      playbackMimeType: nativePlayback ? mimeType : null,
      transcodeError: null,
      transcriptStatus: nativePlayback ? TRANSCRIPT_STATUS.PENDING : null
    });

    logWhatsAppStage("communication_media_stored", {
      organizationId,
      prospectId: row.prospect_id || null,
      providerMessageId: row.provider_message_id,
      mediaKind: row.media_kind
    });

    const storedRow = {
      ...row,
      fetch_status: FETCH_STATUS.STORED,
      fetch_attempts: attempts + 1,
      storage_path: stored.storagePath,
      mime_type: mimeType,
      transcode_status: nativePlayback
        ? TRANSCODE_STATUS.NOT_REQUIRED
        : TRANSCODE_STATUS.PENDING,
      playback_path: nativePlayback ? stored.storagePath : null,
      playback_mime_type: nativePlayback ? mimeType : null,
      transcode_attempts: Number(row.transcode_attempts || 0),
      transcript_status: nativePlayback ? TRANSCRIPT_STATUS.PENDING : row.transcript_status || null
    };

    if (nativePlayback) {
      const storedResult = {
        status: FETCH_STATUS.STORED,
        transcodeStatus: TRANSCODE_STATUS.NOT_REQUIRED,
        id: row.id
      };
      const transcript = await maybeProcessTranscript(storedRow, {
        ...dependencies,
        repository
      });
      return transcript ? { ...storedResult, transcript } : storedResult;
    }

    return processOneCommunicationMediaTranscode(storedRow, {
      ...dependencies,
      repository,
      originalBuffer: fetched.buffer
    });
  } catch (error) {
    const nextAttempts = attempts + 1;
    const terminal = nextAttempts >= MAX_FETCH_ATTEMPTS;
    await repository.update(row.id, organizationId, {
      fetchStatus: terminal ? FETCH_STATUS.FAILED : FETCH_STATUS.PENDING,
      fetchAttempts: nextAttempts,
      fetchError: publicStatusError(error.publicCode || "MEDIA_FETCH_FAILED", "MEDIA_FETCH_FAILED")
    });

    logWhatsAppStage("communication_media_fetch_failed", {
      level: "warn",
      organizationId,
      prospectId: row.prospect_id || null,
      providerMessageId: row.provider_message_id,
      attempts: nextAttempts,
      terminal,
      code: error.publicCode || null
    });

    const failed = {
      status: terminal ? FETCH_STATUS.FAILED : FETCH_STATUS.PENDING,
      reason: error.publicCode || "MEDIA_FETCH_FAILED",
      id: row.id,
      retryAfterMs: terminal ? null : backoffMs(nextAttempts)
    };
    if (terminal) {
      const transcript = await maybeProcessTranscript(
        { ...row, fetch_status: FETCH_STATUS.FAILED },
        { ...dependencies, repository }
      );
      return transcript ? { ...failed, transcript } : failed;
    }
    return failed;
  }
}

async function processPendingWhatsAppMediaFetches(dependencies = {}) {
  const repository =
    dependencies.repository || getCommunicationMediaRepository(dependencies);
  const pending = await repository.listPending({
    limit: dependencies.limit || 10,
    now: dependencies.now || Date.now(),
    staleMs: dependencies.staleMs || FETCH_LOCK_STALE_MS
  });

  const results = [];
  for (const row of pending) {
    if (String(row.media_kind || "") !== "audio") {
      continue;
    }
    results.push(
      await processOneCommunicationMediaFetch(row, { ...dependencies, repository })
    );
  }
  return results;
}

async function persistInboundAudioMedia({
  organizationId,
  prospectId,
  conversationLogId,
  inbound,
  repository = null
} = {}) {
  const media = inbound?.media;
  if (!organizationId || !inbound?.providerMessageId) {
    return null;
  }
  if (String(inbound.messageType || media?.kind || "").toLowerCase() !== "audio") {
    return null;
  }
  if (!media?.metaMediaId) {
    return null;
  }

  const repo = repository || getCommunicationMediaRepository();
  return repo.insertIfNew({
    organizationId,
    prospectId: prospectId || null,
    conversationLogId: conversationLogId || null,
    providerMessageId: inbound.providerMessageId,
    channel: "whatsapp",
    mediaKind: "audio",
    metaMediaId: media.metaMediaId,
    mimeType: media.mimeType || null,
    isVoiceNote: media.isVoiceNote !== false,
    sha256: media.sha256 || null,
    fileSize: media.fileSize || null,
    fetchStatus: FETCH_STATUS.PENDING,
    transcodeStatus: TRANSCODE_STATUS.PENDING
  });
}

module.exports = {
  backoffMs,
  isFetchComplete,
  isTranscodeComplete,
  fetchWhatsAppAudioBytes,
  processOneCommunicationMediaTranscode,
  processOneCommunicationMediaFetch,
  processPendingWhatsAppMediaFetches,
  persistInboundAudioMedia,
  maybeProcessTranscript
};
