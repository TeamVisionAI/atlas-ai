import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { fetchSetupStatus } from "../services/setupService";
import { appPath } from "../config/appRoutes";

export function useSetupStatus() {
  const [ready, setReady] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchSetupStatus()
      .then((status) => {
        if (!cancelled) {
          setSetupRequired(Boolean(status.setupRequired));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSetupRequired(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, setupRequired };
}

export default function RequireSetupComplete({ children }) {
  const location = useLocation();
  const { ready, setupRequired } = useSetupStatus();

  if (!ready) {
    return null;
  }

  if (setupRequired) {
    return (
      <Navigate
        to={appPath("setup")}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children;
}
