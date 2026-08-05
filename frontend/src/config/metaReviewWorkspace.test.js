import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveGoogleCalendarListUiFailure,
  shouldFetchGoogleCalendarList
} from "../services/googleCalendarListUi.js";

/**
 * Pure helpers mirrored from metaReviewMode.js / workspaceExperience.js
 * so node:test can validate locker identity without a Vite runtime.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function isMetaReviewUser(user) {
  return user?.meta_review_user === true;
}

function isMetaReviewWorkspaceActive(user, modeEnabled) {
  return Boolean(modeEnabled) && isMetaReviewUser(user);
}

/** Frozen contract — must match workspaceExperience.js META_REVIEW_ALLOWED_ROUTE_KEYS. */
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

const META_REVIEW_FORBIDDEN_ROUTE_KEYS = [
  "policy-intelligence",
  "admin/users",
  "settings/scheduling",
  "conversations",
  "appointments",
  "knowledge",
  "follow-ups",
  "operations-center"
];

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

/** Language lock contract mirrored from LanguageContext Meta Review path. */
function resolveMetaReviewLanguageLock(user, modeEnabled, preferredLanguage = "es") {
  if (isMetaReviewWorkspaceActive(user, modeEnabled)) {
    return "en";
  }

  return preferredLanguage || "en";
}

const admin = {
  id: "admin-1",
  role: "administrator",
  meta_review_user: false
};

