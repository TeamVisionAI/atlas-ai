/**
 * Sprint 18.2 — Per-organization Google Calendar OAuth integration.
 * One-way sync: Atlas pushes appointments to Google Calendar.
 */

const crypto = require("crypto");
const { google } = require("googleapis");
const { supabase } = require("./supabaseService");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");
const { shouldMockExternalComms } = require("../dev/simulatorGuard");
const { isProduction } = require("../core/platformProductionGuard");

const PROVIDER = "google_calendar";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
];

/** Exact Google OAuth callback path registered on the configuration router. */
const GOOGLE_OAUTH_CALLBACK_PATH = "/api/configuration/scheduling/google/callback";

const tokenEncryption = createTokenEncryption();

function stripTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isCanonicalGoogleOAuthRedirectUri(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.pathname === GOOGLE_OAUTH_CALLBACK_PATH;
  } catch {
    return false;
  }
}

/**
 * Resolve the redirect_uri sent to Google.
 * Prefer GOOGLE_CONFIGURATION_REDIRECT_URI, then a canonical GOOGLE_REDIRECT_URI,
 * then ATLAS_PUBLIC_URL + the configuration callback path.
 *
 * Rejects stale localhost / legacy onboarding callback values in production so
 * GOOGLE_REDIRECT_URI cannot silently override the live Railway callback route.
 */
function resolveGoogleOAuthRedirectUri(env = process.env) {
  const configured = stripTrailingSlash(env.GOOGLE_CONFIGURATION_REDIRECT_URI);
  if (configured && isCanonicalGoogleOAuthRedirectUri(configured)) {
    return configured;
  }

  const legacy = stripTrailingSlash(env.GOOGLE_REDIRECT_URI);
  if (legacy && isCanonicalGoogleOAuthRedirectUri(legacy)) {
    return legacy;
  }

  const publicBase = stripTrailingSlash(env.ATLAS_PUBLIC_URL);
  if (publicBase) {
    return `${publicBase}${GOOGLE_OAUTH_CALLBACK_PATH}`;
  }

  const fallback = `http://localhost:3000${GOOGLE_OAUTH_CALLBACK_PATH}`;
  const production = env.NODE_ENV === "production";

  if (production) {
    const error = new Error(
      "Google OAuth redirect URI is misconfigured. Set GOOGLE_CONFIGURATION_REDIRECT_URI " +
        `(or ATLAS_PUBLIC_URL) to the HTTPS backend callback ending with ${GOOGLE_OAUTH_CALLBACK_PATH}.`
    );
    error.statusCode = 503;
    error.publicCode = "GOOGLE_OAUTH_REDIRECT_MISCONFIGURED";
    throw error;
  }

  if (configured || legacy) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        component: "google_calendar",
        stage: "oauth_redirect_uri_ignored",
        level: "warn",
        message:
          "Ignoring non-canonical GOOGLE_* redirect URI; using local configuration callback path."
      })
    );
  }

  return fallback;
}

