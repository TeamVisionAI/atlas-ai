const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  const trimmed = String(value || "").trim();
  return Boolean(trimmed) && EMAIL_PATTERN.test(trimmed);
}

/**
 * Resolves the best available prospect email from profile and scheduling form input.
 */
export function resolveProspectEmail(prospect = {}, formEmail = "") {
  const candidates = [
    formEmail,
    prospect?.email,
    prospect?.identity?.email
  ];

  for (const candidate of candidates) {
    const trimmed = String(candidate || "").trim();

    if (isValidEmail(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

export function needsZoomSchedulingEmailWarning(form, prospect = {}) {
  if (form?.interviewType !== "zoom") {
    return false;
  }

  if (resolveProspectEmail(prospect, form?.email)) {
    return false;
  }

  return !form?.whatsappDeliveryAcknowledged;
}

export function isSchedulingSubmitBlocked(form, prospect = {}) {
  return needsZoomSchedulingEmailWarning(form, prospect);
}
