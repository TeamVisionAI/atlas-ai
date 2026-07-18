/**
 * Prospect Workspace navigation helpers.
 * Prospect Workspace is distinct from Mission Control queue navigation.
 */

export function buildProspectWorkspacePath(prospect = {}) {
  const phone = prospect.phone || prospect.prospect_phone;

  if (!phone) {
    return "/prospect-workspace";
  }

  return `/prospect-workspace/${encodeURIComponent(phone)}`;
}
