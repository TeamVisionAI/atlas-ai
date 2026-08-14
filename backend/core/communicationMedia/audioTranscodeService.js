/**
 * Server-side audio transcode for Safari-safe playback (BR-140 Phase 1B).
 * Always preserves the original. Derivative is MP3.
 * Uses ffmpeg-static + execFile argument arrays — never shell interpolation.
 * No STT.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const { execFile } = require("child_process");
const {
  MAX_COMMUNICATION_MEDIA_BYTES,
  PLAYBACK_FORMAT,
  BROWSER_NATIVE_AUDIO_MIMES,
  TRANSCODE_TIMEOUT_MS,
  MAX_TRANSCODE_DURATION_SECONDS
} = require("./constants");
const { baseMime } = require("./communicationMediaStorage");

const TEMP_ROOT_PREFIX = "atlas-audio-transcode-";

function resolveFfmpegPath(overridePath = null) {
  if (overridePath) {
    return overridePath;
  }
  if (process.env.ATLAS_FFMPEG_PATH) {
    return process.env.ATLAS_FFMPEG_PATH;
  }
  try {
    return require("ffmpeg-static");
  } catch {
    return null;
  }
}

function isBrowserNativeAudioMime(mimeType) {
  return BROWSER_NATIVE_AUDIO_MIMES.includes(baseMime(mimeType));
}

function tempInputExtension(mimeType) {
  const base = baseMime(mimeType);
  if (base === "audio/webm") {
    return ".webm";
  }
  if (base === "audio/amr") {
    return ".amr";
  }
  if (base === "audio/mpeg" || base === "audio/mp3") {
    return ".mp3";
  }
  if (base === "audio/mp4" || base === "audio/aac" || base === "audio/x-m4a") {
    return ".m4a";
  }
  return ".ogg";
}

function assertSafeTempDir(dirPath) {
  const tmpRoot = os.tmpdir();
  const resolved = path.resolve(dirPath);
  if (!resolved.startsWith(path.resolve(tmpRoot) + path.sep)) {
    const error = new Error("TRANSCODE_TEMP_INVALID");
    error.publicCode = "TRANSCODE_TEMP_INVALID";
    throw error;
  }
  if (!path.basename(resolved).startsWith(TEMP_ROOT_PREFIX)) {
    const error = new Error("TRANSCODE_TEMP_INVALID");
    error.publicCode = "TRANSCODE_TEMP_INVALID";
    throw error;
  }
}

function cleanupTempDir(dirPath) {
  if (!dirPath) {
    return;
  }
  try {
    assertSafeTempDir(dirPath);
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; never throw from finally.
  }
}

function runFfmpeg(ffmpegPath, args, timeoutMs = TRANSCODE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          const timedOut =
            error.killed === true ||
            error.signal === "SIGTERM" ||
            /ETIMEDOUT|timed out/i.test(String(error.message || ""));
          const wrapped = new Error(timedOut ? "TRANSCODE_TIMEOUT" : "TRANSCODE_FAILED");
          wrapped.publicCode = timedOut ? "TRANSCODE_TIMEOUT" : "TRANSCODE_FAILED";
          wrapped.cause = error;
          wrapped.stderrPreview = String(stderr || "").slice(0, 200);
          reject(wrapped);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

/**
 * Transcode original audio bytes to MP3. Never interpolates untrusted names.
 * @returns {Promise<{ buffer: Buffer, mimeType: string, extension: string, tempDir: string|null, cleaned: boolean }>}
 */
