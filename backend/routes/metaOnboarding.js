/**
 * Sprint 20.1 — Meta Embedded Signup API routes (org-scoped).
 */

const express = require("express");
const {
  completeEmbeddedSignupExchange,
  getEmbeddedSignupStatus,
  sanitizeMetaError,
  extractGraphErrorDetails
} = require("../core/metaEmbeddedSignupService");
const { isRateLimited } = require("../core/metaEmbeddedSignupRateLimit");
const { checkMetaConnectionHealth } = require("../core/meta/metaConnectionHealthService");
const { metaLogger } = require("../core/meta/metaLogger");
const {
  compareAuthorizationCodes,
  traceAuthorizationCode
} = require("../core/meta/authorizationCodeTrace");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requirePermission } = require("../middleware/requirePermission");
const { PERMISSIONS } = require("../security/permissions");
const { hasPermission } = require("../security/authorizationService");
const whatsappIntegrationService = require("../services/whatsappIntegrationService");

const router = express.Router();

const EMBEDDED_SIGNUP_TELEMETRY_STAGES = new Set([
  "embedded_signup_client_started",
  "embedded_signup_oauth_received",
  "embedded_signup_finish_received",
  "embedded_signup_exchange_requested",
  "embedded_signup_exchange_completed",
  "embedded_signup_status_verified",
  "embedded_signup_partial_timeout",
  "embedded_signup_status_verify_failed"
]);

router.use(requireAtlasUser);
router.use(organizationGuard());

function auditMeta(req) {
  return {
    userId: req.authContext?.userId,
    userEmail: req.authContext?.email,
    organizationId: req.tenantContext?.organizationId || req.authContext?.organizationId,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

router.get("/embedded-signup/status", async (req, res) => {
  try {
    const organizationId = await whatsappIntegrationService.resolveOrganizationId(
      req.authContext,
      req
    );
    // BR-147 — default status is the actor's personal connection (never org legacy as personal).
    const personal = await whatsappIntegrationService.getPersonalIntegrationStatusForOrganization(
      organizationId,
      req.authContext.userId
    );
    const payload = {
      connected: personal.connected,
      status: personal.status,
      connection: personal.connection,
      ownership: "personal"
    };

    if (hasPermission(req.authContext, PERMISSIONS.ORG_WRITE)) {
      const orgOwned = await whatsappIntegrationService.getIntegrationStatusForOrganization(
        organizationId
      );
      payload.organizationChannel = {
        connected: orgOwned.connected,
        status: orgOwned.status,
        connection: orgOwned.connection,
        ownership: "organization"
      };
    }

    res.json(payload);
  } catch (error) {
    metaLogger.error("embedded_signup_status_failed", { message: error.message });
    res.status(500).json({ error: "Failed to load WhatsApp connection status." });
  }
});

router.get("/embedded-signup/health", async (req, res) => {
  try {
    const organizationId = await whatsappIntegrationService.resolveOrganizationId(
      req.authContext,
      req
    );
    const payload = await checkMetaConnectionHealth(organizationId);
    res.json(payload);
  } catch (error) {
    metaLogger.error("embedded_signup_health_failed", { message: error.message });
    res.status(500).json({ error: "Failed to check WhatsApp connection health." });
  }
});

router.post(
  "/embedded-signup/disconnect",
  requirePermission(PERMISSIONS.INTEGRATIONS_SELF),
  async (req, res) => {
    try {
      const ownership =
        req.body?.ownership === "organization" || req.body?.ownershipMode === "organization"
          ? "organization"
          : "personal";
      const result = await whatsappIntegrationService.disconnectIntegration(
        req.authContext,
        auditMeta(req),
        req,
        { ownership }
      );
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || "DISCONNECT_FAILED",
        message: error.message || "Unable to disconnect WhatsApp integration."
      });
    }
  }
);

router.post("/embedded-signup/telemetry", async (req, res) => {
  try {
    const stage = String(req.body?.stage || "").trim();
    if (!EMBEDDED_SIGNUP_TELEMETRY_STAGES.has(stage)) {
      return res.status(400).json({ error: "INVALID_STAGE" });
    }

    const organizationId = await whatsappIntegrationService.resolveOrganizationId(
      req.authContext,
      req
    );
    const ownershipMode =
      req.body?.ownershipMode === "organization" &&
      hasPermission(req.authContext, PERMISSIONS.ORG_WRITE)
        ? "organization"
        : "personal";

    metaLogger.info(stage, {
      organizationId,
      userId: req.authContext?.userId || null,
      ownershipMode,
      attemptId: req.body?.attemptId ? String(req.body.attemptId).trim() : null,
      partialHandoff: req.body?.partialHandoff || null,
      hasOAuthCode: req.body?.hasOAuthCode === true,
      hasWabaId: req.body?.hasWabaId === true,
      reason: req.body?.reason ? String(req.body.reason) : null
    });

    res.json({ success: true });
  } catch (error) {
    metaLogger.error("embedded_signup_telemetry_failed", { message: error.message });
    res.status(500).json({ error: "TELEMETRY_FAILED" });
  }
});

