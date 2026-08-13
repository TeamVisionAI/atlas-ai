/**
 * Private Supabase storage for inbound communication media (BR-140).
 * Tenant-scoped path. No public URLs. No Meta temporary URLs to browsers.
 */

"use strict";

const {
  COMMUNICATION_MEDIA_BUCKET,
  MAX_COMMUNICATION_MEDIA_BYTES,
  SIGNED_PLAYBACK_EXPIRES_SECONDS,
  ALLOWED_AUDIO_MIME_BASES,
  PLAYBACK_FORMAT
} = require("./constants");

function getSupabase() {
  return require("../../services/supabaseService").supabase;
}

function createHttpError(message, statusCode, publicCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
}

function baseMime(mimeType) {
  return String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function isAllowedAudioMime(mimeType) {
  const base = baseMime(mimeType);
  if (!base.startsWith("audio/")) {
    return false;
  }
  return ALLOWED_AUDIO_MIME_BASES.includes(base);
}

function extensionForMime(mimeType) {
  const base = baseMime(mimeType);
  if (base === "audio/mpeg" || base === "audio/mp3") {
    return "mp3";
  }
  if (base === "audio/mp4" || base === "audio/aac" || base === "audio/x-m4a") {
    return "m4a";
  }
  if (base === "audio/amr") {
    return "amr";
  }
  if (base === "audio/webm") {
    return "webm";
  }
  return "ogg";
}

function sanitizePathSegment(value, fallback = "unknown") {
  const cleaned = String(value || fallback)
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
  return cleaned || fallback;
}

/**
 * organizationId/prospectId/wamid/original.<ext>
 */
function buildOriginalStoragePath({
  organizationId,
  prospectId,
  providerMessageId,
  mimeType
}) {
  const org = sanitizePathSegment(organizationId, "org");
  const prospect = sanitizePathSegment(prospectId, "prospect");
  const wamid = sanitizePathSegment(providerMessageId, "wamid");
  const ext = extensionForMime(mimeType);
  return `${org}/${prospect}/${wamid}/original.${ext}`;
}

/**
 * organizationId/prospectId/wamid/playback.mp3
 */
function buildPlaybackStoragePath({ organizationId, prospectId, providerMessageId }) {
  const org = sanitizePathSegment(organizationId, "org");
  const prospect = sanitizePathSegment(prospectId, "prospect");
  const wamid = sanitizePathSegment(providerMessageId, "wamid");
  return `${org}/${prospect}/${wamid}/playback.${PLAYBACK_FORMAT.extension}`;
}

function assertTenantStoragePath(storagePath, organizationId) {
  const prefix = `${sanitizePathSegment(organizationId, "org")}/`;
  if (!String(storagePath || "").startsWith(prefix)) {
    throw createHttpError("Media storage path is not tenant-scoped.", 403, "MEDIA_FORBIDDEN");
  }
}

async function ensureCommunicationMediaBucket() {
  const { data: bucket, error: getError } = await getSupabase().storage.getBucket(
    COMMUNICATION_MEDIA_BUCKET
  );

  if (bucket && !getError) {
    return;
  }

  const { error: createError } = await getSupabase().storage.createBucket(
    COMMUNICATION_MEDIA_BUCKET,
    {
      public: false,
      fileSizeLimit: MAX_COMMUNICATION_MEDIA_BYTES,
      allowedMimeTypes: [...ALLOWED_AUDIO_MIME_BASES]
    }
  );

  if (createError && !String(createError.message || "").includes("already exists")) {
    throw createHttpError(
      createError.message || "Communication media storage is not configured.",
      500,
      "MEDIA_STORAGE_UNAVAILABLE"
    );
  }
}

async function uploadOriginalMedia({
  organizationId,
  prospectId,
  providerMessageId,
  mimeType,
  buffer
}) {
  if (!organizationId) {
    throw createHttpError("Organization is required to store media.", 400, "MEDIA_ORG_REQUIRED");
  }
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw createHttpError("Media body is required.", 400, "MEDIA_BODY_REQUIRED");
  }
  if (buffer.length > MAX_COMMUNICATION_MEDIA_BYTES) {
    throw createHttpError("Voice message is too large.", 400, "MEDIA_TOO_LARGE");
  }
  if (!isAllowedAudioMime(mimeType)) {
    throw createHttpError("Unsupported audio type.", 400, "MEDIA_TYPE_INVALID");
  }

  await ensureCommunicationMediaBucket();

  const storagePath = buildOriginalStoragePath({
    organizationId,
    prospectId,
    providerMessageId,
    mimeType
  });

  const { error } = await getSupabase()
    .storage.from(COMMUNICATION_MEDIA_BUCKET)
    .upload(storagePath, buffer, {
      contentType: baseMime(mimeType) || "audio/ogg",
      upsert: true,
      cacheControl: "private, max-age=60"
    });

  if (error) {
    throw createHttpError(
      error.message || "Failed to store voice message.",
      500,
      "MEDIA_UPLOAD_FAILED"
    );
  }

  return {
    storagePath,
    bucket: COMMUNICATION_MEDIA_BUCKET
  };
}

