/**
 * BR-141 — OpenAI STT adapter surface.
 * Dedicated transcriptions API. Not chat/completions.
 */

"use strict";

const {
  transcribeWithGptTranscribe,
  STT_PROVIDER,
  STT_MODEL
} = require("./openaiGptTranscribeAdapter");
const { resolveSttLanguageHints } = require("./languageHints");

module.exports = {
  transcribeWithGptTranscribe,
  resolveSttLanguageHints,
  STT_PROVIDER,
  STT_MODEL
};
