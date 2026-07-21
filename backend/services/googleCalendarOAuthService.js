/**
 * Journey #1 — Google Calendar OAuth for per-organization calendar connection.
 */

const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/onboarding/calendar/callback";

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function isConfigured() {
  return Boolean(getOAuthClient());
}

function getFrontendBaseUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function buildAuthorizationUrl(state) {
  const client = getOAuthClient();

  if (!client) {
    throw new Error("Google Calendar OAuth is not configured");
  }

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state
  });
}

async function exchangeAuthorizationCode(code) {
  const client = getOAuthClient();

  if (!client) {
    throw new Error("Google Calendar OAuth is not configured");
  }

  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token");
  }

  return tokens.refresh_token;
}

function encodeOAuthState(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeOAuthState(state) {
  try {
    return JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = {
  isConfigured,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  encodeOAuthState,
  decodeOAuthState,
  getFrontendBaseUrl
};
