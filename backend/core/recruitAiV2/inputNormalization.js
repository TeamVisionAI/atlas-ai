/**
 * Recruit AI v2 — deterministic inbound text normalization (BR-095).
 *
 * Interpretation-only: never mutates the prospect's original message / transcript.
 * Produces comparison forms for case-, accent-, punctuation-, and whitespace-tolerant matching.
 *
 * Does NOT:
 * - globally rewrite "si" → affirmative outside existing contextual detectors
 * - autocorrect arbitrary words
 * - apply fuzzy / edit-distance matching
 */

function foldAccents(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Soft punctuation / whitespace cleanup before case + accent folding.
 * Preserves time colons (e.g. 6:30).
 */
function softenSeparators(value) {
  let s = String(value || "");
  s = s.replace(/[\t\n\r\u00a0]+/g, " ");
  s = s.replace(/[¿¡]/g, "");
  s = s.replace(/[!?]+/g, " ");
  // City/state and list separators → spaces ("Miami,FL", "Miami - FL")
  s = s.replace(/,/g, " ");
  s = s.replace(/([A-Za-zÀ-ÿ])\s*[-–—/|]\s*([A-Za-zÀ-ÿ])/gi, "$1 $2");
  // Decorative end-of-token periods (keep decimals/times untouched via (?=\s|$))
  s = s.replace(/\.(?=\s|$)/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Normalize inbound WhatsApp text for deterministic intent / location matching.
 *
 * @param {unknown} rawInput
 * @returns {{
 *   rawText: string,
 *   trimmedText: string,
 *   normalizedText: string,
 *   accentFoldedText: string,
 *   comparisonText: string,
 *   tokens: string[]
 * }}
 */
function normalizeInboundText(rawInput) {
  const rawText = rawInput == null ? "" : String(rawInput);
  const trimmedText = rawText.trim();
  const softened = softenSeparators(trimmedText);
  const normalizedText = softened.toLowerCase();
  const accentFoldedText = foldAccents(normalizedText).replace(/\s+/g, " ").trim();
  const comparisonText = accentFoldedText;
  const tokens = comparisonText ? comparisonText.split(/\s+/).filter(Boolean) : [];

  return {
    rawText,
    trimmedText,
    normalizedText,
    accentFoldedText,
    comparisonText,
    tokens
  };
}

/**
 * Accent-folded comparison string (shared by opt-out / withdraw / FAQ detectors).
 * Equivalent to normalizeInboundText(text).comparisonText.
 */
function normalizeIntentText(text) {
  return normalizeInboundText(text).comparisonText;
}

/**
 * Location search form — same comparison text (parsers title-case cities).
 */
function prepareLocationSearchText(text) {
  return normalizeInboundText(text).comparisonText;
}

module.exports = {
  foldAccents,
  softenSeparators,
  normalizeInboundText,
  normalizeIntentText,
  prepareLocationSearchText
};
