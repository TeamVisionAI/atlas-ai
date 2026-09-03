/**
 * BR-223 — Fail-closed guards for IUL Workflow Simulator staging calendar E2E.
 * Never falls back to tenant, Support Mode, or default Google calendars.
 */

"use strict";

const { isSuperAdmin } = require("../security/saasRoles");
const {
  isSupportModeActive,
  isControlPlaneRequest,
  resolvePersonalIntegrationOrganizationId
} = require("../core/effectiveOrganizationContext");
const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const appointmentProfileService = require("../services/appointmentProfileService");
const { isApprovedHttpsZoomUrl } = require("../core/virtualMeetingUrlResolver");

const STAGING_CALENDAR_NAME = "Atlas Staging";
const SIMULATOR_EVENT_TITLE_PREFIX = "[ATLAS IUL SIMULATOR]";
const STAGING_GUARD_ERROR = "Staging calendar not safely configured.";

function buildGuardError(message = STAGING_GUARD_ERROR, code = "IUL_STAGING_GUARD_FAILED") {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 409;
  error.publicMessage = STAGING_GUARD_ERROR;
  return error;
}

function assertSuperAdminStagingAccess(req, { explicitStagingMode = false } = {}) {
  if (!explicitStagingMode) {
    throw buildGuardError("Explicit IUL Staging E2E mode is required.");
  }

  const saasRole = req?.atlasUser?.saasRole || req?.authContext?.saasRole || req?.atlasUser?.role;
  if (!isSuperAdmin(saasRole)) {
    throw buildGuardError("SUPER_ADMIN is required for staging calendar writes.");
  }

  if (isSupportModeActive(req)) {
    throw buildGuardError("Support Mode tenant integrations are not allowed for IUL staging E2E.");
  }

  if (!isControlPlaneRequest(req)) {
    throw buildGuardError("IUL staging E2E must run from the Super Admin control plane.");
  }

  const organizationId = resolvePersonalIntegrationOrganizationId(req);
  const userId = req?.atlasUser?.id || req?.authContext?.userId || null;

  if (!organizationId || !userId) {
    throw buildGuardError("Super Admin personal integration context could not be resolved.");
  }

  return { organizationId, userId, saasRole };
}

function isStagingCalendarMatch(calendar, configuredCalendarId) {
  if (!calendar) {
    return false;
  }
  const summary = String(calendar.summary || "").trim();
  const id = String(calendar.id || "").trim();
  if (summary === STAGING_CALENDAR_NAME) {
    return true;
  }
  if (configuredCalendarId && id === configuredCalendarId) {
    return true;
  }
  return false;
}

async function resolveStagingCalendarConfig(req, options = {}) {
  const { organizationId, userId } = assertSuperAdminStagingAccess(req, options);

  const integrationStatus = await googleCalendarIntegrationService.getPersonalIntegrationStatus(
    organizationId,
    userId
  );

  if (!integrationStatus?.connected) {
    throw buildGuardError("Connected personal Google Calendar integration is required.");
  }

  const configuredCalendarId = String(integrationStatus.calendarId || "").trim() || null;
  const calendars = await googleCalendarIntegrationService.listCalendars(organizationId, {
    userId,
    personalOnly: true,
    allowOrgLegacyFallback: false
  });

  const stagingCalendar =
    calendars.find((cal) => isStagingCalendarMatch(cal, configuredCalendarId)) || null;

  if (!stagingCalendar) {
    if (process.env.NODE_ENV === "production") {
      throw buildGuardError(
        "Atlas Staging calendar could not be positively identified in production."
      );
    }
    throw buildGuardError(
      `Selected calendar must be "${STAGING_CALENDAR_NAME}" with a configured personal integration.`
    );
  }

  if (String(stagingCalendar.summary || "").trim() !== STAGING_CALENDAR_NAME) {
    throw buildGuardError(
      `Calendar name must be exactly "${STAGING_CALENDAR_NAME}". Found: ${stagingCalendar.summary || "unknown"}`
    );
  }

  let personalZoomUrl = null;
  let officeAddress = null;
  try {
    const profile = await appointmentProfileService.getAppointmentProfile(userId);
    personalZoomUrl =
      profile?.appointmentProfile?.virtualMeeting?.personalMeetingUrl || null;
    officeAddress =
      profile?.appointmentProfile?.inPersonMeeting?.location?.fullAddress ||
      profile?.appointmentProfile?.inPersonMeeting?.address ||
      null;
  } catch {
    personalZoomUrl = null;
  }

  return {
    organizationId,
    userId,
    calendarId: stagingCalendar.id,
    calendarName: stagingCalendar.summary,
    configuredCalendarId,
    googleAccountEmail: integrationStatus.googleAccountEmail || null,
    personalZoomUrl: isApprovedHttpsZoomUrl(personalZoomUrl) ? personalZoomUrl : null,
    officeAddress: officeAddress ? String(officeAddress).trim() : null,
    environment: process.env.NODE_ENV || "development",
    titlePrefix: SIMULATOR_EVENT_TITLE_PREFIX
  };
}

module.exports = {
  STAGING_CALENDAR_NAME,
  SIMULATOR_EVENT_TITLE_PREFIX,
  STAGING_GUARD_ERROR,
  assertSuperAdminStagingAccess,
  resolveStagingCalendarConfig,
  isStagingCalendarMatch,
  buildGuardError
};