const rvp = {
  id: "rvp-1",
  role: "recruiter",
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

test("1. dedicated Meta Review account remains restricted to the approved workspace", () => {
  assert.equal(isMetaReviewWorkspaceActive(reviewUser, true), true);

  for (const routeKey of META_REVIEW_ALLOWED_ROUTE_KEYS) {
    assert.equal(
      canAccessRouteUnderContract(routeKey, reviewUser, true),
      true,
      `expected allowed: ${routeKey}`
    );
  }

  for (const routeKey of META_REVIEW_FORBIDDEN_ROUTE_KEYS) {
    assert.equal(
      canAccessRouteUnderContract(routeKey, reviewUser, true),
      false,
      `expected forbidden: ${routeKey}`
    );
  }

  assert.deepEqual(buildNavLabelKeys(reviewUser, true), [
    "navDashboard",
    "navProspects",
    "navMissionControl",
    "navWhatsApp",
    "navSettings"
  ]);
});

test("2. normal admin/RVP users remain unaffected by Meta Review locker", () => {
  for (const user of [admin, rvp]) {
    assert.equal(isMetaReviewWorkspaceActive(user, true), false);
    assert.ok(buildNavLabelKeys(user, true).includes("navMissionControl"));
    assert.ok(buildNavLabelKeys(user, true).includes("navKnowledge"));
    assert.equal(canAccessRouteUnderContract("settings/scheduling", user, true), true);
    assert.equal(
      shouldFetchGoogleCalendarList({ connected: true }, { metaReviewWorkspaceActive: false }),
      true
    );
  }

  assert.equal(canAccessRouteUnderContract("policy-intelligence", admin, true), true);
  assert.equal(canAccessRouteUnderContract("policy-intelligence", rvp, true), false);
});

test("3. Google Calendar failure does not unlock or expose additional Meta Review routes", () => {
  const googleFailure = { reconnectRequired: true, code: "GOOGLE_RECONNECT_REQUIRED" };
  const ui = resolveGoogleCalendarListUiFailure(
    googleFailure,
    { connected: true, calendarId: "niovelpm@gmail.com" },
    { metaReviewWorkspaceActive: true }
  );

  assert.equal(ui.suppressGoogleError, true);
  assert.equal(ui.reconnectRequired, false);
  assert.equal(
    shouldFetchGoogleCalendarList(
      { connected: true, reconnectRequired: true },
      { metaReviewWorkspaceActive: true }
    ),
    false
  );

  // Route contract unchanged after Google failure signal.
  assert.equal(canAccessRouteUnderContract("policy-intelligence", reviewUser, true), false);
  assert.equal(canAccessRouteUnderContract("admin/users", reviewUser, true), false);
  assert.equal(canAccessRouteUnderContract("settings/scheduling", reviewUser, true), false);
  assert.equal(canAccessRouteUnderContract("settings/integrations", reviewUser, true), true);
});

test("4. Meta Review language lock remains unchanged", () => {
  assert.equal(resolveMetaReviewLanguageLock(reviewUser, true, "es"), "en");
  assert.equal(resolveMetaReviewLanguageLock(reviewUser, true, "en"), "en");
  assert.equal(resolveMetaReviewLanguageLock(admin, true, "es"), "es");
  assert.equal(resolveMetaReviewLanguageLock(rvp, true, "es"), "es");

  const languageContextSource = fs.readFileSync(
    path.join(repoRoot, "frontend/src/i18n/LanguageContext.jsx"),
    "utf8"
  );
  assert.match(languageContextSource, /metaReviewWorkspaceLockedRef/);
  assert.match(languageContextSource, /isMetaReviewWorkspaceActive\(user\)/);
  assert.match(languageContextSource, /applyLanguage\(SYSTEM_DEFAULT_LANGUAGE\)/);
  assert.match(languageContextSource, /if \(metaReviewWorkspaceLockedRef\.current\) \{\s*return;/s);
});

test("5. Existing Meta Review session contract suite invariants still hold", () => {
  assert.equal(isMetaReviewWorkspaceActive(reviewUser, true), true);
  assert.equal(isMetaReviewWorkspaceActive(admin, true), false);
  assert.equal(isMetaReviewWorkspaceActive(reviewUser, false), false);
  assert.equal(isMetaReviewUser({ meta_review_user: true }), true);
  assert.equal(isMetaReviewUser({ meta_review_user: false }), false);
  assert.equal(isMetaReviewUser({ email: "review@example.com" }), false);
});

test("6. Google credentials/calendar controls stay hidden in Meta Review workspace", () => {
  const integrationsSource = fs.readFileSync(
    path.join(repoRoot, "frontend/src/components/settings/OrganizationIntegrations.jsx"),
    "utf8"
  );

  assert.match(integrationsSource, /isMetaReviewWorkspaceActive\(user\)/);
  assert.match(integrationsSource, /Meta Review Integrations is WhatsApp-only/);
  assert.match(integrationsSource, /\{!metaReviewMode \? \(/);
  assert.match(integrationsSource, /configurationGoogleCalendar/);

  // Google UI is rendered only inside the non-Meta-Review branch.
  const googleCardIndex = integrationsSource.indexOf("configurationGoogleCalendar");
  const metaReviewGateIndex = integrationsSource.indexOf("{!metaReviewMode ? (");
  const metaReviewEarlyReturn = integrationsSource.indexOf(
    "Meta Review Integrations is WhatsApp-only"
  );
  assert.ok(metaReviewEarlyReturn > 0);
  assert.ok(metaReviewGateIndex > 0);
  assert.ok(googleCardIndex > metaReviewGateIndex);

  assert.equal(
    shouldFetchGoogleCalendarList({ connected: true }, { metaReviewWorkspaceActive: true }),
    false
  );
});

test("7. Hotfix does not modify Meta Review allowlist or route guards", () => {
  const workspaceExperienceSource = fs.readFileSync(
    path.join(repoRoot, "frontend/src/config/workspaceExperience.js"),
    "utf8"
  );
  const metaReviewModeSource = fs.readFileSync(
    path.join(repoRoot, "frontend/src/config/metaReviewMode.js"),
    "utf8"
  );

  assert.match(workspaceExperienceSource, /const META_REVIEW_ALLOWED_ROUTE_KEYS = new Set\(\[/);
  assert.match(workspaceExperienceSource, /export function isRouteAllowedInMetaReview/);
  assert.match(metaReviewModeSource, /export function isMetaReviewUser/);
  assert.match(metaReviewModeSource, /export function isMetaReviewWorkspaceActive/);

  for (const routeKey of META_REVIEW_ALLOWED_ROUTE_KEYS) {
    assert.match(
      workspaceExperienceSource,
      new RegExp(`"${routeKey.replace(/\//g, "\\/")}"`),
      `allowlist missing ${routeKey}`
    );
  }

  // Protected Meta Review surfaces must remain untouched by this hotfix branch.
  const protectedPaths = [
    "frontend/src/config/workspaceExperience.js",
    "frontend/src/config/metaReviewMode.js",
    "frontend/src/i18n/LanguageContext.jsx",
    "backend/middleware/requireMetaReviewMode.js",
    "backend/services/metaReviewUserService.js",
    "backend/services/atlasUserService.js",
    "backend/config/metaReviewMode.js"
  ];

  for (const relativePath of protectedPaths) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, relativePath)),
      true,
      `missing protected file ${relativePath}`
    );
  }

  // Diff against main must not include Meta Review core files (when git is available).
  let changed = [];
  try {
    changed = execSync("git diff main...HEAD --name-only", {
      cwd: repoRoot,
      encoding: "utf8"
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    changed = [];
  }

  for (const relativePath of protectedPaths) {
    assert.equal(
      changed.includes(relativePath),
      false,
      `hotfix unexpectedly modified ${relativePath}`
    );
  }
});
