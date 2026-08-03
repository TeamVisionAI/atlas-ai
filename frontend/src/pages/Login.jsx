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
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      await loginAtlasSession({ identifier, password, rememberMe });
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
        <div className="login-brand">
          <img
            className="login-brand__logo"
            src="/atlas-ai-logo.png"
            alt="Atlas AI"
            width={96}
            height={96}
          />
          <p className="login-brand__motto">Connect • Automate • Grow</p>
        </div>

        <div className="login-intro">
          <h1>Sign in</h1>
          <p className="login-intro__subtitle">Secure access to your workspace.</p>
        </div>

        <label htmlFor="identifier">Email or Rep ID</label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          placeholder="Enter your email or Rep ID"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <div className="login-password-field">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            type="button"
            className="login-password-toggle"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls="password"
          >
            {showPassword ? (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                <path d="m2 2 20 20" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        <label className="login-remember">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          Remember me
        </label>

        {error ? <p className="login-error">{error}</p> : null}

        <p className="login-forgot">
          <Link className="login-forgot__link" to={appPath("forgot-password")}>
            Forgot password?
          </Link>
        </p>

        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
