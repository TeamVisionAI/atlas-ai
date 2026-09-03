/**
 * Public QR Channel entry routes — Phase 1.
 * GET  /go/:token
 * POST /go/:token/bind
 *
 * No appointment mutation. No Recruit AI mutation. Execution unchanged.
 */

const express = require("express");
const {
  createQrCampaignService
} = require("../core/qrChannel/qrCampaignService");
const {
  createSupabaseQrChannelRepository
} = require("../core/qrChannel/supabaseQrChannelRepository");
const {
  renderPhoneBindInterstitial,
  renderSafeErrorPage
} = require("../core/qrChannel/interstitialHtml");
const {
  resolveQrInterstitialBranding
} = require("../core/qrChannel/qrInterstitialBranding");
const { REASON_CODES } = require("../core/qrChannel/constants");
const { emitQrEvent, EVENTS } = require("../core/qrChannel/qrChannelTelemetry");

const router = express.Router();

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_GET_MAX = 60;
const RATE_LIMIT_POST_MAX = 30;
const getLog = new Map();
const postLog = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

function isRateLimited(map, ip, max) {
  const now = Date.now();
  const history = (map.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (history.length >= max) {
    map.set(ip, history);
    return true;
  }
  history.push(now);
  map.set(ip, history);
  return false;
}

async function resolvePublicQrBranding(campaign = null) {
  const organizationId = campaign?.org_id || null;
  let organizationDisplayName = null;
  if (organizationId) {
    try {
      const branding = await require("../services/organizationBrandingService").getOrganizationBranding(
        organizationId
      );
      organizationDisplayName = branding?.name || null;
    } catch {
      organizationDisplayName = null;
    }
  }
  return resolveQrInterstitialBranding({
    organizationId,
    organizationDisplayName
  });
}

function getService() {
  if (router._testService) {
    return router._testService;
  }
  return createQrCampaignService({
    repository: createSupabaseQrChannelRepository()
  });
}

function errorCopy(reasonCode) {
  switch (reasonCode) {
    case REASON_CODES.CAMPAIGN_INACTIVE:
      return {
        status: 410,
        title: "Enlace inactivo",
        body: "Este código QR ya no está activo."
      };
    case REASON_CODES.RATE_LIMITED:
      return {
        status: 429,
        title: "Demasiados intentos",
        body: "Espera un momento e inténtalo de nuevo."
      };
    case REASON_CODES.PHONE_INVALID:
      return {
        status: 400,
        title: "Número no válido",
        body: "Revisa tu número de WhatsApp e inténtalo de nuevo."
      };
    case REASON_CODES.SCAN_EXPIRED:
      return {
        status: 410,
        title: "Sesión expirada",
        body: "Vuelve a escanear el código QR."
      };
    case REASON_CODES.DESTINATION_CONFIG_MISSING:
    case REASON_CODES.DESTINATION_CONFIG_MALFORMED:
    case REASON_CODES.DESTINATION_NOT_ALLOWLISTED:
    case REASON_CODES.REDIRECT_NOT_ALLOWLISTED:
      return {
        status: 503,
        title: "Servicio no disponible",
        body: "WhatsApp no está disponible en este momento. Inténtalo más tarde."
      };
    default:
      return {
        status: 404,
        title: "Enlace no disponible",
        body: "Este enlace no está disponible."
      };
  }
}

router.get("/:token", async (req, res) => {
  try {
    const ip = getClientIp(req);
    if (isRateLimited(getLog, ip, RATE_LIMIT_GET_MAX)) {
      emitQrEvent(EVENTS.SCAN_INVALID, {
        reasonCode: REASON_CODES.RATE_LIMITED,
        outcome: "rate_limited"
      });
      const copy = errorCopy(REASON_CODES.RATE_LIMITED);
      return res.status(copy.status).type("html").send(renderSafeErrorPage(copy));
    }

    // Explicitly ignore forged attribution query params (source/campaign/goal).
    void req.query;

    const service = getService();
    const result = await service.startPublicEntry(req.params.token);
    if (!result.ok) {
      const copy = errorCopy(result.reasonCode);
      return res.status(copy.status).type("html").send(renderSafeErrorPage(copy));
    }

    const branding = await resolvePublicQrBranding(result.campaign);
    const html = renderPhoneBindInterstitial({
      token: req.params.token,
      scanId: result.scan.id,
      bindMac: result.bindMac,
      branding
    });
    return res.status(200).type("html").send(html);
  } catch (error) {
    console.error("[qr-go] GET failed", { message: error.message });
    const copy = errorCopy(REASON_CODES.TOKEN_INVALID);
    return res.status(500).type("html").send(renderSafeErrorPage(copy));
  }
});

router.post("/:token/bind", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const ip = getClientIp(req);
    if (isRateLimited(postLog, ip, RATE_LIMIT_POST_MAX)) {
      emitQrEvent(EVENTS.PHONE_BIND_FAILED, {
        reasonCode: REASON_CODES.RATE_LIMITED,
        outcome: "rate_limited"
      });
      const copy = errorCopy(REASON_CODES.RATE_LIMITED);
      return res.status(copy.status).type("html").send(renderSafeErrorPage(copy));
    }

    void req.query;

    const service = getService();
    // Re-resolve token so bind cannot jump orgs via forged scan id alone without matching form token.
    const resolved = await service.resolvePublicToken(req.params.token);
    if (!resolved.ok) {
      const copy = errorCopy(resolved.reasonCode);
      return res.status(copy.status).type("html").send(renderSafeErrorPage(copy));
    }

    const result = await service.bindPhoneAndRedirect({
      scanId: req.body?.scanId,
      bindMac: req.body?.bindMac,
      rawPhone: req.body?.phone,
      expectedOrgId: resolved.campaign.org_id
    });

    if (!result.ok) {
      if (
        result.reasonCode === REASON_CODES.PHONE_INVALID ||
        result.reasonCode === REASON_CODES.BIND_MAC_INVALID ||
        result.reasonCode === REASON_CODES.SCAN_WRONG_STATUS
      ) {
        // Re-create a fresh scan so the user can retry without a dead form.
        const restarted = await service.startPublicEntry(req.params.token);
        if (restarted.ok) {
          const copy = errorCopy(result.reasonCode);
          const branding = await resolvePublicQrBranding(resolved.campaign);
          const html = renderPhoneBindInterstitial({
            token: req.params.token,
            scanId: restarted.scan.id,
            bindMac: restarted.bindMac,
            branding,
            errorMessage: copy.body
          });
          return res.status(400).type("html").send(html);
        }
      }
      const copy = errorCopy(result.reasonCode);
      return res.status(copy.status).type("html").send(renderSafeErrorPage(copy));
    }

    return res.redirect(302, result.redirectUrl);
  } catch (error) {
    console.error("[qr-go] POST bind failed", { message: error.message });
    const copy = errorCopy(REASON_CODES.TOKEN_INVALID);
    return res.status(500).type("html").send(renderSafeErrorPage(copy));
  }
});

/** Test hook — inject memory service without touching production wiring. */
router.setTestService = (service) => {
  router._testService = service;
};

module.exports = router;
