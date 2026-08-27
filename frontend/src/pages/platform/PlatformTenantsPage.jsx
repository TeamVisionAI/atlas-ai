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
  requiresReactivateConfirmation,
  requiresSuspendConfirmation,
  shouldConfirmSupportModeSwitch
} from "../../security/platformAccess";
import {
  assignTenantAdmin,
  createTenant,
  enterSupportMode,
  getTenant,
  listTenants,
  updateTenantStatus,
  updateTenantFeatures
} from "../../services/platformService";
import {
  LIFECYCLE_FILTERS,
  countLifecycleStatuses,
  formatLifecycleBadge,
  isSeedTenant,
  nextDueLabel,
  trialDueLabel
} from "./platformBillingHelpers";
import {
  TENANTS_PAGE_SIZE,
  canAssignFirstAdmin,
  filterTenantsForConsole,
  ownerAdminEmail,
  ownerAdminLabel,
  paginateItems
} from "./platformTenantDisplay";
import OverflowMenu from "../../components/ui/OverflowMenu";
import TablePagination from "../../components/ui/TablePagination";
import TenantBillingPanel from "./TenantBillingPanel";
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

function LifecycleBadge({ status }) {
  const normalized = String(status || "").trim().toUpperCase();
  const className = `platform-status-badge platform-status-badge--${normalized.toLowerCase() || "unknown"}`;

  return <span className={className}>{formatLifecycleBadge(normalized)}</span>;
}

