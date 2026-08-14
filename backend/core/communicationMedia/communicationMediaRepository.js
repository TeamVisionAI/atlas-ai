/**
 * Org-scoped communication_media persistence (BR-140).
 * Phone is never an authorization key.
 */

"use strict";

const { randomUUID } = require("crypto");
const { isMissingTableError } = require("../supabaseTableErrors");
const { FETCH_STATUS, TRANSCODE_STATUS, TRANSCRIPT_STATUS } = require("./constants");

function isTerminalTranscriptStatus(status) {
  const value = String(status || "");
  return (
    value === TRANSCRIPT_STATUS.READY ||
    value === TRANSCRIPT_STATUS.FAILED ||
    value === TRANSCRIPT_STATUS.SKIPPED
  );
}

function rowNeedsPollerWork(row, now, staleMs) {
  if (!row) {
    return false;
  }
  if (row.fetch_status === FETCH_STATUS.PENDING) {
    return true;
  }
  if (row.fetch_status === FETCH_STATUS.FETCHING) {
    const updated = Date.parse(row.updated_at || "") || 0;
    return now - updated >= staleMs;
  }
  if (row.fetch_status === FETCH_STATUS.FAILED) {
    return !isTerminalTranscriptStatus(row.transcript_status);
  }
  if (row.fetch_status !== FETCH_STATUS.STORED) {
    return false;
  }
  if (row.transcode_status === TRANSCODE_STATUS.PENDING) {
    return true;
  }
  if (row.transcode_status === TRANSCODE_STATUS.PROCESSING) {
    const updated = Date.parse(row.updated_at || "") || 0;
    return now - updated >= staleMs;
  }
  if (row.transcode_status === TRANSCODE_STATUS.FAILED) {
    return !isTerminalTranscriptStatus(row.transcript_status);
  }
  if (
    row.transcode_status === TRANSCODE_STATUS.READY ||
    row.transcode_status === TRANSCODE_STATUS.NOT_REQUIRED
  ) {
    if (isTerminalTranscriptStatus(row.transcript_status)) {
      return false;
    }
    if (
      !row.transcript_status ||
      row.transcript_status === TRANSCRIPT_STATUS.PENDING
    ) {
      return true;
    }
    if (row.transcript_status === TRANSCRIPT_STATUS.PROCESSING) {
      const updated = Date.parse(row.updated_at || "") || 0;
      return now - updated >= staleMs || Boolean(row.transcript_text);
    }
  }
  return false;
}

function getSupabase() {
  return require("../../services/supabaseService").supabase;
}

function nowIso(now) {
  return new Date(now || Date.now()).toISOString();
}

function toRow(input = {}) {
  const created = nowIso(input.now);
  return {
    id: input.id || randomUUID(),
    organization_id: input.organizationId || input.organization_id,
    prospect_id: input.prospectId || input.prospect_id || null,
    conversation_log_id: input.conversationLogId || input.conversation_log_id || null,
    provider_message_id: String(input.providerMessageId || input.provider_message_id || "").trim(),
    channel: input.channel || "whatsapp",
    media_kind: input.mediaKind || input.media_kind || "audio",
    meta_media_id: input.metaMediaId || input.meta_media_id || null,
    mime_type: input.mimeType || input.mime_type || null,
    is_voice_note:
      input.isVoiceNote != null
        ? Boolean(input.isVoiceNote)
        : input.is_voice_note != null
          ? Boolean(input.is_voice_note)
          : true,
    sha256: input.sha256 || null,
    file_size:
      input.fileSize != null
        ? Number(input.fileSize)
        : input.file_size != null
          ? Number(input.file_size)
          : null,
    duration_ms:
      input.durationMs != null
        ? Number(input.durationMs)
        : input.duration_ms != null
          ? Number(input.duration_ms)
          : null,
    storage_path: input.storagePath || input.storage_path || null,
    playback_path: input.playbackPath || input.playback_path || null,
    playback_mime_type: input.playbackMimeType || input.playback_mime_type || null,
    fetch_status: input.fetchStatus || input.fetch_status || FETCH_STATUS.PENDING,
    fetch_attempts:
      input.fetchAttempts != null
        ? Number(input.fetchAttempts)
        : input.fetch_attempts != null
          ? Number(input.fetch_attempts)
          : 0,
    fetch_error: input.fetchError || input.fetch_error || null,
    transcode_status:
      input.transcodeStatus || input.transcode_status || TRANSCODE_STATUS.PENDING,
    transcode_attempts:
      input.transcodeAttempts != null
        ? Number(input.transcodeAttempts)
        : input.transcode_attempts != null
          ? Number(input.transcode_attempts)
          : 0,
    transcode_error: input.transcodeError || input.transcode_error || null,
    transcript_status: input.transcriptStatus || input.transcript_status || null,
    transcript_text: input.transcriptText || input.transcript_text || null,
    transcript_language: input.transcriptLanguage || input.transcript_language || null,
    transcript_confidence:
      input.transcriptConfidence != null
        ? Number(input.transcriptConfidence)
        : input.transcript_confidence != null
          ? Number(input.transcript_confidence)
          : null,
    transcript_error: input.transcriptError || input.transcript_error || null,
    transcript_attempts:
      input.transcriptAttempts != null
        ? Number(input.transcriptAttempts)
        : input.transcript_attempts != null
          ? Number(input.transcript_attempts)
          : 0,
    transcript_provider: input.transcriptProvider || input.transcript_provider || null,
    transcript_model: input.transcriptModel || input.transcript_model || null,
    transcript_billed_ms:
      input.transcriptBilledMs != null
        ? Number(input.transcriptBilledMs)
        : input.transcript_billed_ms != null
          ? Number(input.transcript_billed_ms)
          : null,
    transcript_turn_id: input.transcriptTurnId || input.transcript_turn_id || null,
    created_at: input.createdAt || input.created_at || created,
    updated_at: input.updatedAt || input.updated_at || created
  };
}

