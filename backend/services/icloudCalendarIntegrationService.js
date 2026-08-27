/**
 * BR-161 — Per-user Apple Calendar / iCloud availability (read-only).
 * Encrypts app-specific passwords. Never returns or logs secrets or event content.
 */

const { supabase } = require("./supabaseService");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");
const { isIcloudAvailabilityEnabled } = require("../core/availability/icloudAvailabilityFlag");
const {
  PROVIDERS,
  createAvailabilityAuthError,
  isAvailabilityAuthError,
  isAvailabilityUnavailableError,
  busyWindowToRange
} = require("../core/availability/availabilityTypes");
const { calculateBusyWindowsFromIcs } = require("../core/availability/icsBusyWindowCalculator");
const {
  discoverIcloudCalendars,
  fetchIcloudCalendarIcs
} = require("../core/availability/icloudCalDavClient");

const PROVIDER = PROVIDERS.ICLOUD_CALENDAR;
const tokenEncryption = createTokenEncryption();

function logSafe(stage, fields = {}) {
  console.warn(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: "icloud_calendar",
      stage,
      level: "warn",
      organizationId: fields.organizationId || null,
      userId: fields.userId || null,
      code: fields.code || null
    })
  );
}

function assertPersonalScope(organizationId, userId) {
  if (!organizationId || !userId) {
    const error = new Error("Apple Calendar requires an authenticated user in the current tenant.");
    error.statusCode = 400;
    error.publicCode = "ICLOUD_PERSONAL_OWNER_REQUIRED";
    throw error;
  }
}

function assertFeatureEnabled(organizationId, userId) {
  if (!isIcloudAvailabilityEnabled({ organizationId, userId })) {
    const error = new Error("Apple Calendar / iCloud is not enabled.");
    error.statusCode = 404;
    error.publicCode = "ICLOUD_FEATURE_DISABLED";
    throw error;
  }
}

function presentStatus(integration, { available = false } = {}) {
  const config = integration?.config || {};
  return {
    available,
    connected: integration?.status === "connected",
    status: integration?.status || "disconnected",
    appleAccountEmail: config.appleAccountEmail || null,
    calendarHref: config.calendarHref || null,
    calendarDisplayName: config.calendarDisplayName || null,
    syncStatus: config.syncStatus || "idle",
    reconnectRequired: Boolean(config.reconnectRequired),
    lastSuccessfulRead: config.lastSuccessfulRead || null,
    lastErrorCode: config.lastErrorCode || null,
    lastErrorAt: config.lastErrorAt || null,
    ownership: "personal",
    userId: integration?.user_id || null
  };
}

function publicStatusWithoutSecrets(status) {
  const safe = { ...status };
  delete safe.credentials_encrypted;
  delete safe.appSpecificPassword;
  delete safe.password;
  return safe;
}

