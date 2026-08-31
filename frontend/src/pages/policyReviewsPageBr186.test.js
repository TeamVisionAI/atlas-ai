/**
 * BR-186 — Policy Review pipeline page and Client Workspace wiring. Source scans only.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  attributionRowFilters,
  buildPolicyReviewStageLabel,
  formatPolicyReviewMoney,
  kpiStageFilter
} from "../engines/policyReviewViewModel.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("policy review money and stage labels stay presentation-only", () => {
  const translate = (key) => key;
  assert.equal(buildPolicyReviewStageLabel("REPLACEMENT_OPPORTUNITY", translate), "policyReviewOutcomeReplacement");
  assert.match(formatPolicyReviewMoney(1200, "en-US"), /1,200/);
});

test("Policy Reviews is routed separately from recruiting and Policy Intelligence", () => {
  const app = fs.readFileSync(path.join(here, "../App.jsx"), "utf8");
  const nav = fs.readFileSync(path.join(here, "../config/workspaceExperience.js"), "utf8");
  const page = fs.readFileSync(path.join(here, "PolicyReviewsPage.jsx"), "utf8");
  const clients = fs.readFileSync(path.join(here, "ClientsPage.jsx"), "utf8");
  const translations = fs.readFileSync(path.join(here, "../i18n/translations.js"), "utf8");

  assert.match(app, /path="policy-reviews" element=\{<PolicyReviewsPage/);
  assert.match(nav, /"service",\s*"policyReviews"/);
  assert.match(page, /getPolicyReviews\(/);
  assert.match(page, /policyReviewScopeMine/);
  assert.match(page, /policyReviewMetricReplacement/);
  assert.match(page, /policyReviewAcquisition/);
  assert.match(page, /policyReviewFilterPlatform/);
  assert.match(page, /policy-review-source-badge/);
  assert.match(page, /getPolicyReviewDashboard/);
  assert.match(page, /policyReviewViewDashboard/);
  assert.match(page, /PolicyReviewsDashboardBlock/);
  assert.match(page, /policy-review-toolbar/);
  const dashboard = fs.readFileSync(path.join(here, "PolicyReviewsDashboardBlock.jsx"), "utf8");
  assert.match(dashboard, /policy-review-kpi--emphasis/);
  assert.match(dashboard, /policy-review-funnel__bar/);
  assert.match(dashboard, /StatusBadge/);
  assert.match(dashboard, /EmptyState/);
  assert.doesNotMatch(page, /navigateToProspectWorkspace|recruitAiV2|\/api\/prospects/);
  assert.doesNotMatch(page, /policy-intelligence|PolicyIntelligence/);
  assert.doesNotMatch(nav, /IUL Dashboard|Revenue Dashboard|Acquisition Dashboard/);
  assert.match(clients, /getPolicyReviews\(\{ clientId/);
  assert.match(clients, /policyReviewSectionTitle/);
  assert.match(translations, /navPolicyReviews: "Policy Reviews"/);
  assert.match(translations, /policyReviewCommissionEstimated: "Estimated commission"/);
  assert.match(translations, /policyReviewDashboardEmpty/);
});

test("dashboard drill-down stays on existing Policy Reviews filters", () => {
  assert.equal(kpiStageFilter("placed"), "PLACED");
  assert.equal(kpiStageFilter("newReviewLeads"), "");
  assert.deepEqual(attributionRowFilters("campaign", "BR189_FIRST"), { campaign: "BR189_FIRST" });
  assert.deepEqual(attributionRowFilters("owner", "user-1"), { ownerUserId: "user-1" });
});
