import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import {
  archiveAdminUser,
  createAdminUser,
  forceLogoutUser,
  forcePasswordReset,
  listAdminUsers,
  reactivateAdminUser,
  resendInvitation,
  suspendAdminUser,
  transferOwnership,
  updateAdminUser
} from "../../services/identityService";
import UserAvatar from "../../components/ui/UserAvatar";
import "../../components/ui/ProfilePhotoEditor.css";
import "./identity.css";

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
  repId: "",
  email: "",
  phone: "",
  role: "recruiter"
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [transferTarget, setTransferTarget] = useState("");
  const [repIdDrafts, setRepIdDrafts] = useState({});

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const result = await listAdminUsers({
        q: query || undefined,
        status: statusFilter || undefined,
        limit: 50
      });
      setUsers(result.items || []);
      setTotal(result.total || 0);
      setRepIdDrafts(
        Object.fromEntries(
          (result.items || []).map((user) => [user.id, user.rep_id || ""])
        )
      );
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [query, statusFilter]);

  async function handleCreate(event) {
    event.preventDefault();

    try {
      await createAdminUser(form);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await loadUsers();
    } catch (createError) {
      setError(createError.message);
    }
  }

  async function saveRepId(userId) {
    setError("");

    try {
      await updateAdminUser(userId, { repId: repIdDrafts[userId] || null });
      await loadUsers();
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function runAction(action, userId) {
    setError("");

    try {
      if (action === "suspend") await suspendAdminUser(userId);
      if (action === "reactivate") await reactivateAdminUser(userId);
      if (action === "archive") await archiveAdminUser(userId);
      if (action === "reset") await forcePasswordReset(userId);
      if (action === "logout") await forceLogoutUser(userId);
      if (action === "invite") await resendInvitation(userId);
      if (action === "transfer" && transferTarget) {
        await transferOwnership(userId, transferTarget);
        setTransferTarget("");
      }

      await loadUsers();
    } catch (actionError) {
      setError(actionError.message);
    }
  }

  const activeUsers = useMemo(
    () => users.filter((user) => user.status === "active"),
    [users]
  );

  return (
    <div className="identity-page">
      <div className="identity-header">
        <div>
          <h1>Administration — Users</h1>
          <p>{total} users</p>
        </div>
        <div className="identity-actions">
          <Link className="identity-button-secondary" to={appPath("my-account")}>
            My Account
          </Link>
          <button type="button" className="identity-button" onClick={() => setShowCreate(true)}>
            Create User
          </button>
        </div>
      </div>

      <div className="identity-card identity-actions">
        <input
          placeholder="Search name, email, or Rep ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_invitation">Pending Invitation</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
        <input
          placeholder="Transfer ownership to user ID"
          value={transferTarget}
          onChange={(event) => setTransferTarget(event.target.value)}
        />
      </div>

      {error ? <p className="identity-error">{error}</p> : null}

      {showCreate ? (
        <div className="identity-card">
          <h2>Create User</h2>
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
              Rep ID
              <input
                value={form.repId}
                onChange={(event) => setForm({ ...form, repId: event.target.value.toUpperCase() })}
                placeholder="4TJLK"
                maxLength={5}
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
            <div className="identity-actions">
              <button type="submit" className="identity-button">
                Create User & Send Invitation
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
        {loading ? <p>Loading users…</p> : null}
        {!loading ? (
          <table className="identity-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Rep ID</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="profile-photo-editor__table-cell">
                      <UserAvatar
                        photoUrl={user.photo_url}
                        name={user.display_name || `${user.first_name} ${user.last_name}`}
                        email={user.email}
                        size="sm"
                      />
                      <div className="profile-photo-editor__table-name">
                        <span>{user.display_name || `${user.first_name} ${user.last_name}`}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="identity-actions">
                      <input
                        value={repIdDrafts[user.id] ?? user.rep_id ?? ""}
                        onChange={(event) =>
                          setRepIdDrafts((current) => ({
                            ...current,
                            [user.id]: event.target.value.toUpperCase()
                          }))
                        }
                        placeholder="4TJLK"
                        maxLength={5}
                        aria-label={`Rep ID for ${user.email}`}
                      />
                      <button
                        type="button"
                        className="identity-button-secondary"
                        onClick={() => saveRepId(user.id)}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>
                    <span className={`identity-status ${user.status}`}>{user.status}</span>
                  </td>
                  <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "—"}</td>
                  <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</td>
                  <td>
                    <div className="identity-actions">
                      {user.status === "active" ? (
                        <button
                          type="button"
                          className="identity-button-secondary"
                          onClick={() => runAction("suspend", user.id)}
                        >
                          Suspend
                        </button>
                      ) : null}
                      {user.status === "suspended" ? (
                        <button
                          type="button"
                          className="identity-button-secondary"
                          onClick={() => runAction("reactivate", user.id)}
                        >
                          Reactivate
                        </button>
                      ) : null}
                      {user.status === "pending_invitation" ? (
                        <button
                          type="button"
                          className="identity-button-secondary"
                          onClick={() => runAction("invite", user.id)}
                        >
                          Resend Invite
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="identity-button-secondary"
                        onClick={() => runAction("reset", user.id)}
                      >
                        Force Reset
                      </button>
                      <button
                        type="button"
                        className="identity-button-secondary"
                        onClick={() => runAction("logout", user.id)}
                      >
                        Force Logout
                      </button>
                      {transferTarget ? (
                        <button
                          type="button"
                          className="identity-button-secondary"
                          onClick={() => runAction("transfer", user.id)}
                        >
                          Transfer To Target
                        </button>
                      ) : null}
                      {user.status !== "archived" ? (
                        <button
                          type="button"
                          className="identity-button-secondary"
                          onClick={() => runAction("archive", user.id)}
                        >
                          Archive
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {!loading && activeUsers.length === 0 && users.length === 0 ? <p>No users found.</p> : null}
      </div>
    </div>
  );
}
