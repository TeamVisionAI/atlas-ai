import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const PUBLIC_ONBOARDING_PATHS = new Set([
  "/onboarding",
  "/onboarding/login",
  "/onboarding/signup"
]);

export function OnboardingGuard({ children }) {
  const { loading, isAuthenticated, onboarding } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-shell">
          <div className="onboarding-card">Loading...</div>
        </div>
      </div>
    );
  }

  if (PUBLIC_ONBOARDING_PATHS.has(location.pathname)) {
    if (isAuthenticated && onboarding?.nextRoute && onboarding.nextRoute !== "/onboarding/login") {
      return <Navigate to={onboarding.nextRoute} replace />;
    }

    return children;
  }

  if (!isAuthenticated) {
    return <Navigate to="/onboarding/login" replace state={{ from: location.pathname }} />;
  }

  if (onboarding?.organization?.activatedAt && !location.pathname.startsWith("/app")) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

export function AppGuard({ children }) {
  const { loading, isAuthenticated, onboarding } = useAuth();

  if (loading) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-shell">
          <div className="onboarding-card">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!onboarding?.organization?.activatedAt) {
    return <Navigate to={onboarding?.nextRoute || "/onboarding/organization"} replace />;
  }

  return children;
}

export function OnboardingOutlet() {
  return (
    <OnboardingGuard>
      <Outlet />
    </OnboardingGuard>
  );
}

export function AppOutlet() {
  return (
    <AppGuard>
      <Outlet />
    </AppGuard>
  );
}
