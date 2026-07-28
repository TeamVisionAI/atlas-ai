/**
 * LC1 — Authentication routes (login, logout, session, password reset).
 */

const express = require("express");
const router = express.Router();
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const {
  loginWithPassword,
  logoutSession,
  requestPasswordReset,
  confirmPasswordReset,
  validateInvitationToken,
  acceptInvitation
} = require("../services/authService");

router.post("/auth/login", async (req, res) => {
  try {
    const result = await loginWithPassword({
      email: req.body?.email,
      password: req.body?.password,
      rememberMe: Boolean(req.body?.rememberMe),
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json({
      token: result.session.token,
      expiresAt: result.session.expiresAt,
      rememberMe: result.session.rememberMe,
      user: result.user
    });
  } catch (error) {
    const status = error.statusCode || 500;

    if (status >= 500) {
      console.error("[auth/login]", error.message);
    }

    return res.status(status).json({
      error: error.publicCode || "LOGIN_FAILED",
      message: error.message || "Unable to sign in."
    });
  }
});

router.post("/auth/logout", requireAtlasUser, async (req, res) => {
  try {
    await logoutSession(req.atlasSessionToken, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("[auth/logout]", error.message);
    return res.status(500).json({ error: "LOGOUT_FAILED" });
  }
});

router.get("/auth/me", requireAtlasUser, async (req, res) => {
  return res.json(req.sanitizedUser);
});

router.post("/auth/password-reset/request", async (req, res) => {
  try {
    const result = await requestPasswordReset(req.body?.email, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.json(result);
  } catch (error) {
    console.error("[auth/password-reset/request]", error.message);
    return res.status(500).json({ error: "PASSWORD_RESET_FAILED" });
  }
});

router.post("/auth/password-reset/confirm", async (req, res) => {
  try {
    const result = await confirmPasswordReset({
      token: req.body?.token,
      newPassword: req.body?.newPassword,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "PASSWORD_RESET_FAILED",
      message: error.message
    });
  }
});

router.get("/auth/invitation/validate", async (req, res) => {
  try {
    const result = await validateInvitationToken(req.query.token);
    return res.json(result);
  } catch (error) {
    console.error("[auth/invitation/validate] unhandled failure", {
      message: error.message,
      code: error.code
    });
    return res.status(500).json({ error: "INVITATION_VALIDATION_FAILED" });
  }
});

router.post("/auth/invitation/accept", async (req, res) => {
  try {
    const result = await acceptInvitation({
      token: req.body?.token,
      password: req.body?.password,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json({
      token: result.session.token,
      expiresAt: result.session.expiresAt,
      user: result.user
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "INVITATION_FAILED",
      message: error.message
    });
  }
});

module.exports = router;
