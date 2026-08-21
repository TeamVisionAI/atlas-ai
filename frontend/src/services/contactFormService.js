import { apiRequest } from "./apiClient";
import {
  ATLAS_CONTACT_TOPICS,
  SUPPORT_FALLBACK_EMAIL,
  validateAtlasContactFormFields,
  validateContactFormFields
} from "./contactFormValidation";

export {
  ATLAS_CONTACT_TOPICS,
  SUPPORT_FALLBACK_EMAIL,
  validateAtlasContactFormFields,
  validateContactFormFields
};

export async function submitContactForm(payload) {
  const response = await apiRequest("/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
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
        "We couldn't send your message. Please try again or email support@teamvisionfinancial.com."
    );
  }

  return data;
}
