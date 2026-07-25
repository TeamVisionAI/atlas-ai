import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { loginAtlasSession, getStoredSessionToken } from "../services/atlasAuthService";
import { fetchSetupStatus } from "../services/setupService";
import { appPath } from "../config/appRoutes";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    fetchSetupStatus()
      .then((status) => setSetupRequired(Boolean(status.setupRequired)))
      .finally(() => setCheckingSetup(false));
  }, []);

  if (checkingSetup) {
    return null;
  }

  if (setupRequired) {
    return <Navigate to={appPath("setup")} replace />;
  }

  if (getStoredSessionToken()) {
    return <Navigate to={appPath()} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginAtlasSession({ email, password, rememberMe });
      const redirectTo = location.state?.from || appPath();
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
