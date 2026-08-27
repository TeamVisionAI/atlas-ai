/**
 * Sprint 18.2 — Configuration module API routes.
 */

const express = require("express");
const profileService = require("../services/profileService");
const organizationService = require("../services/organizationService");
const organizationIntegrationService = require("../services/organizationIntegrationService");
const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const icloudCalendarIntegrationService = require("../services/icloudCalendarIntegrationService");
const meetingManagementService = require("../services/meetingManagementService");
const whatsappIntegrationService = require("../services/whatsappIntegrationService");
const { checkMetaConnectionHealth } = require("../core/meta/metaConnectionHealthService");
const { protectedRoute } = require("../middleware/protectedRoute");
const { requirePermission } = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../security/permissions");
const { ORGANIZATION_LEVEL_VALUES } = require("../core/configuration/organizationLevels");
const { appPath } = require("../utils/appPathHelper");
const { resolveFrontendBaseUrl } = require("../config/frontendBaseUrl");

const router = express.Router();

function auditMeta(req) {
  return {
    userId: req.tenantContext?.userId || req.authContext?.userId,
    userEmail: req.authContext?.email,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

router.get("/scheduling/google/callback", async (req, res) => {
  const frontendBase = resolveFrontendBaseUrl();
  let redirectTarget = `${frontendBase}${appPath("settings/scheduling")}`;

  try {
    const code = req.query.code;
    const state = req.query.state;

    if (!code || !state) {
      return res.redirect(`${redirectTarget}?google=error&reason=missing_code`);
    }

    const verifiedState = googleCalendarIntegrationService.verifyOAuthState(state);
    if (verifiedState?.returnPath) {
      redirectTarget = `${frontendBase}${appPath(verifiedState.returnPath)}`;
    }

    await googleCalendarIntegrationService.handleOAuthCallback(code, state);
    return res.redirect(`${redirectTarget}?google=connected`);
  } catch (error) {
    console.error("[configuration/google/callback]", error.message);
    return res.redirect(`${redirectTarget}?google=error&reason=exchange_failed`);
  }
});

router.use(...protectedRoute());

router.get("/profile", async (req, res) => {
  try {
    const profile = await profileService.getConfigurationProfile(req.tenantContext.userId);
    res.json({ profile });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch("/profile", async (req, res) => {
  try {
    const profile = await profileService.updateConfigurationProfile(
      req.tenantContext.userId,
      req.body,
      auditMeta(req)
    );
    res.json({ profile });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/organization", requirePermission(PERMISSIONS.ORG_WRITE), async (req, res) => {
  try {
    const organization = await organizationService.getOrganizationConfiguration(
      req.tenantContext.organizationId
    );
    res.json({ organization });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch(
  "/organization",
  requirePermission(PERMISSIONS.ORG_WRITE),
  async (req, res) => {
    try {
      const organization = await organizationService.updateOrganizationConfiguration(
        req.tenantContext.organizationId,
        req.body,
        auditMeta(req)
      );
      res.json({ organization });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

router.get("/organization/levels", (_req, res) => {
  res.json({ levels: ORGANIZATION_LEVEL_VALUES });
});

router.get("/whatsapp", protectedRoute, requirePermission(PERMISSIONS.ORG_WRITE), async (req, res) => {
  try {
    const organizationId = await whatsappIntegrationService.resolveOrganizationId(
      req.authContext,
      req
    );
    const [status, health] = await Promise.all([
      whatsappIntegrationService.getIntegrationStatusForOrganization(organizationId),
      checkMetaConnectionHealth(organizationId, { persist: false })
    ]);

    const connection = status.connection;

    res.json({
      connected: status.connected,
      connectionStatus: health?.status || connection?.healthStatus || status.status,
      businessPhone: connection?.displayPhoneNumber || null,
      businessName: connection?.businessName || null,
      businessId: connection?.businessId || null,
      phoneNumberId: connection?.phoneNumberId || null,
      wabaId: connection?.wabaId || null,
      connectedAt: connection?.connectedAt || null,
      lastSync: connection?.lastSyncAt || health?.checkedAt || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "WHATSAPP_STATUS_UNAVAILABLE" });
  }
});

router.get("/scheduling", async (req, res) => {
  try {
    const [scheduling, googleCalendar] = await Promise.all([
      organizationService.getSchedulingSettings(req.tenantContext.organizationId),
      googleCalendarIntegrationService.getIntegrationStatus(req.tenantContext.organizationId)
    ]);

    res.json({
      scheduling,
      googleCalendar
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch(
  "/scheduling",
  requirePermission(PERMISSIONS.ORG_WRITE),
  async (req, res) => {
    try {
      const organization = await organizationService.updateSchedulingSettings(
        req.tenantContext.organizationId,
        req.body,
        auditMeta(req)
      );

      res.json({
        scheduling: organization.scheduling
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

router.get(
  "/organization/integrations",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),
  async (req, res) => {
    try {
      const integrations = await organizationIntegrationService.getIntegrationsStatus(
        req.tenantContext.organizationId,
        req.authContext
      );
      res.json({ integrations });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

router.get("/organization/meeting-management", async (req, res) => {
  try {
    const meetingManagement = await meetingManagementService.getMeetingManagement(
      req.tenantContext.organizationId
    );
    res.json({ meetingManagement });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.patch(
  "/organization/meeting-management",
  requirePermission(PERMISSIONS.ORG_WRITE),
  async (req, res) => {
    try {
      const meetingManagement = await meetingManagementService.updateMeetingManagement(
        req.tenantContext.organizationId,
        req.body
      );
      res.json({ meetingManagement });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

router.get(
  "/scheduling/google/auth-url",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),
  async (req, res) => {
    try {
      const ownershipMode =
        req.query.ownershipMode === "organization" ? "organization" : "personal";
      if (ownershipMode === "organization") {
        const { hasPermission } = require("../security/authorizationService");
        if (!hasPermission(req.authContext, PERMISSIONS.ORG_WRITE)) {
          return res.status(403).json({ error: "ORG_WRITE_REQUIRED" });
        }
      }
      const payload = googleCalendarIntegrationService.getAuthUrl(
        req.tenantContext.organizationId,
        req.tenantContext.userId,
        {
          returnPath: req.query.returnPath || "settings/integrations",
          ownershipMode
        }
      );
      res.json(payload);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

router.get(
  "/scheduling/google/calendars",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),
  async (req, res) => {
    try {
      const ownershipMode =
        req.query.ownershipMode === "organization" ? "organization" : "personal";
      const calendars = await googleCalendarIntegrationService.listCalendars(
        req.tenantContext.organizationId,
        ownershipMode === "personal"
          ? {
              userId: req.tenantContext.userId,
              personalOnly: true
            }
          : { personalOnly: false, allowOrgLegacyFallback: true }
      );
      res.json({ calendars });
    } catch (error) {
      const failure = googleCalendarIntegrationService.presentGoogleCalendarListFailure(error);
      res.status(failure.statusCode).json(failure.body);
    }
  }
);

router.post(
  "/scheduling/google/calendar",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),
  async (req, res) => {
    try {
      const ownershipMode =
        req.body?.ownershipMode === "organization" ? "organization" : "personal";
      const config = await googleCalendarIntegrationService.setCalendar(
        req.tenantContext.organizationId,
        req.body?.calendarId,
        ownershipMode === "personal"
          ? { userId: req.tenantContext.userId, personalOnly: true }
          : { personalOnly: false }
      );
      res.json({ calendar: config });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

router.post(
  "/scheduling/icloud/connect",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),
  async (req, res) => {
    try {
      const result = await icloudCalendarIntegrationService.connect({
        organizationId: req.tenantContext.organizationId,
        userId: req.tenantContext.userId,
        appleAccountEmail: req.body?.appleAccountEmail,
        appSpecificPassword: req.body?.appSpecificPassword
      });
      res.json({ icloudCalendar: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || "ICLOUD_CONNECT_FAILED",
        message: error.message
      });
    }
  }
);

router.get(
  "/scheduling/icloud/calendars",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),
  async (req, res) => {
    try {
      const result = await icloudCalendarIntegrationService.listCalendars(
        req.tenantContext.organizationId,
        req.tenantContext.userId
      );
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || "ICLOUD_CALENDAR_LIST_FAILED",
        message: error.message
      });
    }
  }
);

router.post(
  "/scheduling/icloud/calendar",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),
  async (req, res) => {
    try {
      const calendar = await icloudCalendarIntegrationService.selectCalendar(
        req.tenantContext.organizationId,
        req.tenantContext.userId,
        req.body?.calendarHref,
        req.body?.calendarDisplayName
      );
      res.json({ calendar });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || "ICLOUD_CALENDAR_SELECT_FAILED",
        message: error.message
      });
    }
  }
);

router.post(
  "/scheduling/icloud/disconnect",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),
  async (req, res) => {
    try {
      const result = await icloudCalendarIntegrationService.disconnect(
        req.tenantContext.organizationId,
        req.tenantContext.userId
      );
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || "ICLOUD_DISCONNECT_FAILED",
        message: error.message
      });
    }
  }
);

router.post(
  "/scheduling/google/disconnect",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),

  async (req, res) => {
    try {
      const ownershipMode =
        req.body?.ownershipMode === "organization" ? "organization" : "personal";
      if (ownershipMode === "organization") {
        const { hasPermission } = require("../security/authorizationService");
        if (!hasPermission(req.authContext, PERMISSIONS.ORG_WRITE)) {
          return res.status(403).json({ error: "ORG_WRITE_REQUIRED" });
        }
      }
      const result = await googleCalendarIntegrationService.disconnect(
        req.tenantContext.organizationId,
        ownershipMode === "personal"
          ? { userId: req.tenantContext.userId, ownershipMode: "personal" }
          : { ownershipMode: "organization" }
      );
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

module.exports = router;
