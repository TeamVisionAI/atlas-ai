import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../../services/identityService";
import { appPath } from "../../config/appRoutes";
import "../identity/identity.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await requestPasswordReset(email);
      setMessage(result.message);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="identity-page">
      <div className="identity-card identity-form">
        <h1>Forgot Password</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {message ? <p className="identity-success">{message}</p> : null}
          {error ? <p className="identity-error">{error}</p> : null}
          <button type="submit" className="identity-button" disabled={loading}>
            Send Reset Link
          </button>
        </form>
        <p>
          <Link to={appPath("login")}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