function assertProductionRedirectUri(redirectUri, env = process.env) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  let parsed;
  try {
    parsed = new URL(redirectUri);
  } catch {
    const error = new Error("Google OAuth redirect URI is invalid.");
    error.statusCode = 503;
    error.publicCode = "GOOGLE_OAUTH_REDIRECT_MISCONFIGURED";
    throw error;
  }

  if (parsed.protocol !== "https:") {
    const error = new Error(
      "Google OAuth redirect URI must use HTTPS in production " +
        `(expected path ${GOOGLE_OAUTH_CALLBACK_PATH}).`
    );
    error.statusCode = 503;
    error.publicCode = "GOOGLE_OAUTH_REDIRECT_MISCONFIGURED";
    throw error;
  }

  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    const error = new Error(
      "Google OAuth redirect URI cannot target localhost in production."
    );
    error.statusCode = 503;
    error.publicCode = "GOOGLE_OAUTH_REDIRECT_MISCONFIGURED";
    throw error;
  }

  if (parsed.pathname !== GOOGLE_OAUTH_CALLBACK_PATH) {
    const error = new Error(
      `Google OAuth redirect URI path must be ${GOOGLE_OAUTH_CALLBACK_PATH}.`
    );
    error.statusCode = 503;
    error.publicCode = "GOOGLE_OAUTH_REDIRECT_MISCONFIGURED";
    throw error;
  }
}

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const redirectUri = resolveGoogleOAuthRedirectUri();
  assertProductionRedirectUri(redirectUri);

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function resolveOAuthStateSecret() {
  if (process.env.GOOGLE_OAUTH_STATE_SECRET?.trim()) {
    return process.env.GOOGLE_OAUTH_STATE_SECRET.trim();
  }

  if (isProduction()) {
    throw new Error(
      "GOOGLE_OAUTH_STATE_SECRET is required in production when Google OAuth is enabled."
    );
  }

  return (
    process.env.JWT_SECRET ||
    process.env.META_APP_SECRET ||
    "atlas-dev-oauth-state"
  );
}

