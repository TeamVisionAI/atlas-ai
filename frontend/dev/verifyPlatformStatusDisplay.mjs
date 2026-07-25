/**
 * Sprint 17.0 — Frontend platform status display verification.
 * Run: node frontend/dev/verifyPlatformStatusDisplay.mjs
 */

import {
  formatMetaReviewStatus,
  formatSprintLabel,
  getFreshnessState
} from "../src/utils/platformStatusDisplay.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const t = {
  knowledgeHubMetaStatusInReview: "In Review",
  knowledgeHubMetaStatusNotSubmitted: "Not submitted",
  knowledgeHubMetaStatusUnknown: "Unknown",
  knowledgeHubSprintUnknown: "Unknown"
};

function verifySprintLabel() {
  assert(
    formatSprintLabel({ number: 17, title: "Atlas Self-Awareness" }) ===
      "Sprint 17 — Atlas Self-Awareness",
    "Sprint label must include number and title"
  );
  assert(formatSprintLabel(null) === null, "Missing sprint must return null");
  assert(formatSprintLabel({ number: 16 }) === "Sprint 16", "Sprint label must not hardcode Sprint 16 when absent");
}

function verifyUnknownSprintBehavior() {
  const label = formatSprintLabel(null) || t.knowledgeHubSprintUnknown;
  assert(label === "Unknown", "Unknown sprint must not fall back to Sprint 16");
  assert(!label.includes("Sprint 16"), "UI must not show stale Sprint 16 when sprint data is missing");
}

function verifyFreshnessState() {
  const now = new Date().toISOString();
  assert(getFreshnessState({ generatedAt: now, cached: false, hasData: true, error: null }) === "live");
  assert(
    getFreshnessState({ generatedAt: now, cached: true, hasData: true, error: null }) === "cached"
  );
  assert(getFreshnessState({ generatedAt: null, cached: false, hasData: false, error: null }) === "unknown");
}

function verifyMetaReviewStatus() {
  assert(formatMetaReviewStatus("in_review", t) === "In Review");
  assert(formatMetaReviewStatus(null, t) === "Unknown");
}

function main() {
  verifySprintLabel();
  verifyUnknownSprintBehavior();
  verifyFreshnessState();
  verifyMetaReviewStatus();
  console.log("verifyPlatformStatusDisplay: all checks passed");
}

main();
