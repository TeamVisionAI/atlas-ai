/**
 * BR-215 — Create-time provenance for suspected Meta lead review.
 * A later META_AD_DESTINATION continuation stamp is never enough.
 * Implements BR-215 create-evidence order; does not rewrite CTWA or ownership.
 */

const { AD_DESTINATION_FALLBACK_REASON } = require("../metaAdDestinationFallback");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../whatsappConstants");
const { EVENT_TYPES } = require("../workflowConstants");
const { formatPhoneForStorage, normalizePhoneNumber } = require("../phoneNormalizer");

const META_AD_DESTINATION = "META_AD_DESTINATION";

const HISTORICAL_PROVEN_CTWA_ORIGINS = Object.freeze(
  new Set(["FACEBOOK", "CLICK_TO_WHATSAPP", "CTWA_REFERRAL"])
);

const NON_BR193_CREATE_ORIGINS = Object.freeze(
  new Set([
    ...HISTORICAL_PROVEN_CTWA_ORIGINS,
    "FACEBOOK_LEAD_ADS",
    "QR",
    "CAMPAIGN_INTAKE",
    "CAMPAIGN_INTAKE_CODE",
    "CAMPAIGN_INTAKE_IUL",
    "QUICK_CAPTURE",
    upper(WHATSAPP_SOURCE.PERSONAL_WHATSAPP),
    upper(WHATSAPP_SOURCE.UNKNOWN),
    WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    "CAR_MAGNET"
  ])
);

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function isProspectCreatedEvent(event) {
  if (!event || typeof event !== "object") {
    return false;
  }
  const type = upper(event.event_type || event.eventType);
  return type === upper(EVENT_TYPES.PROSPECT_CREATED);
}

function phoneKeys(phone) {
  const raw = String(phone || "").trim();
  if (!raw) {
    return [];
  }
  const keys = new Set([raw]);
  const normalized = normalizePhoneNumber(raw);
  if (normalized) {
    keys.add(normalized);
    const stored = formatPhoneForStorage(normalized);
    if (stored) {
      keys.add(stored);
    }
  }
  return [...keys];
}

function tokensFromRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return [];
  }
  const payload =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? record.payload
      : {};
  return [
    record.source,
    record.entry_method,
    record.entryMethod,
    record.atlasEligibilitySource,
    record.eligibilityReason,
    payload.source,
    payload.entry_method,
    payload.entryMethod,
    payload.atlasEligibilitySource,
    payload.eligibilityReason
  ]
    .map(upper)
    .filter(Boolean);
}

function isBr193CreateToken(token) {
  return token === META_AD_DESTINATION || token === AD_DESTINATION_FALLBACK_REASON;
}

function classifyTokens(tokens) {
  const unique = [...new Set(tokens)];
  return {
    unique,
    hasBr193: unique.some(isBr193CreateToken),
    provenCtwa: unique.filter((token) => HISTORICAL_PROVEN_CTWA_ORIGINS.has(token)),
    nonBr193: unique.filter((token) => NON_BR193_CREATE_ORIGINS.has(token))
  };
}

function readStoredBr193CreateMarker(workflowState = {}) {
  const reasons = [
    workflowState.eligibilityReason,
    workflowState.prospectPromotion?.reason,
    workflowState.prospectPromotion?.eligibilityReason
  ];
  return reasons.some((reason) => upper(reason) === AD_DESTINATION_FALLBACK_REASON);
}

function readAttachedCreateEvent(prospect = {}, workflowState = {}, options = {}) {
  if (options.createEvent && typeof options.createEvent === "object") {
    return options.createEvent;
  }
  const byPhone = options.createEventsByPhone;
  if (byPhone && typeof byPhone.get === "function") {
    for (const key of phoneKeys(prospect.phone)) {
      const found = byPhone.get(key);
      if (found) {
        return found;
      }
    }
  }
  if (workflowState.prospectCreated && typeof workflowState.prospectCreated === "object") {
    return workflowState.prospectCreated;
  }
  if (prospect.createEvent && typeof prospect.createEvent === "object") {
    return prospect.createEvent;
  }
  return null;
}

function readOriginalSnapshot(workflowState = {}) {
  return (
    workflowState.originalProvenance ||
    workflowState.prospectCreateProvenance ||
    workflowState.createTimeProvenance ||
    null
  );
}

