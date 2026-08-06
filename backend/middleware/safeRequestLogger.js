/**
 * Production Security — Avoid logging phone numbers and raw paths in production access logs.
 */

function sanitizeUrl(url = "") {
  return String(url)
    .replace(/\/api\/mission-control\/[^/?]+/gi, "/api/mission-control/[redacted]")
    .replace(/\/api\/prospect-workspace\/[^/?]+/gi, "/api/prospect-workspace/[redacted]")
    .replace(/\/api\/communications-center\/[^/?]+/gi, "/api/communications-center/[redacted]")
    .replace(/\/timeline\/[^/?]+/gi, "/timeline/[redacted]")
    .replace(/\/api\/prospects\/[^/?]+/gi, "/api/prospects/[redacted]");
}

function safeRequestLogger(req, res, next) {
  const path = process.env.NODE_ENV === "production" ? sanitizeUrl(req.originalUrl) : req.originalUrl;
  console.log(`[${new Date().toISOString()}] ${req.method} ${path}`);
  next();
}

module.exports = {
  safeRequestLogger,
  sanitizeUrl
};
