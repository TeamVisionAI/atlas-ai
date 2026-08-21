import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import {
  BUSINESS_RANK_DEFAULT_PERMISSION_ROLE,
  BUSINESS_RANK_ORDER,
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
  updateAdminUser,
  updateUserSecuritiesAuthorization,
  revokeUserSecuritiesAuthorization
} from "../../services/identityService";
import UserAvatar from "../../components/ui/UserAvatar";
import "../../components/ui/ProfilePhotoEditor.css";
import {
  USERS_DEFAULT_STATUS_FILTER,
  buildUserRowActions,
  displayUserName,
  filterAdminUsers,
  formatStatusLabel,
  invitationDisplayStatus,
  statusBadgeClass
} from "./adminUsersGridHelpers";
import "./identity.css";

/** LC1 permission roles (platform access) — separate from business ranks. */
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

function formatShortDateTime(value) {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return "—";
  }
}

function Badge({ className, children, title }) {
  return (
    <span className={className} title={title || (typeof children === "string" ? children : undefined)}>
      {children}
    </span>
  );
}

function RowActionsMenu({ actions, onAction }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!actions.length) {
    return null;
  }

  return (
    <div className="admin-users-menu" ref={rootRef}>
      <button
        type="button"
        className="admin-users-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Row actions"
        onClick={() => setOpen((current) => !current)}
      >
        •••
      </button>
      {open ? (
        <div className="admin-users-menu__panel" role="menu">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className="admin-users-menu__item"
              onClick={() => {
                setOpen(false);
                onAction(action.id);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
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
  const [statusFilter, setStatusFilter] = useState(USERS_DEFAULT_STATUS_FILTER);
  const [rankFilter, setRankFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRepId, setEditingRepId] = useState(null);
  const [repIdDraft, setRepIdDraft] = useState("");
  const [securitiesTarget, setSecuritiesTarget] = useState(null);
  const [securitiesForm, setSecuritiesForm] = useState(EMPTY_SECURITIES_FORM);
  const [securitiesSaving, setSecuritiesSaving] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      // Load tenant-scoped list once; filters applied client-side for multi-criteria UX.
      // Flag for later: server pagination when tenants exceed ~500 users.
      const result = await listAdminUsers({
        limit: 200
      });
      setUsers(result.items || []);
      setTotal(result.total || 0);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (activeTab === "invitations") {
      setStatusFilter("pending_invitation");
    } else if (statusFilter === "pending_invitation") {
      setStatusFilter(USERS_DEFAULT_STATUS_FILTER);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab switch drives status filter only
  }, [activeTab]);

  const filteredUsers = useMemo(
    () =>
      filterAdminUsers(users, {
        query,
        statusFilter: activeTab === "invitations" ? "pending_invitation" : statusFilter,
        rankFilter,
        roleFilter
      }),
    [users, query, statusFilter, rankFilter, roleFilter, activeTab]
  );

  const activeLeaders = useMemo(
    () => users.filter((user) => user.status === "active"),
    [users]
  );

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

  function startRepIdEdit(user) {
    setEditingRepId(user.id);
    setRepIdDraft(user.rep_id || "");
  }

  function cancelRepIdEdit() {
    setEditingRepId(null);
    setRepIdDraft("");
  }

  async function saveRepId(userId) {
    setError("");

    try {
      await updateAdminUser(userId, { repId: repIdDraft || null });
      cancelRepIdEdit();
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

  async function runAction(action, user) {
    setError("");

    try {
      if (action === "edit-rep") {
        startRepIdEdit(user);
        return;
      }
      if (action === "edit-securities") {
        openSecuritiesEditor(user);
        return;
      }
      if (action === "suspend") await suspendAdminUser(user.id);
      if (action === "reactivate") await reactivateAdminUser(user.id);
      if (action === "archive") await archiveAdminUser(user.id);
      if (action === "reset") await forcePasswordReset(user.id);
      if (action === "logout") await forceLogoutUser(user.id);
      if (action === "invite") await resendInvitation(user.id);
      if (action === "revoke-invite") await revokeInvitation(user.id);

      await loadUsers();
    } catch (actionError) {
      setError(actionError.message);
    }
  }

  function renderRepIdCell(user) {
    if (editingRepId === user.id) {
      return (
        <div className="admin-users-rep-edit">
          <input
            className="admin-users-rep-edit__input"
            value={repIdDraft}
            onChange={(event) => setRepIdDraft(event.target.value.toUpperCase())}
            placeholder="Rep ID"
            maxLength={5}
            aria-label={`Edit Rep ID for ${user.email}`}
            autoFocus
          />
          <button type="button" className="identity-button" onClick={() => saveRepId(user.id)}>
            Save
          </button>
          <button type="button" className="identity-button-secondary" onClick={cancelRepIdEdit}>
            Cancel
          </button>
        </div>
      );
    }

    return (
      <div className="admin-users-rep-display">
        <span className="admin-users-rep-display__value">{user.rep_id || "—"}</span>
        {user.status !== "pending_invitation" ? (
          <button
            type="button"
            className="admin-users-icon-btn"
            aria-label={`Edit Rep ID for ${displayUserName(user)}`}
            onClick={() => startRepIdEdit(user)}
          >
            ✎
          </button>
        ) : null}
      </div>
    );
  }

  function renderUserRow(user) {
    const isSelf = String(sessionUser?.id) === String(user.id);
    const actions = buildUserRowActions(user, { canVerifySecurities, isSelf });
    const statusKey = invitationDisplayStatus(user);
    const isPending = user.status === "pending_invitation";

    return (
      <tr
        key={user.id}
        className={`admin-users-row ${isPending ? "admin-users-row--pending" : ""}`}
      >
        <td className="admin-users-col-name">
          <div className="admin-users-name-cell">
            <UserAvatar
              photoUrl={user.photo_url}
              name={displayUserName(user)}
              email={user.email}
              size="sm"
            />
            <span className="admin-users-name-cell__text" title={displayUserName(user)}>
              {displayUserName(user)}
            </span>
          </div>
        </td>
        <td className="admin-users-col-email">
          <span className="admin-users-truncate" title={user.email || ""}>
            {user.email || "—"}
          </span>
        </td>
        {activeTab === "users" ? (
          <td className="admin-users-col-rep">{renderRepIdCell(user)}</td>
        ) : null}
        <td className="admin-users-col-rank">
          {user.business_rank ? (
            <Badge className="admin-users-badge admin-users-badge--rank" title={user.business_rank}>
              {user.business_rank}
            </Badge>
          ) : (
            "—"
          )}
        </td>
        <td className="admin-users-col-role">
          {user.role ? (
            <Badge className="admin-users-badge admin-users-badge--role" title={user.role}>
              {user.role}
            </Badge>
          ) : (
            "—"
          )}
        </td>
        <td className="admin-users-col-status">
          <Badge className={statusBadgeClass(statusKey)}>{formatStatusLabel(statusKey)}</Badge>
        </td>
        {activeTab === "users" ? (
          <td className="admin-users-col-login">
            {user.last_login_at ? formatShortDateTime(user.last_login_at) : "—"}
          </td>
        ) : (
          <>
            <td className="admin-users-col-sent">
              {formatShortDateTime(user.invitation?.created_at || user.created_at)}
            </td>
            <td className="admin-users-col-expires">
              {formatShortDateTime(user.invitation?.expires_at)}
            </td>
          </>
        )}
        <td className="admin-users-col-actions">
          <RowActionsMenu actions={actions} onAction={(actionId) => runAction(actionId, user)} />
        </td>
      </tr>
    );
  }

  function renderUserCard(user) {
    const isSelf = String(sessionUser?.id) === String(user.id);
    const actions = buildUserRowActions(user, { canVerifySecurities, isSelf });
    const statusKey = invitationDisplayStatus(user);
    const isPending = user.status === "pending_invitation";

    return (
      <article
        key={user.id}
        className={`admin-users-card ${isPending ? "admin-users-card--pending" : ""}`}
      >
        <div className="admin-users-card__top">
          <div className="admin-users-name-cell">
            <UserAvatar
              photoUrl={user.photo_url}
              name={displayUserName(user)}
              email={user.email}
              size="sm"
            />
            <div>
              <div className="admin-users-card__name">{displayUserName(user)}</div>
              <Badge className={statusBadgeClass(statusKey)}>{formatStatusLabel(statusKey)}</Badge>
            </div>
          </div>
          <RowActionsMenu actions={actions} onAction={(actionId) => runAction(actionId, user)} />
        </div>
        <div className="admin-users-card__meta">
          {user.business_rank ? (
            <Badge className="admin-users-badge admin-users-badge--rank">{user.business_rank}</Badge>
          ) : null}
          {user.role ? (
            <Badge className="admin-users-badge admin-users-badge--role">{user.role}</Badge>
          ) : null}
        </div>
        <div className="admin-users-card__email" title={user.email || ""}>
          {user.email || "—"}
        </div>
        {activeTab === "users" ? (
          <div className="admin-users-card__row">
            <span className="admin-users-card__label">Rep ID</span>
            {renderRepIdCell(user)}
          </div>
        ) : (
          <div className="admin-users-card__row">
            <span className="admin-users-card__label">Expires</span>
            <span>{formatShortDateTime(user.invitation?.expires_at)}</span>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="identity-page admin-users-page">
      <div className="identity-header admin-users-header">
        <div>
          <h1>Administration — Users</h1>
          <p className="admin-users-subtitle">
            {activeTab === "invitations"
              ? `${filteredUsers.length} pending invitation${filteredUsers.length === 1 ? "" : "s"}`
              : `${filteredUsers.length} shown${total ? ` · ${total} in organization` : ""}`}
          </p>
        </div>
        <Link className="identity-button-secondary" to={appPath("my-account")}>
          My Account
        </Link>
      </div>

      <div className="identity-tabs admin-users-tabs" role="tablist" aria-label="Users and invitations">
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

      <div className="admin-users-toolbar">
        <input
          className="admin-users-toolbar__search"
          placeholder="Search users..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search users by name, email, or Rep ID"
        />
        {activeTab === "users" ? (
          <select
            className="admin-users-toolbar__filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value={USERS_DEFAULT_STATUS_FILTER}>Active + Pending</option>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending_invitation">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
        ) : null}
        <select
          className="admin-users-toolbar__filter"
          value={rankFilter}
          onChange={(event) => setRankFilter(event.target.value)}
          aria-label="Filter by business rank"
        >
          <option value="">All ranks</option>
          {BUSINESS_RANK_ORDER.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <select
          className="admin-users-toolbar__filter"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          aria-label="Filter by permission role"
        >
          <option value="">All roles</option>
          {PERMISSION_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="identity-button admin-users-toolbar__invite"
          onClick={() => {
            setShowCreate(true);
            setActiveTab("invitations");
          }}
        >
          Invite User
        </button>
      </div>

      {error ? <p className="identity-error">{error}</p> : null}

      {showCreate ? (
        <div className="identity-card admin-users-invite-panel">
          <h2>Invite User</h2>
          <p className="identity-muted">
            Business rank is the field hierarchy. Permission role controls platform access and
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
                {activeLeaders.map((leader) => (
                  <option key={leader.id} value={leader.id}>
                    {displayUserName(leader)} ({leader.business_rank || leader.role})
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
                placeholder="Optional"
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
            {displayUserName(securitiesTarget)} — firm verification only (not self-attestation)
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

      <div className="identity-card admin-users-grid-card">
        {loading ? <p className="admin-users-loading">Loading users…</p> : null}

        {!loading && filteredUsers.length === 0 ? (
          <p className="admin-users-empty">No users match the current filters.</p>
        ) : null}

        {!loading && filteredUsers.length > 0 ? (
          <>
            <div className="admin-users-table-wrap admin-users-desktop">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    {activeTab === "users" ? <th>Rep ID</th> : null}
                    <th>Rank</th>
                    <th>Role</th>
                    <th>Status</th>
                    {activeTab === "users" ? (
                      <th>Last Login</th>
                    ) : (
                      <>
                        <th>Sent</th>
                        <th>Expires</th>
                      </>
                    )}
                    <th className="admin-users-col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>{filteredUsers.map((user) => renderUserRow(user))}</tbody>
              </table>
            </div>
            <div className="admin-users-mobile">{filteredUsers.map((user) => renderUserCard(user))}</div>
          </>
        ) : null}

        {!loading && total > 200 ? (
          <p className="admin-users-scale-note">
            Showing up to 200 users. Server-side pagination recommended for larger tenants.
          </p>
        ) : null}
      </div>
    </div>
  );
}
