/**
 * Sprint 11.1 — Meta webhook signature verification (x-hub-signature-256).
 * Requires express.raw() on the webhook route so req.body is a Buffer.
 */

const crypto = require("crypto");
const { logWhatsAppStage } = require("../core/whatsappStructuredLogger");

function verifyMetaWebhookSignature(req, res, next) {
  console.log(">>> Signature middleware reached");
  console.log("Header:", req.get("x-hub-signature-256"));
  console.log("Has META_APP_SECRET:", !!process.env.META_APP_SECRET);

  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    logWhatsAppStage("signature_skipped", {
      reason: "META_APP_SECRET not configured"
    });
    return next();
  }

  const signatureHeader = req.get("x-hub-signature-256");

  if (!signatureHeader) {
    logWhatsAppStage("signature_rejected", { reason: "missing_header", level: "error" });
    return res.sendStatus(403);
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    logWhatsAppStage("signature_rejected", { reason: "mismatch", level: "error" });
    return res.sendStatus(403);
  }

  logWhatsAppStage("signature_verified");
  return next();
}

module.exports = {
  verifyMetaWebhookSignature
};
