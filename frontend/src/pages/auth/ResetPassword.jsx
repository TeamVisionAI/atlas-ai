import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { confirmPasswordReset } from "../../services/identityService";
import { appPath } from "../../config/appRoutes";
import "../identity/identity.css";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await confirmPasswordReset(token, password);
      navigate(appPath("login"), { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="identity-page">
      <div className="identity-card identity-form">
        <h1>Reset Password</h1>
        <form onSubmit={handleSubmit}>
          <label>
            New Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirm Password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </label>
          {error ? <p className="identity-error">{error}</p> : null}
          <button type="submit" className="identity-button" disabled={loading || !token}>
            Save New Password
          </button>
        </form>
        <p>
          <Link to={appPath("login")}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
