/**
 * Communication media constants (BR-140). WhatsApp audio Phase 1.
 * No STT. Private storage only.
 */

"use strict";

const COMMUNICATION_MEDIA_BUCKET = "communication-media";
const MAX_COMMUNICATION_MEDIA_BYTES = 16 * 1024 * 1024;
const SIGNED_PLAYBACK_EXPIRES_SECONDS = 120;
const MAX_FETCH_ATTEMPTS = 5;
const FETCH_POLL_INTERVAL_MS = 15_000;
const FETCH_LOCK_STALE_MS = 5 * 60 * 1000;

const FETCH_STATUS = Object.freeze({
  PENDING: "pending",
  FETCHING: "fetching",
  STORED: "stored",
  FAILED: "failed"
});

const TRANSCODE_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  READY: "ready",
  FAILED: "failed",
  NOT_REQUIRED: "not_required"
});

const PLAYBACK_FORMAT = Object.freeze({
  extension: "mp3",
  mimeType: "audio/mpeg",
  codec: "libmp3lame",
  bitrate: "64k",
  sampleRate: 22050,
  channels: 1
});

const BROWSER_NATIVE_AUDIO_MIMES = Object.freeze([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a"
]);

const MAX_TRANSCODE_ATTEMPTS = 3;
const TRANSCODE_TIMEOUT_MS = 30_000;
const MAX_TRANSCODE_DURATION_SECONDS = 15 * 60;

const MEDIA_KINDS = Object.freeze({
  AUDIO: "audio",
  IMAGE: "image",
  VIDEO: "video",
  DOCUMENT: "document",
  STICKER: "sticker"
});

const ALLOWED_AUDIO_MIME_BASES = Object.freeze([
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/webm",
  "audio/x-m4a"
]);

module.exports = {
  COMMUNICATION_MEDIA_BUCKET,
  MAX_COMMUNICATION_MEDIA_BYTES,
  SIGNED_PLAYBACK_EXPIRES_SECONDS,
  MAX_FETCH_ATTEMPTS,
  FETCH_POLL_INTERVAL_MS,
  FETCH_LOCK_STALE_MS,
  FETCH_STATUS,
  TRANSCODE_STATUS,
  PLAYBACK_FORMAT,
  BROWSER_NATIVE_AUDIO_MIMES,
  MAX_TRANSCODE_ATTEMPTS,
  TRANSCODE_TIMEOUT_MS,
  MAX_TRANSCODE_DURATION_SECONDS,
  MEDIA_KINDS,
  ALLOWED_AUDIO_MIME_BASES
};
