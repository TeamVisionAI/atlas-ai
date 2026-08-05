/**
 * Hotfix — Google OAuth redirect_uri must match the configuration callback route.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveGoogleOAuthRedirectUri,
  isCanonicalGoogleOAuthRedirectUri,
  GOOGLE_OAUTH_CALLBACK_PATH
} = require("../services/googleCalendarIntegrationService");

const CANONICAL_PROD =
  "https://atlas-ai-production-01de.up.railway.app/api/configuration/scheduling/google/callback";

test("canonical callback path matches configuration router registration", () => {
  assert.equal(
    GOOGLE_OAUTH_CALLBACK_PATH,
    "/api/configuration/scheduling/google/callback"
  );

  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/configuration.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");

  assert.match(routeSource, /router\.get\("\/scheduling\/google\/callback"/);
  assert.match(serverSource, /app\.use\("\/api\/configuration", configurationRoutes\)/);
  assert.equal(
    isCanonicalGoogleOAuthRedirectUri(CANONICAL_PROD),
    true
  );
  assert.equal(
    isCanonicalGoogleOAuthRedirectUri(
      "http://localhost:3000/api/onboarding/calendar/callback"
    ),
    false
  );
});

test("prefers GOOGLE_CONFIGURATION_REDIRECT_URI when canonical", () => {
  const uri = resolveGoogleOAuthRedirectUri({
    GOOGLE_CONFIGURATION_REDIRECT_URI: CANONICAL_PROD,
    GOOGLE_REDIRECT_URI: "http://localhost:3000/api/onboarding/calendar/callback",
    ATLAS_PUBLIC_URL: "https://ignored.example.com",
    NODE_ENV: "production"
  });

  assert.equal(uri, CANONICAL_PROD);
});

test("ignores stale GOOGLE_REDIRECT_URI onboarding localhost callback", () => {
  const uri = resolveGoogleOAuthRedirectUri({
    GOOGLE_REDIRECT_URI: "http://localhost:3000/api/onboarding/calendar/callback",
    ATLAS_PUBLIC_URL: "https://atlas-ai-production-01de.up.railway.app",
    NODE_ENV: "test"
  });

  assert.equal(uri, CANONICAL_PROD);
});

test("accepts legacy GOOGLE_REDIRECT_URI only when path is canonical", () => {
  const uri = resolveGoogleOAuthRedirectUri({
    GOOGLE_REDIRECT_URI: `${CANONICAL_PROD}/`,
    NODE_ENV: "test"
  });

  assert.equal(uri, CANONICAL_PROD);
});

test("derives from ATLAS_PUBLIC_URL when redirect env is missing", () => {
  const uri = resolveGoogleOAuthRedirectUri({
    ATLAS_PUBLIC_URL: "https://atlas-ai-production-01de.up.railway.app/",
    NODE_ENV: "test"
  });

  assert.equal(uri, CANONICAL_PROD);
});

test("production fails closed when only localhost fallback remains", () => {
  assert.throws(
    () =>
      resolveGoogleOAuthRedirectUri({
        GOOGLE_REDIRECT_URI: "http://localhost:3000/api/onboarding/calendar/callback",
        NODE_ENV: "production"
      }),
    (error) => {
      assert.equal(error.publicCode, "GOOGLE_OAUTH_REDIRECT_MISCONFIGURED");
      assert.equal(error.statusCode, 503);
      assert.doesNotMatch(String(error.message), /client_secret|refresh_token/i);
      return true;
    }
  );
});

test("Meta Review allowlist and Google hide gate remain untouched by this hotfix", () => {
  const changed = require("node:child_process")
    .execSync("git diff --name-only", { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const protectedPaths = [
    "frontend/src/config/workspaceExperience.js",
    "frontend/src/config/metaReviewMode.js",
    "frontend/src/i18n/LanguageContext.jsx",
    "backend/middleware/requireMetaReviewMode.js",
    "backend/services/metaReviewUserService.js"
  ];

  for (const relativePath of protectedPaths) {
    assert.equal(changed.includes(relativePath), false, relativePath);
  }

  const integrations = fs.readFileSync(
    path.join(
      __dirname,
      "../../frontend/src/components/settings/OrganizationIntegrations.jsx"
    ),
    "utf8"
  );
  assert.match(integrations, /Meta Review Integrations is WhatsApp-only/);
  assert.match(integrations, /\{!metaReviewMode \? \(/);
});
