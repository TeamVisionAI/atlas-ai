import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { completePlatformSetup, fetchSetupStatus } from "../../services/setupService";
import { storeSessionToken } from "../../services/atlasAuthService";
import { appPath } from "../../config/appRoutes";
import "../identity/identity.css";

const EMPTY_FORM = {
  organizationName: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerEmail: "",
  password: "",
  confirmPassword: ""
};

export default function SetupWizard() {
  const [ready, setReady] = useState(false);
  const [setupRequired, setSetupRequired] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSetupStatus()
      .then((status) => {
        setSetupRequired(Boolean(status.setupRequired));
      })
      .finally(() => setReady(true));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await completePlatformSetup(form);
      storeSessionToken(result.token);
      window.location.href = appPath();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return null;
  }

  if (!setupRequired) {
    return <Navigate to={appPath("login")} replace />;
  }

  return (
    <div className="identity-page">
      <div className="identity-card identity-form" style={{ maxWidth: "36rem", margin: "2rem auto" }}>
        <h1>Welcome to Atlas</h1>
        <p>Create your organization and first administrator account to get started.</p>

        <form onSubmit={handleSubmit}>
          <h2>Create Organization</h2>
          <label>
            Organization Name
            <input
              value={form.organizationName}
              onChange={(event) => setForm({ ...form, organizationName: event.target.value })}
              required
            />
          </label>

          <h2>Create First Administrator</h2>
          <p>This user becomes the organization owner and platform administrator.</p>

          <label>
            Owner First Name
            <input
              value={form.ownerFirstName}
              onChange={(event) => setForm({ ...form, ownerFirstName: event.target.value })}
              required
            />
          </label>
          <label>
            Owner Last Name
            <input
              value={form.ownerLastName}
              onChange={(event) => setForm({ ...form, ownerLastName: event.target.value })}
              required
            />
          </label>
          <label>
            Owner Email
            <input
              type="email"
              value={form.ownerEmail}
              onChange={(event) => setForm({ ...form, ownerEmail: event.target.value })}
              required
            />
          </label>
          <label>
            Create Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
          </label>
          <label>
            Confirm Password
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              required
            />
          </label>

          {error ? <p className="identity-error">{error}</p> : null}

          <button type="submit" className="identity-button" disabled={loading}>
            {loading ? "Creating…" : "Create First Administrator"}
          </button>
        </form>
      </div>
    </div>
  );
}
