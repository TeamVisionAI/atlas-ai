/**
 * Pure Public Location scheduling form helpers (no React).
 */

export function hasPublicLocationDetails(form) {
  return Boolean(
    String(form?.meetingLocationName || "").trim() ||
      String(form?.meetingLocationAddress || "").trim()
  );
}

export function clearPublicLocationFields(form = {}) {
  return {
    ...form,
    meetingLocationName: "",
    meetingLocationAddress: "",
    meetingLocationUrl: ""
  };
}

export function isPublicLocationInterviewType(interviewType) {
  return String(interviewType || "").trim().toLowerCase() === "public_location";
}

export function isSchedulingFormValidWithPublicLocation(form) {
  if (!form?.interviewType || !form?.dateKey || !form?.timeKey) {
    return false;
  }

  if (isPublicLocationInterviewType(form.interviewType) && !hasPublicLocationDetails(form)) {
    return false;
  }

  return true;
}