function toPublicMedia(row) {
  if (!row) {
    return null;
  }
  const fetchStatus = String(row.fetch_status || FETCH_STATUS.PENDING);
  const transcodeStatus = String(row.transcode_status || TRANSCODE_STATUS.PENDING);
  const playbackReady =
    fetchStatus === FETCH_STATUS.STORED &&
    ((transcodeStatus === TRANSCODE_STATUS.READY && Boolean(row.playback_path)) ||
      (transcodeStatus === TRANSCODE_STATUS.NOT_REQUIRED &&
        Boolean(row.playback_path || row.storage_path)));
  return {
    id: row.id || null,
    mediaKind: row.media_kind || "audio",
    mimeType: row.playback_mime_type || row.mime_type || null,
    isVoiceNote: row.is_voice_note !== false,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
    fetchStatus,
    transcodeStatus,
    playbackAvailable: playbackReady,
    playbackPreparing:
      fetchStatus === FETCH_STATUS.STORED &&
      (transcodeStatus === TRANSCODE_STATUS.PENDING ||
        transcodeStatus === TRANSCODE_STATUS.PROCESSING),
    playbackFailed:
      fetchStatus === FETCH_STATUS.STORED && transcodeStatus === TRANSCODE_STATUS.FAILED,
    transcriptStatus: row.transcript_status || null,
    transcriptText:
      String(row.transcript_status || "") === TRANSCRIPT_STATUS.READY
        ? row.transcript_text || null
        : null
  };
}

/**
 * Attach canonical public media to WhatsApp thread messages keyed by conversation_log id.
 * Same toPublicMedia() used by Communications Center. No second fetch/storage path.
 */
function attachPublicMediaToConversationMessages(messages = [], mediaRows = []) {
  const byLogId = new Map();
  for (const row of mediaRows || []) {
    if (!row?.conversation_log_id) {
      continue;
    }
    byLogId.set(String(row.conversation_log_id), toPublicMedia(row));
  }

  return (messages || []).map((message) => {
    const attached = byLogId.get(String(message?.id)) || message?.media || null;
    if (!attached) {
      return message;
    }
    return {
      ...message,
      media: attached,
      messageType: attached.mediaKind || message.messageType || null
    };
  });
}

