import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import {
  BUSINESS_RANK_DEFAULT_PERMISSION_ROLE,
  listBusinessRanks
} from "../../config/teamVisionBusinessRanks";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import {
  archiveAdminUser,
  createAdminUser,
  forceLogoutUser,
  forcePasswordReset,
  listAdminUsers,
  reactivateAdminUser,
  resendInvitation,
  revokeInvitation,
  suspendAdminUser,
  transferOwnership,
  updateAdminUser,
  updateUserSecuritiesAuthorization,
  revokeUserSecuritiesAuthorization
} from "../../services/identityService";
import UserAvatar from "../../components/ui/UserAvatar";
import "../../components/ui/ProfilePhotoEditor.css";
import "./identity.css";

/** LC1 permission roles (platform access) — separate from Team Vision business ranks. */
const PERMISSION_ROLES = [
  "rvp",
  "division_leader",
  "agent",
  "recruiter",
  "operations",
  "support",
  "administrator"
];

const SECURITIES_STATUSES = [
  "UNKNOWN",
  "NOT_REGISTERED",
  "PENDING_VERIFICATION",
  "VERIFIED_ACTIVE",
  "RESTRICTED",
  "SUSPENDED",
  "EXPIRED",
  "TERMINATED"
];

const BUSINESS_RANK_OPTIONS = listBusinessRanks();

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  repId: "",
  email: "",
  phone: "",
  businessRank: "REP",
  role: BUSINESS_RANK_DEFAULT_PERMISSION_ROLE.REP,
  reportsToUserId: ""
};

const EMPTY_SECURITIES_FORM = {
  securities_access_status: "PENDING_VERIFICATION",
  registration_type: "",
  permitted_product_scope: "",
  effective_from: "",
  effective_to: "",
  jurisdiction_scope: "",
  principal_scope: "",
  status_reason: ""
};

function formatScope(scope) {
  if (Array.isArray(scope) && scope.length) {
    return scope.join(", ");
  }
  if (typeof scope === "string" && scope.trim()) {
    return scope;
  }
  return "—";
}

