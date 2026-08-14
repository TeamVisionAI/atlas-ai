/**
 * Signed playback for org-scoped communication media (BR-140 Phase 1D + 1B).
 * Prefers Safari-safe MP3 derivative. Authenticated Atlas user + org + prospect.
 * Never returns Meta tokens or public bucket URLs.
 */

"use strict";

const {
  FETCH_STATUS,
  TRANSCODE_STATUS,
  SIGNED_PLAYBACK_EXPIRES_SECONDS
} = require("./constants");
const {
  assertTenantStoragePath,
  createSignedPlaybackUrl
} = require("./communicationMediaStorage");
const { isBrowserNativeAudioMime } = require("./audioTranscodeService");
const { getCommunicationMediaRepository } = require("./communicationMediaRepository");

function httpError(message, statusCode, publicCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
}

async function signTenantPath(signUrl, storagePath, organizationId) {
  assertTenantStoragePath(storagePath, organizationId);
  return signUrl(storagePath, SIGNED_PLAYBACK_EXPIRES_SECONDS);
}

async function createCommunicationMediaPlayback({
  organizationId,
  prospectId,
  mediaId,
  authorizedProspect,
  repository = null,
  signUrl = createSignedPlaybackUrl
} = {}) {
  if (!organizationId) {
    throw httpError("Organization is required.", 403, "MEDIA_FORBIDDEN");
  }
  if (!prospectId || !mediaId) {
    throw httpError("Media not found.", 404, "MEDIA_NOT_FOUND");
  }

  const prospectOrg =
    authorizedProspect?.organization_id || authorizedProspect?.organizationId || null;
  const authorizedId = authorizedProspect?.id || null;

  if (!authorizedId || String(authorizedId) !== String(prospectId)) {
    throw httpError("You do not have access to this prospect.", 403, "MEDIA_FORBIDDEN");
  }
  if (prospectOrg && String(prospectOrg) !== String(organizationId)) {
    throw httpError("You do not have access to this media.", 403, "MEDIA_FORBIDDEN");
  }

  const repo = repository || getCommunicationMediaRepository();
  const row = await repo.findById(mediaId, organizationId);
  if (!row || String(row.prospect_id || "") !== String(prospectId)) {
    throw httpError("Media not found.", 404, "MEDIA_NOT_FOUND");
  }
  if (String(row.organization_id) !== String(organizationId)) {
    throw httpError("You do not have access to this media.", 403, "MEDIA_FORBIDDEN");
  }
  if (row.fetch_status !== FETCH_STATUS.STORED || !row.storage_path) {
    throw httpError("Voice message unavailable.", 409, "MEDIA_NOT_READY");
  }

  const transcodeStatus = String(row.transcode_status || TRANSCODE_STATUS.PENDING);

  if (
    row.playback_path &&
    (transcodeStatus === TRANSCODE_STATUS.READY ||
      transcodeStatus === TRANSCODE_STATUS.NOT_REQUIRED)
  ) {
    const signed = await signTenantPath(signUrl, row.playback_path, organizationId);
    return {
      url: signed.url,
      expiresIn: signed.expiresIn || SIGNED_PLAYBACK_EXPIRES_SECONDS,
      mimeType: row.playback_mime_type || row.mime_type || null,
      durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
      mediaKind: row.media_kind || "audio",
      isVoiceNote: row.is_voice_note !== false,
      transcodeStatus
    };
  }

  if (
    transcodeStatus === TRANSCODE_STATUS.NOT_REQUIRED ||
    isBrowserNativeAudioMime(row.mime_type)
  ) {
    const signed = await signTenantPath(signUrl, row.storage_path, organizationId);
    return {
      url: signed.url,
      expiresIn: signed.expiresIn || SIGNED_PLAYBACK_EXPIRES_SECONDS,
      mimeType: row.mime_type || null,
      durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
      mediaKind: row.media_kind || "audio",
      isVoiceNote: row.is_voice_note !== false,
      transcodeStatus: TRANSCODE_STATUS.NOT_REQUIRED
    };
  }

  if (
    transcodeStatus === TRANSCODE_STATUS.PENDING ||
    transcodeStatus === TRANSCODE_STATUS.PROCESSING
  ) {
    throw httpError("Preparing audio.", 409, "MEDIA_PREPARING");
  }

  throw httpError(
    "Voice message unavailable in this browser.",
    409,
    "MEDIA_UNSUPPORTED_BROWSER"
  );
}

module.exports = {
  createCommunicationMediaPlayback
};
