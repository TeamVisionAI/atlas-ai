const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ATLAS_CONTACT_TOPICS = Object.freeze([
  "General Question",
  "Account Access",
  "Technical Support",
  "Google Calendar",
  "WhatsApp / Meta",
  "Billing",
  "Other"
]);

export const SUPPORT_FALLBACK_EMAIL = "support@teamvisionfinancial.com";

export function validateContactFormFields({ name, email, message }) {
  const errors = {};
  const trimmedName = String(name ?? "").trim();
  const trimmedEmail = String(email ?? "").trim();
  const trimmedMessage = String(message ?? "").trim();

  if (!trimmedName) {
    errors.name = "Full name is required.";
  }

  if (!trimmedEmail) {
    errors.email = "Email is required.";
  } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (!trimmedMessage) {
    errors.message = "Message is required.";
  }

  return errors;
}

export function validateAtlasContactFormFields({
  name,
  email,
  organization,
  topic,
  message
}) {
  const errors = validateContactFormFields({ name, email, message });
  const trimmedTopic = String(topic ?? "").trim();
  const trimmedOrg = String(organization ?? "").trim();

  if (!trimmedTopic) {
    errors.topic = "Topic is required.";
  } else if (!ATLAS_CONTACT_TOPICS.includes(trimmedTopic)) {
    errors.topic = "Select a valid topic.";
  }

  if (trimmedOrg.length > 200) {
    errors.organization = "Organization must be 200 characters or fewer.";
  }

  return errors;
}
