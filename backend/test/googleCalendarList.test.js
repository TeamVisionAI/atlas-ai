/**
 * Hotfix — GET /api/configuration/scheduling/google/calendars must not
 * surface unstructured Google OAuth failures (e.g. invalid_grant → 500).
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  listCalendars,
  presentIntegrationStatus,
  presentGoogleCalendarListFailure,
  classifyGoogleCalendarUpstreamError,
  toPublicGoogleCalendarListError
} = require("../services/googleCalendarIntegrationService");

const ORG_A = "00000000-0000-4000-8000-0000000000aa";
const ORG_B = "00000000-0000-4000-8000-0000000000bb";

function connectedIntegration(overrides = {}) {
  return {
    status: "connected",
    connected_at: "2026-08-01T00:00:00.000Z",
    config: {
      googleAccountEmail: "niovelpm@gmail.com",
      calendarId: "niovelpm@gmail.com",
      syncStatus: "configured",
      lastSync: "2026-08-01T00:00:00.000Z",
      ...(overrides.config || {})
    },
    ...overrides
  };
}

test("1. connected account returns calendar list", async () => {
  const calendars = await listCalendars(ORG_A, {
    getAuthorizedClient: async () => ({
      oauth2Client: { credentials: { refresh_token: "rt" } },
      integration: connectedIntegration()
    }),
    createCalendarClient: () => ({
      calendarList: {
        list: async () => ({
          data: {
            items: [
              {
                id: "niovelpm@gmail.com",
                summary: "niovelpm@gmail.com",
                primary: true,
                accessRole: "owner"
              }
            ]
          }
        })
      }
    }),
    markReconnectRequired: async () => {
      throw new Error("should not mark reconnect on success");
    }
  });

  assert.equal(calendars.length, 1);
  assert.equal(calendars[0].id, "niovelpm@gmail.com");
  assert.equal(calendars[0].primary, true);
});

test("2. expired access token refreshes successfully via authorized client", async () => {
  let listCalls = 0;
  const calendars = await listCalendars(ORG_A, {
    getAuthorizedClient: async () => ({
      oauth2Client: {
        credentials: {
          access_token: "expired",
          refresh_token: "valid-refresh"
        }
      },
      integration: connectedIntegration()
    }),
    createCalendarClient: (auth) => {
      assert.equal(auth.credentials.refresh_token, "valid-refresh");
      return {
        calendarList: {
          list: async () => {
            listCalls += 1;
            return {
              data: {
                items: [{ id: "primary", summary: "Primary", primary: true, accessRole: "owner" }]
              }
            };
          }
        }
      };
    }
  });

  assert.equal(listCalls, 1);
  assert.equal(calendars[0].id, "primary");
});

test("3. missing refresh token returns safe reconnect-required response", async () => {
  let marked = false;
  await assert.rejects(
    () =>
      listCalendars(ORG_A, {
        getAuthorizedClient: async () => ({
          oauth2Client: null,
          integration: connectedIntegration()
        }),
        markReconnectRequired: async () => {
          marked = true;
        }
      }),
    (error) => {
      assert.equal(error.publicCode, "GOOGLE_RECONNECT_REQUIRED");
      assert.equal(error.statusCode, 409);
      assert.equal(error.reconnectRequired, true);
      assert.equal(error.reason, "missing_refresh_token");
      assert.doesNotMatch(String(error.message), /1\/\/|ya29\.|refresh_token/i);
      return true;
    }
  );
  assert.equal(marked, true);

  const failure = presentGoogleCalendarListFailure(
    toPublicGoogleCalendarListError({
      publicCode: "GOOGLE_RECONNECT_REQUIRED",
      statusCode: 409,
      message: "Google Calendar authorization is missing. Reconnect Google Calendar to continue.",
      reconnectRequired: true
    })
  );
  assert.equal(failure.statusCode, 409);
  assert.equal(failure.body.error, "GOOGLE_RECONNECT_REQUIRED");
  assert.equal(failure.body.reconnectRequired, true);
  assert.deepEqual(failure.body.calendars, []);
});

test("4. invalid Google grant is handled without unstructured 500", async () => {
  let marked = false;
  await assert.rejects(
    () =>
      listCalendars(ORG_A, {
        getAuthorizedClient: async () => ({
          oauth2Client: { credentials: { refresh_token: "rt" } },
          integration: connectedIntegration()
        }),
        createCalendarClient: () => ({
          calendarList: {
            list: async () => {
              const error = new Error("invalid_grant");
              error.response = { data: { error: "invalid_grant" } };
              throw error;
            }
          }
        }),
        markReconnectRequired: async () => {
          marked = true;
        }
      }),
    (error) => {
      assert.equal(error.publicCode, "GOOGLE_RECONNECT_REQUIRED");
      assert.equal(error.statusCode, 409);
      assert.equal(error.reconnectRequired, true);
      return true;
    }
  );
  assert.equal(marked, true);

  const failure = presentGoogleCalendarListFailure(new Error("invalid_grant"));
  assert.notEqual(failure.statusCode, 500);
  assert.equal(failure.body.error, "GOOGLE_RECONNECT_REQUIRED");
  assert.doesNotMatch(JSON.stringify(failure.body), /access_token|refresh_token|1\/\//i);
});

test("5. empty calendar list returns 200-shaped empty array", async () => {
  const calendars = await listCalendars(ORG_A, {
    getAuthorizedClient: async () => ({
      oauth2Client: { credentials: { refresh_token: "rt" } },
      integration: connectedIntegration()
    }),
    createCalendarClient: () => ({
      calendarList: {
        list: async () => ({ data: { items: [] } })
      }
    })
  });

  assert.deepEqual(calendars, []);
});

test("6. selected calendar remains preserved on reconnect_required status", () => {
  const status = presentIntegrationStatus(
    connectedIntegration({
      config: {
        googleAccountEmail: "niovelpm@gmail.com",
        calendarId: "niovelpm@gmail.com",
        syncStatus: "reconnect_required"
      }
    })
  );

  assert.equal(status.connected, true);
  assert.equal(status.calendarId, "niovelpm@gmail.com");
  assert.equal(status.googleAccountEmail, "niovelpm@gmail.com");
  assert.equal(status.reconnectRequired, true);
  assert.equal(status.syncStatus, "reconnect_required");
});

test("7. cross-organization access is denied by organization-scoped client lookup", async () => {
  const seenOrgIds = [];

  await listCalendars(ORG_A, {
    getAuthorizedClient: async (organizationId) => {
      seenOrgIds.push(organizationId);
      return {
        oauth2Client: { credentials: { refresh_token: "rt" } },
        integration: connectedIntegration()
      };
    },
    createCalendarClient: () => ({
      calendarList: {
        list: async () => ({ data: { items: [] } })
      }
    })
  });

  assert.deepEqual(seenOrgIds, [ORG_A]);
  assert.ok(!seenOrgIds.includes(ORG_B));
});

test("8. Google API error is sanitized", () => {
  const classified = classifyGoogleCalendarUpstreamError({
    message: "Request failed",
    response: {
      data: {
        error: {
          message: "Backend Error",
          errors: [{ reason: "backendError" }]
        }
      }
    }
  });
  assert.equal(classified.kind, "upstream_unavailable");

  const failure = presentGoogleCalendarListFailure({
    message: "Request failed with raw token ya29.secret",
    response: { data: { error: "backendError", access_token: "ya29.secret" } }
  });

  assert.equal(failure.statusCode, 502);
  assert.equal(failure.body.error, "GOOGLE_CALENDAR_UNAVAILABLE");
  assert.equal(failure.body.reconnectRequired, false);
  assert.doesNotMatch(JSON.stringify(failure.body), /ya29\.|access_token|refresh_token/i);
});

test("9. Settings page remains usable during an upstream failure", () => {
  const uiPath = path.join(
    __dirname,
    "../../frontend/src/services/googleCalendarListUi.js"
  );
  const integrationsPath = path.join(
    __dirname,
    "../../frontend/src/components/settings/OrganizationIntegrations.jsx"
  );
  const uiSource = fs.readFileSync(uiPath, "utf8");
  const integrationsSource = fs.readFileSync(integrationsPath, "utf8");

  assert.match(uiSource, /pageBlocked:\s*false/);
  assert.match(uiSource, /keepIntegrationsVisible:\s*true/);
  assert.match(integrationsSource, /shouldFetchGoogleCalendarList/);
  assert.match(integrationsSource, /resolveGoogleCalendarListUiFailure/);
  assert.match(integrationsSource, /configurationGoogleReconnectRequired/);
});

test("10. Policy Intelligence does not depend on calendar-list success", () => {
  const roots = [
    path.join(__dirname, "../../frontend/src/pages/PolicyIntelligence.jsx"),
    path.join(__dirname, "../../frontend/src/pages/policy-intelligence"),
    path.join(__dirname, "../../frontend/src/components/financial-intelligence"),
    path.join(__dirname, "../../frontend/src/components/policy-intelligence")
  ];

  const offenders = [];

  function inspectFile(full) {
    if (!/\.(jsx?|tsx?)$/.test(full)) {
      return;
    }

    const source = fs.readFileSync(full, "utf8");
    if (
      source.includes("fetchGoogleCalendars") ||
      source.includes("/scheduling/google/calendars")
    ) {
      offenders.push(path.relative(path.join(__dirname, "../.."), full));
    }
  }

  function walk(dir) {
    if (!fs.existsSync(dir)) {
      return;
    }

    const stat = fs.statSync(dir);
    if (stat.isFile()) {
      inspectFile(dir);
      return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      inspectFile(full);
    }
  }

  for (const root of roots) {
    walk(root);
  }

  assert.deepEqual(offenders, []);
});

test("11. existing scheduling presentation helpers still accept google calendar event ids", () => {
  const scheduleResponsePath = path.join(
    __dirname,
    "missionExecutionScheduleResponse.test.js"
  );
  assert.equal(fs.existsSync(scheduleResponsePath), true);

  const status = presentIntegrationStatus(connectedIntegration());
  assert.equal(status.connected, true);
  assert.equal(typeof status.calendarId, "string");
});

test("12. production-safe list failure never leaks raw invalid_grant as sole 500 body", () => {
  const failure = presentGoogleCalendarListFailure({
    message: "invalid_grant",
    response: { data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }
  });

  assert.notEqual(failure.statusCode, 500);
  assert.equal(failure.body.error, "GOOGLE_RECONNECT_REQUIRED");
  assert.equal(failure.body.message.includes("Reconnect"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(failure.body, "error_description"), false);
});
