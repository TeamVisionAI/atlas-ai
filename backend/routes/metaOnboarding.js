/**
 * Sprint 6 / 6.1 — Meta Embedded Signup API routes (thin layer).
 */

const express = require("express");
const {
  completeEmbeddedSignupExchange,
  attachWhatsAppFromEmbeddedSignup,
  getEmbeddedSignupStatus,
  sanitizeMetaError
} = require("../core/metaEmbeddedSignupService");
const {
  isRateLimited,
  fingerprintAuthorizationCode,
  recordCodeFingerprintAttempt
} = require("../core/metaEmbeddedSignupRateLimit");
const { checkMetaConnectionHealth } = require("../core/meta/metaConnectionHealthService");
const { metaLogger } = require("../core/meta/metaLogger");

const router = express.Router();

router.get("/embedded-signup/status", async (req, res) => {
  try {
    const payload = await getEmbeddedSignupStatus();
    res.json(payload);
  } catch (error) {
    metaLogger.error("embedded_signup_status_failed", { message: error.message });
    res.status(500).json({ error: "Failed to load WhatsApp connection status." });
  }
});

router.get("/embedded-signup/health", async (req, res) => {
  try {
    const payload = await checkMetaConnectionHealth();
    res.json(payload);
  } catch (error) {
    metaLogger.error("embedded_signup_health_failed", { message: error.message });
    res.status(500).json({ error: "Failed to check WhatsApp connection health." });
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

    const code = req.body?.code;
    const requestReceivedAt = Date.now();
    const codeIssuedAt = Number(req.body?.codeIssuedAt);

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        error: "CODE_REQUIRED",
        message: "Authorization code is required."
      });
    }

    const trimmedCode = code.trim();
    const codeFingerprint = fingerprintAuthorizationCode(trimmedCode);
    const fingerprintAttempt = recordCodeFingerprintAttempt(codeFingerprint);
    const elapsedSinceCodeIssuedMs =
      Number.isFinite(codeIssuedAt) && codeIssuedAt > 0
        ? requestReceivedAt - codeIssuedAt
        : null;

    metaLogger.info("embedded_signup_exchange_request", {
      requestReceivedAt: new Date(requestReceivedAt).toISOString(),
      appId: process.env.META_APP_ID || null,
      codeLength: trimmedCode.length,
      codeFingerprint,
      duplicateFingerprintAttempt: fingerprintAttempt.duplicate,
      fingerprintAttemptCount: fingerprintAttempt.attemptCount,
      fingerprintFirstAttemptAt: new Date(fingerprintAttempt.firstAttemptAt).toISOString(),
      elapsedSinceCodeIssuedMs
    });

    const wabaId = req.body?.wabaId ? String(req.body.wabaId).trim() : undefined;
    const phoneNumberId = req.body?.phoneNumberId
      ? String(req.body.phoneNumberId).trim()
      : undefined;
    const onboardingType = req.body?.onboardingType
      ? String(req.body.onboardingType).trim()
      : "whatsapp_business_app";

    const allowedOnboardingTypes = new Set(["whatsapp_business_app"]);

    if (!allowedOnboardingTypes.has(onboardingType)) {
      return res.status(400).json({
        error: "INVALID_ONBOARDING_TYPE",
        message: "Unsupported onboarding type."
      });
    }

    const result = await completeEmbeddedSignupExchange({
      code: trimmedCode,
      wabaId,
      phoneNumberId,
      onboardingType
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
      return res.status(error.statusCode || 500).json({
        error: error.publicCode || error.stage,
        stage: error.stage,
        recoverable: Boolean(error.recoverable),
        message: error.message
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

router.post("/embedded-signup/whatsapp-attach", async (req, res) => {
  try {
    const wabaId = req.body?.wabaId ? String(req.body.wabaId).trim() : undefined;
    const phoneNumberId = req.body?.phoneNumberId
      ? String(req.body.phoneNumberId).trim()
      : undefined;
    const onboardingType = req.body?.onboardingType
      ? String(req.body.onboardingType).trim()
      : "whatsapp_business_app";

    if (!wabaId || !phoneNumberId) {
      return res.status(400).json({
        error: "WHATSAPP_ASSETS_REQUIRED",
        message: "WhatsApp Business Account ID and phone number ID are required."
      });
    }

    const result = await attachWhatsAppFromEmbeddedSignup({
      wabaId,
      phoneNumberId,
      onboardingType
    });

    res.json(result);
  } catch (error) {
    if (error.stage) {
      return res.status(error.statusCode || 500).json({
        error: error.publicCode || error.stage,
        stage: error.stage,
        recoverable: Boolean(error.recoverable),
        message: error.message
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.publicCode || "WHATSAPP_ATTACH_FAILED",
        message: error.message
      });
    }

    metaLogger.error("embedded_signup_whatsapp_attach_failed", { message: error.message });
    res.status(500).json({
      error: "WHATSAPP_ATTACH_FAILED",
      message: "Unable to attach WhatsApp Business assets."
    });
  }
});

module.exports = router;
