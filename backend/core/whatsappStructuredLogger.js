/**
 * Sprint 11.1 — Structured logging for live WhatsApp pipeline validation.
 */

function logWhatsAppStage(stage, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    component: "whatsapp_pipeline",
    stage,
    ...details
  };

  if (details.level === "error") {
    console.error(JSON.stringify(entry));
    return;
  }

  console.log(JSON.stringify(entry));
}

module.exports = {
  logWhatsAppStage
};
