/**
 * BR-141 — customer-facing voice-note copy. No provider internals.
 */

"use strict";

function isEnglish(language) {
  const raw = String(language || "").toLowerCase();
  return raw === "english" || raw === "en";
}

function getVoiceNoteSoftAck(language) {
  return isEnglish(language)
    ? "I received your voice message. Give me a moment."
    : "Recibí tu mensaje de voz. Dame un momento.";
}

function getVoiceNoteTypeFallback(language) {
  return isEnglish(language)
    ? "I couldn't understand the voice message. Could you type it or send a shorter one?"
    : "No pude entender el mensaje de voz. ¿Me lo escribes o envías uno más corto?";
}

function getVoiceNoteTooLongFallback(language) {
  return isEnglish(language)
    ? "That voice message is a bit long. Could you send a shorter one or type it?"
    : "Ese mensaje de voz es un poco largo. ¿Me envías uno más corto o me lo escribes?";
}

module.exports = {
  getVoiceNoteSoftAck,
  getVoiceNoteTypeFallback,
  getVoiceNoteTooLongFallback
};