function signOAuthState(payload) {
  const secret = resolveOAuthStateSecret();

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyOAuthState(state) {
  if (!state || typeof state !== "string" || !state.includes(".")) {
    return null;
  }

  const [body, signature] = state.split(".");
  const secret = resolveOAuthStateSecret();
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");

  if (signature !== expected) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function fetchOrganizationLegacyIntegration(organizationId) {
  const { data, error } = await supabase
    .from("organization_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .is("user_id", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/** @deprecated Prefer fetchOrganizationLegacyIntegration or fetchPersonalIntegration. */
async function fetchIntegration(organizationId) {
  return fetchOrganizationLegacyIntegration(organizationId);
}

async function fetchPersonalIntegration(organizationId, userId) {
  if (!organizationId || !userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("organization_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * BR-147 — Resolve Google credentials for an actor/interviewer.
 * Personal preferred. Org legacy only when allowOrgLegacyFallback=true.
 */
async function resolveIntegrationForUser(
  organizationId,
  userId,
  { allowOrgLegacyFallback = false } = {}
) {
  const { selectGoogleIntegrationRow, OWNERSHIP } = require("../core/personalIntegrationOwnership");
  const personalRow = userId
    ? await fetchPersonalIntegration(organizationId, userId)
    : null;
  const organizationLegacyRow = allowOrgLegacyFallback
    ? await fetchOrganizationLegacyIntegration(organizationId)
    : null;
  const selected = selectGoogleIntegrationRow({
    personalRow,
    organizationLegacyRow,
    allowOrgLegacyFallback
  });
  return {
    integration: selected.row,
    ownership: selected.ownership,
    OWNERSHIP
  };
}

function decryptRefreshToken(integration) {
  if (!integration?.credentials_encrypted) {
    return null;
  }

  return tokenEncryption.decrypt(integration.credentials_encrypted);
}

async function getAuthorizedClient(organizationId, options = {}) {
  const userId = options.userId || null;
  const allowOrgLegacyFallback = options.allowOrgLegacyFallback !== false && !options.personalOnly;
  let integration;

  if (options.personalOnly && userId) {
    integration = await fetchPersonalIntegration(organizationId, userId);
  } else if (userId) {
    const resolved = await resolveIntegrationForUser(organizationId, userId, {
      allowOrgLegacyFallback
    });
    integration = resolved.integration;
  } else {
    integration = await fetchOrganizationLegacyIntegration(organizationId);
  }

  const refreshToken = decryptRefreshToken(integration);
  const oauth2Client = createOAuthClient();

  if (!oauth2Client || !refreshToken) {
    return { oauth2Client: null, integration };
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return { oauth2Client, integration };
}

function presentIntegrationStatus(integration, { ownership = null } = {}) {
  const config = integration?.config || {};
  const reconnectRequired = config.syncStatus === "reconnect_required";
  const { classifyIntegrationOwnership } = require("../core/personalIntegrationOwnership");
  const classified = ownership || classifyIntegrationOwnership(integration);

  return {
    connected: integration?.status === "connected",
    status: integration?.status || "disconnected",
    googleAccountEmail: config.googleAccountEmail || null,
    calendarId: config.calendarId || null,
    syncStatus: config.syncStatus || "idle",
    reconnectRequired,
    lastSync: config.lastSync || null,
    connectedAt: integration?.connected_at || null,
    ownership: classified?.kind || null,
    userId: classified?.userId || null
  };
}

/**
 * Classify Google OAuth / Calendar API failures for safe client responses.
 * Never includes tokens or raw upstream payloads.
 */
function classifyGoogleCalendarUpstreamError(error) {
  const message = String(error?.message || "");
  const responseError = error?.response?.data?.error;
  const responseErrorString =
    typeof responseError === "string"
      ? responseError
      : String(responseError?.message || responseError?.error || "");
  const gaxiosReason = String(error?.errors?.[0]?.reason || "");
  const haystack = `${message} ${responseErrorString} ${gaxiosReason}`.toLowerCase();

  if (
    haystack.includes("invalid_grant") ||
    haystack.includes("token has been expired or revoked") ||
    haystack.includes("invalid_rapt")
  ) {
    return {
      kind: "reconnect_required",
      reason: "invalid_grant"
    };
  }

  if (
    haystack.includes("insufficient permissions") ||
    haystack.includes("access_not_configured") ||
    haystack.includes("accessdenied") ||
    haystack.includes("insufficientauthenticationscopes")
  ) {
    return {
      kind: "reconnect_required",
      reason: "insufficient_scope"
    };
  }

  if (haystack.includes("invalid_client") || haystack.includes("unauthorized_client")) {
    return {
      kind: "misconfigured",
      reason: "oauth_client"
    };
  }

  return {
    kind: "upstream_unavailable",
    reason: "google_api_error"
  };
}

function createGoogleCalendarListError({
  statusCode,
  publicCode,
  message,
  reconnectRequired = false,
  reason = null
}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.publicCode = publicCode;
  err.reconnectRequired = reconnectRequired;
  err.reason = reason;
  return err;
}

function toPublicGoogleCalendarListError(error) {
  if (error?.publicCode) {
    return error;
  }

  const classified = classifyGoogleCalendarUpstreamError(error);

  if (classified.kind === "reconnect_required") {
    return createGoogleCalendarListError({
      statusCode: 409,
      publicCode: "GOOGLE_RECONNECT_REQUIRED",
      message: "Google Calendar authorization expired. Reconnect Google Calendar to continue.",
      reconnectRequired: true,
      reason: classified.reason
    });
  }

  if (classified.kind === "misconfigured") {
    return createGoogleCalendarListError({
      statusCode: 503,
      publicCode: "GOOGLE_OAUTH_MISCONFIGURED",
      message: "Google Calendar is temporarily unavailable. Please try again later.",
      reconnectRequired: false,
      reason: classified.reason
    });
  }

  return createGoogleCalendarListError({
    statusCode: 502,
    publicCode: "GOOGLE_CALENDAR_UNAVAILABLE",
    message: "Unable to load Google calendars right now. Please try again.",
    reconnectRequired: false,
    reason: classified.reason
  });
}

function presentGoogleCalendarListFailure(error) {
  const publicError = toPublicGoogleCalendarListError(error);

  return {
    statusCode: publicError.statusCode || 500,
    body: {
      error: publicError.publicCode || "GOOGLE_CALENDAR_LIST_FAILED",
      message: publicError.message,
      reconnectRequired: Boolean(publicError.reconnectRequired),
      calendars: []
    }
  };
}

async function markReconnectRequired(organizationId, integration) {
  if (!organizationId || !integration) {
    return;
  }

  const previousConfig = integration.config || {};
  if (previousConfig.syncStatus === "reconnect_required") {
    return;
  }

  const config = {
    ...previousConfig,
    // Preserve selected calendar and account email while signaling reconnect.
    syncStatus: "reconnect_required",
    lastErrorCode: "invalid_grant",
    lastErrorAt: new Date().toISOString()
  };

  let query = supabase
    .from("organization_integrations")
    .update({
      config,
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER);

  if (integration.id) {
    query = query.eq("id", integration.id);
  } else if (integration.user_id) {
    query = query.eq("user_id", integration.user_id);
  } else {
    query = query.is("user_id", null);
  }

  const { error } = await query;

  if (error) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        component: "google_calendar",
        stage: "mark_reconnect_required_failed",
        level: "warn",
        organizationId,
        message: "Unable to persist Google Calendar reconnect_required status."
      })
    );
  }
}

async function getIntegrationStatus(organizationId, userId = null, options = {}) {
  const personalOnly = options.personalOnly !== false && Boolean(userId);
  if (personalOnly && userId) {
    const integration = await fetchPersonalIntegration(organizationId, userId);
    return presentIntegrationStatus(integration, { ownership: integration ? undefined : null });
  }

  const integration = await fetchOrganizationLegacyIntegration(organizationId);
  return presentIntegrationStatus(integration);
}

async function getPersonalIntegrationStatus(organizationId, userId) {
  return getIntegrationStatus(organizationId, userId, { personalOnly: true });
}

function getAuthUrl(organizationId, userId, options = {}) {
  const oauth2Client = createOAuthClient();

  if (!oauth2Client) {
    const error = new Error("Google OAuth is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const redirectUri = resolveGoogleOAuthRedirectUri();

  const ownershipMode =
    options.ownershipMode === "organization" ? "organization" : "personal";

  const state = signOAuthState({
    organizationId,
    userId,
    ownershipMode,
    returnPath: options.returnPath || "settings/integrations",
    exp: Date.now() + 15 * 60 * 1000
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state
  });

  // redirectUri is intentionally returned (not a secret) so operators can verify
  // exact parity with Google Cloud authorized redirect URIs.
  return { url, state, redirectUri };
}

async function handleOAuthCallback(code, state) {
  const payload = verifyOAuthState(state);

  if (!payload?.organizationId) {
    const error = new Error("Invalid OAuth state.");
    error.statusCode = 400;
    throw error;
  }

  const oauth2Client = createOAuthClient();

  if (!oauth2Client) {
    const error = new Error("Google OAuth is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const profile = await oauth2.userinfo.get();
  const googleAccountEmail = profile.data.email || null;

  const encryptedRefreshToken = tokenEncryption.encrypt(tokens.refresh_token || tokens.access_token);

  const config = {
    googleAccountEmail,
    calendarId: "primary",
    syncStatus: "connected",
    lastSync: new Date().toISOString()
  };

  const ownershipMode =
    payload.ownershipMode === "organization" ? "organization" : "personal";
  const ownerUserId =
    ownershipMode === "personal" ? payload.userId || null : null;

  if (ownershipMode === "personal" && !ownerUserId) {
    const error = new Error("Personal Google Calendar connect requires an authenticated user.");
    error.statusCode = 400;
    error.publicCode = "GOOGLE_PERSONAL_OWNER_REQUIRED";
    throw error;
  }

  const rowPayload = {
    organization_id: payload.organizationId,
    provider: PROVIDER,
    status: "connected",
    config,
    credentials_encrypted: encryptedRefreshToken,
    connected_at: new Date().toISOString(),
    connected_by: payload.userId || null,
    user_id: ownerUserId,
    updated_at: new Date().toISOString()
  };

  let existing;
  if (ownerUserId) {
    existing = await fetchPersonalIntegration(payload.organizationId, ownerUserId);
  } else {
    existing = await fetchOrganizationLegacyIntegration(payload.organizationId);
  }

  let error;
  if (existing?.id) {
    ({ error } = await supabase
      .from("organization_integrations")
      .update(rowPayload)
      .eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("organization_integrations").insert(rowPayload));
  }

  if (error) {
    throw error;
  }

  return {
    organizationId: payload.organizationId,
    userId: ownerUserId,
    ownership: ownershipMode,
    googleAccountEmail,
    calendarId: config.calendarId
  };
}

async function listCalendars(organizationId, deps = {}) {
  const getClient = deps.getAuthorizedClient || getAuthorizedClient;
  const createCalendarClient =
    deps.createCalendarClient || ((auth) => google.calendar({ version: "v3", auth }));
  const persistReconnectRequired = deps.markReconnectRequired || markReconnectRequired;
  const clientOptions = deps.clientOptions || {
    userId: deps.userId || null,
    personalOnly: deps.personalOnly !== false && Boolean(deps.userId),
    allowOrgLegacyFallback: deps.allowOrgLegacyFallback === true
  };

  const { oauth2Client, integration } = await getClient(organizationId, clientOptions);

  if (!oauth2Client) {
    if (integration?.status === "connected") {
      await persistReconnectRequired(organizationId, integration);
      throw createGoogleCalendarListError({
        statusCode: 409,
        publicCode: "GOOGLE_RECONNECT_REQUIRED",
        message: "Google Calendar authorization is missing. Reconnect Google Calendar to continue.",
        reconnectRequired: true,
        reason: "missing_refresh_token"
      });
    }

    throw createGoogleCalendarListError({
      statusCode: 400,
      publicCode: "GOOGLE_NOT_CONNECTED",
      message: "Google Calendar is not connected.",
      reconnectRequired: false,
      reason: "not_connected"
    });
  }

  try {
    const calendar = createCalendarClient(oauth2Client);
    const response = await calendar.calendarList.list({ minAccessRole: "writer" });

    return (response.data.items || []).map((item) => ({
      id: item.id,
      summary: item.summary,
      primary: Boolean(item.primary),
      accessRole: item.accessRole
    }));
  } catch (upstreamError) {
    const publicError = toPublicGoogleCalendarListError(upstreamError);

    if (publicError.reconnectRequired) {
      await persistReconnectRequired(organizationId, integration);
    }

    throw publicError;
  }
}

async function setCalendar(organizationId, calendarId, options = {}) {
  const userId = options.userId || null;
  const personalOnly = options.personalOnly !== false && Boolean(userId);
  const integration = personalOnly
    ? await fetchPersonalIntegration(organizationId, userId)
    : await fetchOrganizationLegacyIntegration(organizationId);

  if (!integration || integration.status !== "connected") {
    const error = new Error("Google Calendar is not connected.");
    error.statusCode = 400;
    throw error;
  }

  const config = {
    ...(integration.config || {}),
    calendarId: calendarId || "primary",
    syncStatus: "configured",
    lastSync: new Date().toISOString()
  };

  const { error } = await supabase
    .from("organization_integrations")
    .update({
      config,
      updated_at: new Date().toISOString()
    })
    .eq("id", integration.id);

  if (error) {
    throw error;
  }

  return config;
}

async function disconnect(organizationId, options = {}) {
  const userId = options.userId || null;
  const ownershipMode =
    options.ownershipMode === "organization" || (!userId && options.personalOnly !== true)
      ? "organization"
      : "personal";

  let query = supabase
    .from("organization_integrations")
    .update({
      status: "disconnected",
      credentials_encrypted: null,
      config: {
        syncStatus: "disconnected",
        lastSync: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER);

  if (ownershipMode === "personal") {
    if (!userId) {
      const error = new Error("Personal Google disconnect requires userId.");
      error.statusCode = 400;
      throw error;
    }
    query = query.eq("user_id", userId);
  } else {
    query = query.is("user_id", null);
  }

  const { error } = await query;

  if (error) {
    throw error;
  }

  return { disconnected: true, ownership: ownershipMode, userId: userId || null };
}

async function createCalendarEvent(organizationId, event) {
  let stagingTarget = null;
  if (event?.stagingCalendarTarget) {
    const { assertIulStagingBookingGrant } = require("../dev/iulStagingBookingGrant");
    stagingTarget = assertIulStagingBookingGrant(event.stagingCalendarTarget);
  }

  if (shouldMockExternalComms() && !stagingTarget) {
    return {
      id: `sim-gcal-${Date.now()}`,
      htmlLink: event.zoomUrl || null,
      simulated: true
    };
  }

  // BR-147 — prefer interviewer personal calendar; fall back to org legacy for sync compat.
  // BR-223 — staging E2E never falls back to tenant/default calendars.
  const interviewerUserId = stagingTarget
    ? stagingTarget.userId
    : event?.interviewerUserId || event?.userId || null;
  const { oauth2Client, integration } = await getAuthorizedClient(organizationId, {
    userId: interviewerUserId,
    allowOrgLegacyFallback: stagingTarget ? false : true,
    personalOnly: Boolean(stagingTarget)
  });

  if (!oauth2Client) {
    return null;
  }

  const calendarId = stagingTarget
    ? stagingTarget.calendarId
    : integration?.config?.calendarId || "primary";

  if (stagingTarget && calendarId !== stagingTarget.calendarId) {
    const { buildGrantError } = require("../dev/iulStagingBookingGrant");
    throw buildGrantError("Staging calendar target drifted from the verified Atlas Staging calendar.");
  }
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const requestBody = {
    summary: event.summary,
    description: event.description,
    start: {
      dateTime: event.startTimeISO,
      timeZone: event.timezone || "America/New_York"
    },
    end: {
      dateTime: event.endTimeISO,
      timeZone: event.timezone || "America/New_York"
    }
  };

  if (event.location) {
    requestBody.location = event.location;
  }

  if (event.attendeeEmail && !stagingTarget) {
    requestBody.attendees = [{ email: event.attendeeEmail }];
  }

  const response = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 0,
    sendUpdates: event.attendeeEmail && !stagingTarget ? "all" : "none",
    requestBody
  });

  if (!stagingTarget) {
    await supabase
      .from("organization_integrations")
      .update({
        config: {
          ...(integration.config || {}),
          syncStatus: "synced",
          lastSync: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER);
  }

  return response.data;
}

async function deleteCalendarEvent(organizationId, eventId) {
  if (!eventId || shouldMockExternalComms()) {
    return { deleted: true, simulated: shouldMockExternalComms(), alreadyAbsent: false };
  }

  const { oauth2Client, integration } = await getAuthorizedClient(organizationId);

  if (!oauth2Client) {
    return { deleted: false, reason: "NOT_CONNECTED", alreadyAbsent: false };
  }

  const calendarId = integration?.config?.calendarId || "primary";
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Implements BR-121 — already-absent Calendar delete is successful absence.
  const { isAlreadyAbsentGoogleEventError } = require("../core/googleCalendarAbsence");

  try {
    await calendar.events.delete({
      calendarId,
      eventId
    });
    return { deleted: true, alreadyAbsent: false };
  } catch (error) {
    if (isAlreadyAbsentGoogleEventError(error)) {
      return {
        deleted: true,
        alreadyAbsent: true,
        absenceReason: String(error.message || "ALREADY_ABSENT").slice(0, 200)
      };
    }
    throw error;
  }
}

async function updateCalendarEvent(organizationId, eventId, event) {
  if (!eventId || shouldMockExternalComms()) {
    return {
      id: eventId || `sim-gcal-${Date.now()}`,
      htmlLink: event.zoomUrl || null,
      simulated: true
    };
  }

  const { oauth2Client, integration } = await getAuthorizedClient(organizationId);

  if (!oauth2Client) {
    return null;
  }

  const calendarId = integration?.config?.calendarId || "primary";
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const requestBody = {
    summary: event.summary,
    description: event.description,
    start: {
      dateTime: event.startTimeISO,
      timeZone: event.timezone || "America/New_York"
    },
    end: {
      dateTime: event.endTimeISO,
      timeZone: event.timezone || "America/New_York"
    }
  };

  if (event.location) {
    requestBody.location = event.location;
  }

  if (event.attendeeEmail) {
    requestBody.attendees = [{ email: event.attendeeEmail }];
  }

  const response = await calendar.events.patch({
    calendarId,
    eventId,
    sendUpdates: "all",
    requestBody
  });

  return response.data;
}

/**
 * Re-sends a Google Calendar invitation to the prospect's email address.
 */
async function resendCalendarInvitation(organizationId, eventId, attendeeEmail, eventPatch = {}) {
  if (!eventId) {
    const error = new Error("Calendar event id is required.");
    error.code = "NO_CALENDAR_EVENT";
    throw error;
  }

  if (!attendeeEmail) {
    const error = new Error("Prospect email is required.");
    error.code = "NO_EMAIL";
    throw error;
  }

  if (shouldMockExternalComms()) {
    return {
      id: eventId,
      simulated: true,
      attendees: [{ email: attendeeEmail }]
    };
  }

  const { oauth2Client, integration } = await getAuthorizedClient(organizationId);

  if (!oauth2Client) {
    const error = new Error("Google Calendar is not connected.");
    error.code = "CALENDAR_NOT_CONNECTED";
    throw error;
  }

  const calendarId = integration?.config?.calendarId || "primary";
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const requestBody = {
    attendees: [{ email: attendeeEmail }],
    ...eventPatch
  };

  const response = await calendar.events.patch({
    calendarId,
    eventId,
    sendUpdates: "all",
    requestBody
  });

  await supabase
    .from("organization_integrations")
    .update({
      config: {
        ...(integration.config || {}),
        syncStatus: "synced",
        lastSync: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER);

  return response.data;
}

/**
 * Query Google Calendar FreeBusy for connected org calendar.
 * Returns [] when not connected — graceful fallback for scheduling engine.
 */
async function queryFreeBusy(
  organizationId,
  timeMin,
  timeMax,
  timezone = "America/New_York",
  options = {}
) {
  if (shouldMockExternalComms()) {
    return [];
  }

  const userId = options.userId || null;
  // BR-147 — agent free/busy uses personal calendar only (never inherit org/RVP).
  const { oauth2Client, integration } = await getAuthorizedClient(organizationId, {
    userId,
    personalOnly: Boolean(userId),
    allowOrgLegacyFallback: !userId
  });

  if (!oauth2Client) {
    return [];
  }

  const calendarId = integration?.config?.calendarId || "primary";
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: timezone,
      items: [{ id: calendarId }]
    }
  });

  const busy = response.data?.calendars?.[calendarId]?.busy || [];

  return busy.map((period) => ({
    start: period.start,
    end: period.end
  }));
}

module.exports = {
  getAuthUrl,
  handleOAuthCallback,
  getIntegrationStatus,
  getPersonalIntegrationStatus,
  fetchPersonalIntegration,
  fetchOrganizationLegacyIntegration,
  resolveIntegrationForUser,
  getAuthorizedClient,
  listCalendars,
  setCalendar,
  disconnect,
  createCalendarEvent,
  updateCalendarEvent,
  resendCalendarInvitation,
  deleteCalendarEvent,
  queryFreeBusy,
  presentIntegrationStatus,
  presentGoogleCalendarListFailure,
  classifyGoogleCalendarUpstreamError,
  toPublicGoogleCalendarListError,
  resolveGoogleOAuthRedirectUri,
  isCanonicalGoogleOAuthRedirectUri,
  GOOGLE_OAUTH_CALLBACK_PATH,
  signOAuthState,
  verifyOAuthState
};