function createMemoryCommunicationMediaRepository(seed = []) {
  const rows = seed.map((row) => toRow(row));

  return {
    backend: "memory",
    _rows: rows,
    async insertIfNew(input) {
      const next = toRow(input);
      if (!next.organization_id || !next.provider_message_id) {
        const error = new Error("organization_id and provider_message_id are required");
        error.publicCode = "MEDIA_IDENTITY_REQUIRED";
        throw error;
      }
      const existing = rows.find(
        (row) =>
          String(row.organization_id) === String(next.organization_id) &&
          String(row.provider_message_id) === String(next.provider_message_id) &&
          String(row.media_kind) === String(next.media_kind)
      );
      if (existing) {
        return { row: existing, inserted: false };
      }
      rows.push(next);
      return { row: next, inserted: true };
    },
    async findById(id, organizationId) {
      return (
        rows.find(
          (row) =>
            String(row.id) === String(id) &&
            String(row.organization_id) === String(organizationId)
        ) || null
      );
    },
    async findByProvider({ organizationId, providerMessageId, mediaKind = "audio" }) {
      return (
        rows.find(
          (row) =>
            String(row.organization_id) === String(organizationId) &&
            String(row.provider_message_id) === String(providerMessageId) &&
            String(row.media_kind) === String(mediaKind)
        ) || null
      );
    },
    async listForProspect({ organizationId, prospectId }) {
      return rows.filter(
        (row) =>
          String(row.organization_id) === String(organizationId) &&
          String(row.prospect_id || "") === String(prospectId || "")
      );
    },
    async listPending({ limit = 20, now = Date.now(), staleMs = 5 * 60 * 1000 } = {}) {
      return rows
        .filter((row) => rowNeedsPollerWork(row, now, staleMs))
        .sort((a, b) => Date.parse(a.updated_at || 0) - Date.parse(b.updated_at || 0))
        .slice(0, limit);
    },
    async update(id, organizationId, patch = {}) {
      const row = await this.findById(id, organizationId);
      if (!row) {
        return null;
      }
      const mapped = {
        ...row,
        ...Object.fromEntries(
          Object.entries({
            fetch_status: patch.fetchStatus || patch.fetch_status,
            fetch_attempts:
              patch.fetchAttempts != null
                ? patch.fetchAttempts
                : patch.fetch_attempts,
            fetch_error:
              patch.fetchError !== undefined
                ? patch.fetchError
                : patch.fetch_error !== undefined
                  ? patch.fetch_error
                  : undefined,
            storage_path: patch.storagePath || patch.storage_path,
            playback_path: patch.playbackPath || patch.playback_path,
            playback_mime_type: patch.playbackMimeType || patch.playback_mime_type,
            mime_type: patch.mimeType || patch.mime_type,
            transcode_status: patch.transcodeStatus || patch.transcode_status,
            transcode_attempts:
              patch.transcodeAttempts != null
                ? patch.transcodeAttempts
                : patch.transcode_attempts,
            transcode_error:
              patch.transcodeError !== undefined
                ? patch.transcodeError
                : patch.transcode_error !== undefined
                  ? patch.transcode_error
                  : undefined,
            file_size:
              patch.fileSize != null ? patch.fileSize : patch.file_size,
            duration_ms:
              patch.durationMs != null ? patch.durationMs : patch.duration_ms,
            sha256: patch.sha256,
            transcript_status: patch.transcriptStatus || patch.transcript_status,
            transcript_text:
              patch.transcriptText !== undefined
                ? patch.transcriptText
                : patch.transcript_text,
            transcript_language:
              patch.transcriptLanguage !== undefined
                ? patch.transcriptLanguage
                : patch.transcript_language,
            transcript_confidence:
              patch.transcriptConfidence != null
                ? patch.transcriptConfidence
                : patch.transcript_confidence,
            transcript_error:
              patch.transcriptError !== undefined
                ? patch.transcriptError
                : patch.transcript_error !== undefined
                  ? patch.transcript_error
                  : undefined,
            transcript_attempts:
              patch.transcriptAttempts != null
                ? patch.transcriptAttempts
                : patch.transcript_attempts,
            transcript_provider:
              patch.transcriptProvider !== undefined
                ? patch.transcriptProvider
                : patch.transcript_provider,
            transcript_model:
              patch.transcriptModel !== undefined
                ? patch.transcriptModel
                : patch.transcript_model,
            transcript_billed_ms:
              patch.transcriptBilledMs != null
                ? patch.transcriptBilledMs
                : patch.transcript_billed_ms,
            transcript_turn_id:
              patch.transcriptTurnId !== undefined
                ? patch.transcriptTurnId
                : patch.transcript_turn_id
          }).filter(([, value]) => value !== undefined)
        ),
        updated_at: nowIso(patch.now)
      };
      const index = rows.findIndex((entry) => entry.id === row.id);
      rows[index] = mapped;
      return mapped;
    }
  };
}

