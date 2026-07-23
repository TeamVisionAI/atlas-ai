/**
 * Temporary production diagnostic — validates GOOGLE_* env without exposing secrets.
 * Run: npm run validate:google-oauth
 */

require("dotenv").config();
const { google } = require("googleapis");

const REQUIRED_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN"
];

function resolveRedirectUri() {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    process.env.GOOGLE_REDIRECT_URI ||
    null
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function reportOAuthFailure(error) {
  const message = error?.message || String(error);
  const isInvalidGrant = /invalid_grant/i.test(message);

  console.error(`Error: ${message}`);
  console.error(`invalid_grant: ${isInvalidGrant ? "yes" : "no"}`);

  if (isInvalidGrant) {
    console.error(
      "The refresh token may be revoked, expired, or issued for a different OAuth client than GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET."
    );
  }

  process.exit(1);
}

async function main() {
  const missing = REQUIRED_ENV.filter(
    (key) => !String(process.env[key] || "").trim()
  );

  const redirectUri = resolveRedirectUri();

  if (!redirectUri) {
    missing.push("GOOGLE_OAUTH_REDIRECT_URI or GOOGLE_REDIRECT_URI");
  }

  if (missing.length) {
    fail(`Missing required environment variable(s): ${missing.join(", ")}`);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  try {
    await oauth2Client.getAccessToken();
    console.log("Google OAuth validation successful");
    process.exit(0);
  } catch (error) {
    reportOAuthFailure(error);
  }
}

main();
