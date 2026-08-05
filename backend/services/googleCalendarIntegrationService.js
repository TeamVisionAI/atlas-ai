/**
 * Sprint 18.2 — Per-organization Google Calendar OAuth integration.
 * One-way sync: Atlas pushes appointments to Google Calendar.
 */

const crypto = require("crypto");
const { google } = require("googleapis");
const { supabase } = require("./supabaseService");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");
const { shouldMockExternalComms } = require("../dev/simulatorGuard");

const PROVIDER = "google_calendar";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
];

const tokenEncryption = createTokenEncryption();

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CONFIGURATION_REDIRECT_URI ||
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.ATLAS_PUBLIC_URL || "http://localhost:3000"}/api/configuration/scheduling/google/callback`;

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

const { isProduction } = require("../core/platformProductionGuard");

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

async function fetchIntegration(organizationId) {
  const { data, error } = await supabase
    .from("organization_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function decryptRefreshToken(integration) {
  if (!integration?.credentials_encrypted) {
    return null;
  }

  return tokenEncryption.decrypt(integration.credentials_encrypted);
}

async function getAuthorizedClient(organizationId) {
  const integration = await fetchIntegration(organizationId);
  const refreshToken = decryptRefreshToken(integration);
  const oauth2Client = createOAuthClient();

  if (!oauth2Client || !refreshToken) {
    return { oauth2Client: null, integration };
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return { oauth2Client, integration };
}

function presentIntegrationStatus(integration) {
  const config = integration?.config || {};
  const reconnectRequired = config.syncStatus === "reconnect_required";

  return {
    connected: integration?.status === "connected",
    status: integration?.status || "disconnected",
    googleAccountEmail: config.googleAccountEmail || null,
    calendarId: config.calendarId || null,
    syncStatus: config.syncStatus || "idle",
    reconnectRequired,
    lastSync: config.lastSync || null,
    connectedAt: integration?.connected_at || null
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

  const { error } = await supabase
    .from("organization_integrations")
    .update({
      config,
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER);

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

async function getIntegrationStatus(organizationId) {
  const integration = await fetchIntegration(organizationId);
  return presentIntegrationStatus(integration);
}

function getAuthUrl(organizationId, userId, options = {}) {
  const oauth2Client = createOAuthClient();

  if (!oauth2Client) {
    const error = new Error("Google OAuth is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const state = signOAuthState({
    organizationId,
    userId,
    returnPath: options.returnPath || "settings/scheduling",
    exp: Date.now() + 15 * 60 * 1000
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state
  });

  return { url, state };
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

  const { error } = await supabase.from("organization_integrations").upsert(
    {
      organization_id: payload.organizationId,
      provider: PROVIDER,
      status: "connected",
      config,
      credentials_encrypted: encryptedRefreshToken,
      connected_at: new Date().toISOString(),
      connected_by: payload.userId || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "organization_id,provider" }
  );

  if (error) {
    throw error;
  }

  return {
    organizationId: payload.organizationId,
    googleAccountEmail,
    calendarId: config.calendarId
  };
}

async function listCalendars(organizationId, deps = {}) {
  const getClient = deps.getAuthorizedClient || getAuthorizedClient;
  const createCalendarClient =
    deps.createCalendarClient || ((auth) => google.calendar({ version: "v3", auth }));
  const persistReconnectRequired = deps.markReconnectRequired || markReconnectRequired;

  const { oauth2Client, integration } = await getClient(organizationId);

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

async function setCalendar(organizationId, calendarId) {
  const integration = await fetchIntegration(organizationId);

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
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER);

  if (error) {
    throw error;
  }

  return config;
}

async function disconnect(organizationId) {
  const { error } = await supabase
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

  if (error) {
    throw error;
  }

  return { disconnected: true };
}

async function createCalendarEvent(organizationId, event) {
  if (shouldMockExternalComms()) {
    return {
      id: `sim-gcal-${Date.now()}`,
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

  const response = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 0,
    sendUpdates: event.attendeeEmail ? "all" : "none",
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

async function deleteCalendarEvent(organizationId, eventId) {
  if (!eventId || shouldMockExternalComms()) {
    return { deleted: true, simulated: shouldMockExternalComms() };
  }

  const { oauth2Client, integration } = await getAuthorizedClient(organizationId);

  if (!oauth2Client) {
    return { deleted: false, reason: "NOT_CONNECTED" };
  }

  const calendarId = integration?.config?.calendarId || "primary";
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  await calendar.events.delete({
    calendarId,
    eventId
  });

  return { deleted: true };
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
async function queryFreeBusy(organizationId, timeMin, timeMax, timezone = "America/New_York") {
  if (shouldMockExternalComms()) {
    return [];
  }

  const { oauth2Client, integration } = await getAuthorizedClient(organizationId);

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
  signOAuthState,
  verifyOAuthState
};
