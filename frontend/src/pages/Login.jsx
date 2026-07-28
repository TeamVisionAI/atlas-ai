import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { loginAtlasSession, fetchCurrentUser } from "../services/atlasAuthService";
import { fetchSetupStatus } from "../services/setupService";
import { appPath } from "../config/appRoutes";
import { getDefaultLandingPath } from "../config/workspaceExperience";
import { useLanguage } from "../i18n/LanguageContext";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { syncFromUser } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [sessionLandingPath, setSessionLandingPath] = useState(appPath());

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const [status, user] = await Promise.all([
          fetchSetupStatus(),
          fetchCurrentUser()
        ]);

        if (!cancelled) {
          setSetupRequired(Boolean(status.setupRequired));
          setHasValidSession(Boolean(user));
          if (user) {
            syncFromUser(user);
            setSessionLandingPath(getDefaultLandingPath(user.role));
          }
        }
      } catch {
        if (!cancelled) {
          setSetupRequired(false);
          setHasValidSession(false);
        }
      } finally {
        if (!cancelled) {
          setCheckingSetup(false);
          setCheckingSession(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [syncFromUser]);

  if (checkingSetup || checkingSession) {
    return null;
  }

  if (setupRequired) {
    return <Navigate to={appPath("setup")} replace />;
  }

  if (hasValidSession) {
    return <Navigate to={sessionLandingPath} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginAtlasSession({ email, password, rememberMe });
      const user = await fetchCurrentUser();
      syncFromUser(user);
      const defaultLanding = getDefaultLandingPath(user?.role);
      const redirectTo = location.state?.from || defaultLanding;
      navigate(redirectTo, { replace: true });
    } catch (loginError) {
      setError(loginError.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Atlas Sign In</h1>
        <p>Use your individual Atlas account.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <label className="login-remember">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          Remember me
        </label>

        {error ? <p className="login-error">{error}</p> : null}

        <p>
          <Link to={appPath("forgot-password")}>Forgot password?</Link>
        </p>

        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
