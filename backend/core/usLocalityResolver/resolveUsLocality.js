/**
 * BR-233 — National U.S. locality resolution (50 states + DC).
 * Does not classify tenant coverage. Does not call external APIs.
 */

"use strict";

const {
  COMPLETENESS,
  CONFIDENCE,
  RESOLUTION_SOURCE
} = require("./constants");
const {
  extractTrailingUsZip,
  tokenize,
  splitTrailingState,
  titleCaseCity
} = require("./normalize");
const { loadUsLocalityIndex } = require("./loadIndex");

function emptyResult(overrides = {}) {
  return {
    city: null,
    state: null,
    zip: null,
    proposedState: null,
    completeness: COMPLETENESS.NONE,
    confidence: CONFIDENCE.LOW,
    resolutionSource: RESOLUTION_SOURCE.NONE,
    requiresClarification: true,
    matchSpan: null,
    ...overrides
  };
}

function lookupName(index, key) {
  if (!key) {
    return null;
  }
  const row = index.byName[key];
  return row && Object.keys(row).length ? row : null;
}

function lookupZip(index, zip) {
  if (!zip) {
    return null;
  }
  const pair = index.byZip[zip];
  if (!Array.isArray(pair) || pair.length < 2) {
    return null;
  }
  const cityKey = pair[0];
  const state = pair[1];
  const display = index.byName[cityKey] && index.byName[cityKey][state];
  if (!display) {
    return null;
  }
  return { cityKey, state, display };
}

function longestTrailingCity(index, tokens, stateFilter) {
  const max = Math.min(4, tokens.length);
  for (let size = max; size >= 1; size -= 1) {
    const window = tokens.slice(-size);
    if (window.some((token) => /^\d/.test(token))) {
      continue;
    }
    const key = window.join(" ");
    const states = lookupName(index, key);
    if (!states) {
      continue;
    }
    if (stateFilter) {
      if (!states[stateFilter]) {
        continue;
      }
      return {
        cityKey: key,
        display: states[stateFilter],
        state: stateFilter,
        stateCount: 1,
        tokenCount: size
      };
    }
    const list = Object.keys(states);
    return {
      cityKey: key,
      display: states[list[0]],
      state: list.length === 1 ? list[0] : null,
      states: list,
      stateCount: list.length,
      tokenCount: size
    };
  }
  return null;
}

function completeGazetteer({ city, state, zip, cityKey, tokenCount, zipValidated }) {
  return {
    city,
    state,
    zip: zip || null,
    proposedState: null,
    completeness: COMPLETENESS.COMPLETE,
    confidence: zipValidated ? CONFIDENCE.HIGH : CONFIDENCE.HIGH,
    resolutionSource: zipValidated
      ? RESOLUTION_SOURCE.ZIP_CROSSWALK
      : RESOLUTION_SOURCE.GAZETTEER,
    requiresClarification: false,
    matchSpan: { cityKey, tokenCount }
  };
}

function resolveUsLocality(raw, options = {}) {
  const index = options.index || loadUsLocalityIndex();
  const stripped = extractTrailingUsZip(raw);
  const zip = stripped.zip || null;
  const tokens = tokenize(stripped.text);
  const zipHit = lookupZip(index, zip);

  if (!tokens.length && zipHit) {
    return completeGazetteer({
      city: zipHit.display,
      state: zipHit.state,
      zip,
      cityKey: zipHit.cityKey,
      tokenCount: 0,
      zipValidated: true
    });
  }

  if (!tokens.length) {
    return emptyResult({ zip });
  }

  const trailing = splitTrailingState(tokens);
  if (trailing.excludedTerritory) {
    return emptyResult({
      zip,
      resolutionSource: RESOLUTION_SOURCE.NONE,
      matchSpan: { reason: "excluded_territory" }
    });
  }

  const cityTokens = trailing.cityTokens;
  const state = trailing.state;

  if (state && cityTokens.length) {
    const match = longestTrailingCity(index, cityTokens, state);
    if (match) {
      const zipValidated = Boolean(
        zipHit && zipHit.state === state && zipHit.cityKey === match.cityKey
      );
      const zipConflict = Boolean(
        zipHit && (zipHit.state !== state || zipHit.cityKey !== match.cityKey)
      );
      if (zipConflict) {
        return {
          city: match.display,
          state,
          zip,
          proposedState: null,
          completeness: COMPLETENESS.PARTIAL,
          confidence: CONFIDENCE.MEDIUM,
          resolutionSource: RESOLUTION_SOURCE.GAZETTEER,
          requiresClarification: true,
          matchSpan: { cityKey: match.cityKey, tokenCount: match.tokenCount, zipConflict: true }
        };
      }
      return completeGazetteer({
        city: match.display,
        state,
        zip,
        cityKey: match.cityKey,
        tokenCount: match.tokenCount,
        zipValidated
      });
    }
    return emptyResult({
      state,
      zip,
      resolutionSource: RESOLUTION_SOURCE.NONE,
      matchSpan: { reason: "unknown_city_for_state" }
    });
  }

  if (state && !cityTokens.length) {
    if (zipHit && zipHit.state === state) {
      return completeGazetteer({
        city: zipHit.display,
        state,
        zip,
        cityKey: zipHit.cityKey,
        tokenCount: 0,
        zipValidated: true
      });
    }
    return {
      city: null,
      state,
      zip,
      proposedState: null,
      completeness: COMPLETENESS.STATE_ONLY,
      confidence: CONFIDENCE.MEDIUM,
      resolutionSource: RESOLUTION_SOURCE.GAZETTEER,
      requiresClarification: true,
      matchSpan: null
    };
  }

  if (zipHit && cityTokens.length) {
    const match = longestTrailingCity(index, cityTokens, zipHit.state);
    if (match && match.cityKey === zipHit.cityKey) {
      return completeGazetteer({
        city: zipHit.display,
        state: zipHit.state,
        zip,
        cityKey: zipHit.cityKey,
        tokenCount: match.tokenCount,
        zipValidated: true
      });
    }
  }

  if (zipHit && !cityTokens.length) {
    return completeGazetteer({
      city: zipHit.display,
      state: zipHit.state,
      zip,
      cityKey: zipHit.cityKey,
      tokenCount: 0,
      zipValidated: true
    });
  }

  const bare = longestTrailingCity(index, cityTokens.length ? cityTokens : tokens, null);
  if (!bare) {
    return emptyResult({ zip });
  }

  if (bare.stateCount > 1) {
    return {
      city: titleCaseCity(bare.cityKey),
      state: null,
      zip,
      proposedState: null,
      completeness: COMPLETENESS.PARTIAL,
      confidence: CONFIDENCE.LOW,
      resolutionSource: RESOLUTION_SOURCE.AMBIGUOUS,
      requiresClarification: true,
      matchSpan: { cityKey: bare.cityKey, tokenCount: bare.tokenCount, states: bare.states }
    };
  }

  return {
    city: bare.display,
    state: null,
    zip,
    proposedState: bare.state,
    completeness: COMPLETENESS.PARTIAL,
    confidence: CONFIDENCE.MEDIUM,
    resolutionSource: RESOLUTION_SOURCE.GAZETTEER,
    requiresClarification: true,
    matchSpan: { cityKey: bare.cityKey, tokenCount: bare.tokenCount }
  };
}

module.exports = {
  resolveUsLocality,
  emptyResult,
  longestTrailingCity
};
