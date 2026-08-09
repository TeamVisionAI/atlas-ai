/**
 * BR-127 — Canonical qualification fact sync for Recruit AI V2 → schedule advance.
 *
 * Makes V2 durable knownFacts (city/state/workAuthorization) available to the
 * legacy milestone validation layer without redesigning prospect storage.
 */

"use strict";

const SYNC_REASON = Object.freeze({
  OK: null,
  MISSING_SCOPE: "QUALIFICATION_SYNC_SCOPE_REQUIRED",
  ORG_MISMATCH: "QUALIFICATION_SYNC_ORG_MISMATCH",
  IDENTITY_MISMATCH: "QUALIFICATION_SYNC_IDENTITY_MISMATCH",
  FACT_CONFLICT: "QUALIFICATION_FACT_CONFLICT",
  NO_DURABLE_FACTS: "QUALIFICATION_SYNC_NO_DURABLE_FACTS",
  WRITE_FAILED: "QUALIFICATION_SYNC_WRITE_FAILED"
});

function normalizeCity(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.replace(/\s+/g, " ");
}

function normalizeState(value) {
  const s = String(value || "").trim().toUpperCase();
  if (!s) return null;
  const map = {
    FLORIDA: "FL",
    "NEW YORK": "NY",
    TEXAS: "TX",
    CALIFORNIA: "CA"
  };
  if (s.length === 2) return s;
  return map[s] || s;
}

