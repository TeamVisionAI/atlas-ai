/**
 * Recruit AI v2 — conversation-quality acknowledgement stacking guard (BR-102).
 * Suppress consecutive equivalent affirmations; keep one natural acknowledgement.
 * Must not split or mutate URLs (e.g. https://zoom.us/j/…).
 */

function normalizeAscii(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡¿]/g, "")
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Standalone acknowledgement sentences (no other communicative content). */
const ACK_ONLY_RE = Object.freeze([
  /^(perfecto|excelente|gracias|genial|estupendo|maravilloso)( (perfecto|excelente|gracias|genial|estupendo|maravilloso))*$/,
  /^(perfect|excellent|great|wonderful|awesome|thanks)( (perfect|excellent|great|wonderful|awesome|thanks))*$/,
  /^thank you( (perfect|excellent|great|wonderful|awesome|thanks|thank you))*$/,
  /^perfect thank you$/,
  /^perfecto gracias$/
]);

const ACK_TOKEN_PRIORITY_ES = Object.freeze([
  "perfecto",
  "gracias",
  "excelente",
  "genial"
]);
const ACK_TOKEN_PRIORITY_EN = Object.freeze([
  "perfect",
  "thank you",
  "thanks",
  "great",
  "excellent"
]);

function isAcknowledgementOnlySentence(sentence) {
  const t = normalizeAscii(sentence);
  if (!t) {
    return false;
  }
  return ACK_ONLY_RE.some((re) => re.test(t));
}

function simplifyAcknowledgementSentence(sentence) {
  const t = normalizeAscii(sentence);
  const isSpanish = /\b(perfecto|excelente|gracias|genial)\b/.test(t);
  const priority = isSpanish ? ACK_TOKEN_PRIORITY_ES : ACK_TOKEN_PRIORITY_EN;
  for (const token of priority) {
    if (token === "thank you") {
      if (/\bthank you\b/.test(t)) {
        return "Thank you.";
      }
      continue;
    }
    if (new RegExp(`\\b${token}\\b`).test(t)) {
      const pretty = token.charAt(0).toUpperCase() + token.slice(1);
      return `${pretty}.`;
    }
  }
  const trimmed = String(sentence || "").trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Protect URLs so sentence splitting does not break on dots inside hosts/paths.
 */
function protectUrls(text) {
  const urls = [];
  const protectedText = String(text || "").replace(
    /https?:\/\/[^\s<>"']+/gi,
    (url) => {
      const token = `__URL_${urls.length}__`;
      urls.push(url);
      return token;
    }
  );
  return { protectedText, urls };
}

function restoreUrls(text, urls) {
  return String(text || "").replace(/__URL_(\d+)__/g, (_, idx) => {
    return urls[Number(idx)] || "";
  });
}

function splitSentences(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return [];
  }
  const parts = [];
  // Split only on sentence punctuation followed by whitespace (or end).
  // Avoid consuming host dots inside protected URL tokens.
  const re = /[^.!?]+(?:[.!?]+(?=\s|$)|$)/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    const piece = match[0].trim();
    if (piece) {
      parts.push(piece);
    }
  }
  return parts.length ? parts : [raw];
}

/**
 * Collapse stacked equivalent acknowledgements.
 * Keeps informational sentences; retains at most one leading ack-only sentence.
 */
function collapseRedundantAcknowledgements(text) {
  const value = String(text || "").trim();
  if (!value) {
    return value;
  }

  const { protectedText, urls } = protectUrls(value);
  const sentences = splitSentences(protectedText);
  if (sentences.length <= 1) {
    if (sentences.length === 1 && isAcknowledgementOnlySentence(sentences[0])) {
      return restoreUrls(simplifyAcknowledgementSentence(sentences[0]), urls);
    }
    return value;
  }

  const out = [];
  let keptAck = false;
  for (const sentence of sentences) {
    if (isAcknowledgementOnlySentence(sentence)) {
      if (keptAck) {
        continue;
      }
      out.push(simplifyAcknowledgementSentence(sentence));
      keptAck = true;
      continue;
    }
    out.push(sentence.replace(/^\s+/, "").replace(/\s+$/, ""));
  }

  return restoreUrls(out.join(" ").replace(/\s+/g, " ").trim(), urls);
}

module.exports = {
  collapseRedundantAcknowledgements,
  isAcknowledgementOnlySentence,
  simplifyAcknowledgementSentence
};
