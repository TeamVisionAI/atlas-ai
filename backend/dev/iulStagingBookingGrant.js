/**
 * BR-223 — Fail-closed staging booking grant.
 * Production inbound never constructs this. Calendar writes require the grant.
 */

"use strict";

const STAGING_CALENDAR_NAME = "Atlas Staging";
const SIMULATOR_EVENT_TITLE_PREFIX = "[ATLAS IUL SIMULATOR]";
const IUL_STAGING_E2E_INVOCATION_SOURCE = "iul_staging_e2e_simulator";
const GRANT_KIND = "IUL_STAGING_E2E";
const STAGING_GUARD_ERROR = "Staging calendar not safely configured.";

function buildGrantError(message = STAGING_GUARD_ERROR, code = "IUL_STAGING_GUARD_FAILED") {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 409;
  error.publicMessage = STAGING_GUARD_ERROR;
  return error;
}

function assertIulStagingBookingGrant(grant) {
  if (!grant || typeof grant !== "object") {
    throw buildGrantError("IUL staging booking grant is missing.");
  }

  if (grant.kind !== GRANT_KIND) {
    throw buildGrantError("IUL staging booking grant kind is invalid.");
  }

  if (grant.explicitStagingMode !== true) {
    throw buildGrantError("Explicit IUL Staging E2E mode is required.");
  }

  if (grant.invocationSource !== IUL_STAGING_E2E_INVOCATION_SOURCE) {
    throw buildGrantError("Staging booking grant is not valid for this invocation source.");
  }

  if (String(grant.calendarName || "").trim() !== STAGING_CALENDAR_NAME) {
    throw buildGrantError(
      `Calendar name must be exactly "${STAGING_CALENDAR_NAME}". Found: ${grant.calendarName || "unknown"}`
    );
  }

  const calendarId = String(grant.calendarId || "").trim();
  if (!calendarId || calendarId === "primary") {
    throw buildGrantError("Staging calendar ID must be an explicit Atlas Staging calendar.");
  }

  if (!grant.organizationId || !grant.userId || !grant.simulatorRunId) {
    throw buildGrantError("Staging booking grant is missing organization, user, or run identity.");
  }

  if (grant.allowTenantCalendarFallback === true || grant.allowDefaultCalendarFallback === true) {
    throw buildGrantError("Staging booking grant cannot allow calendar fallback.");
  }

  return grant;
}

function tryAssertIulStagingBookingGrant(grant) {
  try {
    return assertIulStagingBookingGrant(grant);
  } catch {
    return null;
  }
}

function createIulStagingBookingGrant({
  stagingConfig,
  simulatorRunId,
  scenarioId
} = {}) {
  if (!stagingConfig?.calendarId || String(stagingConfig.calendarName || "").trim() !== STAGING_CALENDAR_NAME) {
    throw buildGrantError("Verified Atlas Staging calendar is required to create a booking grant.");
  }

  return Object.freeze({
    kind: GRANT_KIND,
    explicitStagingMode: true,
    invocationSource: IUL_STAGING_E2E_INVOCATION_SOURCE,
    simulatorRunId,
    scenarioId: scenarioId || null,
    organizationId: stagingConfig.organizationId,
    userId: stagingConfig.userId,
    calendarId: stagingConfig.calendarId,
    calendarName: stagingConfig.calendarName,
    personalZoomUrl: stagingConfig.personalZoomUrl || null,
    officeAddress: stagingConfig.officeAddress || null,
    environment: stagingConfig.environment || process.env.NODE_ENV || "development",
    titlePrefix: SIMULATOR_EVENT_TITLE_PREFIX,
    allowTenantCalendarFallback: false,
    allowDefaultCalendarFallback: false
  });
}

function buildSimulatorEventDescription({
  simulatorRunId,
  scenarioId,
  meetingMode,
  slot,
  timezone,
  environment
}) {
  return [
    "Atlas IUL Workflow Simulator event",
    `simulatorRunId=${simulatorRunId}`,
    `scenarioId=${scenarioId || "unknown"}`,
    "createdBy=workflow-simulator",
    `environment=${environment || process.env.NODE_ENV || "development"}`,
    `meetingMode=${meetingMode || "unknown"}`,
    `selectedDate=${slot?.dateKey || slot?.date || "unknown"}`,
    `selectedTime=${slot?.timeKey || slot?.time || "unknown"}`,
    `timezone=${timezone || slot?.timezone || "America/New_York"}`
  ].join("\n");
}

function isIulStagingE2eInvocation(options = {}) {
  return (
    options.invocationSource === IUL_STAGING_E2E_INVOCATION_SOURCE &&
    Boolean(tryAssertIulStagingBookingGrant(options.iulStagingE2EGrant))
  );
}

module.exports = {
  STAGING_CALENDAR_NAME,
  SIMULATOR_EVENT_TITLE_PREFIX,
  IUL_STAGING_E2E_INVOCATION_SOURCE,
  GRANT_KIND,
  STAGING_GUARD_ERROR,
  buildGrantError,
  assertIulStagingBookingGrant,
  tryAssertIulStagingBookingGrant,
  createIulStagingBookingGrant,
  isIulStagingE2eInvocation,
  buildSimulatorEventDescription
};
