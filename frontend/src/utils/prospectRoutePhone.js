/**
 * Decode prospect phone route params (handles %2B and double-encoding from SPA nav).
 */
export function normalizeProspectRoutePhone(routePhone) {
  const raw = String(routePhone || "").trim();
  if (!raw) {
    return "";
  }
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  // Handle double-encoded plus segments from SPA navigation.
  if (decoded.includes("%2B") || decoded.includes("%2b")) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // keep prior decode
    }
  }
  return decoded.trim();
}
