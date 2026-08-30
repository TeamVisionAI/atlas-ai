/**
 * BR-182 — My Service / authorized Team Service.
 * Client service cases only. Not recruiting and not production.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import { appPath } from "../config/appRoutes";
import { getClients } from "../services/clientsService";
import {
  createServiceCase,
  createServiceFollowUp,
  getServiceCases,
  ServiceCasesError,
  updateServiceCase,
  updateServiceCaseStatus
} from "../services/serviceCasesService";
import {
  SERVICE_STATUSES,
  SERVICE_TYPES,
  buildServiceStatusLabel,
  buildServiceTypeLabel,
  emptyServiceForm
} from "../engines/serviceViewModel";
import { ServiceCaseCard, ServiceDialogs } from "./ServiceRecordsBlock";
import "./ClientsPage.css";

const DUE_FILTERS = ["all", "needs-date", "due-today", "overdue", "upcoming"];

export default function ServicePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { translate, language } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const locale = language === "es" ? "es-US" : "en-US";
  const activeScope = searchParams.get("scope") || "mine";
  const searchQuery = searchParams.get("q") || "";
  const statusFilter = searchParams.get("status") || "";
  const typeFilter = searchParams.get("serviceType") || "";
  const dueFilter = searchParams.get("due") || "all";

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [payload, setPayload] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(emptyServiceForm());
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    if (controlPlane) {
      setPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [service, clientPayload] = await Promise.all([
        getServiceCases({
          search: searchQuery,
          scope: activeScope,
          status: statusFilter,
          serviceType: typeFilter,
          due: dueFilter
        }),
        getClients({ scope: activeScope })
      ]);
      setPayload(service);
      setClients(clientPayload?.items || []);
    } catch (err) {
      setError(err instanceof ServiceCasesError ? translate("serviceLoadError") : err.message);
    } finally {
      setLoading(false);
    }
  }, [activeScope, controlPlane, dueFilter, searchQuery, statusFilter, translate, typeFilter]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed === searchQuery.trim()) return;
      const next = new URLSearchParams(searchParams);
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      setSearchParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchQuery, searchParams, setSearchParams]);

  function patchParams(updates) {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || (key === "scope" && value === "mine") || (key === "due" && value === "all")) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    setSearchParams(next, { replace: true });
  }

  async function submitDialog() {
    setSaving(true);
    setError(null);
    try {
      if (dialog?.type === "create") {
        await createServiceCase({
          clientId: form.clientId,
          serviceType: form.serviceType,
          title: form.title,
          notes: form.notes || null,
          dueDate: form.dueDate || null
        });
      } else if (dialog?.type === "edit") {
        await updateServiceCase(dialog.item.id, {
          serviceType: form.serviceType,
          title: form.title,
          notes: form.notes || null,
          dueDate: form.dueDate || null
        });
      } else if (dialog?.type === "status") {
        await updateServiceCaseStatus(dialog.item.id, { status: form.status });
      } else if (dialog?.type === "follow-up") {
        await createServiceFollowUp(dialog.item.id, {
          dueDate: form.dueDate,
          dueTime: form.dueTime || null,
          notes: form.notes || null
        });
      }
      setDialog(null);
      await loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (controlPlane) {
    return <ControlPlaneEmptyState translate={translate} />;
  }

  return (
    <div className="clients-page">
      <header className="clients-page__header">
        <div>
          <h1 className="clients-page__title">{translate("serviceTitle")}</h1>
          <p className="clients-page__subtitle">{translate("serviceSubtitle")}</p>
        </div>
        <button
          type="button"
          className="clients-page__filter"
          onClick={() => {
            setForm(emptyServiceForm());
            setDialog({ type: "create" });
          }}
        >
          {translate("serviceAdd")}
        </button>
      </header>

      <div className="clients-page__scope" role="tablist" aria-label={translate("serviceScopeLabel")}>
        <button
          type="button"
          className={`clients-page__filter${activeScope === "mine" ? " is-active" : ""}`}
          onClick={() => patchParams({ scope: "mine" })}
        >
          {translate("serviceScopeMine")}
        </button>
        {payload?.teamAvailable ? (
          <button
            type="button"
            className={`clients-page__filter${activeScope === "team" ? " is-active" : ""}`}
            onClick={() => patchParams({ scope: "team" })}
          >
            {translate("serviceScopeTeam")}
          </button>
        ) : null}
      </div>

      <div className="clients-page__scope" aria-label={translate("serviceFilters")}>
        <label className="clients-page__search-label">
          {translate("serviceStatus")}
          <select value={statusFilter} onChange={(event) => patchParams({ status: event.target.value })}>
            <option value="">{translate("serviceFilterAll")}</option>
            {Object.values(SERVICE_STATUSES).map((status) => (
              <option key={status} value={status}>
                {buildServiceStatusLabel(status, translate)}
              </option>
            ))}
          </select>
        </label>
        <label className="clients-page__search-label">
          {translate("serviceType")}
          <select value={typeFilter} onChange={(event) => patchParams({ serviceType: event.target.value })}>
            <option value="">{translate("serviceFilterAll")}</option>
            {Object.values(SERVICE_TYPES).map((type) => (
              <option key={type} value={type}>
                {buildServiceTypeLabel(type, translate)}
              </option>
            ))}
          </select>
        </label>
        <label className="clients-page__search-label">
          {translate("serviceDue")}
          <select value={dueFilter} onChange={(event) => patchParams({ due: event.target.value })}>
            {DUE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === "all" ? translate("serviceFilterAll") : translate(`serviceDue${value === "needs-date" ? "NeedsDate" : value === "due-today" ? "Today" : value === "overdue" ? "Overdue" : "Upcoming"}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="clients-page__search-label" htmlFor="service-search">
        {translate("serviceSearchLabel")}
        <input
          id="service-search"
          type="search"
          className="clients-page__search"
          value={searchInput}
          placeholder={translate("serviceSearchPlaceholder")}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </label>

      {payload ? (
        <dl className="clients-card__details">
          <div>
            <dt>{translate("serviceMetricOpen")}</dt>
            <dd>{payload.counts?.open || 0}</dd>
          </div>
          <div>
            <dt>{translate("serviceDueOverdue")}</dt>
            <dd>{payload.counts?.overdue || 0}</dd>
          </div>
          <div>
            <dt>{translate("serviceDueToday")}</dt>
            <dd>{payload.counts?.dueToday || 0}</dd>
          </div>
          <div>
            <dt>{translate("serviceDueNeedsDate")}</dt>
            <dd>{payload.counts?.needsDate || 0}</dd>
          </div>
        </dl>
      ) : null}

      {error ? <p className="clients-page__error">{error}</p> : null}
      {loading ? <p className="clients-page__status">{translate("serviceLoading")}</p> : null}
      {!loading && !payload?.items?.length ? <p className="clients-page__status">{translate("serviceEmpty")}</p> : null}

      {!loading && payload?.items?.length ? (
        <ul className="clients-list">
          {payload.items.map((item) => (
            <ServiceCaseCard
              key={item.id}
              item={item}
              translate={translate}
              locale={locale}
              onOpenClient={(record) => navigate(appPath(`clients/${record.clientId}`))}
              onEdit={(record) => {
                setForm(
                  emptyServiceForm({
                    serviceType: record.serviceType,
                    title: record.title || "",
                    notes: record.notes || "",
                    dueDate: record.dueDate || "",
                    scheduledAppointmentId: record.scheduledAppointmentId || ""
                  })
                );
                setDialog({ type: "edit", item: record });
              }}
              onStatus={(record) => {
                setForm(emptyServiceForm({ status: record.status }));
                setDialog({ type: "status", item: record });
              }}
              onFollowUp={(record) => {
                setForm(emptyServiceForm({ title: record.title }));
                setDialog({ type: "follow-up", item: record });
              }}
            />
          ))}
        </ul>
      ) : null}

      <ServiceDialogs
        dialog={dialog}
        form={form}
        setForm={setForm}
        translate={translate}
        saving={saving}
        clients={clients}
        showClientOnCreate
        onClose={() => setDialog(null)}
        onConfirm={submitDialog}
      />
    </div>
  );
}
