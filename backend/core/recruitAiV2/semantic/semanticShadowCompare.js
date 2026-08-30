/**
 * BR-174 — compare semantic interpretation vs legacy projection. Observability only.
 */

function normalizeValue(value) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  return value;
}

function addDisagreement(disagreements, path, legacy, semantic) {
  if (normalizeValue(legacy) === normalizeValue(semantic)) {
    return;
  }
  disagreements.push({ path, legacy: legacy ?? null, semantic: semantic ?? null });
}

function compareSemanticVsLegacy(legacyProjection, semanticInterpretation) {
  const disagreements = [];
  const legacy = legacyProjection || {};
  const semantic = semanticInterpretation || {};

  addDisagreement(disagreements, "intent", legacy.intent, semantic.intent);
  addDisagreement(disagreements, "language", legacy.language, semantic.language);
  addDisagreement(
    disagreements,
    "schedulingIntent",
    legacy.schedulingIntent,
    semantic.schedulingIntent
  );
  addDisagreement(disagreements, "facts.city", legacy.facts?.city, semantic.facts?.city);
  addDisagreement(disagreements, "facts.state", legacy.facts?.state, semantic.facts?.state);
  addDisagreement(
    disagreements,
    "facts.workAuthorization",
    legacy.facts?.workAuthorization,
    semantic.facts?.workAuthorization
  );
  addDisagreement(
    disagreements,
    "safety.ssnPrivacy",
    legacy.safety?.ssnPrivacy,
    semantic.safety?.ssnPrivacy
  );
  addDisagreement(
    disagreements,
    "requestedDayPart",
    legacy.requestedDayPart,
    semantic.requestedDayPart
  );

  const acceptedFacts = [];
  const rejectedFacts = [];
  const factKeys = ["city", "state", "workAuthorization"];
  for (const key of factKeys) {
    const value = semantic.facts?.[key];
    if (value == null || value === "") {
      continue;
    }
    if (Number(semantic.confidence) >= 0.7) {
      acceptedFacts.push(key);
    } else {
      rejectedFacts.push(key);
    }
  }

  return {
    agree: disagreements.length === 0,
    disagreementCount: disagreements.length,
    disagreements,
    acceptedFacts,
    rejectedFacts
  };
}

module.exports = {
  compareSemanticVsLegacy
};
