import test from "node:test";
import assert from "node:assert/strict";

/**
 * Pure helpers mirrored from metaReviewMode.js / workspaceExperience.js
 * so node:test can validate locker identity without a Vite runtime.
 */

function isMetaReviewUser(user) {
  return user?.meta_review_user === true;
}

function isMetaReviewWorkspaceActive(user, modeEnabled) {
  return Boolean(modeEnabled) && isMetaReviewUser(user);
}

const META_REVIEW_ALLOWED_ROUTE_KEYS = new Set([
  "executive-dashboard",
  "my-dashboard",
  "team-dashboard",
  "mission-control",
  "prospect-center",
  "prospect-workspace",
  "prospect",
  "settings",
  "settings/profile",
  "settings/integrations",
  "settings/whatsapp",
  "settings/whatsapp/success",
  "settings/whatsapp/error",
  "settings/review-users"
]);

function buildNavLabelKeys(user, modeEnabled) {
  if (isMetaReviewWorkspaceActive(user, modeEnabled)) {
    return ["navDashboard", "navProspects", "navMissionControl", "navWhatsApp", "navSettings"];
  }

  return [
    "navDashboard",
    "navQuickCapture",
    "navMissionControl",
    "navProspects",
    "navConversations",
    "navAppointments",
    "navFollowUps",
    "navKnowledge",
    "navPolicyIntelligence",
    "navSettings"
  ];
}

function canAccessRouteUnderContract(routeKey, user, modeEnabled) {
  if (isMetaReviewWorkspaceActive(user, modeEnabled)) {
    if (routeKey === "admin/users") {
      return false;
    }
    if (routeKey === "policy-intelligence") {
      return false;
    }
    return META_REVIEW_ALLOWED_ROUTE_KEYS.has(routeKey);
  }

  if (routeKey === "policy-intelligence") {
    return user?.role === "administrator";
  }

  return true;
}

const admin = {
  id: "admin-1",
  role: "administrator",
  meta_review_user: false
};

const reviewUser = {
  id: "review-1",
  role: "recruiter",
  meta_review_user: true
};

test("dedicated Meta Review account activates locker when mode enabled", () => {
  assert.equal(isMetaReviewWorkspaceActive(reviewUser, true), true);
  assert.deepEqual(buildNavLabelKeys(reviewUser, true), [
    "navDashboard",
    "navProspects",
    "navMissionControl",
    "navWhatsApp",
    "navSettings"
  ]);
  assert.equal(canAccessRouteUnderContract("policy-intelligence", reviewUser, true), false);
  assert.equal(canAccessRouteUnderContract("mission-control", reviewUser, true), true);
});

test("normal administrator does not receive Meta Review locker while mode enabled", () => {
  assert.equal(isMetaReviewUser(admin), false);
  assert.equal(isMetaReviewWorkspaceActive(admin, true), false);
  const nav = buildNavLabelKeys(admin, true);
  assert.ok(nav.includes("navPolicyIntelligence"));
  assert.ok(nav.includes("navKnowledge"));
  assert.equal(canAccessRouteUnderContract("policy-intelligence", admin, true), true);
  assert.equal(canAccessRouteUnderContract("admin/users", admin, true), true);
});

test("incognito/new session uses the same session contract (meta_review_user only)", () => {
  const freshAdminSession = { ...admin };
  const freshReviewSession = { ...reviewUser };
  assert.equal(isMetaReviewWorkspaceActive(freshAdminSession, true), false);
  assert.equal(isMetaReviewWorkspaceActive(freshReviewSession, true), true);
});

test("frontend navigation follows backend session contract, not env alone", () => {
  assert.equal(isMetaReviewWorkspaceActive(admin, true), false);
  assert.equal(isMetaReviewWorkspaceActive(reviewUser, false), false);
  assert.equal(isMetaReviewWorkspaceActive(reviewUser, true), true);
});

test("locker ignores email-like fields and requires explicit meta_review_user", () => {
  const spoofed = {
    id: "x",
    role: "administrator",
    email: "review@example.com",
    meta_review_user: false
  };
  assert.equal(isMetaReviewWorkspaceActive(spoofed, true), false);
});
