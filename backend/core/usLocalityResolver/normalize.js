/**
 * BR-233 — Text folding, state tokens, ZIP strip. No network. No tenant lists.
 */

"use strict";

const {
  US_STATE_NAME_TO_ABBR,
  US_POSTAL_ABBREVIATIONS,
  EXCLUDED_TERRITORY_TOKENS,
  FALSE_POSITIVE_STATE_TOKENS,
  PLACE_NAME_SUFFIXES
} = require("./constants");

const US_ZIP_TRAILING_RE = /(?:^|\s)(\d{5}(?:-\d{4})?)\s*$/;

function foldToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’]/g, "")
    .replace(/[?!¡¿.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseCity(raw) {
  return String(raw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^(fl|nw|sw|ne|se|dc)$/i.test(part)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function stripPlaceLsadSuffix(name) {
  let folded = foldToken(name);
  if (!folded) {
    return "";
  }
  for (const suffix of PLACE_NAME_SUFFIXES) {
    if (folded.endsWith(suffix) && folded.length > suffix.length + 2) {
      folded = folded.slice(0, -suffix.length).trim();
      break;
    }
  }
  return folded;
}

function extractTrailingUsZip(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { text: "", zip: null };
  }
  const match = text.match(US_ZIP_TRAILING_RE);
  if (!match) {
    return { text, zip: null };
  }
  const zip5 = String(match[1]).slice(0, 5);
  const remainder = text.slice(0, match.index).replace(/[,\s]+$/g, "").trim();
  return { text: remainder, zip: zip5 };
}

function tokenize(raw) {
  return foldToken(String(raw || "").replace(/,/g, " "))
    .split(/\s+/)
    .filter(Boolean);
}

function isExcludedTerritoryToken(raw) {
  const folded = foldToken(raw);
  return Boolean(folded && EXCLUDED_TERRITORY_TOKENS[folded]);
}

function normalizeStateToken(value, { allowFalsePositives = false } = {}) {
  const text = foldToken(value);
  if (!text) {
    return null;
  }
  if (EXCLUDED_TERRITORY_TOKENS[text]) {
    return null;
  }
  if (!allowFalsePositives && FALSE_POSITIVE_STATE_TOKENS.has(text)) {
    return null;
  }
  if (/^[a-z]{2}$/.test(text)) {
    const upper = text.toUpperCase();
    return US_POSTAL_ABBREVIATIONS.has(upper) ? upper : null;
  }
  return US_STATE_NAME_TO_ABBR[text] || null;
}

function splitTrailingState(tokens) {
  if (!tokens.length) {
    return { state: null, cityTokens: tokens, excludedTerritory: false };
  }
  for (const size of [3, 2, 1]) {
    if (tokens.length < size) {
      continue;
    }
    const slice = tokens.slice(-size).join(" ");
    if (isExcludedTerritoryToken(slice)) {
      return {
        state: null,
        cityTokens: tokens.slice(0, -size),
        excludedTerritory: true
      };
    }
    const state = normalizeStateToken(slice);
    if (state) {
      return {
        state,
        cityTokens: tokens.slice(0, -size),
        excludedTerritory: false
      };
    }
  }
  return { state: null, cityTokens: tokens, excludedTerritory: false };
}

function aliasKeysForPlace(cityKey) {
  const keys = new Set([cityKey]);
  if (!cityKey) {
    return [];
  }
  if (cityKey.startsWith("fort ")) {
    keys.add(`ft ${cityKey.slice(5)}`);
  }
  if (cityKey.startsWith("ft ")) {
    keys.add(`fort ${cityKey.slice(3)}`);
  }
  if (cityKey.startsWith("saint ")) {
    keys.add(`st ${cityKey.slice(6)}`);
  }
  if (/\bst\s/.test(cityKey) || cityKey.startsWith("st ")) {
    keys.add(cityKey.replace(/\bst\b/g, "saint"));
  }
  return [...keys];
}

module.exports = {
  foldToken,
  titleCaseCity,
  stripPlaceLsadSuffix,
  extractTrailingUsZip,
  tokenize,
  isExcludedTerritoryToken,
  normalizeStateToken,
  splitTrailingState,
  aliasKeysForPlace
};
