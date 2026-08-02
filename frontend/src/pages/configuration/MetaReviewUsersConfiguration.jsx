import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import { isMetaReviewModeEnabled } from "../../config/metaReviewMode";
import { META_REVIEW_COPY } from "../../components/meta-review/metaReviewCopy";
import {
  createReviewUser,
  listReviewUsers,
  resetReviewUserPassword
} from "../../services/metaReviewUserService";
import "../../pages/identity/identity.css";

const ROLES = [
  "administrator",
  "operations",
  "rvp",
  "division_leader",
  "agent",
  "recruiter",
  "support"
];

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "recruiter",
  repId: "",
  password: "",
  confirmPassword: ""
};

export default function MetaReviewUsersConfiguration() {
  const metaReviewMode = isMetaReviewModeEnabled();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [passwordDrafts, setPasswordDrafts] = useState({});

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const result = await listReviewUsers();
      setUsers(result.items || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (metaReviewMode) {
      loadUsers();
    }
  }, [metaReviewMode]);

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const result = await createReviewUser({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        role: form.role,
        repId: form.repId,
        password: form.password
      });

      setForm(EMPTY_FORM);
      setShowCreate(false);
      setMessage(
        result.activated
          ? META_REVIEW_COPY.reviewUserActivated
          : META_REVIEW_COPY.reviewUserCreated
      );
      await loadUsers();
    } catch (createError) {
      setError(createError.message);
    }
  }

  async function handleResetPassword(userId) {
    setError("");
    setMessage("");

    const password = passwordDrafts[userId] || "";

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    try {
      await resetReviewUserPassword(userId, password);
      setPasswordDrafts((current) => ({ ...current, [userId]: "" }));
      setMessage(META_REVIEW_COPY.reviewUserPasswordReset);
      await loadUsers();
    } catch (resetError) {
      setError(resetError.message);
    }
  }

  if (!metaReviewMode) {
    return (
      <div className="identity-page">
        <p className="identity-error">{META_REVIEW_COPY.reviewUsersUnavailable}</p>
      </div>
    );
  }

  return (
    <div className="identity-page">
      <div className="identity-header">
        <div>
          <h1>{META_REVIEW_COPY.reviewUsersTitle}</h1>
          <p>{META_REVIEW_COPY.reviewUsersIntro}</p>
        </div>
        <div className="identity-actions">
          <Link className="identity-button-secondary" to={appPath("settings")}>
            Settings
          </Link>
          <button type="button" className="identity-button" onClick={() => setShowCreate(true)}>
            {META_REVIEW_COPY.reviewUserCreateAction}
          </button>
        </div>
      </div>

      {error ? <p className="identity-error">{error}</p> : null}
      {message ? <p className="identity-success">{message}</p> : null}

      {showCreate ? (
        <div className="identity-card">
          <h2>{META_REVIEW_COPY.reviewUserCreateTitle}</h2>
          <p>{META_REVIEW_COPY.reviewUserCreateNote}</p>
          <form className="identity-form" onSubmit={handleCreate}>
            <label>
              First Name
              <input
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                required
              />
            </label>
            <label>
              Last Name
              <input
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </label>
            <label>
              Rep ID
              <input
                value={form.repId}
                onChange={(event) => setForm({ ...form, repId: event.target.value.toUpperCase() })}
                placeholder="4TJLK"
                maxLength={5}
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <label>
              Role
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Initial Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                minLength={8}
                required
              />
            </label>
            <label>
              Confirm Password
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                minLength={8}
                required
              />
            </label>
            <div className="identity-actions">
              <button type="submit" className="identity-button">
                {META_REVIEW_COPY.reviewUserCreateSubmit}
              </button>
              <button
                type="button"
                className="identity-button-secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="identity-card">
        {loading ? <p>{META_REVIEW_COPY.reviewUsersLoading}</p> : null}
        {!loading ? (
          <table className="identity-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Set Password</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.display_name || `${user.first_name} ${user.last_name}`}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>
                    <span className={`identity-status ${user.status}`}>{user.status}</span>
                  </td>
                  <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "—"}</td>
                  <td>
                    <div className="identity-actions">
                      <input
                        type="password"
                        placeholder="New password"
                        value={passwordDrafts[user.id] || ""}
                        onChange={(event) =>
                          setPasswordDrafts((current) => ({
                            ...current,
                            [user.id]: event.target.value
                          }))
                        }
                        minLength={8}
                        aria-label={`New password for ${user.email}`}
                      />
                      <button
                        type="button"
                        className="identity-button-secondary"
                        onClick={() => handleResetPassword(user.id)}
                      >
                        Reset Password
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {!loading && users.length === 0 ? <p>{META_REVIEW_COPY.reviewUsersEmpty}</p> : null}
      </div>
    </div>
  );
}
