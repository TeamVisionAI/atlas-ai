/**
 * LC1.1 — Transactional email delivery (Resend).
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const { resolveFrontendBaseUrl } = require("../config/frontendBaseUrl");

function getEmailConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail:
      process.env.ATLAS_EMAIL_FROM ||
      process.env.CONTACT_FORM_FROM_EMAIL ||
      "Team Vision Financial <notifications@teamvisionfinancial.com>"
  };
}

function getFrontendBaseUrl() {
  return resolveFrontendBaseUrl();
}

async function sendEmail({ to, subject, text, html }) {
  const { apiKey, fromEmail } = getEmailConfig();

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      const error = new Error("Email delivery is not configured.");
      error.statusCode = 503;
      throw error;
    }

    console.warn("[email] dev-log mode — email not sent", { to, subject });
    return { delivered: false, mode: "dev-log" };
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Email delivery failed (${response.status})`);
    error.statusCode = 502;
    error.details = body;
    throw error;
  }

  return { delivered: true, mode: "resend" };
}

async function sendInvitationEmail({ email, firstName, token, expiresAt }) {
  const link = `${getFrontendBaseUrl()}/app/accept-invitation?token=${encodeURIComponent(token)}`;
  const subject = "Welcome to Atlas — Create Your Password";
  const text = [
    `Hello ${firstName || "there"},`,
    "",
    "You have been invited to Atlas by Team Vision.",
    "",
    "Create your password using the secure link below:",
    link,
    "",
    `This invitation expires on ${expiresAt}.`,
    "",
    "If you did not expect this email, you can ignore it."
  ].join("\n");

  return sendEmail({ to: email, subject, text });
}

async function sendPasswordResetEmail({ email, firstName, token, expiresAt }) {
  const link = `${getFrontendBaseUrl()}/app/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Atlas — Reset Your Password";
  const text = [
    `Hello ${firstName || "there"},`,
    "",
    "We received a request to reset your Atlas password.",
    "",
    "Use this secure link to create a new password:",
    link,
    "",
    `This link expires on ${expiresAt}. It can only be used once.`,
    "",
    "If you did not request this, you can ignore this email."
  ].join("\n");

  return sendEmail({ to: email, subject, text });
}

module.exports = {
  sendEmail,
  sendInvitationEmail,
  sendPasswordResetEmail,
  getFrontendBaseUrl
};
