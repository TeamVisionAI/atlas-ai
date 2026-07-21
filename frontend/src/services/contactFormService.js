import { apiRequest } from "./apiClient";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export async function submitContactForm(payload) {
  const response = await apiRequest("/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 429) {
    throw new Error(data.error || "Too many submissions. Please try again later.");
  }

  if (response.status === 400 && data.errors) {
    const error = new Error("Validation failed.");
    error.validationErrors = data.errors;
    throw error;
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
        "We couldn't send your message. Please try again or call (786) 752-8080."
    );
  }

  return data;
}
