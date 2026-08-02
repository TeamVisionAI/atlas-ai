import { Navigate, useLocation } from "react-router-dom";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { appPath } from "../config/appRoutes";
import {
  canAccessRoute,
  canManageUsers,
  getDefaultLandingPath,
  resolveRouteKey
} from "../config/workspaceExperience";
import { isMetaReviewModeEnabled } from "../config/metaReviewMode";
import ForbiddenPage from "../pages/ForbiddenPage";

export default function RequireWorkspaceAccess({ children, routeKey = null }) {
  const { user, operationsAllowed, landingPath } = useWorkspace();
  const location = useLocation();
  const key = routeKey || resolveRouteKey(location.pathname);

  if (!user) {
    return null;
  }

  if (!canAccessRoute(key, user, { operationsAllowed })) {
    if (isMetaReviewModeEnabled()) {
      if (key === "admin/users" && canManageUsers(user, { operationsAllowed })) {
        return <Navigate to={appPath("settings/review-users")} replace />;
      }

      return <Navigate to={landingPath || getDefaultLandingPath(user.role)} replace />;
    }

    return <ForbiddenPage routeKey={key} />;
  }

  return children;
}

export function WorkspaceLandingRedirect() {
  const { user, landingPath } = useWorkspace();

  if (!user) {
    return null;
  }

  return <Navigate to={landingPath || getDefaultLandingPath(user.role)} replace />;
}
