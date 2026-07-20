const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LIMITS = {
  name: 120,
  email: 254,
  message: 5000,
};

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function validateContactSubmission(body = {}) {
  const honeypot = sanitizeText(body.website);

  if (honeypot) {
    return { ok: false, spam: true };
  }

  const name = sanitizeText(body.name);
  const email = sanitizeText(body.email).toLowerCase();
  const message = sanitizeText(body.message);
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

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: { name, email, message },
  };
}

module.exports = {
  EMAIL_PATTERN,
  LIMITS,
  sanitizeText,
  validateContactSubmission,
};
