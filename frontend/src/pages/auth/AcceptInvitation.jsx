import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvitation, validateInvitation } from "../../services/identityService";
import { storeSessionToken } from "../../services/atlasAuthService";
import { appPath } from "../../config/appRoutes";
import "../identity/identity.css";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [invitation, setInvitation] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    validateInvitation(token)
      .then(setInvitation)
      .catch((validationError) => setError(validationError.message));
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await acceptInvitation(token, password);
      storeSessionToken(result.token);
      navigate(appPath(), { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="identity-page">
        <div className="identity-card">Invalid invitation link.</div>
      </div>
    );
  }

  if (!invitation?.valid) {
    return (
      <div className="identity-page">
        <div className="identity-card">This invitation is invalid or has expired.</div>
      </div>
    );
  }

  return (
    <div className="identity-page">
      <div className="identity-card identity-form">
        <h1>Welcome to Atlas</h1>
        <p>Create your password for {invitation.email}</p>
        <form onSubmit={handleSubmit}>
          <label>
            Password
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
          <button type="submit" className="identity-button" disabled={loading}>
            Activate Account
          </button>
        </form>
        <p>
          <Link to={appPath("login")}>Already have an account?</Link>
        </p>
      </div>
    </div>
  );
}
