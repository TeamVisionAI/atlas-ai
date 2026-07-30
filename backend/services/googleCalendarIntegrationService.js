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

  return {
    connected: integration?.status === "connected",
    status: integration?.status || "disconnected",
    googleAccountEmail: config.googleAccountEmail || null,
    calendarId: config.calendarId || null,
    syncStatus: config.syncStatus || "idle",
    lastSync: config.lastSync || null,
    connectedAt: integration?.connected_at || null
  };
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

async function listCalendars(organizationId) {
  const { oauth2Client } = await getAuthorizedClient(organizationId);

  if (!oauth2Client) {
    const error = new Error("Google Calendar is not connected.");
    error.statusCode = 400;
    throw error;
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const response = await calendar.calendarList.list({ minAccessRole: "writer" });

  return (response.data.items || []).map((item) => ({
    id: item.id,
    summary: item.summary,
    primary: Boolean(item.primary),
    accessRole: item.accessRole
  }));
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
  signOAuthState,
  verifyOAuthState
};
