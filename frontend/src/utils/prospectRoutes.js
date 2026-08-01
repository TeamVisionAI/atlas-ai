import { appPath } from "../config/appRoutes";

/**
 * Prospect Workspace navigation helpers.
 * Prospect Workspace is distinct from Mission Control queue navigation.
 */

export function resolveProspectPhone(prospect) {
  if (prospect == null) {
    return null;
  }

  if (typeof prospect === "string" || typeof prospect === "number") {
    const phone = String(prospect).trim();
    return phone || null;
  }

  const phone =
    prospect.phone ||
    prospect.prospectPhone ||
    prospect.prospect_phone ||
    null;

  return phone ? String(phone).trim() : null;
}

export function buildProspectWorkspacePath(prospect) {
  const phone = resolveProspectPhone(prospect);

  if (!phone) {
    return appPath("prospect-workspace");
  }

  return appPath(`prospect-workspace/${encodeURIComponent(phone)}`);
}

export function navigateToProspectWorkspace(navigate, prospect) {
  if (typeof navigate !== "function") {
    return null;
  }

  const path = buildProspectWorkspacePath(prospect);
  navigate(path);
  return path;
}

export function buildProspectWorkspaceCommunicationHistoryPath(prospect) {
  const basePath = buildProspectWorkspacePath(prospect);
  return `${basePath}#communication-history`;
}

export function navigateToProspectCommunicationHistory(navigate, prospect) {
  if (typeof navigate !== "function") {
    return null;
  }

  const path = buildProspectWorkspaceCommunicationHistoryPath(prospect);
  navigate(path);
  return path;
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