async function fetchPersonalIntegration(organizationId, userId) {
  assertPersonalScope(organizationId, userId);
  const { data, error } = await supabase
    .from("organization_integrations")
    .select("id, organization_id, user_id, provider, status, config, connected_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data;
}

async function fetchPersonalIntegrationWithCredentials(organizationId, userId) {
  assertPersonalScope(organizationId, userId);
  const { data, error } = await supabase
    .from("organization_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data;
}

function decryptAppSpecificPassword(integration) {
  if (!integration?.credentials_encrypted) {
    return null;
  }
  return tokenEncryption.decrypt(integration.credentials_encrypted);
}

async function persistRow(organizationId, userId, payload) {
  const existing = await fetchPersonalIntegration(organizationId, userId);
  const row = {
    organization_id: organizationId,
    user_id: userId,
    provider: PROVIDER,
    ...payload,
    updated_at: new Date().toISOString()
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("organization_integrations")
      .update(row)
      .eq("id", existing.id)
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("provider", PROVIDER);
    if (error) {
      throw error;
    }
    return { ...existing, ...row };
  }

  const { data, error } = await supabase
    .from("organization_integrations")
    .insert(row)
    .select("id, organization_id, user_id, provider, status, config, connected_at, updated_at")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function markReconnectRequired(organizationId, userId, code) {
  const integration = await fetchPersonalIntegration(organizationId, userId);
  if (!integration) {
    return;
  }
  const config = {
    ...(integration.config || {}),
    reconnectRequired: true,
    syncStatus: "reconnect_required",
    lastErrorCode: code,
    lastErrorAt: new Date().toISOString()
  };
  await persistRow(organizationId, userId, { config });
}

async function markSuccessfulRead(organizationId, userId, integration) {
  const config = {
    ...(integration?.config || {}),
    reconnectRequired: false,
    syncStatus: "synced",
    lastSuccessfulRead: new Date().toISOString(),
    lastErrorCode: null,
    lastErrorAt: null
  };
  await persistRow(organizationId, userId, { config });
}

async function getIntegrationStatus(organizationId, userId) {
  const available = isIcloudAvailabilityEnabled({ organizationId, userId });
  if (!available) {
    return publicStatusWithoutSecrets(presentStatus(null, { available: false }));
  }
  const integration = await fetchPersonalIntegration(organizationId, userId);
  return publicStatusWithoutSecrets(presentStatus(integration, { available: true }));
}

async function connect({
  organizationId,
  userId,
  appleAccountEmail,
  appSpecificPassword,
  deps = {}
}) {
  assertFeatureEnabled(organizationId, userId);
  assertPersonalScope(organizationId, userId);

  const email = String(appleAccountEmail || "").trim();
  const password = String(appSpecificPassword || "").trim();
  if (!email || !password) {
    const error = new Error("Apple Account email and app-specific password are required.");
    error.statusCode = 400;
    error.publicCode = "ICLOUD_CREDENTIALS_REQUIRED";
    throw error;
  }

  const discover = deps.discoverIcloudCalendars || discoverIcloudCalendars;
  const discovery = await discover({
    appleAccountEmail: email,
    appSpecificPassword: password
  });
  const calendars = discovery.calendars || [];
  const selected = calendars[0];

  const encrypted = tokenEncryption.encrypt(password);
  if (!encrypted || String(encrypted).startsWith("plain:")) {
    const error = new Error("Apple Calendar credentials cannot be stored without encryption.");
    error.statusCode = 503;
    error.publicCode = "ICLOUD_ENCRYPTION_REQUIRED";
    throw error;
  }

  const config = {
    appleAccountEmail: email,
    calendarHref: selected?.href || null,
    calendarDisplayName: selected?.displayName || null,
    principalUrl: discovery.principalUrl || null,
    calendarHomeUrl: discovery.calendarHomeUrl || null,
    syncStatus: "connected",
    reconnectRequired: false,
    lastSuccessfulRead: new Date().toISOString(),
    lastErrorCode: null,
    lastErrorAt: null
  };

  await persistRow(organizationId, userId, {
    status: "connected",
    config,
    credentials_encrypted: encrypted,
    connected_at: new Date().toISOString(),
    connected_by: userId
  });

  return {
    ...publicStatusWithoutSecrets(presentStatus({ user_id: userId, status: "connected", config }, { available: true })),
    calendars: calendars.map((calendar) => ({
      href: calendar.href,
      displayName: calendar.displayName
    }))
  };
}

async function listCalendars(organizationId, userId, deps = {}) {
  assertFeatureEnabled(organizationId, userId);
  const integration = await fetchPersonalIntegrationWithCredentials(organizationId, userId);
  if (!integration || integration.status !== "connected") {
    const error = new Error("Apple Calendar / iCloud is not connected.");
    error.statusCode = 400;
    error.publicCode = "ICLOUD_NOT_CONNECTED";
    throw error;
  }

  const password = decryptAppSpecificPassword(integration);
  const discover = deps.discoverIcloudCalendars || discoverIcloudCalendars;
  try {
    const discovery = await discover({
      appleAccountEmail: integration.config?.appleAccountEmail,
      appSpecificPassword: password
    });
    return {
      calendars: (discovery.calendars || []).map((calendar) => ({
        href: calendar.href,
        displayName: calendar.displayName
      }))
    };
  } catch (error) {
    if (isAvailabilityAuthError(error)) {
      await markReconnectRequired(organizationId, userId, error.code);
    }
    throw error;
  }
}

async function selectCalendar(organizationId, userId, calendarHref, calendarDisplayName) {
  assertFeatureEnabled(organizationId, userId);
  const integration = await fetchPersonalIntegration(organizationId, userId);
  if (!integration || integration.status !== "connected") {
    const error = new Error("Apple Calendar / iCloud is not connected.");
    error.statusCode = 400;
    error.publicCode = "ICLOUD_NOT_CONNECTED";
    throw error;
  }
  if (!calendarHref) {
    const error = new Error("A calendar is required.");
    error.statusCode = 400;
    error.publicCode = "ICLOUD_CALENDAR_REQUIRED";
    throw error;
  }

  const config = {
    ...(integration.config || {}),
    calendarHref,
    calendarDisplayName: calendarDisplayName || integration.config?.calendarDisplayName || null,
    syncStatus: "configured",
    reconnectRequired: false
  };
  await persistRow(organizationId, userId, { config });
  return publicStatusWithoutSecrets(presentStatus({ ...integration, config }, { available: true }));
}

async function disconnect(organizationId, userId) {
  assertFeatureEnabled(organizationId, userId);
  assertPersonalScope(organizationId, userId);
  const { error } = await supabase
    .from("organization_integrations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("provider", PROVIDER);
  if (error) {
    throw error;
  }
  return { disconnected: true, ownership: "personal", userId };
}

async function listBusyWindows({
  organizationId,
  userId,
  timeMin,
  timeMax,
  timezone = "America/New_York",
  deps = {}
} = {}) {
  if (!isIcloudAvailabilityEnabled({ organizationId, userId })) {
    return [];
  }
  if (!organizationId || !userId) {
    return [];
  }

  const integration = await (deps.fetchIntegrationFn || fetchPersonalIntegrationWithCredentials)(
    organizationId,
    userId
  );
  if (!integration || integration.status !== "connected") {
    return [];
  }

  const calendarHref = integration.config?.calendarHref;
  if (!calendarHref) {
    const error = createAvailabilityAuthError("ICLOUD_RECONNECT_REQUIRED");
    await markReconnectRequired(organizationId, userId, error.code);
    throw error;
  }

  const password = decryptAppSpecificPassword(integration);
  if (!password) {
    const error = createAvailabilityAuthError("ICLOUD_RECONNECT_REQUIRED");
    await markReconnectRequired(organizationId, userId, error.code);
    throw error;
  }

  const fetchIcs = deps.fetchIcloudCalendarIcs || fetchIcloudCalendarIcs;
  const calculate = deps.calculateBusyWindowsFromIcs || calculateBusyWindowsFromIcs;

  try {
    const icsBlocks = await fetchIcs(
      {
        appleAccountEmail: integration.config?.appleAccountEmail,
        appSpecificPassword: password
      },
      calendarHref,
      timeMin,
      timeMax
    );
    const busy = [];
    for (const ics of icsBlocks || []) {
      busy.push(
        ...calculate({
          ics,
          timeMin,
          timeMax,
          timezone,
          calendarId: calendarHref
        })
      );
    }
    await markSuccessfulRead(organizationId, userId, integration);
    return busy.filter(Boolean).map((window) => busyWindowToRange(window));
  } catch (error) {
    if (isAvailabilityAuthError(error)) {
      await markReconnectRequired(organizationId, userId, error.code);
      logSafe("auth_failed", { organizationId, userId, code: error.code });
      throw error;
    }
    if (isAvailabilityUnavailableError(error)) {
      logSafe("upstream_unavailable", { organizationId, userId, code: error.code });
      throw error;
    }
    logSafe("read_failed", { organizationId, userId, code: "ICLOUD_UNAVAILABLE" });
    throw error;
  }
}

async function isConnected(organizationId, userId) {
  const status = await getIntegrationStatus(organizationId, userId);
  return Boolean(status.available && status.connected && !status.reconnectRequired);
}

module.exports = {
  PROVIDER,
  getIntegrationStatus,
  connect,
  listCalendars,
  selectCalendar,
  disconnect,
  listBusyWindows,
  isConnected,
  presentStatus,
  publicStatusWithoutSecrets
};
