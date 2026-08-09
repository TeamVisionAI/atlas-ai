/**
 * BR-121 — Shared Google Calendar already-absent / missing-event classification.
 * Single source of truth for cancel, rollback, and sync recreate paths.
 */

/**
 * True when the provider indicates the Calendar event is already absent:
 * 404 Not Found, 410 Gone, "Resource has been deleted", and equivalents.
 * Unrelated provider/network/auth failures must return false.
 */
function isMissingGoogleEventError(error) {
  const rawStatus = error?.code ?? error?.response?.status ?? error?.statusCode ?? error?.status;
  const status = Number(rawStatus);
  const reason = String(
    error?.errors?.[0]?.reason ||
      error?.response?.data?.error?.errors?.[0]?.reason ||
      ""
  ).toLowerCase();
  const message = String(
    error?.message || error?.response?.data?.error?.message || ""
  ).toLowerCase();

  if (status === 404 || status === 410) {
    return true;
  }

  if (reason === "notfound" || reason === "gone" || reason === "deleted") {
    return true;
  }

  return (
    message.includes("not found") ||
    message.includes("404") ||
    message.includes("410") ||
    message.includes("resource has been deleted") ||
    message.includes("resource not found") ||
    message.includes("has been deleted") ||
    message.includes("already deleted") ||
    message.includes("event not found")
  );
}

/** Alias for cancel/rollback call sites (BR-121). */
function isAlreadyAbsentGoogleEventError(error) {
  return isMissingGoogleEventError(error);
}

module.exports = {
  isMissingGoogleEventError,
  isAlreadyAbsentGoogleEventError
};
