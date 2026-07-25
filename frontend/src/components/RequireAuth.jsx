import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { ensureAtlasSession } from "../services/atlasAuthService";
import { appPath } from "../config/appRoutes";

export default function RequireAuth({ children }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    ensureAtlasSession()
      .then((value) => {
        if (!cancelled) {
          setAuthenticated(value);
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

  if (!ready) {
    return null;
  }

  if (!authenticated) {
    return (
      <Navigate
        to={appPath("login")}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children;
}
