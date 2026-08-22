/**
 * Shared Quick Capture copy + source options.
 * Tenant-neutral: does not assume a Team Vision-only catalog object exists.
 */

export const QUICK_CAPTURE_LANGUAGE_OPTIONS = Object.freeze([
  { value: "english", labelKey: "quickCaptureLanguageEn" },
  { value: "spanish", labelKey: "quickCaptureLanguageEs" }
]);

export const QUICK_CAPTURE_MANUAL_SOURCES = Object.freeze([
  { value: "IN_PERSON", labelKey: "quickCaptureSourceInPerson" },
  { value: "REFERRAL", labelKey: "quickCaptureSourceReferral" },
  { value: "CHURCH", labelKey: "quickCaptureSourceChurch" },
  { value: "NETWORKING", labelKey: "quickCaptureSourceNetworking" },
  { value: "COMMUNITY_EVENT", labelKey: "quickCaptureSourceCommunityEvent" },
  { value: "WARM_MARKET", labelKey: "quickCaptureSourceWarmMarket" },
  { value: "OTHER", labelKey: "quickCaptureSourceOther" }
]);

/** English defaults when a key is missing from any tenant/shared catalog. */
export const QUICK_CAPTURE_COPY_FALLBACKS = Object.freeze({
  quickCaptureTitle: "Quick Capture",
  quickCaptureFirstName: "First Name",
  quickCaptureLastName: "Last Name",
  quickCapturePhone: "Phone",
  quickCapturePreferredLanguage: "Preferred Language",
  quickCaptureLanguageEn: "English",
  quickCaptureLanguageEs: "Español",
  quickCaptureHowDidYouMeet: "How did you meet this person?",
  quickCaptureSave: "Save Prospect",
  quickCaptureSaving: "Saving…",
  quickCaptureDuplicateTitle: "Existing Prospect",
  quickCaptureDuplicateMessage: "A prospect with this phone number already exists.",
  quickCaptureOpenExisting: "Open Existing Prospect",
  quickCaptureCancel: "Cancel",
  quickCaptureRequired: "Required field",
  quickCaptureError: "Unable to save prospect.",
  quickCaptureSourceInPerson: "In Person",
  quickCaptureSourceReferral: "Referral",
  quickCaptureSourceChurch: "Church",
  quickCaptureSourceNetworking: "Networking",
  quickCaptureSourceCommunityEvent: "Community Event",
  quickCaptureSourceWarmMarket: "Warm Market",
  quickCaptureSourceOther: "Other"
});

/**
 * Resolve a Quick Capture copy key via shared translate, with neutral fallback.
 * Never throws when translate or a tenant overlay is missing.
 */
export function resolveQuickCaptureCopy(translate, key) {
  const fallback =
    QUICK_CAPTURE_COPY_FALLBACKS[key] ||
    String(key || "")
      .replace(/^quickCapture/, "")
      .replace(/([A-Z])/g, " $1")
      .trim() ||
    "—";

  if (typeof translate !== "function") {
    return fallback;
  }

  try {
    const value = translate(key);

    if (value == null || value === "" || value === key) {
      return fallback;
    }

    return String(value);
  } catch {
    return fallback;
  }
}

export function resolveQuickCaptureSourceOptions(translate) {
  return QUICK_CAPTURE_MANUAL_SOURCES.map((option) => ({
    value: option.value,
    label: resolveQuickCaptureCopy(translate, option.labelKey)
  }));
}

export function resolveQuickCaptureLanguageOptions(translate) {
  return QUICK_CAPTURE_LANGUAGE_OPTIONS.map((option) => ({
    value: option.value,
    label: resolveQuickCaptureCopy(translate, option.labelKey)
  }));
}