function createSupabaseCommunicationMediaRepository() {
  return {
    backend: "supabase",
    async insertIfNew(input) {
      const next = toRow(input);
      if (!next.organization_id || !next.provider_message_id) {
        const error = new Error("organization_id and provider_message_id are required");
        error.publicCode = "MEDIA_IDENTITY_REQUIRED";
        throw error;
      }

      const { data, error } = await getSupabase()
        .from("communication_media")
        .upsert(next, {
          onConflict: "organization_id,provider_message_id,media_kind",
          ignoreDuplicates: true
        })
        .select()
        .maybeSingle();

      if (error) {
        if (isMissingTableError(error)) {
          const missing = new Error("communication_media table is not available");
          missing.publicCode = "MEDIA_TABLE_MISSING";
          missing.cause = error;
          throw missing;
        }
        throw error;
      }

      if (data) {
        return { row: data, inserted: true };
      }

      const existing = await this.findByProvider({
        organizationId: next.organization_id,
        providerMessageId: next.provider_message_id,
        mediaKind: next.media_kind
      });
      return { row: existing, inserted: false };
    },
    async findById(id, organizationId) {
      const { data, error } = await getSupabase()
        .from("communication_media")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) {
        if (isMissingTableError(error)) {
          return null;
        }
        throw error;
      }
      return data || null;
    },
    async findByProvider({ organizationId, providerMessageId, mediaKind = "audio" }) {
      const { data, error } = await getSupabase()
        .from("communication_media")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("provider_message_id", providerMessageId)
        .eq("media_kind", mediaKind)
        .maybeSingle();

      if (error) {
        if (isMissingTableError(error)) {
          return null;
        }
        throw error;
      }
      return data || null;
    },
    async listForProspect({ organizationId, prospectId }) {
      if (!organizationId || !prospectId) {
        return [];
      }
      const { data, error } = await getSupabase()
        .from("communication_media")
        .select(
          "id, organization_id, prospect_id, conversation_log_id, provider_message_id, channel, media_kind, mime_type, is_voice_note, duration_ms, fetch_status, transcode_status, playback_mime_type, playback_path, storage_path, transcript_status, transcript_text, created_at"
        )
        .eq("organization_id", organizationId)
        .eq("prospect_id", prospectId);

      if (error) {
        if (isMissingTableError(error)) {
          return [];
        }
        throw error;
      }
      return data || [];
    },
    async listPending({ limit = 20, now = Date.now(), staleMs = 5 * 60 * 1000 } = {}) {
      const { data, error } = await getSupabase()
        .from("communication_media")
        .select("*")
        .in("fetch_status", [
          FETCH_STATUS.PENDING,
          FETCH_STATUS.FETCHING,
          FETCH_STATUS.STORED,
          FETCH_STATUS.FAILED
        ])
        .order("updated_at", { ascending: true })
        .limit(Math.max(limit * 4, 40));

      if (error) {
        if (isMissingTableError(error)) {
          return [];
        }
        throw error;
      }

      return (data || [])
        .filter((row) => rowNeedsPollerWork(row, now, staleMs))
        .slice(0, limit);
    },
    async update(id, organizationId, patch = {}) {
      const updates = {
        updated_at: nowIso(patch.now)
      };
      if (patch.fetchStatus || patch.fetch_status) {
        updates.fetch_status = patch.fetchStatus || patch.fetch_status;
      }
      if (patch.fetchAttempts != null || patch.fetch_attempts != null) {
        updates.fetch_attempts =
          patch.fetchAttempts != null ? patch.fetchAttempts : patch.fetch_attempts;
      }
      if (patch.fetchError !== undefined || patch.fetch_error !== undefined) {
        updates.fetch_error =
          patch.fetchError !== undefined ? patch.fetchError : patch.fetch_error;
      }
      if (patch.storagePath || patch.storage_path) {
        updates.storage_path = patch.storagePath || patch.storage_path;
      }
      if (patch.playbackPath || patch.playback_path) {
        updates.playback_path = patch.playbackPath || patch.playback_path;
      }
      if (patch.playbackMimeType || patch.playback_mime_type) {
        updates.playback_mime_type = patch.playbackMimeType || patch.playback_mime_type;
      }
      if (patch.transcodeStatus || patch.transcode_status) {
        updates.transcode_status = patch.transcodeStatus || patch.transcode_status;
      }
      if (patch.transcodeAttempts != null || patch.transcode_attempts != null) {
        updates.transcode_attempts =
          patch.transcodeAttempts != null ? patch.transcodeAttempts : patch.transcode_attempts;
      }
      if (patch.transcodeError !== undefined || patch.transcode_error !== undefined) {
        updates.transcode_error =
          patch.transcodeError !== undefined ? patch.transcodeError : patch.transcode_error;
      }
      if (patch.mimeType || patch.mime_type) {
        updates.mime_type = patch.mimeType || patch.mime_type;
      }
      if (patch.fileSize != null || patch.file_size != null) {
        updates.file_size = patch.fileSize != null ? patch.fileSize : patch.file_size;
      }
      if (patch.durationMs != null || patch.duration_ms != null) {
        updates.duration_ms =
          patch.durationMs != null ? patch.durationMs : patch.duration_ms;
      }
      if (patch.sha256) {
        updates.sha256 = patch.sha256;
      }
      if (patch.transcriptStatus || patch.transcript_status) {
        updates.transcript_status = patch.transcriptStatus || patch.transcript_status;
      }
      if (patch.transcriptText !== undefined || patch.transcript_text !== undefined) {
        updates.transcript_text =
          patch.transcriptText !== undefined ? patch.transcriptText : patch.transcript_text;
      }
      if (patch.transcriptLanguage !== undefined || patch.transcript_language !== undefined) {
        updates.transcript_language =
          patch.transcriptLanguage !== undefined
            ? patch.transcriptLanguage
            : patch.transcript_language;
      }
      if (patch.transcriptConfidence != null || patch.transcript_confidence != null) {
        updates.transcript_confidence =
          patch.transcriptConfidence != null
            ? patch.transcriptConfidence
            : patch.transcript_confidence;
      }
      if (patch.transcriptError !== undefined || patch.transcript_error !== undefined) {
        updates.transcript_error =
          patch.transcriptError !== undefined ? patch.transcriptError : patch.transcript_error;
      }
      if (patch.transcriptAttempts != null || patch.transcript_attempts != null) {
        updates.transcript_attempts =
          patch.transcriptAttempts != null ? patch.transcriptAttempts : patch.transcript_attempts;
      }
      if (patch.transcriptProvider !== undefined || patch.transcript_provider !== undefined) {
        updates.transcript_provider =
          patch.transcriptProvider !== undefined
            ? patch.transcriptProvider
            : patch.transcript_provider;
      }
      if (patch.transcriptModel !== undefined || patch.transcript_model !== undefined) {
        updates.transcript_model =
          patch.transcriptModel !== undefined ? patch.transcriptModel : patch.transcript_model;
      }
      if (patch.transcriptBilledMs != null || patch.transcript_billed_ms != null) {
        updates.transcript_billed_ms =
          patch.transcriptBilledMs != null ? patch.transcriptBilledMs : patch.transcript_billed_ms;
      }
      if (patch.transcriptTurnId !== undefined || patch.transcript_turn_id !== undefined) {
        updates.transcript_turn_id =
          patch.transcriptTurnId !== undefined
            ? patch.transcriptTurnId
            : patch.transcript_turn_id;
      }

      const { data, error } = await getSupabase()
        .from("communication_media")
        .update(updates)
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select()
        .maybeSingle();

      if (error) {
        if (isMissingTableError(error)) {
          return null;
        }
        throw error;
      }
      return data || null;
    }
  };
}

function getCommunicationMediaRepository(options = {}) {
  if (options.repository) {
    return options.repository;
  }
  if (
    options.backend === "memory" ||
    process.env.ATLAS_COMMUNICATION_MEDIA_BACKEND === "memory"
  ) {
    return createMemoryCommunicationMediaRepository(options.seed || []);
  }
  return createSupabaseCommunicationMediaRepository();
}

module.exports = {
  toRow,
  toPublicMedia,
  attachPublicMediaToConversationMessages,
  rowNeedsPollerWork,
  createMemoryCommunicationMediaRepository,
  createSupabaseCommunicationMediaRepository,
  getCommunicationMediaRepository
};
