const { validateContactSubmission } = require("../core/contactFormValidation");

const RESEND_API_URL = "https://api.resend.com/emails";

function getDeliveryConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail:
      process.env.CONTACT_FORM_FROM_EMAIL ||
      "Team Vision Financial <notifications@teamvisionfinancial.com>",
    toEmail: process.env.CONTACT_FORM_TO_EMAIL || "contact@teamvisionfinancial.com",
  };
}

function buildEmailText({ name, email, message }) {
  return [
    "New contact form submission — teamvisionfinancial.com",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    "",
    "Message:",
    message,
  ].join("\n");
}

async function sendContactEmail(submission, { traceId } = {}) {
  const { apiKey, fromEmail, toEmail } = getDeliveryConfig();
  const logPrefix = traceId ? `[contact-form][trace:${traceId}]` : "[contact-form]";

  console.log(`${logPrefix} 5. sendContactEmail config`, {
    apiKeyPresent: Boolean(apiKey),
    apiKeyLength: apiKey ? apiKey.length : 0,
    fromEmail,
    toEmail,
    nodeEnv: process.env.NODE_ENV || "(unset)",
  });

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      const error = new Error("Contact form email is not configured.");
      error.status = 503;
      console.error(`${logPrefix} RESEND_API_KEY missing in production — throwing 503`);
      throw error;
    }

    console.warn(`${logPrefix} 6. SKIPPED Resend call — no RESEND_API_KEY (dev-log mode)`, submission);
    return { delivered: false, mode: "dev-log" };
  }

  const payload = {
    from: fromEmail,
    to: [toEmail],
    reply_to: submission.email,
    subject: `Website contact: ${submission.name}`,
    text: buildEmailText(submission),
  };

  console.log(`${logPrefix} 6. sending HTTP POST to Resend`, {
    url: RESEND_API_URL,
    from: payload.from,
    to: payload.to,
    reply_to: payload.reply_to,
    subject: payload.subject,
  });

  let response;

  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`${logPrefix} 7. Resend fetch threw`, {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    });
    throw error;
  }

  const responseBody = await response.text().catch(() => "");

  console.log(`${logPrefix} 7. Resend response`, {
    status: response.status,
    statusText: response.statusText,
    body: responseBody,
  });

  if (!response.ok) {
    const error = new Error("Failed to deliver contact form submission.");
    error.status = 502;
    error.cause = { status: response.status, body: responseBody };
    console.error(`${logPrefix} Resend API error — throwing 502`, error.cause);
    throw error;
  }

  let parsedBody = responseBody;

  try {
    parsedBody = responseBody ? JSON.parse(responseBody) : responseBody;
  } catch (parseError) {
    console.warn(`${logPrefix} Resend response body is not JSON`, {
      message: parseError.message,
    });
  }

  return {
    delivered: true,
    mode: "email",
    to: toEmail,
    resend: parsedBody,
  };
}

async function submitContactForm(body, { traceId } = {}) {
  const logPrefix = traceId ? `[contact-form][trace:${traceId}]` : "[contact-form]";

  console.log(`${logPrefix} submitContactForm validation starting`);
  const validation = validateContactSubmission(body);

  if (!validation.ok) {
    if (validation.spam) {
      console.warn(`${logPrefix} honeypot triggered — treating as spam`, {
        website: body?.website,
      });
      return { ok: true, spam: true };
    }

    console.warn(`${logPrefix} validation failed`, validation.errors);
    return { ok: false, errors: validation.errors };
  }

  console.log(`${logPrefix} validation passed`, {
    name: validation.data.name,
    email: validation.data.email,
    messageLength: validation.data.message.length,
  });

  const delivery = await sendContactEmail(validation.data, { traceId });

  return {
    ok: true,
    delivery,
  };
}

module.exports = {
  getDeliveryConfig,
  submitContactForm,
};
