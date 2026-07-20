import { appPath } from "../config/appRoutes";

/**
 * Prospect Workspace navigation helpers.
 * Prospect Workspace is distinct from Mission Control queue navigation.
 */

export function buildProspectWorkspacePath(prospect = {}) {
  const phone = prospect.phone || prospect.prospect_phone;

  if (!phone) {
    return appPath("prospect-workspace");
  }

  return appPath(`prospect-workspace/${encodeURIComponent(phone)}`);
}

export function buildProspectCenterPath({ filter, search } = {}) {
  const params = new URLSearchParams();

  if (filter && filter !== "all") {
    params.set("filter", filter);
  }

  if (search) {
    params.set("q", search);
  }

  const query = params.toString();
  return query ? `${appPath("prospect-center")}?${query}` : appPath("prospect-center");
}
