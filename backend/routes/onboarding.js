/**
 * Journey #1 — Onboarding and home dashboard routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const {
  signupWithPassword,
  loginWithPassword,
  createSessionForUser,
  findUserBySessionToken
} = require("../services/atlasUserService");
const { extractBearerToken } = require("../middleware/requireAtlasUser");
const {
  createOrganizationForUser,
  markMetaConnected,
  markCalendarConnected,
  saveMeetingPreferences,
  activateOrganization,
  getOrganizationForUser,
  serializeOrganization
} = require("../services/organizationService");
const {
  getOnboardingStatus,
  getHomeDashboardSummary
} = require("../services/onboardingService");
const googleCalendarOAuthService = require("../services/googleCalendarOAuthService");

const router = express.Router();

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name
  };
}

router.post("/auth/signup", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");
    const displayName = req.body?.displayName ? String(req.body.displayName).trim() : null;

    if (!email || !password) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Email and password are required."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Password must be at least 8 characters."
      });
    }

    const user = await signupWithPassword({ email, password, displayName });
    const session = await createSessionForUser(user.id);

    return res.status(201).json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: serializeUser(user)
    });
  } catch (error) {
    if (error.code === "EMAIL_EXISTS") {
      return res.status(409).json({
        error: "EMAIL_EXISTS",
        message: "An account with this email already exists."
      });
    }

    console.error("[auth/signup]", error.message);
    return res.status(500).json({ error: "SIGNUP_FAILED", message: error.message });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Email and password are required."
      });
    }

    const user = await loginWithPassword(email, password);

    if (!user) {
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Invalid email or password."
      });
    }

    const session = await createSessionForUser(user.id);

    return res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: serializeUser(user)
    });
  } catch (error) {
    console.error("[auth/login]", error.message);
    return res.status(500).json({ error: "LOGIN_FAILED", message: error.message });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const user = await findUserBySessionToken(token);

    if (!user) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const organization = await getOrganizationForUser(user.id);

    return res.json({
      ...serializeUser(user),
      organization: serializeOrganization(organization)
    });
  } catch (error) {
    console.error("[auth/me]", error.message);
    return res.status(500).json({ error: "AUTH_ERROR" });
  }
});

router.get("/onboarding/status", requireAtlasUser, async (req, res) => {
  try {
    const status = await getOnboardingStatus(req.atlasUser);
    return res.json(status);
  } catch (error) {
    console.error("[onboarding/status]", error.message);
    return res.status(500).json({ error: "ONBOARDING_STATUS_FAILED", message: error.message });
  }
});

router.post("/onboarding/organization", requireAtlasUser, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();

    if (!name) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Organization name is required."
      });
    }

    const organization = await createOrganizationForUser(req.atlasUser.id, name);

    return res.status(201).json({
      organization: serializeOrganization(organization)
    });
  } catch (error) {
    console.error("[onboarding/organization]", error.message);
    return res.status(500).json({ error: "ORG_CREATE_FAILED", message: error.message });
  }
});

router.post("/onboarding/meta/complete", requireAtlasUser, async (req, res) => {
  try {
    const organization = await getOrganizationForUser(req.atlasUser.id);

    if (!organization) {
      return res.status(400).json({ error: "NO_ORGANIZATION" });
    }

    const whatsappStatus = req.body?.whatsappStatus
      ? String(req.body.whatsappStatus).trim()
      : undefined;

    const updated = await markMetaConnected(organization.id, { whatsappStatus });

    return res.json({
      organization: serializeOrganization(updated)
    });
  } catch (error) {
    console.error("[onboarding/meta/complete]", error.message);
    return res.status(500).json({ error: "META_COMPLETE_FAILED", message: error.message });
  }
});

router.get("/onboarding/calendar/connect", requireAtlasUser, async (req, res) => {
  try {
    const organization = await getOrganizationForUser(req.atlasUser.id);

    if (!organization) {
      return res.status(400).json({ error: "NO_ORGANIZATION" });
    }

    const state = googleCalendarOAuthService.encodeOAuthState({
      organizationId: organization.id,
      userId: req.atlasUser.id
    });

    const url = googleCalendarOAuthService.buildAuthorizationUrl(state);

    return res.json({ url });
  } catch (error) {
    console.error("[onboarding/calendar/connect]", error.message);
    return res.status(500).json({ error: "CALENDAR_CONNECT_FAILED", message: error.message });
  }
});

router.get("/onboarding/calendar/callback", async (req, res) => {
  const frontendBase = googleCalendarOAuthService.getFrontendBaseUrl();

  try {
    const code = String(req.query.code || "");
    const statePayload = googleCalendarOAuthService.decodeOAuthState(req.query.state);

    if (!code || !statePayload?.organizationId) {
      return res.redirect(`${frontendBase}/onboarding/calendar?error=oauth_failed`);
    }

    const refreshToken = await googleCalendarOAuthService.exchangeAuthorizationCode(code);
    await markCalendarConnected(statePayload.organizationId, refreshToken);

    return res.redirect(`${frontendBase}/onboarding/calendar?connected=1`);
  } catch (error) {
    console.error("[onboarding/calendar/callback]", error.message);
    return res.redirect(`${frontendBase}/onboarding/calendar?error=oauth_failed`);
  }
});

router.put("/onboarding/meeting-preferences", requireAtlasUser, async (req, res) => {
  try {
    const organization = await getOrganizationForUser(req.atlasUser.id);

    if (!organization) {
      return res.status(400).json({ error: "NO_ORGANIZATION" });
    }

    const updated = await saveMeetingPreferences(organization.id, req.body || {});

    return res.json({
      organization: serializeOrganization(updated)
    });
  } catch (error) {
    console.error("[onboarding/meeting-preferences]", error.message);
    return res.status(500).json({ error: "MEETING_PREFS_FAILED", message: error.message });
  }
});

router.post("/onboarding/activate", requireAtlasUser, async (req, res) => {
  try {
    const organization = await getOrganizationForUser(req.atlasUser.id);

    if (!organization) {
      return res.status(400).json({ error: "NO_ORGANIZATION" });
    }

    const updated = await activateOrganization(organization.id);

    return res.json({
      organization: serializeOrganization(updated)
    });
  } catch (error) {
    console.error("[onboarding/activate]", error.message);
    return res.status(500).json({ error: "ACTIVATE_FAILED", message: error.message });
  }
});

router.get("/home/summary", requireAtlasUser, async (req, res) => {
  try {
    const summary = await getHomeDashboardSummary(req.atlasUser);
    return res.json(summary);
  } catch (error) {
    console.error("[home/summary]", error.message);
    return res.status(500).json({ error: "HOME_SUMMARY_FAILED", message: error.message });
  }
});

module.exports = router;