/**
 * Strongest available create-time evidence.
 * 1. ProspectCreated / durable snapshot non-BR-193 origins veto later META stamps
 * 2. explicit stored BR-193 fallback marker
 * 3. ProspectCreated / snapshot META_AD_DESTINATION
 * 4. current row source/entry only as supporting evidence, never sole proof when null
 */
function resolveCreateTimeProvenance(prospect = {}, workflowState = {}, options = {}) {
  const createEvent = readAttachedCreateEvent(prospect, workflowState, options);
  const snapshot = readOriginalSnapshot(workflowState);
  const eventClass = classifyTokens(tokensFromRecord(createEvent));
  const snapshotClass = classifyTokens(tokensFromRecord(snapshot));
  const rowClass = classifyTokens(
    [prospect?.source, prospect?.entry_method].map(upper).filter(Boolean)
  );
  const storedMarker = readStoredBr193CreateMarker(workflowState);

  if (eventClass.provenCtwa.length) {
    return {
      reviewEligible: false,
      reason: "HISTORICAL_PROVEN_CTWA_CREATE_ORIGIN",
      createOrigin: eventClass.provenCtwa[0],
      evidence: "PROSPECT_CREATED"
    };
  }
  if (eventClass.nonBr193.length && !eventClass.hasBr193) {
    return {
      reviewEligible: false,
      reason: "LEGACY_NON_BR193_CREATE_ORIGIN",
      createOrigin: eventClass.nonBr193[0],
      evidence: "PROSPECT_CREATED"
    };
  }
  if (snapshotClass.provenCtwa.length) {
    return {
      reviewEligible: false,
      reason: "HISTORICAL_PROVEN_CTWA_CREATE_ORIGIN",
      createOrigin: snapshotClass.provenCtwa[0],
      evidence: "ORIGINAL_PROVENANCE_SNAPSHOT"
    };
  }
  if (snapshotClass.nonBr193.length && !snapshotClass.hasBr193) {
    return {
      reviewEligible: false,
      reason: "LEGACY_NON_BR193_CREATE_ORIGIN",
      createOrigin: snapshotClass.nonBr193[0],
      evidence: "ORIGINAL_PROVENANCE_SNAPSHOT"
    };
  }

  if (storedMarker) {
    return {
      reviewEligible: true,
      reason: "BR193_CREATE_TIME_FALLBACK_MARKER",
      createOrigin: META_AD_DESTINATION,
      evidence: "STORED_BR193_MARKER"
    };
  }
  if (eventClass.hasBr193) {
    return {
      reviewEligible: true,
      reason: "BR193_CREATE_TIME_META_FALLBACK",
      createOrigin: META_AD_DESTINATION,
      evidence: "PROSPECT_CREATED"
    };
  }
  if (snapshotClass.hasBr193) {
    return {
      reviewEligible: true,
      reason: "BR193_CREATE_TIME_META_FALLBACK",
      createOrigin: META_AD_DESTINATION,
      evidence: "ORIGINAL_PROVENANCE_SNAPSHOT"
    };
  }

  if (rowClass.provenCtwa.length) {
    return {
      reviewEligible: false,
      reason: "HISTORICAL_PROVEN_CTWA_CREATE_ORIGIN",
      createOrigin: rowClass.provenCtwa[0],
      evidence: "ROW_SOURCE_ENTRY"
    };
  }
  if (rowClass.nonBr193.length && !rowClass.hasBr193) {
    return {
      reviewEligible: false,
      reason: "LEGACY_NON_BR193_CREATE_ORIGIN",
      createOrigin: rowClass.nonBr193[0],
      evidence: "ROW_SOURCE_ENTRY"
    };
  }
  if (rowClass.hasBr193) {
    return {
      reviewEligible: true,
      reason: "BR193_CREATE_TIME_META_FALLBACK",
      createOrigin: META_AD_DESTINATION,
      evidence: "ROW_SOURCE_ENTRY"
    };
  }

  return {
    reviewEligible: false,
    reason: "NO_BR193_CREATE_TIME_EVIDENCE",
    createOrigin: null,
    evidence: "AMBIGUOUS_CURRENT_ROW"
  };
}

module.exports = {
  AD_DESTINATION_FALLBACK_REASON,
  HISTORICAL_PROVEN_CTWA_ORIGINS,
  NON_BR193_CREATE_ORIGINS,
  isProspectCreatedEvent,
  phoneKeys,
  readStoredBr193CreateMarker,
  resolveCreateTimeProvenance
};