export default function PlatformTenantsPage() {
  const navigate = useNavigate();
  const { user, landingPath, supportMode, refreshSupportMode } = useWorkspace();
  const [tenants, setTenants] = useState([]);
  const [lifecycleFilter, setLifecycleFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [billingTenant, setBillingTenant] = useState(null);
  const [detail, setDetail] = useState(null);
  const [adminForm, setAdminForm] = useState(EMPTY_ADMIN);
  const [assigning, setAssigning] = useState(false);
  const [busyTenantId, setBusyTenantId] = useState("");
  const [featureBusyKey, setFeatureBusyKey] = useState("");

  const allowed = isSuperAdminUser(user);
  const counts = useMemo(() => countLifecycleStatuses(tenants), [tenants]);
  const filteredRows = useMemo(
    () =>
      filterTenantsForConsole(tenants, {
        query: search,
        lifecycleFilter
      }),
    [tenants, search, lifecycleFilter]
  );
  const paged = useMemo(
    () => paginateItems(filteredRows, page, TENANTS_PAGE_SIZE),
    [filteredRows, page]
  );
  const rows = paged.items;

  async function refreshList() {
    const result = await listTenants({ limit: 200 });
    setTenants(result.items || result.tenants || []);
  }

  useEffect(() => {
    if (!allowed) {
      return undefined;
    }

    let cancelled = false;

    setLoading(true);
    listTenants({ limit: 200 })
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

  useEffect(() => {
    setPage(1);
  }, [lifecycleFilter, search]);

  if (!allowed) {
    return null;
  }

  function applyTenantUpdate(updated) {
    if (!updated?.id) {
      return;
    }

    setTenants((current) =>
      current.map((tenant) => (tenant.id === updated.id ? { ...tenant, ...updated } : tenant))
    );

    if (detail?.id === updated.id) {
      setDetail((current) => ({ ...current, ...updated }));
    }

    if (billingTenant?.id === updated.id) {
      setBillingTenant((current) => ({ ...current, ...updated }));
    }
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

    if (requiresReactivateConfirmation(tenant.lifecycleStatus, status)) {
      const confirmed = window.confirm(
        `Reactivate ${tenant.name} from Suspended? This is a Super Admin lifecycle change.`
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
      applyTenantUpdate(updated);
    } catch (err) {
      setError(err.message || "Unable to update tenant status.");
    } finally {
      setBusyTenantId("");
    }
  }

  async function handleFeatureToggle(featureKey, nextValue) {
    if (!detail?.id) {
      return;
    }

    if (featureKey === "recruitAiExecutionEnabled" && nextValue === true) {
      const confirmed = window.confirm(
        `Enable Recruit AI Execution for ${detail.name}?\n\n` +
          "This is a live/destructive capability. Authoring ON does not imply Execution ON — " +
          "this toggle is independent. Global Railway kill switches still apply."
      );
      if (!confirmed) {
        return;
      }
    }

    setFeatureBusyKey(featureKey);
    setError("");
    setNotice("");

    try {
      const result = await updateTenantFeatures(detail.id, {
        [featureKey]: nextValue
      });
      setDetail((current) =>
        current
          ? {
              ...current,
              features: result.features || current.features,
              featureControls: result.controls || current.featureControls
            }
          : current
      );
      setNotice(`Updated ${featureKey} for ${detail.name}.`);
    } catch (err) {
      setError(err.message || "Unable to update tenant features.");
    } finally {
      setFeatureBusyKey("");
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
      setSelectedTenant(null);
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
            Super Admin billing and lifecycle console. Tenant Administrators do not see this page.
          </p>
        </div>
      </div>

      {error ? <p className="identity-error">{error}</p> : null}
      {notice ? <p className="identity-success">{notice}</p> : null}

      <section className="identity-card platform-create-card">
        <h2>Create tenant</h2>
        <form className="platform-create-form" onSubmit={handleCreate}>
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
          <div className="platform-create-form__actions">
            <button type="submit" className="identity-button" disabled={creating}>
              {creating ? "Creating…" : "Create tenant"}
            </button>
          </div>
        </form>
      </section>

      <section className="identity-card platform-tenants-card">
        <div className="platform-tenants-card__head">
          <h2>Tenants</h2>
          <input
            className="platform-tenants-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tenants…"
            aria-label="Search tenants by name, slug, or admin"
          />
        </div>
        <div className="platform-lifecycle-filters" data-testid="platform-lifecycle-filters">
          {LIFECYCLE_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`platform-lifecycle-filters__button${
                lifecycleFilter === filter ? " platform-lifecycle-filters__button--active" : ""
              }`}
              data-testid={`lifecycle-filter-${filter}`}
              onClick={() => setLifecycleFilter(filter)}
            >
              {formatLifecycleBadge(filter === "ALL" ? "ALL" : filter)} ({counts[filter] ?? 0})
            </button>
          ))}
        </div>
        {loading ? <p>Loading tenants…</p> : null}
        <div className="platform-tenants-table-wrap">
          <table className="platform-tenants-table">
            <thead>
              <tr>
                <th className="platform-tenants-col-name">Name</th>
                <th className="platform-tenants-col-status">Status</th>
                <th className="platform-tenants-col-plan">Plan</th>
                <th className="platform-tenants-col-trial">Trial / Due</th>
                <th className="platform-tenants-col-due">Next Due</th>
                <th className="platform-tenants-col-owner">Owner / Admin</th>
                <th className="platform-tenants-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tenant) => {
                const suspended = isTenantSuspended(tenant);
                const seed = isSeedTenant(tenant);
                const assignable = canAssignFirstAdmin(tenant);
                const ownerEmail = ownerAdminEmail(tenant);
                const menuActions = [
                  { id: "view", label: "View" },
                  { id: "billing", label: "Billing" }
                ];

                if (assignable) {
                  menuActions.push({ id: "assign", label: "Assign first admin" });
                }

                return (
                  <tr
                    key={tenant.id}
                    className={suspended ? "platform-tenants-page__row--suspended" : ""}
                  >
                    <td className="platform-tenants-col-name">
                      <div className="platform-tenants-page__name">
                        <strong>{tenant.name}</strong>
                        {seed ? (
                          <span className="platform-seed-badge" data-testid="seed-tenant-badge">
                            Seed Tenant
                          </span>
                        ) : null}
                      </div>
                      <div className="platform-tenants-page__slug">{tenant.slug || "—"}</div>
                    </td>
                    <td className="platform-tenants-col-status">
                      <LifecycleBadge status={tenant.lifecycleStatus || tenant.status} />
                    </td>
                    <td className="platform-tenants-col-plan">
                      {tenant.plan || tenant.subscriptionPlan || "—"}
                    </td>
                    <td className="platform-tenants-col-trial">{trialDueLabel(tenant)}</td>
                    <td className="platform-tenants-col-due">{nextDueLabel(tenant)}</td>
                    <td className="platform-tenants-col-owner" data-testid="tenant-owner-admin">
                      <div className="platform-tenants-page__owner">
                        {ownerAdminLabel(tenant)}
                      </div>
                      {ownerEmail ? (
                        <div className="platform-tenants-page__owner-email">{ownerEmail}</div>
                      ) : null}
                    </td>
                    <td className="platform-tenants-col-actions">
                      <div className="platform-tenants-page__actions">
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
                        <OverflowMenu
                          ariaLabel={`More actions for ${tenant.name}`}
                          actions={menuActions}
                          onAction={(actionId) => {
                            if (actionId === "view") {
                              handleView(tenant);
                            }
                            if (actionId === "billing") {
                              setBillingTenant(tenant);
                            }
                            if (actionId === "assign" && canAssignFirstAdmin(tenant)) {
                              setSelectedTenant(tenant);
                              setAdminForm(EMPTY_ADMIN);
                              setNotice("");
                            }
                          }}
                        >
                          {/* BR-146: Super Admin may still manually PATCH Team Vision lifecycle. */}
                          <label>
                            Status
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
                          </label>
                        </OverflowMenu>
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
        <TablePagination
          page={paged.page}
          pageCount={paged.pageCount}
          total={paged.total}
          pageSize={TENANTS_PAGE_SIZE}
          onPageChange={setPage}
          label="tenants"
        />
      </section>

      {selectedTenant && canAssignFirstAdmin(selectedTenant) ? (
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

      {billingTenant ? (
        <TenantBillingPanel
          tenant={billingTenant}
          onClose={() => setBillingTenant(null)}
          onTenantUpdated={async (updated) => {
            applyTenantUpdate(updated);
            await refreshList();
          }}
        />
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
              <dd>{ownerAdminLabel(detail)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(detail.createdAt)}</dd>
            </div>
          </dl>

          <h3 className="platform-tenants-page__features-title">Operational features</h3>
          <p className="platform-tenants-page__lede">
            Super Admin only. Global Railway kill switches still apply. Authoring and Execution are
            independent — enabling Authoring never enables Execution.
          </p>
          <div className="platform-feature-controls" data-testid="platform-feature-controls">
            {(detail.featureControls || []).map((control) => (
              <div
                key={control.featureKey}
                className={`platform-feature-controls__row${
                  control.destructive ? " platform-feature-controls__row--destructive" : ""
                }`}
              >
                <div>
                  <strong>{control.label}</strong>
                  <div className="platform-feature-controls__status">{control.statusLabel}</div>
                  {control.destructive ? (
                    <div className="platform-feature-controls__warning">
                      Live mutations / appointments — use with care.
                    </div>
                  ) : null}
                </div>
                <label className="platform-feature-controls__toggle">
                  <span>Configured</span>
                  <input
                    type="checkbox"
                    checked={Boolean(control.configured)}
                    disabled={featureBusyKey === control.featureKey}
                    onChange={(event) =>
                      handleFeatureToggle(control.featureKey, event.target.checked)
                    }
                    data-testid={`feature-toggle-${control.featureKey}`}
                  />
                </label>
              </div>
            ))}
            {!detail.featureControls?.length ? (
              <p className="platform-tenants-page__lede">Feature controls unavailable.</p>
            ) : null}
          </div>

          <div className="identity-actions">
            <button
              type="button"
              className="identity-button-secondary"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
