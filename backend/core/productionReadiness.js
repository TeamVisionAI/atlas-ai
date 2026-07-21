/**
 * Production MVP pipeline readiness checks.
 * Used by /health/production and backend/dev/verifyProductionPipeline.js
 */

const { resolveWhatsAppSendCredentials } = require("./whatsappSendCredentials");

function isPresent(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function checkSupabase() {
  const ok =
    isPresent(process.env.SUPABASE_URL) && isPresent(process.env.SUPABASE_ANON_KEY);

  return {
    id: "supabase",
    label: "Supabase database",
    ok,
    blocker: true,
    detail: ok ? "configured" : "SUPABASE_URL and SUPABASE_ANON_KEY required"
  };
}

function checkWebhook() {
  const verifyToken = isPresent(process.env.VERIFY_TOKEN);
  const appSecret = isPresent(process.env.META_APP_SECRET);

  return {
    id: "whatsapp_webhook",
    label: "WhatsApp webhook",
    ok: verifyToken,
    blocker: true,
    detail: verifyToken
      ? appSecret
        ? "VERIFY_TOKEN set; signature validation enabled"
        : "VERIFY_TOKEN set; META_APP_SECRET missing (signatures skipped)"
      : "VERIFY_TOKEN missing"
  };
}

async function checkWhatsAppSend() {
  const credentials = await resolveWhatsAppSendCredentials();

  return {
    id: "whatsapp_send",
    label: "WhatsApp outbound credentials",
    ok: Boolean(credentials?.accessToken && credentials?.phoneNumberId),
    blocker: true,
    detail: credentials
      ? `source=${credentials.source}, phone_number_id=${credentials.phoneNumberId}`
      : "No Embedded Signup connection and WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID unset"
  };
}

function checkGoogleCalendar() {
  const keys = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_REFRESH_TOKEN"
  ];
  const missing = keys.filter((key) => !isPresent(process.env[key]));
  const ok = missing.length === 0;

  return {
    id: "google_calendar",
    label: "Google Calendar interview booking",
    ok,
    blocker: true,
    detail: ok ? "all GOOGLE_* vars configured" : `missing: ${missing.join(", ")}`
  };
}

function checkMetaEmbeddedSignup() {
  const required = ["META_APP_ID", "META_APP_SECRET"];
  const missing = required.filter((key) => !isPresent(process.env[key]));
  const ok = missing.length === 0;

  return {
    id: "meta_embedded_signup",
    label: "Meta Embedded Signup",
    ok,
    blocker: false,
    detail: ok ? "META_APP_ID and META_APP_SECRET configured" : `missing: ${missing.join(", ")}`
  };
}

function checkContactForm() {
  const ok = isPresent(process.env.RESEND_API_KEY);

  return {
    id: "contact_form",
    label: "Public contact form (Resend)",
    ok,
    blocker: false,
    detail: ok ? "RESEND_API_KEY configured" : "missing (public site contact form disabled in prod)"
  };
}

/**
 * @returns {Promise<{ ready: boolean, mvpReady: boolean, checks: Array, blockers: string[] }>}
 */
async function evaluateProductionReadiness() {
  const checks = [
    checkSupabase(),
    checkWebhook(),
    await checkWhatsAppSend(),
    checkGoogleCalendar(),
    checkMetaEmbeddedSignup(),
    checkContactForm()
  ];

  const blockers = checks.filter((c) => c.blocker && !c.ok).map((c) => c.id);
  const mvpBlockers = blockers.filter((id) =>
    ["supabase", "whatsapp_webhook", "whatsapp_send", "google_calendar"].includes(id)
  );

  return {
    ready: blockers.length === 0,
    mvpReady: mvpBlockers.length === 0,
    checks,
    blockers,
    mvpBlockers,
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  evaluateProductionReadiness,
  checkSupabase,
  checkWebhook,
  checkWhatsAppSend,
  checkGoogleCalendar
};
