const express = require("express");
const { submitContactForm } = require("../services/contactFormService");

const router = express.Router();

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const requestLog = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const history = (requestLog.get(ip) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );

  if (history.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, history);
    return true;
  }

  history.push(now);
  requestLog.set(ip, history);
  return false;
}

router.post("/", async (req, res, next) => {
  const traceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    console.log(`[contact-form][trace:${traceId}] 1. POST /api/contact received`, {
      ip: getClientIp(req),
      bodyKeys: Object.keys(req.body || {}),
      hasWebsiteField: Object.prototype.hasOwnProperty.call(req.body || {}, "website"),
    });

    const clientIp = getClientIp(req);

    if (isRateLimited(clientIp)) {
      console.warn(`[contact-form][trace:${traceId}] blocked by rate limit`, { ip: clientIp });
      return res.status(429).json({
        ok: false,
        error: "Too many submissions. Please try again later.",
      });
    }

    console.log(`[contact-form][trace:${traceId}] 2. calling submitContactForm()`);
    const result = await submitContactForm(req.body, { traceId });

    console.log(`[contact-form][trace:${traceId}] 3. submitContactForm result`, result);

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        errors: result.errors,
      });
    }

    console.log(`[contact-form][trace:${traceId}] 4. responding 200 ok:true`, {
      spam: Boolean(result.spam),
      delivery: result.delivery || null,
    });

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    console.error(`[contact-form][trace:${traceId}] exception in route handler`, {
      message: error.message,
      status: error.status,
      stack: error.stack,
      cause: error.cause,
    });
    return next(error);
  }
});

module.exports = router;
