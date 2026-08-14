/**
 * BR-141 — WhatsApp audio STT + Recruit AI V2 semantic replay.
 * Same media row / poller. Original wamid is linkage only.
 * Execution gates stay off. No second inbound conversation_logs row.
 */

"use strict";

const { logWhatsAppStage } = require("../whatsappStructuredLogger");
const { resolveProspectPreferredLanguage } = require("../prospectLanguage");
const { attemptLiveV2Authoring } = require("../recruitAiV2/liveAuthoringBridge");
const { processRecruitAiV2Turn } = require("../recruitAiV2/orchestrator");
const {
  transcribeWithGptTranscribe,
  resolveSttLanguageHints
} = require("../../communication/audio/stt");
const { downloadStoredMedia } = require("./communicationMediaStorage");
const { getCommunicationMediaRepository } = require("./communicationMediaRepository");
const {
  FETCH_STATUS,
  TRANSCODE_STATUS,
  TRANSCRIPT_STATUS,
  MAX_STT_ATTEMPTS,
  MAX_STT_DURATION_MS,
  STT_SOFT_ACK_MS,
  FETCH_LOCK_STALE_MS
} = require("./constants");
const {
  getVoiceNoteSoftAck,
  getVoiceNoteTypeFallback,
  getVoiceNoteTooLongFallback
} = require("./whatsappAudioTranscriptCopy");
function backoffMs(attempts) {
  const exponent = Math.max(0, Number(attempts) || 0);
  return Math.min(15_000 * 2 ** exponent, 15 * 60 * 1000);
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

function buildTranscriptTurnId(mediaId) {
  return `audio-stt:${String(mediaId || "").trim()}`;
}

function publicStatusError(code, fallback) {
  return String(code || fallback).slice(0, 80);
}

function isTerminalTranscript(status) {
  const value = String(status || "");
  return (
    value === TRANSCRIPT_STATUS.READY ||
    value === TRANSCRIPT_STATUS.FAILED ||
    value === TRANSCRIPT_STATUS.SKIPPED
  );
}

function isPlaybackReadyForStt(row) {
  return isFetchComplete(row) && isTranscodeComplete(row);
}

function isStaleProcessing(row, now, staleMs) {
  if (String(row?.transcript_status) !== TRANSCRIPT_STATUS.PROCESSING) {
    return false;
  }
  const updated = Date.parse(row.updated_at || "") || 0;
  return now - updated >= staleMs;
}

function needsTranscriptWork(row, { now = Date.now(), staleMs = FETCH_LOCK_STALE_MS } = {}) {
  if (!row || String(row.media_kind || "") !== "audio") {
    return false;
  }
  if (isTerminalTranscript(row.transcript_status)) {
    return false;
  }
  if (row.fetch_status === FETCH_STATUS.FAILED) {
    return true;
  }
  if (
    row.fetch_status === FETCH_STATUS.STORED &&
    row.transcode_status === TRANSCODE_STATUS.FAILED
  ) {
    return true;
  }
  if (!isPlaybackReadyForStt(row)) {
    return false;
  }
  if (!row.transcript_status || row.transcript_status === TRANSCRIPT_STATUS.PENDING) {
    return true;
  }
  if (row.transcript_status === TRANSCRIPT_STATUS.PROCESSING) {
    return isStaleProcessing(row, now, staleMs) || Boolean(row.transcript_text);
  }
  return false;
}

function isUnusableTranscript(text) {
  const value = String(text || "").trim();
  if (!value) {
    return true;
  }
  if (/^[\s.!?…,:-]*$/u.test(value)) {
    return true;
  }
  return false;
}

function isLowConfidence(confidence) {
  return confidence != null && Number.isFinite(Number(confidence)) && Number(confidence) < 0.25;
}

function resolvePlaybackPath(row) {
  if (row?.playback_path) {
    return row.playback_path;
  }
  if (row?.transcode_status === TRANSCODE_STATUS.NOT_REQUIRED && row?.storage_path) {
    return row.storage_path;
  }
  return null;
}

function canSttOriginal(row) {
  const mime = String(row?.mime_type || row?.playback_mime_type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return mime === "audio/mpeg" || mime === "audio/mp3";
}

function resolveCustomerLanguage(prospect) {
  return resolveProspectPreferredLanguage(prospect || {}) || "spanish";
}

async function defaultLoadProspect(row) {
  if (!row?.prospect_id) {
    return null;
  }
  const { supabase } = require("../../services/supabaseService");
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", row.prospect_id)
    .maybeSingle();
  if (error) {
    return null;
  }
  return data || null;
}

function scheduleSoftAck(fn, delayMs, dependencies = {}) {
  if (typeof dependencies.scheduleSoftAck === "function") {
    return dependencies.scheduleSoftAck(fn, delayMs);
  }
  return setTimeout(fn, delayMs);
}

function cancelSoftAck(handle, dependencies = {}) {
  if (typeof dependencies.cancelSoftAck === "function") {
    dependencies.cancelSoftAck(handle);
    return;
  }
  if (handle) {
    clearTimeout(handle);
  }
}

async function sendTranscriptOutbound({
  prospect,
  row,
  text,
  idempotencyKey,
  dependencies = {}
}) {
  if (!prospect?.phone || !text) {
    return { success: false, replied: false, reason: "NO_PROSPECT_OR_TEXT" };
  }
  const deliver = dependencies.deliverWhatsAppReply || require("../communicationHub").deliverWhatsAppReply;
  return deliver({
    normalized: {
      channel: "whatsapp",
      providerMessageId: idempotencyKey,
      phone: prospect.phone,
      text,
      messageType: "text",
      timestamp: new Date().toISOString()
    },
    prospect,
    replyText: text,
    engineResult: {
      reply: text,
      source: "recruit_ai_v2_audio_stt",
      owner: "v2",
      confirmationIdempotencyKey: idempotencyKey
    },
    outboundIntent: "CONVERSATION_ENGINE_REPLY"
  });
}

async function processWhatsAppAudioTranscriptTurn({
  row,
  prospect,
  transcriptText,
  dependencies = {}
} = {}) {
  const mediaId = row?.id;
  const turnId = buildTranscriptTurnId(mediaId);
  const env = {
    ...(dependencies.env || process.env),
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
  };
  const innerProcessTurn = dependencies.processTurn || processRecruitAiV2Turn;

  const processTurn = async (args = {}) =>
    innerProcessTurn({
      ...args,
      message: {
        ...(args.message || {}),
        id: turnId,
        providerMessageId: turnId,
        text: String(transcriptText || "").trim(),
        messageType: "text"
      },
      options: {
        ...(args.options || {}),
        channel: "whatsapp",
        inboundMessageId: turnId,
        inputModality: "whatsapp_audio",
        transcriptSource: "gpt-transcribe",
        mediaId,
        originalProviderMessageId: row.provider_message_id || null,
        skipInboundClaim: true,
        skipInboundConversationLog: true,
        persistContext: true,
        allowExecution: false,
        messageType: "text",
        env
      }
    });

  const attemptAuthoring = dependencies.attemptLiveV2Authoring || attemptLiveV2Authoring;
  const authoringAttempt = await attemptAuthoring({
    normalized: {
      channel: "whatsapp",
      providerMessageId: turnId,
      phone: prospect.phone,
      contactName: prospect.name || null,
      text: String(transcriptText || "").trim(),
      messageType: "text",
      timestamp: new Date().toISOString()
    },
    prospect,
    env,
    dependencies,
    processTurn,
    persistenceService: dependencies.persistenceService || null,
    logStage: logWhatsAppStage
  });

  if (!authoringAttempt?.authored || !authoringAttempt.replyText) {
    return {
      success: true,
      replied: false,
      reason: authoringAttempt?.reason || "AUDIO_STT_NO_REPLY",
      turnId,
      authoringAttempt
    };
  }

  const delivery = await sendTranscriptOutbound({
    prospect,
    row,
    text: authoringAttempt.replyText,
    idempotencyKey: `audio-stt-reply:${mediaId}`,
    dependencies
  });

  return {
    success: Boolean(delivery?.success),
    replied: Boolean(delivery?.replied || delivery?.success),
    reason: delivery?.reason || null,
    turnId,
    authoringAttempt,
    delivery
  };
}

async function markTranscriptTerminal(repository, row, patch) {
  return repository.update(row.id, row.organization_id, patch);
}

async function failOrSkipTranscript({
  repository,
  row,
  prospect,
  status,
  errorCode,
  fallbackText,
  dependencies
}) {
  await markTranscriptTerminal(repository, row, {
    transcriptStatus: status,
    transcriptError: publicStatusError(errorCode, "STT_FAILED"),
    transcriptTurnId: row.transcript_turn_id || buildTranscriptTurnId(row.id)
  });

  logWhatsAppStage("communication_media_transcript_failed", {
    level: "warn",
    organizationId: row.organization_id,
    prospectId: row.prospect_id || null,
    providerMessageId: row.provider_message_id,
    code: errorCode,
    status
  });

  if (fallbackText && prospect) {
    await sendTranscriptOutbound({
      prospect,
      row,
      text: fallbackText,
      idempotencyKey: `audio-stt-fallback:${row.id}`,
      dependencies
    });
  }

  return {
    status,
    reason: errorCode,
    id: row.id,
    turnId: buildTranscriptTurnId(row.id)
  };
}

async function processOneCommunicationMediaTranscript(row, dependencies = {}) {
  const repository =
    dependencies.repository || getCommunicationMediaRepository(dependencies);
  const now = dependencies.now || Date.now();
  const staleMs = dependencies.staleMs || FETCH_LOCK_STALE_MS;
  const organizationId = row.organization_id;
  const current = (await repository.findById(row.id, organizationId)) || row;

  if (isTerminalTranscript(current.transcript_status)) {
    return { status: current.transcript_status, reason: "NO_OP", id: current.id };
  }

  if (
    current.transcript_status === TRANSCRIPT_STATUS.PROCESSING &&
    !isStaleProcessing(current, now, staleMs) &&
    !current.transcript_text
  ) {
    return { status: TRANSCRIPT_STATUS.PROCESSING, reason: "IN_FLIGHT", id: current.id };
  }

  const prospect =
    dependencies.prospect ||
    (await (dependencies.loadProspect || defaultLoadProspect)(current));
  const language = resolveCustomerLanguage(prospect);
  const attempts = Number(current.transcript_attempts || 0);

  if (current.fetch_status === FETCH_STATUS.FAILED) {
    return failOrSkipTranscript({
      repository,
      row: current,
      prospect,
      status: TRANSCRIPT_STATUS.SKIPPED,
      errorCode: "FETCH_FAILED",
      fallbackText: getVoiceNoteTypeFallback(language),
      dependencies
    });
  }

  if (current.transcode_status === TRANSCODE_STATUS.FAILED && !canSttOriginal(current)) {
    return failOrSkipTranscript({
      repository,
      row: current,
      prospect,
      status: TRANSCRIPT_STATUS.FAILED,
      errorCode: "TRANSCODE_FAILED",
      fallbackText: getVoiceNoteTypeFallback(language),
      dependencies
    });
  }

  const durationMs = Number(current.duration_ms);
  if (Number.isFinite(durationMs) && durationMs > MAX_STT_DURATION_MS) {
    return failOrSkipTranscript({
      repository,
      row: current,
      prospect,
      status: TRANSCRIPT_STATUS.SKIPPED,
      errorCode: "AUDIO_TOO_LONG",
      fallbackText: getVoiceNoteTooLongFallback(language),
      dependencies
    });
  }

  if (attempts >= MAX_STT_ATTEMPTS && !current.transcript_text) {
    return failOrSkipTranscript({
      repository,
      row: current,
      prospect,
      status: TRANSCRIPT_STATUS.FAILED,
      errorCode: "MAX_ATTEMPTS",
      fallbackText: getVoiceNoteTypeFallback(language),
      dependencies
    });
  }

  const turnId = buildTranscriptTurnId(current.id);

  if (current.transcript_text && current.transcript_turn_id) {
    const replay = await processWhatsAppAudioTranscriptTurn({
      row: current,
      prospect,
      transcriptText: current.transcript_text,
      dependencies
    });
    await markTranscriptTerminal(repository, current, {
      transcriptStatus: TRANSCRIPT_STATUS.READY,
      transcriptError: null,
      transcriptTurnId: current.transcript_turn_id
    });
    return {
      status: TRANSCRIPT_STATUS.READY,
      reason: replay.reason || "REPLAYED",
      id: current.id,
      turnId,
      replayed: true
    };
  }

  await repository.update(current.id, organizationId, {
    transcriptStatus: TRANSCRIPT_STATUS.PROCESSING,
    transcriptAttempts: attempts + 1,
    transcriptError: null
  });

  const ackHandle = scheduleSoftAck(
    () => {
      sendTranscriptOutbound({
        prospect,
        row: current,
        text: getVoiceNoteSoftAck(language),
        idempotencyKey: `audio-stt-ack:${current.id}`,
        dependencies
      }).catch(() => {});
    },
    dependencies.softAckMs != null ? dependencies.softAckMs : STT_SOFT_ACK_MS,
    dependencies
  );

  try {
    let buffer = null;
    const downloader = dependencies.downloadStoredMedia || downloadStoredMedia;
    const playbackPath = resolvePlaybackPath(current);
    if (playbackPath) {
      buffer = await downloader(playbackPath);
    } else if (canSttOriginal(current) && current.storage_path) {
      buffer = await downloader(current.storage_path);
    } else {
      throw Object.assign(new Error("STT_INPUT_MISSING"), { publicCode: "STT_INPUT_MISSING" });
    }

    const hints = resolveSttLanguageHints(prospect || {}, dependencies.languageHintOptions || {});
    const transcribe = dependencies.transcribeFn || transcribeWithGptTranscribe;
    const sttStarted = Date.now();
    const stt = await transcribe({
      buffer,
      hints,
      apiKey: dependencies.apiKey,
      fetchFn: dependencies.fetchFn,
      timeoutMs: dependencies.sttTimeoutMs
    });
    const sttLatencyMs = Date.now() - sttStarted;

    if (stt?.billedMs && stt.billedMs > MAX_STT_DURATION_MS) {
      cancelSoftAck(ackHandle, dependencies);
      return failOrSkipTranscript({
        repository,
        row: current,
        prospect,
        status: TRANSCRIPT_STATUS.SKIPPED,
        errorCode: "AUDIO_TOO_LONG",
        fallbackText: getVoiceNoteTooLongFallback(language),
        dependencies
      });
    }

    if (isUnusableTranscript(stt?.text) || isLowConfidence(stt?.confidence)) {
      cancelSoftAck(ackHandle, dependencies);
      return failOrSkipTranscript({
        repository,
        row: current,
        prospect,
        status: TRANSCRIPT_STATUS.FAILED,
        errorCode: isUnusableTranscript(stt?.text) ? "EMPTY_TRANSCRIPT" : "LOW_CONFIDENCE",
        fallbackText: getVoiceNoteTypeFallback(language),
        dependencies
      });
    }

    await repository.update(current.id, organizationId, {
      transcriptStatus: TRANSCRIPT_STATUS.PROCESSING,
      transcriptText: stt.text,
      transcriptLanguage: stt.language || null,
      transcriptConfidence: stt.confidence != null ? stt.confidence : null,
      transcriptProvider: stt.provider || "openai",
      transcriptModel: stt.model || "gpt-transcribe",
      transcriptBilledMs: stt.billedMs != null ? stt.billedMs : null,
      transcriptError: null,
      transcriptTurnId: turnId
    });

    logWhatsAppStage("communication_media_transcribed", {
      organizationId,
      prospectId: current.prospect_id || null,
      providerMessageId: current.provider_message_id,
      language: stt.language || null,
      billedMs: stt.billedMs || null,
      attempts: attempts + 1,
      latencyMs: sttLatencyMs,
      model: stt.model || "gpt-transcribe"
    });

    const replay = await processWhatsAppAudioTranscriptTurn({
      row: { ...current, transcript_text: stt.text, transcript_turn_id: turnId },
      prospect,
      transcriptText: stt.text,
      dependencies
    });

    cancelSoftAck(ackHandle, dependencies);

    await markTranscriptTerminal(repository, current, {
      transcriptStatus: TRANSCRIPT_STATUS.READY,
      transcriptError: null,
      transcriptTurnId: turnId
    });

    return {
      status: TRANSCRIPT_STATUS.READY,
      id: current.id,
      turnId,
      billedMs: stt.billedMs || null,
      latencyMs: sttLatencyMs,
      language: stt.language || null,
      replied: Boolean(replay.replied)
    };
  } catch (error) {
    cancelSoftAck(ackHandle, dependencies);
    const nextAttempts = attempts + 1;
    const retryable =
      error.publicCode === "STT_PROVIDER_UNAVAILABLE" ||
      error.publicCode === "STT_TIMEOUT";
    const terminal = nextAttempts >= MAX_STT_ATTEMPTS || !retryable;

    if (!terminal) {
      await repository.update(current.id, organizationId, {
        transcriptStatus: TRANSCRIPT_STATUS.PENDING,
        transcriptAttempts: nextAttempts,
        transcriptError: publicStatusError(error.publicCode || "STT_FAILED", "STT_FAILED")
      });
      logWhatsAppStage("communication_media_transcript_retry", {
        level: "warn",
        organizationId,
        prospectId: current.prospect_id || null,
        providerMessageId: current.provider_message_id,
        attempts: nextAttempts,
        code: error.publicCode || null
      });
      return {
        status: TRANSCRIPT_STATUS.PENDING,
        reason: error.publicCode || "STT_FAILED",
        id: current.id,
        retryAfterMs: backoffMs(nextAttempts)
      };
    }

    return failOrSkipTranscript({
      repository,
      row: { ...current, transcript_attempts: nextAttempts },
      prospect,
      status: TRANSCRIPT_STATUS.FAILED,
      errorCode: error.publicCode || "STT_FAILED",
      fallbackText: getVoiceNoteTypeFallback(language),
      dependencies
    });
  }
}

module.exports = {
  buildTranscriptTurnId,
  needsTranscriptWork,
  isUnusableTranscript,
  processWhatsAppAudioTranscriptTurn,
  processOneCommunicationMediaTranscript
};
