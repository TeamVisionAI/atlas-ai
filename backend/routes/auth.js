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
const { isSuperAdmin } = require("../security/saasRoles");

function withPlatformIdentity(payload, req) {
  return {
    ...payload,
    saasRole: req.authContext?.saasRole || null,
    isSuperAdmin: isSuperAdmin(req.authContext?.saasRole)
  };
}

router.post("/auth/login", async (req, res) => {
  try {
    const result = await loginWithPassword({
      identifier: req.body?.identifier ?? req.body?.email,
      password: req.body?.password,
      organizationId: req.body?.organizationId ?? req.body?.organization_id ?? null,
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
  try {
    const {
      getSecuritiesAccessSummary,
      canVerifySecuritiesAuthorization
    } = require("../security/securitiesAccessService");

    const securities = await getSecuritiesAccessSummary(req.authContext);
    const canVerify = await canVerifySecuritiesAuthorization(req.authContext);
    const {
      resolveAgentCapabilitiesFromUser
    } = require("../core/agentCapabilitiesEngine");
    const agentCaps = resolveAgentCapabilitiesFromUser(req.sanitizedUser);

    return res.json(
      withPlatformIdentity(
        {
          ...req.sanitizedUser,
          agent_capabilities: agentCaps,
          securities_access_status: securities.securities_access_status,
          securities_access_verified: securities.securities_access_verified,
          permitted_product_scope: securities.permitted_product_scope,
          effective_to: securities.effective_to,
          capabilities: {
            canAccessSecuritiesContent: securities.canAccessSecuritiesContent === true,
            canVerifySecuritiesAuthorization: canVerify === true,
            ...agentCaps
          }
        },
        req
      )
    );
  } catch (error) {
    console.error("[auth/me] securities summary failed", error.message);
    const {
      resolveAgentCapabilitiesFromUser,
      DEFAULT_AGENT_CAPABILITIES
    } = require("../core/agentCapabilitiesEngine");
    const agentCaps = resolveAgentCapabilitiesFromUser(req.sanitizedUser) || {
      ...DEFAULT_AGENT_CAPABILITIES
    };
    return res.json(
      withPlatformIdentity(
        {
          ...req.sanitizedUser,
          agent_capabilities: agentCaps,
          securities_access_status: "UNKNOWN",
          securities_access_verified: false,
          permitted_product_scope: [],
          effective_to: null,
          capabilities: {
            canAccessSecuritiesContent: false,
            canVerifySecuritiesAuthorization: false,
            ...agentCaps
          }
        },
        req
      )
    );
  }
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
