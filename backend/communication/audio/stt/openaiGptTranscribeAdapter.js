/**
 * BR-141 — OpenAI gpt-transcribe adapter.
 * POST /v1/audio/transcriptions only. Do not reuse chat/completions.
 * Input: private MP3 bytes. Never log transcript body.
 */

"use strict";

const STT_PROVIDER = "openai";
const STT_MODEL = "gpt-transcribe";
const TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TIMEOUT_MS = 60_000;

function publicSttError(code, fallback = "STT_FAILED") {
  const error = new Error(code || fallback);
  error.publicCode = String(code || fallback).slice(0, 80);
  return error;
}

function toBilledMs(payload) {
  const duration = Number(payload?.duration);
  if (Number.isFinite(duration) && duration > 0) {
    return Math.round(duration * 1000);
  }
  return null;
}

function toConfidence(payload) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const probs = segments
    .map((segment) => Number(segment?.avg_logprob))
    .filter((value) => Number.isFinite(value));
  if (!probs.length) {
    return null;
  }
  const mean = probs.reduce((sum, value) => sum + value, 0) / probs.length;
  // avg_logprob is typically negative; map roughly into 0..1 without claiming calibration.
  const confidence = Math.max(0, Math.min(1, 1 + mean / 5));
  return Number(confidence.toFixed(3));
}

function normalizeLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === "spanish" || raw === "es" || raw.startsWith("es-")) {
    return "es";
  }
  if (raw === "english" || raw === "en" || raw.startsWith("en-")) {
    return "en";
  }
  return raw.slice(0, 16);
}

function buildForm({ buffer, hints, responseFormat }) {
  const form = new FormData();
  const blob = new Blob([buffer], { type: "audio/mpeg" });
  form.append("file", blob, "audio.mp3");
  form.append("model", STT_MODEL);
  form.append("response_format", responseFormat);
  if (hints?.language) {
    form.append("language", hints.language);
  }
  if (hints?.prompt) {
    form.append("prompt", hints.prompt);
  }
  return form;
}

async function transcribeWithGptTranscribe({
  buffer,
  hints = null,
  apiKey = process.env.OPENAI_API_KEY,
  fetchFn = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw publicSttError("STT_INPUT_EMPTY");
  }
  if (!apiKey) {
    throw publicSttError("STT_CREDENTIALS_MISSING");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response = await fetchFn(TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: buildForm({ buffer, hints, responseFormat: "verbose_json" }),
      signal: controller.signal
    });

    if (response.status === 400) {
      response = await fetchFn(TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: buildForm({ buffer, hints, responseFormat: "json" }),
        signal: controller.signal
      });
    }

    if (!response.ok) {
      const status = Number(response.status) || 0;
      if (status === 429 || status >= 500) {
        throw publicSttError("STT_PROVIDER_UNAVAILABLE");
      }
      throw publicSttError("STT_PROVIDER_REJECTED");
    }

    const payload = await response.json().catch(() => ({}));
    const text = String(payload?.text || "").trim();

    return {
      text,
      language: normalizeLanguage(payload?.language),
      confidence: toConfidence(payload),
      billedMs: toBilledMs(payload),
      provider: STT_PROVIDER,
      model: STT_MODEL
    };
  } catch (error) {
    if (error?.publicCode) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw publicSttError("STT_TIMEOUT");
    }
    throw publicSttError("STT_PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  STT_PROVIDER,
  STT_MODEL,
  TRANSCRIPTIONS_URL,
  transcribeWithGptTranscribe
};
