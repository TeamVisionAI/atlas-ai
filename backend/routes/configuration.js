/**
 * Sprint 18.2 — Configuration module API routes.
 */

const express = require("express");
const profileService = require("../services/profileService");
const organizationService = require("../services/organizationService");
const googleCalendarIntegrationService = require("../services/googleCalendarIntegrationService");
const { getEmbeddedSignupStatus } = require("../core/metaEmbeddedSignupService");
const { checkMetaConnectionHealth } = require("../core/meta/metaConnectionHealthService");
const { protectedRoute } = require("../middleware/protectedRoute");
const { requirePermission } = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../security/permissions");
const { ORGANIZATION_LEVEL_VALUES } = require("../core/configuration/organizationLevels");
const { appPath } = require("../utils/appPathHelper");

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
  const frontendBase = process.env.ATLAS_FRONTEND_URL || "http://localhost:5173";
  const redirectTarget = `${frontendBase}${appPath("settings/scheduling")}`;

  try {
    const code = req.query.code;
    const state = req.query.state;

    if (!code || !state) {
      return res.redirect(`${redirectTarget}?google=error&reason=missing_code`);
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

router.get("/organization", async (req, res) => {
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

router.get("/whatsapp", async (_req, res) => {
  try {
    const [status, health] = await Promise.all([
      getEmbeddedSignupStatus(),
      checkMetaConnectionHealth()
    ]);

    res.json({
      connectionStatus: health?.status || status?.status || "disconnected",
      businessPhone: status?.displayPhoneNumber || status?.phoneNumber || null,
      phoneNumberId: status?.phoneNumberId || null,
      wabaId: status?.wabaId || null,
      lastSync: status?.lastSync || health?.checkedAt || null,
      connected: Boolean(status?.connected || status?.phoneNumberId)
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

router.get("/scheduling/google/auth-url", async (req, res) => {
  try {
    const payload = googleCalendarIntegrationService.getAuthUrl(
      req.tenantContext.organizationId,
      req.tenantContext.userId
    );
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/scheduling/google/calendars", async (req, res) => {
  try {
    const calendars = await googleCalendarIntegrationService.listCalendars(
      req.tenantContext.organizationId
    );
    res.json({ calendars });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/scheduling/google/calendar", async (req, res) => {
  try {
    const config = await googleCalendarIntegrationService.setCalendar(
      req.tenantContext.organizationId,
      req.body?.calendarId
    );
    res.json({ calendar: config });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/scheduling/google/disconnect", async (req, res) => {
  try {
    const result = await googleCalendarIntegrationService.disconnect(
      req.tenantContext.organizationId
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

module.exports = router;
