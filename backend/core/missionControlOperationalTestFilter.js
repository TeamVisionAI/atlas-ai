/**
 * BR-136 — Mission Control operational TEST/CANARY exclusion (Meta-safe).
 *
 * Separate from Conversations Center lifecycle TEST classification.
 * Never treats META_REVIEW / META_REVIEW_DEMO as ordinary operational TEST.
 */

"use strict";

const OPERATIONAL_TEST_MARKERS = Object.freeze(
  new Set(["TEST", "CANARY", "QA"])
);

function normalizeMarker(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function resolveSourceAndEntry(prospect = {}) {
  const entry = normalizeMarker(prospect.entry_method);
  const source = normalizeMarker(
    prospect.source ||
      (prospect.lead_source && prospect.lead_source.source) ||
      ""
  );
  return { entry, source };
}

/**
 * Meta App Review demo markers — must remain visible in Mission Control /
 * Prospect surfaces for Meta Reviewer (and are not operational TEST for MC).
 */
function isMetaReviewDemoProspect(prospect = {}) {
  const { entry, source } = resolveSourceAndEntry(prospect);
  return entry.includes("META_REVIEW") || source.includes("META_REVIEW");
}

function resolveWorkflowState(prospect = {}, persisted = null) {
  if (persisted && typeof persisted === "object" && !Array.isArray(persisted)) {
    return persisted;
  }
  const raw = prospect.workflow_state;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

/**
 * True when a prospect must be excluded from default Mission Control queue,
 * counts, and latest navigation for operational Niovel use.
 *
 * Criteria:
 * - durable workflow_state.inboxMarkedTestAt
 * - exact source/entry TEST | CANARY | QA
 *
 * Never true for META_REVIEW / META_REVIEW_DEMO subjects.
 */
function isOperationalTestProspectForMissionControl(
  prospect = {},
  persisted = null
) {
  if (!prospect || isMetaReviewDemoProspect(prospect)) {
    return false;
  }

  const workflowState = resolveWorkflowState(prospect, persisted);
  if (workflowState.inboxMarkedTestAt) {
    return true;
  }

  const { entry, source } = resolveSourceAndEntry(prospect);
  return (
    OPERATIONAL_TEST_MARKERS.has(entry) || OPERATIONAL_TEST_MARKERS.has(source)
  );
}

function filterOutOperationalTestProspects(prospects = []) {
  return (prospects || []).filter(
    (prospect) => !isOperationalTestProspectForMissionControl(prospect)
  );
}

module.exports = {
  OPERATIONAL_TEST_MARKERS,
  isMetaReviewDemoProspect,
  isOperationalTestProspectForMissionControl,
  filterOutOperationalTestProspects
};