async function transcodeBufferToMp3(inputBuffer, options = {}) {
  if (!inputBuffer || !Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    const error = new Error("TRANSCODE_INPUT_EMPTY");
    error.publicCode = "TRANSCODE_INPUT_EMPTY";
    throw error;
  }
  if (inputBuffer.length > MAX_COMMUNICATION_MEDIA_BYTES) {
    const error = new Error("MEDIA_TOO_LARGE");
    error.publicCode = "MEDIA_TOO_LARGE";
    throw error;
  }

  const ffmpegPath = resolveFfmpegPath(options.ffmpegPath);
  if (!ffmpegPath) {
    const error = new Error("FFMPEG_UNAVAILABLE");
    error.publicCode = "FFMPEG_UNAVAILABLE";
    throw error;
  }

  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : TRANSCODE_TIMEOUT_MS;
  const maxDuration =
    Number(options.maxDurationSeconds) > 0
      ? Number(options.maxDurationSeconds)
      : MAX_TRANSCODE_DURATION_SECONDS;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_ROOT_PREFIX));
  assertSafeTempDir(tempDir);
  const inputPath = path.join(tempDir, `input${tempInputExtension(options.mimeType)}`);
  const outputPath = path.join(tempDir, `playback.${PLAYBACK_FORMAT.extension}`);

  try {
    fs.writeFileSync(inputPath, inputBuffer);

    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      String(PLAYBACK_FORMAT.channels),
      "-ar",
      String(PLAYBACK_FORMAT.sampleRate),
      "-c:a",
      PLAYBACK_FORMAT.codec,
      "-b:a",
      PLAYBACK_FORMAT.bitrate,
      "-t",
      String(maxDuration),
      outputPath
    ];

    if (typeof options.execFileFn === "function") {
      await options.execFileFn(ffmpegPath, args, { timeout: timeoutMs });
    } else {
      await runFfmpeg(ffmpegPath, args, timeoutMs);
    }

    if (!fs.existsSync(outputPath)) {
      const error = new Error("TRANSCODE_OUTPUT_MISSING");
      error.publicCode = "TRANSCODE_OUTPUT_MISSING";
      throw error;
    }

    const output = fs.readFileSync(outputPath);
    if (!output.length) {
      const error = new Error("TRANSCODE_OUTPUT_EMPTY");
      error.publicCode = "TRANSCODE_OUTPUT_EMPTY";
      throw error;
    }
    if (output.length > MAX_COMMUNICATION_MEDIA_BYTES) {
      const error = new Error("MEDIA_TOO_LARGE");
      error.publicCode = "MEDIA_TOO_LARGE";
      throw error;
    }

    cleanupTempDir(tempDir);
    return {
      buffer: output,
      mimeType: PLAYBACK_FORMAT.mimeType,
      extension: PLAYBACK_FORMAT.extension,
      cleaned: true
    };
  } catch (error) {
    cleanupTempDir(tempDir);
    if (error.publicCode) {
      throw error;
    }
    const wrapped = new Error("TRANSCODE_FAILED");
    wrapped.publicCode = "TRANSCODE_FAILED";
    wrapped.cause = error;
    throw wrapped;
  }
}

async function createSyntheticOpusOggFixture({ durationSeconds = 1, ffmpegPath = null } = {}) {
  const bin = resolveFfmpegPath(ffmpegPath);
  if (!bin) {
    const error = new Error("FFMPEG_UNAVAILABLE");
    error.publicCode = "FFMPEG_UNAVAILABLE";
    throw error;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_ROOT_PREFIX));
  assertSafeTempDir(tempDir);
  const outputPath = path.join(tempDir, "fixture.ogg");
  try {
    await runFfmpeg(bin, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${Number(durationSeconds) || 1}`,
      "-c:a",
      "libopus",
      "-f",
      "ogg",
      outputPath
    ]);
    const buffer = fs.readFileSync(outputPath);
    cleanupTempDir(tempDir);
    return buffer;
  } catch (error) {
    cleanupTempDir(tempDir);
    throw error;
  }
}

module.exports = {
  TEMP_ROOT_PREFIX,
  resolveFfmpegPath,
  isBrowserNativeAudioMime,
  tempInputExtension,
  cleanupTempDir,
  transcodeBufferToMp3,
  createSyntheticOpusOggFixture
};