function normalizeAuthorization(value) {
  if (value === true || value === false) return value;
  const s = String(value || "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s === "authorized" || s === "true" || s === "yes") return true;
  if (s === "not_authorized" || s === "false" || s === "no") return false;
  if (s === "unknown") return null;
  return null;
}

function citiesEqual(a, b) {
  return (
    String(normalizeCity(a) || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") ===
    String(normalizeCity(b) || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );
}

function extractDurableQualificationFacts(durableContext = null) {
  const facts = durableContext?.knownFacts || {};
  const city = normalizeCity(facts.city);
  const state = normalizeState(facts.state);
  const authorization =
    normalizeAuthorization(facts.workAuthorization) ??
    normalizeAuthorization(facts.workAuthorizationStatus);

  return {
    city,
    state,
    authorization,
    cityCertainty: facts.cityCertainty || null,
    stateCertainty: facts.stateCertainty || null
  };
}

/**
 * Build capturedFields patch + legacy prospect column updates from durable facts.
 * Fail closed on org/identity mismatch or conflicting non-null legacy values.
 */
function planQualificationFactSync({
  durableContext = null,
  prospect = null,
  organizationId = null,
  expectedCoreProspectId = null,
  expectedLegacyProspectId = null
} = {}) {
  if (!organizationId || !prospect?.id) {
    return {
      ok: false,
      reasonCode: SYNC_REASON.MISSING_SCOPE,
      capturedPatch: {},
      legacyUpdates: {},
      conflicts: []
    };
  }

  // Exact organization required (BR-127 / BR-120) — never sync when org is unset or mismatched.
  const prospectOrg = prospect.organization_id || prospect.organizationId || null;
  if (!prospectOrg || prospectOrg !== organizationId) {
    return {
      ok: false,
      reasonCode: SYNC_REASON.ORG_MISMATCH,
      capturedPatch: {},
      legacyUpdates: {},
      conflicts: []
    };
  }

  // Exact legacy + core mapping required when callers supply expected ids.
  if (!expectedLegacyProspectId || String(prospect.id) !== String(expectedLegacyProspectId)) {
    return {
      ok: false,
      reasonCode: SYNC_REASON.IDENTITY_MISMATCH,
      capturedPatch: {},
      legacyUpdates: {},
      conflicts: []
    };
  }

  if (
    !expectedCoreProspectId ||
    !durableContext?.prospectId ||
    String(durableContext.prospectId) !== String(expectedCoreProspectId)
  ) {
    return {
      ok: false,
      reasonCode: SYNC_REASON.IDENTITY_MISMATCH,
      capturedPatch: {},
      legacyUpdates: {},
      conflicts: []
    };
  }

  const durable = extractDurableQualificationFacts(durableContext);
  if (!durable.city && !durable.state && durable.authorization == null) {
    return {
      ok: false,
      reasonCode: SYNC_REASON.NO_DURABLE_FACTS,
      capturedPatch: {},
      legacyUpdates: {},
      conflicts: []
    };
  }

  const conflicts = [];
  const capturedPatch = {};
  const legacyUpdates = {};

  const legacyCity = normalizeCity(prospect.city);
  const legacyState = normalizeState(prospect.state);
  const legacyAuth = normalizeAuthorization(prospect.work_authorized);

  if (durable.city) {
    if (legacyCity && !citiesEqual(legacyCity, durable.city)) {
      conflicts.push({ field: "city", legacy: legacyCity, durable: durable.city });
    } else {
      capturedPatch.city = durable.city;
      if (!legacyCity) {
        legacyUpdates.city = durable.city;
      }
    }
  }

  if (durable.state) {
    if (legacyState && legacyState !== durable.state) {
      conflicts.push({ field: "state", legacy: legacyState, durable: durable.state });
    } else {
      capturedPatch.state = durable.state;
      if (!legacyState) {
        legacyUpdates.state = durable.state;
      }
    }
  }

  if (durable.authorization != null) {
    if (legacyAuth != null && legacyAuth !== durable.authorization) {
      conflicts.push({
        field: "authorization",
        legacy: legacyAuth,
        durable: durable.authorization
      });
    } else {
      capturedPatch.authorization = durable.authorization;
      if (legacyAuth == null) {
        legacyUpdates.work_authorized = durable.authorization;
      }
    }
  }

  // Any conflict invalidates the entire mutation set — never partial city/state/auth writes.
  if (conflicts.length > 0) {
    return {
      ok: false,
      reasonCode: SYNC_REASON.FACT_CONFLICT,
      capturedPatch: {},
      legacyUpdates: {},
      conflicts
    };
  }

  return {
    ok: true,
    reasonCode: SYNC_REASON.OK,
    capturedPatch,
    legacyUpdates,
    conflicts: [],
    durable
  };
}

/**
 * Apply a previously validated plan (or plan first): single atomic prospect UPDATE
 * for all legacy column hydrations. capturedFields enrichment is in-memory only.
 */
async function synchronizeQualificationFactsForSchedule({
  durableContext = null,
  prospect = null,
  organizationId = null,
  expectedCoreProspectId = null,
  expectedLegacyProspectId = null,
  updateProspectFn = null,
  baseCapturedFields = {},
  plan: providedPlan = null
} = {}) {
  const plan =
    providedPlan ||
    planQualificationFactSync({
      durableContext,
      prospect,
      organizationId,
      expectedCoreProspectId,
      expectedLegacyProspectId
    });

  if (!plan.ok) {
    return {
      ...plan,
      capturedFields: { ...baseCapturedFields },
      prospect
    };
  }

  let nextProspect = prospect;
  if (
    updateProspectFn &&
    prospect?.phone &&
    Object.keys(plan.legacyUpdates).length > 0
  ) {
    try {
      // Single UPDATE payload: city/state/work_authorized together (all-or-nothing row update).
      await updateProspectFn(prospect.phone, { ...plan.legacyUpdates });
      nextProspect = {
        ...prospect,
        ...plan.legacyUpdates
      };
    } catch (error) {
      return {
        ok: false,
        reasonCode: SYNC_REASON.WRITE_FAILED,
        capturedPatch: {},
        legacyUpdates: {},
        conflicts: [],
        capturedFields: { ...baseCapturedFields },
        prospect,
        error
      };
    }
  }

  return {
    ok: true,
    reasonCode: SYNC_REASON.OK,
    capturedFields: {
      ...baseCapturedFields,
      ...plan.capturedPatch
    },
    legacyUpdates: plan.legacyUpdates,
    conflicts: [],
    prospect: nextProspect,
    durable: plan.durable
  };
}

module.exports = {
  SYNC_REASON,
  normalizeCity,
  normalizeState,
  normalizeAuthorization,
  extractDurableQualificationFacts,
  planQualificationFactSync,
  synchronizeQualificationFactsForSchedule
};
