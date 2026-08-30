/**
 * BR-181 — My Production / authorized Team Production.
 * Client business outcomes only. Not recruiting production.
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
  createProduction,
  createProductionFollowUp,
  getProductionList,
  ProductionError,
  updateProduction,
  updateProductionStatus
} from "../services/productionService";
import {
  PRODUCTION_ACTIVITY_TYPES,
  PRODUCTION_STATUSES,
  buildProductionStatusLabel,
  buildProductionTypeLabel,
  emptyProductionForm,
  formatProductionAmount
} from "../engines/productionViewModel";
import { ProductionDialogs, ProductionRecordCard } from "./ProductionRecordsBlock";
import "./ClientsPage.css";

function optionalAmount(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return value;
}

export default function ProductionPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { translate, language } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const locale = language === "es" ? "es-US" : "en-US";
  const activeScope = searchParams.get("scope") || "mine";
  const searchQuery = searchParams.get("q") || "";
  const statusFilter = searchParams.get("status") || "";
  const typeFilter = searchParams.get("activityType") || "";
  const fromFilter = searchParams.get("from") || "";
  const toFilter = searchParams.get("to") || "";

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [payload, setPayload] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(emptyProductionForm());
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
      const [production, clientPayload] = await Promise.all([
        getProductionList({
          search: searchQuery,
          scope: activeScope,
          status: statusFilter,
          activityType: typeFilter,
          from: fromFilter,
          to: toFilter
        }),
        getClients({ scope: activeScope })
      ]);
      setPayload(production);
      setClients(clientPayload?.items || []);
    } catch (err) {
      setError(err instanceof ProductionError ? translate("productionLoadError") : err.message);
    } finally {
      setLoading(false);
    }
  }, [activeScope, controlPlane, fromFilter, searchQuery, statusFilter, toFilter, translate, typeFilter]);

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
      if (!value || (key === "scope" && value === "mine")) next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  }

  async function submitDialog() {
    setSaving(true);
    setError(null);
    try {
      if (dialog?.type === "create") {
        await createProduction({
          clientId: form.clientId,
          activityType: form.activityType,
          status: form.status,
          carrier: form.carrier || null,
          productType: form.productType || null,
          amount: optionalAmount(form.amount),
          notes: form.notes || null
        });
      } else if (dialog?.type === "edit") {
        await updateProduction(dialog.item.id, {
          activityType: form.activityType,
          carrier: form.carrier || null,
          productType: form.productType || null,
          amount: optionalAmount(form.amount),
          notes: form.notes || null
        });
      } else if (dialog?.type === "status") {
        await updateProductionStatus(dialog.item.id, { status: form.status });
      } else if (dialog?.type === "follow-up") {
        await createProductionFollowUp(dialog.item.id, {
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
          <h1 className="clients-page__title">{translate("productionTitle")}</h1>
          <p className="clients-page__subtitle">{translate("productionSubtitle")}</p>
        </div>
        <button
          type="button"
          className="clients-page__filter"
          onClick={() => {
            setForm(emptyProductionForm({ status: PRODUCTION_STATUSES.DRAFT }));
            setDialog({ type: "create" });
          }}
        >
          {translate("productionAdd")}
        </button>
      </header>

      <div className="clients-page__scope" role="tablist" aria-label={translate("productionScopeLabel")}>
        <button
          type="button"
          className={`clients-page__filter${activeScope === "mine" ? " is-active" : ""}`}
          onClick={() => patchParams({ scope: "mine" })}
        >
          {translate("productionScopeMine")}
        </button>
        {payload?.teamAvailable ? (
          <button
            type="button"
            className={`clients-page__filter${activeScope === "team" ? " is-active" : ""}`}
            onClick={() => patchParams({ scope: "team" })}
          >
            {translate("productionScopeTeam")}
          </button>
        ) : null}
      </div>

      <div className="clients-page__scope" aria-label={translate("productionFilters")}>
        <label className="clients-page__search-label">
          {translate("productionStatus")}
          <select value={statusFilter} onChange={(event) => patchParams({ status: event.target.value })}>
            <option value="">{translate("productionFilterAll")}</option>
            {Object.values(PRODUCTION_STATUSES).map((status) => (
              <option key={status} value={status}>
                {buildProductionStatusLabel(status, translate)}
              </option>
            ))}
          </select>
        </label>
        <label className="clients-page__search-label">
          {translate("productionType")}
          <select value={typeFilter} onChange={(event) => patchParams({ activityType: event.target.value })}>
            <option value="">{translate("productionFilterAll")}</option>
            {Object.values(PRODUCTION_ACTIVITY_TYPES).map((type) => (
              <option key={type} value={type}>
                {buildProductionTypeLabel(type, translate)}
              </option>
            ))}
          </select>
        </label>
        <label className="clients-page__search-label">
          {translate("productionFrom")}
          <input type="date" value={fromFilter} onChange={(event) => patchParams({ from: event.target.value })} />
        </label>
        <label className="clients-page__search-label">
          {translate("productionTo")}
          <input type="date" value={toFilter} onChange={(event) => patchParams({ to: event.target.value })} />
        </label>
      </div>

      <label className="clients-page__search-label" htmlFor="production-search">
        {translate("productionSearchLabel")}
        <input
          id="production-search"
          type="search"
          className="clients-page__search"
          value={searchInput}
          placeholder={translate("productionSearchPlaceholder")}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </label>

      {payload ? (
        <dl className="clients-card__details">
          {["submitted", "pending", "issued", "paid"].map((key) => (
            <div key={key}>
              <dt>{translate(`productionMetric${key[0].toUpperCase()}${key.slice(1)}`)}</dt>
              <dd>
                {payload.counts?.[key] || 0}
                {payload.amounts?.[key] != null ? ` · ${formatProductionAmount(payload.amounts[key], locale)}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {error ? <p className="clients-page__error">{error}</p> : null}
      {loading ? <p className="clients-page__status">{translate("productionLoading")}</p> : null}
      {!loading && !payload?.items?.length ? <p className="clients-page__status">{translate("productionEmpty")}</p> : null}

      {!loading && payload?.items?.length ? (
        <ul className="clients-list">
          {payload.items.map((item) => (
            <ProductionRecordCard
              key={item.id}
              item={item}
              translate={translate}
              locale={locale}
              onOpenClient={(record) => navigate(appPath(`clients/${record.clientId}`))}
              onEdit={(record) => {
                setForm(
                  emptyProductionForm({
                    activityType: record.activityType,
                    carrier: record.carrier || "",
                    productType: record.productType || "",
                    amount: record.amount == null ? "" : String(record.amount),
                    notes: record.notes || ""
                  })
                );
                setDialog({ type: "edit", item: record });
              }}
              onStatus={(record) => {
                setForm(emptyProductionForm({ status: record.status }));
                setDialog({ type: "status", item: record });
              }}
              onFollowUp={(record) => {
                setForm(emptyProductionForm());
                setDialog({ type: "follow-up", item: record });
              }}
            />
          ))}
        </ul>
      ) : null}

      <ProductionDialogs
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
