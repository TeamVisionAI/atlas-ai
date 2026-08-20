import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { getDefaultLandingPath } from "../../config/workspaceExperience";
import { isSuperAdminUser } from "../../security/isSuperAdminUser";
import {
  DEFAULT_CREATE_TENANT_STATUS,
  TENANT_LIFECYCLE_STATUSES,
  canEnterSupportMode,
  isTenantSuspended,
  requiresSuspendConfirmation,
  shouldConfirmSupportModeSwitch
} from "../../security/platformAccess";
import {
  assignTenantAdmin,
  createTenant,
  enterSupportMode,
  getTenant,
  listTenants,
  updateTenantStatus
} from "../../services/platformService";
import "../identity/identity.css";
import "./PlatformTenantsPage.css";

const EMPTY_CREATE = {
  name: "",
  slug: "",
  status: DEFAULT_CREATE_TENANT_STATUS
};

const EMPTY_ADMIN = {
  firstName: "",
  lastName: "",
  email: ""
};

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function ownerLabel(tenant) {
  return tenant?.ownerUserId || "—";
}

export default function PlatformTenantsPage() {
  const navigate = useNavigate();
  const { user, landingPath, supportMode, refreshSupportMode } = useWorkspace();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [detail, setDetail] = useState(null);
  const [adminForm, setAdminForm] = useState(EMPTY_ADMIN);
  const [assigning, setAssigning] = useState(false);
  const [busyTenantId, setBusyTenantId] = useState("");

  const allowed = isSuperAdminUser(user);

  async function refreshList() {
    const result = await listTenants();
    setTenants(result.items || result.tenants || []);
  }

  useEffect(() => {
    if (!allowed) {
      return undefined;
    }

    let cancelled = false;

    setLoading(true);
    listTenants()
      .then((result) => {
        if (!cancelled) {
          setTenants(result.items || result.tenants || []);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Unable to load tenants.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const rows = useMemo(() => tenants, [tenants]);

  if (!allowed) {
    return null;
  }

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setError("");
    setNotice("");

    try {
      const result = await createTenant(createForm);
      const tenant = result.tenant || result;
      setNotice(`Tenant “${tenant.name}” created.`);
      setCreateForm(EMPTY_CREATE);
      await refreshList();
      setSelectedTenant(tenant);
      setAdminForm(EMPTY_ADMIN);
      setDetail(tenant);
    } catch (err) {
      setError(err.message || "Unable to create tenant.");
    } finally {
      setCreating(false);
    }
  }

  async function handleView(tenant) {
    setError("");
    setBusyTenantId(tenant.id);

    try {
      const result = await getTenant(tenant.id);
      const loaded = result.tenant || result;
      setDetail(loaded);
      setSelectedTenant(loaded);
    } catch (err) {
      setError(err.message || "Unable to load tenant.");
    } finally {
      setBusyTenantId("");
    }
  }

  async function handleStatusChange(tenant, status) {
    if (requiresSuspendConfirmation(status)) {
      const confirmed = window.confirm(
        `Suspend ${tenant.name}? Support Mode will be unavailable while this tenant is suspended.`
      );

      if (!confirmed) {
        return;
      }
    }

    setBusyTenantId(tenant.id);
    setError("");
    setNotice("");

    try {
      const result = await updateTenantStatus(tenant.id, status);
      const updated = result.tenant || result;
      setNotice(`${updated.name} is now ${updated.lifecycleStatus}.`);
      await refreshList();
      if (detail?.id === tenant.id) {
        setDetail(updated);
      }
    } catch (err) {
      setError(err.message || "Unable to update tenant status.");
    } finally {
      setBusyTenantId("");
    }
  }

  async function handleAssignAdmin(event) {
    event.preventDefault();

    if (!selectedTenant?.id) {
      setError("Select a tenant before assigning an admin.");
      return;
    }

    setAssigning(true);
    setError("");
    setNotice("");

    try {
      const result = await assignTenantAdmin(selectedTenant.id, adminForm);
      const email = result.user?.email || adminForm.email;
      const invitationStatus = result.invitation
        ? "Invitation created."
        : `Status: ${result.user?.status || "created"}.`;
      setNotice(`Tenant Admin ${email} created. ${invitationStatus}`);
      setAdminForm(EMPTY_ADMIN);
      await refreshList();
    } catch (err) {
      setError(err.message || "Unable to assign tenant admin.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleEnterSupportMode(tenant) {
    if (!canEnterSupportMode(tenant)) {
      return;
    }

    if (shouldConfirmSupportModeSwitch(supportMode, tenant.id)) {
      const confirmed = window.confirm(
        `Leave Support Mode for ${supportMode.organizationName} and enter ${tenant.name}?`
      );

      if (!confirmed) {
        return;
      }
    }

    setBusyTenantId(tenant.id);
    setError("");

    try {
      await enterSupportMode(tenant.id);
      await refreshSupportMode?.();
      navigate(landingPath || getDefaultLandingPath(user?.role));
    } catch (err) {
      setError(err.message || "Unable to enter Support Mode.");
    } finally {
      setBusyTenantId("");
    }
  }

  return (
    <div className="identity-page platform-tenants-page">
      <div className="identity-header">
        <div>
          <h1>Platform tenants</h1>
          <p className="platform-tenants-page__lede">
            Super Admin console. Tenant Administrators do not see this page.
          </p>
        </div>
      </div>

      {error ? <p className="identity-error">{error}</p> : null}
      {notice ? <p className="identity-success">{notice}</p> : null}

      <section className="identity-card">
        <h2>Create tenant</h2>
        <form className="identity-form" onSubmit={handleCreate}>
          <label>
            Name
            <input
              value={createForm.name}
              onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))}
              required
            />
          </label>
          <label>
            Slug
            <input
              value={createForm.slug}
              onChange={(event) => setCreateForm((form) => ({ ...form, slug: event.target.value }))}
              placeholder="optional"
            />
          </label>
          <label>
            Initial status
            <select
              value={createForm.status}
              onChange={(event) => setCreateForm((form) => ({ ...form, status: event.target.value }))}
            >
              {TENANT_LIFECYCLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <div className="identity-actions">
            <button type="submit" className="identity-button" disabled={creating}>
              {creating ? "Creating…" : "Create tenant"}
            </button>
          </div>
        </form>
      </section>

      <section className="identity-card">
        <h2>Tenants</h2>
        {loading ? <p>Loading tenants…</p> : null}
        <div className="identity-table-wrap">
          <table className="identity-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Active</th>
                <th>Subscription</th>
                <th>Owner / admin</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tenant) => {
                const suspended = isTenantSuspended(tenant);
                return (
                  <tr key={tenant.id} className={suspended ? "platform-tenants-page__row--suspended" : ""}>
                    <td>{tenant.name}</td>
                    <td>{tenant.slug || "—"}</td>
                    <td>
                      <strong>{tenant.lifecycleStatus || tenant.status || "—"}</strong>
                    </td>
                    <td>{tenant.isActive === false ? "Inactive" : "Active"}</td>
                    <td>{tenant.subscriptionStatus || "—"}</td>
                    <td className="platform-tenants-page__owner">{ownerLabel(tenant)}</td>
                    <td>{formatDate(tenant.createdAt)}</td>
                    <td>
                      <div className="identity-actions">
                        <button
                          type="button"
                          className="identity-button-secondary"
                          onClick={() => handleView(tenant)}
                          disabled={busyTenantId === tenant.id}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="identity-button-secondary"
                          onClick={() => {
                            setSelectedTenant(tenant);
                            setAdminForm(EMPTY_ADMIN);
                            setNotice("");
                          }}
                        >
                          Assign first admin
                        </button>
                        <select
                          aria-label={`Change status for ${tenant.name}`}
                          value={tenant.lifecycleStatus || ""}
                          onChange={(event) => handleStatusChange(tenant, event.target.value)}
                          disabled={busyTenantId === tenant.id}
                        >
                          {TENANT_LIFECYCLE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="identity-button"
                          onClick={() => handleEnterSupportMode(tenant)}
                          disabled={!canEnterSupportMode(tenant) || busyTenantId === tenant.id}
                          title={
                            suspended
                              ? "Support Mode is unavailable while this tenant is suspended."
                              : "Enter Support Mode"
                          }
                        >
                          Enter Support Mode
                        </button>
                      </div>
                      {suspended ? (
                        <p className="platform-tenants-page__suspended-hint">
                          Support Mode unavailable while suspended.
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedTenant ? (
        <section className="identity-card">
          <h2>Assign first admin — {selectedTenant.name}</h2>
          <p className="platform-tenants-page__lede">
            Admin is created in this tenant. Organization is not selectable.
          </p>
          <form className="identity-form" onSubmit={handleAssignAdmin}>
            <input type="hidden" name="tenantId" value={selectedTenant.id} readOnly />
            <label>
              First name
              <input
                value={adminForm.firstName}
                onChange={(event) =>
                  setAdminForm((form) => ({ ...form, firstName: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Last name
              <input
                value={adminForm.lastName}
                onChange={(event) =>
                  setAdminForm((form) => ({ ...form, lastName: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={adminForm.email}
                onChange={(event) =>
                  setAdminForm((form) => ({ ...form, email: event.target.value }))
                }
                required
              />
            </label>
            <div className="identity-actions">
              <button type="submit" className="identity-button" disabled={assigning}>
                {assigning ? "Assigning…" : "Assign admin"}
              </button>
              <button
                type="button"
                className="identity-button-secondary"
                onClick={() => setSelectedTenant(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {detail ? (
        <section className="identity-card">
          <h2>Tenant detail</h2>
          <dl className="platform-tenants-page__detail">
            <div>
              <dt>Name</dt>
              <dd>{detail.name}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd>{detail.slug || "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{detail.lifecycleStatus}</dd>
            </div>
            <div>
              <dt>Active</dt>
              <dd>{detail.isActive === false ? "Inactive" : "Active"}</dd>
            </div>
            <div>
              <dt>Subscription</dt>
              <dd>{detail.subscriptionStatus || "—"}</dd>
            </div>
            <div>
              <dt>Owner / admin</dt>
              <dd>{ownerLabel(detail)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(detail.createdAt)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