router.post("/embedded-signup/exchange", async (req, res) => {
  try {
    if (isRateLimited(req)) {
      return res.status(429).json({
        error: "RATE_LIMITED",
        message: "Too many signup attempts. Please wait and try again."
      });
    }

    const rawCode = req.body?.code;

    if (!rawCode || typeof rawCode !== "string" || !rawCode.trim()) {
      return res.status(400).json({
        error: "CODE_REQUIRED",
        message: "Authorization code is required."
      });
    }

    metaLogger.info(
      "authorization_code_trace",
      traceAuthorizationCode("route_body_received", rawCode)
    );

    const code = rawCode.trim();
    const trimComparison = compareAuthorizationCodes(rawCode, code, "route_trim");

    metaLogger.info("authorization_code_trace", trimComparison);

    const wabaId = req.body?.wabaId ? String(req.body.wabaId).trim() : undefined;
    const phoneNumberId = req.body?.phoneNumberId
      ? String(req.body.phoneNumberId).trim()
      : undefined;
    const businessId = req.body?.businessId ? String(req.body.businessId).trim() : undefined;
    const onboardingType = req.body?.onboardingType
      ? String(req.body.onboardingType).trim()
      : "whatsapp_business_app";
    const redirectUri = req.body?.redirectUri ? String(req.body.redirectUri).trim() : undefined;
    const attemptId = req.body?.attemptId ? String(req.body.attemptId).trim() : null;

    const allowedOnboardingTypes = new Set(["whatsapp_business_app"]);

    if (!allowedOnboardingTypes.has(onboardingType)) {
      return res.status(400).json({
        error: "INVALID_ONBOARDING_TYPE",
        message: "Unsupported onboarding type."
      });
    }

    const organizationId = await whatsappIntegrationService.resolveOrganizationId(
      req.authContext,
      req
    );

    const ownershipMode =
      req.body?.ownershipMode === "organization" &&
      hasPermission(req.authContext, PERMISSIONS.ORG_WRITE)
        ? "organization"
        : "personal";

    metaLogger.info("embedded_signup_exchange_requested", {
      organizationId,
      userId: req.authContext?.userId || null,
      ownershipMode,
      attemptId,
      homeOrganizationId: req.tenantContext?.homeOrganizationId || null,
      supportMode: Boolean(req.supportContext?.organizationId)
    });

    if (ownershipMode === "personal") {
      const {
        resolveAgentCapabilitiesFromUser
      } = require("../core/agentCapabilitiesEngine");
      const { findUserById } = require("../services/atlasUserService");
      const actor =
        req.authContext?.user ||
        (await findUserById(req.authContext?.userId).catch(() => null)) ||
        req.sanitizedUser;
      const caps = resolveAgentCapabilitiesFromUser(actor);
      if (!caps.personalWhatsAppEnabled) {
        return res.status(403).json({
          error: "PERSONAL_WHATSAPP_DISABLED",
          message:
            "Personal WhatsApp is not enabled for this user. Ask an RVP/Admin to enable it."
        });
      }
    }

    const result = await completeEmbeddedSignupExchange({
      organizationId,
      userId: req.authContext?.userId || null,
      ownershipMode,
      code,
      wabaId,
      phoneNumberId,
      businessId,
      onboardingType,
      redirectUri
    });

    metaLogger.info("embedded_signup_exchange_completed", {
      organizationId,
      userId: req.authContext?.userId || null,
      ownershipMode,
      attemptId,
      wabaId: result?.connection?.wabaId || wabaId || null,
      phoneNumberId: result?.connection?.phoneNumberId || phoneNumberId || null
    });

    res.json(result);
  } catch (error) {
    if (error.code === "META_ENV_INVALID") {
      return res.status(500).json({
        error: "META_CONFIG_MISSING",
        message: "Meta embedded signup environment is not fully configured.",
        missing: error.missing || []
      });
    }

    if (error.response) {
      const sanitized = sanitizeMetaError(error);
      return res.status(error.response.status || 502).json(sanitized);
    }

    if (error.stage) {
      const graphDetails = extractGraphErrorDetails(error);

      return res.status(error.statusCode || 500).json({
        error: error.publicCode || error.stage,
        stage: error.stage,
        recoverable: Boolean(error.recoverable),
        message: error.message,
        metaGraphStatus: error.metaGraphStatus ?? graphDetails.graphStatus ?? null,
        metaGraphError: error.metaGraphError ?? graphDetails.graphError ?? null,
        metaGraphResponse: error.metaGraphResponse ?? graphDetails.graphResponseBody ?? null
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.publicCode || "EXCHANGE_FAILED",
        message: error.message
      });
    }

    metaLogger.error("embedded_signup_exchange_failed", { message: error.message });
    res.status(500).json({
      error: "EXCHANGE_FAILED",
      message: "WhatsApp embedded signup exchange failed."
    });
  }
});

module.exports = router;