function parseScopeInput(value) {
  if (!value || !String(value).trim()) {
    return [];
  }
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function invitationStatusLabel(user) {
  if (user.status === "pending_invitation") {
    return user.invitation?.status || "pending";
  }
  return user.status;
}

function SecuritiesAccessBadge({ access }) {
  const verified = access?.securities_access_verified === true;
  const status = access?.securities_access_status || "UNKNOWN";

  return (
    <div className="securities-access-cell">
      <span className={`securities-access-badge ${verified ? "is-verified" : ""}`}>
        <span className="securities-access-badge__mark" aria-hidden="true">
          {verified ? "✓" : ""}
        </span>
        Securities Access Verified
      </span>
      <span className="securities-access-meta">{status}</span>
      <span className="securities-access-meta">Scope: {formatScope(access?.permitted_product_scope)}</span>
      <span className="securities-access-meta">
        Effective:{" "}
        {access?.effective_from ? new Date(access.effective_from).toLocaleDateString() : "—"}
        {" → "}
        {access?.effective_to ? new Date(access.effective_to).toLocaleDateString() : "open"}
      </span>
      {access?.jurisdiction_scope ? (
        <span className="securities-access-meta">
          Jurisdiction: {formatScope(access.jurisdiction_scope)}
        </span>
      ) : null}
    </div>
  );
}

export default function AdminUsers() {
  const { user: sessionUser } = useWorkspace();
  const canVerifySecurities =
    sessionUser?.capabilities?.canVerifySecuritiesAuthorization === true;
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [transferTarget, setTransferTarget] = useState("");
  const [repIdDrafts, setRepIdDrafts] = useState({});
  const [securitiesTarget, setSecuritiesTarget] = useState(null);
  const [securitiesForm, setSecuritiesForm] = useState(EMPTY_SECURITIES_FORM);
  const [securitiesSaving, setSecuritiesSaving] = useState(false);

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

  useEffect(() => {
    if (activeTab === "invitations") {
      setStatusFilter("pending_invitation");
    } else if (statusFilter === "pending_invitation") {
      setStatusFilter("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab switch drives status filter only
  }, [activeTab]);

  async function handleCreate(event) {
    event.preventDefault();

    try {
      await createAdminUser({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        repId: form.repId || undefined,
        businessRank: form.businessRank,
        role: form.role,
        reportsToUserId: form.reportsToUserId || undefined
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setActiveTab("invitations");
      setStatusFilter("pending_invitation");
      await loadUsers();
    } catch (createError) {
      setError(createError.message);
    }
  }

  function updateBusinessRank(nextRank) {
    setForm((current) => ({
      ...current,
      businessRank: nextRank,
      role: BUSINESS_RANK_DEFAULT_PERMISSION_ROLE[nextRank] || current.role
    }));
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

  function openSecuritiesEditor(user) {
    const access = user.securities_access || {};
    setSecuritiesTarget(user);
    setSecuritiesForm({
      securities_access_status: access.securities_access_status || "PENDING_VERIFICATION",
      registration_type: access.registration_type || "",
      permitted_product_scope: Array.isArray(access.permitted_product_scope)
        ? access.permitted_product_scope.join(", ")
        : "",
      effective_from: access.effective_from
        ? String(access.effective_from).slice(0, 10)
        : "",
      effective_to: access.effective_to ? String(access.effective_to).slice(0, 10) : "",
      jurisdiction_scope: Array.isArray(access.jurisdiction_scope)
        ? access.jurisdiction_scope.join(", ")
        : access.jurisdiction_scope
          ? String(access.jurisdiction_scope)
          : "",
      principal_scope: Array.isArray(access.principal_scope)
        ? access.principal_scope.join(", ")
        : "",
      status_reason: ""
    });
  }

  async function saveSecuritiesAuthorization(event) {
    event.preventDefault();
    if (!securitiesTarget || !canVerifySecurities) {
      return;
    }

    if (sessionUser?.id && String(sessionUser.id) === String(securitiesTarget.id)) {
      setError("You cannot verify or modify your own securities authorization.");
      return;
    }

    setSecuritiesSaving(true);
    setError("");

    try {
      await updateUserSecuritiesAuthorization(securitiesTarget.id, {
        securities_access_status: securitiesForm.securities_access_status,
        registration_type: securitiesForm.registration_type || null,
        permitted_product_scope: parseScopeInput(securitiesForm.permitted_product_scope),
        principal_scope: parseScopeInput(securitiesForm.principal_scope),
        jurisdiction_scope: parseScopeInput(securitiesForm.jurisdiction_scope),
        effective_from: securitiesForm.effective_from
          ? new Date(securitiesForm.effective_from).toISOString()
          : null,
        effective_to: securitiesForm.effective_to
          ? new Date(`${securitiesForm.effective_to}T23:59:59.999Z`).toISOString()
          : null,
        status_reason: securitiesForm.status_reason || null,
        record_review: true
      });
      setSecuritiesTarget(null);
      await loadUsers();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSecuritiesSaving(false);
    }
  }

  async function revokeSecurities() {
    if (!securitiesTarget || !canVerifySecurities) {
      return;
    }

    setSecuritiesSaving(true);
    setError("");

    try {
      await revokeUserSecuritiesAuthorization(
        securitiesTarget.id,
        securitiesForm.status_reason || "revoked"
      );
      setSecuritiesTarget(null);
      await loadUsers();
    } catch (revokeError) {
      setError(revokeError.message);
    } finally {
      setSecuritiesSaving(false);
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
      if (action === "revoke-invite") await revokeInvitation(userId);
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

  const pendingInvitations = useMemo(
    () => users.filter((user) => user.status === "pending_invitation"),
    [users]
  );

  const tableUsers = activeTab === "invitations" ? pendingInvitations : users;

  return (
    <div className="identity-page">
      <div className="identity-header">
        <div>
          <h1>Administration — Users</h1>
          <p>
            {activeTab === "invitations"
              ? `${pendingInvitations.length} pending invitations`
              : `${total} users`}
          </p>
        </div>
        <div className="identity-actions">
          <Link className="identity-button-secondary" to={appPath("my-account")}>
            My Account
          </Link>
          <button
            type="button"
            className="identity-button"
            onClick={() => {
              setShowCreate(true);
              setActiveTab("invitations");
            }}
          >
            Invite User
          </button>
        </div>
      </div>

      <div className="identity-tabs" role="tablist" aria-label="Users and invitations">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "users"}
          className={`identity-tab ${activeTab === "users" ? "is-active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "invitations"}
          className={`identity-tab ${activeTab === "invitations" ? "is-active" : ""}`}
          onClick={() => setActiveTab("invitations")}
        >
          Invitations
        </button>
      </div>

      <div className="identity-card identity-actions">
        <input
          placeholder="Search name, email, or Rep ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {activeTab === "users" ? (
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending_invitation">Pending Invitation</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
        ) : null}
        <input
          placeholder="Transfer ownership to user ID"
          value={transferTarget}
          onChange={(event) => setTransferTarget(event.target.value)}
        />
      </div>

      {error ? <p className="identity-error">{error}</p> : null}

      {showCreate ? (
        <div className="identity-card">
          <h2>Invite User</h2>
          <p className="identity-muted">
            Business rank is the Team Vision hierarchy. Permission role controls platform access and
            defaults to a non-admin field role.
          </p>
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
              Business Rank
              <select
                value={form.businessRank}
                onChange={(event) => updateBusinessRank(event.target.value)}
                required
              >
                {BUSINESS_RANK_OPTIONS.map((rank) => (
                  <option key={rank.code} value={rank.code}>
                    {rank.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reporting Leader
              <select
                value={form.reportsToUserId}
                onChange={(event) => setForm({ ...form, reportsToUserId: event.target.value })}
              >
                <option value="">None</option>
                {activeUsers.map((leader) => (
                  <option key={leader.id} value={leader.id}>
                    {leader.display_name || `${leader.first_name} ${leader.last_name}`} (
                    {leader.business_rank || leader.role})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Permission Role
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                {PERMISSION_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
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
            <div className="identity-actions">
              <button type="submit" className="identity-button">
                Send Invitation
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

      {securitiesTarget ? (
        <div className="identity-card">
          <h2>Securities Authorization</h2>
          <p className="securities-access-meta">
            {securitiesTarget.display_name || securitiesTarget.email} — firm verification only (not
            self-attestation)
          </p>
          {!canVerifySecurities ? (
            <p className="identity-error">
              Explicit securities:verify permission is required to edit authorization.
            </p>
          ) : null}
          <form className="identity-form securities-access-dialog" onSubmit={saveSecuritiesAuthorization}>
            <label>
              Status
              <select
                value={securitiesForm.securities_access_status}
                disabled={!canVerifySecurities}
                onChange={(event) =>
                  setSecuritiesForm({
                    ...securitiesForm,
                    securities_access_status: event.target.value
                  })
                }
              >
                {SECURITIES_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Registration type
              <input
                value={securitiesForm.registration_type}
                disabled={!canVerifySecurities}
                onChange={(event) =>
                  setSecuritiesForm({ ...securitiesForm, registration_type: event.target.value })
                }
                placeholder="e.g. SERIES_6_SCOPE"
              />
            </label>
            <label>
              Permitted product scope (comma-separated)
              <input
                value={securitiesForm.permitted_product_scope}
                disabled={!canVerifySecurities}
                onChange={(event) =>
                  setSecuritiesForm({
                    ...securitiesForm,
                    permitted_product_scope: event.target.value
                  })
                }
              />
            </label>
            <label>
              Principal scope (comma-separated)
              <input
                value={securitiesForm.principal_scope}
                disabled={!canVerifySecurities}
                onChange={(event) =>
                  setSecuritiesForm({ ...securitiesForm, principal_scope: event.target.value })
                }
              />
            </label>
            <label>
              Jurisdiction scope (comma-separated, optional)
              <input
                value={securitiesForm.jurisdiction_scope}
                disabled={!canVerifySecurities}
                onChange={(event) =>
                  setSecuritiesForm({ ...securitiesForm, jurisdiction_scope: event.target.value })
                }
              />
            </label>
            <label>
              Effective from
              <input
                type="date"
                value={securitiesForm.effective_from}
                disabled={!canVerifySecurities}
                onChange={(event) =>
                  setSecuritiesForm({ ...securitiesForm, effective_from: event.target.value })
                }
              />
            </label>
            <label>
              Effective to
              <input
                type="date"
                value={securitiesForm.effective_to}
                disabled={!canVerifySecurities}
                onChange={(event) =>
                  setSecuritiesForm({ ...securitiesForm, effective_to: event.target.value })
                }
              />
            </label>
            <label>
              Sanitized reason (optional, short)
              <input
                value={securitiesForm.status_reason}
                disabled={!canVerifySecurities}
                onChange={(event) =>
                  setSecuritiesForm({ ...securitiesForm, status_reason: event.target.value })
                }
                maxLength={120}
              />
            </label>
            <div className="identity-actions">
              <button
                type="submit"
                className="identity-button"
                disabled={!canVerifySecurities || securitiesSaving}
              >
                Save Authorization
              </button>
              <button
                type="button"
                className="identity-button-secondary"
                disabled={!canVerifySecurities || securitiesSaving}
                onClick={revokeSecurities}
              >
                Revoke / Terminate
              </button>
              <button
                type="button"
                className="identity-button-secondary"
                onClick={() => setSecuritiesTarget(null)}
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
                <th>Business Rank</th>
                <th>Permission Role</th>
                <th>Status</th>
                {activeTab === "users" ? <th>Securities Access</th> : null}
                <th>Last Login</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableUsers.map((user) => (
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
                  <td>{user.business_rank || "—"}</td>
                  <td>{user.role}</td>
                  <td>
                    <span className={`identity-status ${user.status}`}>
                      {invitationStatusLabel(user)}
                    </span>
                    {user.invitation?.expires_at ? (
                      <div className="identity-muted">
                        Expires {new Date(user.invitation.expires_at).toLocaleString()}
                      </div>
                    ) : null}
                  </td>
                  {activeTab === "users" ? (
                    <td>
                      <SecuritiesAccessBadge access={user.securities_access} />
                      {canVerifySecurities && String(sessionUser?.id) !== String(user.id) ? (
                        <button
                          type="button"
                          className="identity-button-secondary"
                          style={{ marginTop: "0.35rem" }}
                          onClick={() => openSecuritiesEditor(user)}
                        >
                          Edit Securities Access
                        </button>
                      ) : null}
                    </td>
                  ) : null}
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
                        <>
                          <button
                            type="button"
                            className="identity-button-secondary"
                            onClick={() => runAction("invite", user.id)}
                          >
                            Resend Invite
                          </button>
                          <button
                            type="button"
                            className="identity-button-secondary"
                            onClick={() => runAction("revoke-invite", user.id)}
                          >
                            Revoke Invite
                          </button>
                        </>
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
