/**
 * Prospect Workspace action permissions.
 * Implements BR-038 — recruiting users with prospect access may update prospect info.
 */

import { PERMISSIONS, roleHasPermission } from "./workspacePermissions";

export function canUpdateProspectInWorkspace(role) {
  return roleHasPermission(role, PERMISSIONS.PROSPECT_WRITE);
}

export function prospectWorkspaceActionRequiresCoreProspect(actionId) {
  return ["assign", "archive", "restore", "merge"].includes(actionId);
}

export function canPerformProspectWorkspaceAction(role, actionId) {
  switch (actionId) {
    case "update":
      return canUpdateProspectInWorkspace(role);
    case "assign":
    case "merge":
      return roleHasPermission(role, PERMISSIONS.PROSPECT_ASSIGN);
    case "archive":
    case "restore":
      return roleHasPermission(role, PERMISSIONS.PROSPECT_WRITE);
    case "schedule":
    case "contact":
      return roleHasPermission(role, PERMISSIONS.PROSPECT_READ);
    default:
      return false;
  }
}
