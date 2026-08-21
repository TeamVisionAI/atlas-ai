const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LIMITS = {
  name: 120,
  email: 254,
  message: 5000,
  organization: 200,
  topic: 80
};

const CONTACT_SOURCES = Object.freeze({
  TEAM_VISION: "team_vision",
  ATLAS: "atlas"
});

const ATLAS_CONTACT_TOPICS = Object.freeze([
  "General Question",
  "Account Access",
  "Technical Support",
  "Google Calendar",
  "WhatsApp / Meta",
  "Billing",
  "Other"
]);

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function normalizeSource(value) {
  const raw = sanitizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === CONTACT_SOURCES.ATLAS || raw === "atlas_ai") {
    return CONTACT_SOURCES.ATLAS;
  }
  return CONTACT_SOURCES.TEAM_VISION;
}

function validateContactSubmission(body = {}) {
  const honeypot = sanitizeText(body.website);

  if (honeypot) {
    return { ok: false, spam: true };
  }

  const source = normalizeSource(body.source);
  const name = sanitizeText(body.name);
  const email = sanitizeText(body.email).toLowerCase();
  const message = sanitizeText(body.message);
  const organization = sanitizeText(body.organization);
  const topic = sanitizeText(body.topic);
  const errors = {};

  if (!name) {
    errors.name = "Full name is required.";
  } else if (name.length > LIMITS.name) {
    errors.name = `Full name must be ${LIMITS.name} characters or fewer.`;
  }

  if (!email) {
    errors.email = "Email is required.";
  } else if (email.length > LIMITS.email) {
    errors.email = `Email must be ${LIMITS.email} characters or fewer.`;
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!message) {
    errors.message = "Message is required.";
  } else if (message.length > LIMITS.message) {
    errors.message = `Message must be ${LIMITS.message} characters or fewer.`;
  }

  if (source === CONTACT_SOURCES.ATLAS) {
    if (!topic) {
      errors.topic = "Topic is required.";
    } else if (!ATLAS_CONTACT_TOPICS.includes(topic)) {
      errors.topic = "Select a valid topic.";
    } else if (topic.length > LIMITS.topic) {
      errors.topic = `Topic must be ${LIMITS.topic} characters or fewer.`;
    }

    if (organization.length > LIMITS.organization) {
      errors.organization = `Organization must be ${LIMITS.organization} characters or fewer.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const data = { name, email, message, source };
  if (source === CONTACT_SOURCES.ATLAS) {
    data.topic = topic;
    if (organization) {
      data.organization = organization;
    }
  }

  return {
    ok: true,
    data
  };
}

module.exports = {
  EMAIL_PATTERN,
  LIMITS,
  CONTACT_SOURCES,
  ATLAS_CONTACT_TOPICS,
  sanitizeText,
  normalizeSource,
  validateContactSubmission
};
