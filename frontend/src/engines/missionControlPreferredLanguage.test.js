import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPreferredLanguageDisplay,
  resolvePreferredLanguageDisplay
} from "../types/language.js";

test("Mission Control display uses preferred_language when brain.language is en", () => {
  const prospectLanguage = resolvePreferredLanguageDisplay({
    preferred_language: "spanish",
    preferred_language_label: "Spanish"
  });

  assert.equal(prospectLanguage, "Spanish");
});

test("formatPreferredLanguageDisplay maps canonical storage values", () => {
  assert.equal(formatPreferredLanguageDisplay("spanish"), "Spanish");
  assert.equal(formatPreferredLanguageDisplay("english"), "English");
  assert.equal(formatPreferredLanguageDisplay("es"), "Spanish");
  assert.equal(formatPreferredLanguageDisplay("en"), "English");
});

test("resolvePreferredLanguageDisplay prefers backend label when present", () => {
  assert.equal(
    resolvePreferredLanguageDisplay({
      preferred_language: "english",
      preferred_language_label: "Spanish"
    }),
    "Spanish"
  );
});