async function uploadPlaybackMedia({
  organizationId,
  prospectId,
  providerMessageId,
  buffer
}) {
  if (!organizationId) {
    throw createHttpError("Organization is required to store media.", 400, "MEDIA_ORG_REQUIRED");
  }
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw createHttpError("Media body is required.", 400, "MEDIA_BODY_REQUIRED");
  }
  if (buffer.length > MAX_COMMUNICATION_MEDIA_BYTES) {
    throw createHttpError("Voice message is too large.", 400, "MEDIA_TOO_LARGE");
  }

  await ensureCommunicationMediaBucket();

  const storagePath = buildPlaybackStoragePath({
    organizationId,
    prospectId,
    providerMessageId
  });

  const { error } = await getSupabase()
    .storage.from(COMMUNICATION_MEDIA_BUCKET)
    .upload(storagePath, buffer, {
      contentType: PLAYBACK_FORMAT.mimeType,
      upsert: true,
      cacheControl: "private, max-age=60"
    });

  if (error) {
    throw createHttpError(
      error.message || "Failed to store playback audio.",
      500,
      "MEDIA_UPLOAD_FAILED"
    );
  }

  return {
    storagePath,
    mimeType: PLAYBACK_FORMAT.mimeType,
    bucket: COMMUNICATION_MEDIA_BUCKET
  };
}

async function downloadStoredMedia(storagePath) {
  if (!storagePath) {
    throw createHttpError("Media storage path is missing.", 404, "MEDIA_NOT_FOUND");
  }

  const { data, error } = await getSupabase()
    .storage.from(COMMUNICATION_MEDIA_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw createHttpError(
      error?.message || "Failed to read stored media.",
      500,
      "MEDIA_DOWNLOAD_FAILED"
    );
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (!buffer.length) {
    throw createHttpError("Stored media is empty.", 500, "MEDIA_DOWNLOAD_FAILED");
  }
  return buffer;
}

async function createSignedPlaybackUrl(
  storagePath,
  expiresIn = SIGNED_PLAYBACK_EXPIRES_SECONDS
) {
  if (!storagePath) {
    throw createHttpError("Media storage path is missing.", 404, "MEDIA_NOT_FOUND");
  }

  const { data, error } = await getSupabase()
    .storage.from(COMMUNICATION_MEDIA_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw createHttpError(
      error?.message || "Failed to create playback URL.",
      500,
      "MEDIA_URL_FAILED"
    );
  }

  return {
    url: data.signedUrl,
    expiresIn
  };
}

module.exports = {
  COMMUNICATION_MEDIA_BUCKET,
  MAX_COMMUNICATION_MEDIA_BYTES,
  SIGNED_PLAYBACK_EXPIRES_SECONDS,
  baseMime,
  isAllowedAudioMime,
  extensionForMime,
  buildOriginalStoragePath,
  buildPlaybackStoragePath,
  assertTenantStoragePath,
  ensureCommunicationMediaBucket,
  uploadOriginalMedia,
  uploadPlaybackMedia,
  downloadStoredMedia,
  createSignedPlaybackUrl
};
