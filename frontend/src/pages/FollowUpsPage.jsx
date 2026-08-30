import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import AtlasSelect from "../components/ui/AtlasSelect";
import StatusBadge from "../components/ui/StatusBadge";
import {
  getFollowUps,
  createFollowUp,
  completeFollowUp,
  rescheduleFollowUp,
  cancelFollowUp,
  FollowUpsError
} from "../services/followUpsService";
import {
  buildFollowUpDueDate,
  buildFollowUpPriorityLabel,
  buildFollowUpReasonLabel,
  buildFollowUpRepresentativeLabel,
  buildFollowUpsSummary,
  buildFollowUpStatusLabel,
  getFollowUpFilterOptions,
  getFollowUpSortOptions
} from "../engines/followUpsViewModel";
import { navigateToProspectWorkspace } from "../utils/prospectRoutes";
import { appPath } from "../config/appRoutes";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import "./FollowUpsPage.css";

const ENTITY_OPTIONS = [
  "prospect",
  "conversation",
  "appointment",
  "agenda_contact",
  "client"
];

function statusVariant(status) {
  switch (status) {
    case "overdue":
      return "danger";
    case "needs-date":
      return "warning";
    case "due-today":
      return "warning";
    case "upcoming":
      return "info";
    case "completed":
      return "success";
    default:
      return "neutral";
  }
}

function FollowUpDialog({ title, children, onClose, onConfirm, confirmLabel, cancelLabel, loading }) {
  return (
    <div className="follow-ups-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="follow-ups-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
        <div className="follow-ups-dialog__actions">
          <button type="button" className="follow-ups-dialog__secondary" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className="follow-ups-dialog__primary" onClick={onConfirm} disabled={loading}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FollowUpRow({ item, translate, locale, onOpen, onComplete, onReschedule, onCancel, onSetDate }) {
  const dueLabel = buildFollowUpDueDate(item.followUpDate || item.dueDate, item.followUpTime || item.dueTime, locale);
  const statusLabel = buildFollowUpStatusLabel(item, translate);
  const reasonLabel = buildFollowUpReasonLabel(item, translate);
  const priorityLabel = buildFollowUpPriorityLabel(item, translate);
  const representativeLabel = buildFollowUpRepresentativeLabel(item, translate);
  const canManage = item.canManage !== false && item.source !== "legacy" && item.status !== "completed";
  const canSetDate = item.source === "legacy" && item.status === "needs-date";

  return (
    <article className="follow-ups-row">
      <button type="button" className="follow-ups-row__main" onClick={() => onOpen(item)}>
        <div className="follow-ups-row__header">
          <div className="follow-ups-row__identity">
            <h3 className="follow-ups-row__name">{item.name || item.title || item.phone}</h3>
            {item.prospectNumber ? (
              <span className="follow-ups-row__number">{item.prospectNumber}</span>
            ) : null}
          </div>
          <StatusBadge variant={statusVariant(item.status)}>{statusLabel}</StatusBadge>
        </div>

        <dl className="follow-ups-row__details">
          <div className="follow-ups-row__detail">
            <dt>{translate("followUpsColumnReason")}</dt>
            <dd>{reasonLabel}</dd>
          </div>
          <div className="follow-ups-row__detail">
            <dt>{translate("followUpsColumnDue")}</dt>
            <dd>{dueLabel || translate("followUpsStatusNeedsDate")}</dd>
          </div>
          <div className="follow-ups-row__detail">
            <dt>{translate("followUpsColumnRepresentative")}</dt>
            <dd>{representativeLabel}</dd>
          </div>
          <div className="follow-ups-row__detail">
            <dt>{translate("followUpsColumnPriority")}</dt>
            <dd>
              <span className={`follow-ups-row__priority follow-ups-row__priority--${item.status}`}>
                {priorityLabel}
              </span>
            </dd>
          </div>
        </dl>
      </button>
      {canSetDate ? (
        <div className="follow-ups-row__actions">
          <button type="button" onClick={() => onSetDate(item)}>
            {translate("followUpsSetDate")}
          </button>
        </div>
      ) : null}
      {canManage ? (
        <div className="follow-ups-row__actions">
          <button type="button" onClick={() => onComplete(item)}>
            {translate("followUpsComplete")}
          </button>
          <button type="button" onClick={() => onReschedule(item)}>
            {translate("followUpsReschedule")}
          </button>
          <button type="button" onClick={() => onCancel(item)}>
            {translate("followUpsCancel")}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function FollowUpsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { translate, language } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const locale = language === "es" ? "es-US" : "en-US";

  const activeFilter = searchParams.get("filter") || "all";
  const searchQuery = searchParams.get("q") || "";
  const activeSort = searchParams.get("sort") || "due-date";
  const activeScope = searchParams.get("scope") || "mine";

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const lastFetchedAtRef = useRef(0);

  const loadFollowUps = useCallback(async ({ silent = false } = {}) => {
    if (controlPlane) {
      setPayload(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await getFollowUps({
        filter: activeFilter,
        search: searchQuery,
        sort: activeSort,
        scope: activeScope
      });
      setPayload(data);
      lastFetchedAtRef.current = Date.now();
    } catch (err) {
      console.error(err);
      setError(err instanceof FollowUpsError ? translate("followUpsLoadError") : err.message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [activeFilter, activeSort, activeScope, searchQuery, translate, controlPlane]);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  useEffect(() => {
    function refreshIfStale() {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (Date.now() - lastFetchedAtRef.current < 60000) {
        return;
      }
      loadFollowUps({ silent: true }).catch((err) => {
        console.error(err);
      });
    }
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [loadFollowUps]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed === searchQuery.trim()) {
        return;
      }
      const nextParams = new URLSearchParams(searchParams);
      if (trimmed) {
        nextParams.set("q", trimmed);
      } else {
        nextParams.delete("q");
      }
      setSearchParams(nextParams, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchQuery, searchParams, setSearchParams]);

  const filterOptions = useMemo(
    () => getFollowUpFilterOptions(payload?.filters || [], translate),
    [payload?.filters, translate]
  );
  const sortOptions = useMemo(() => getFollowUpSortOptions(translate), [translate]);
  const summary = useMemo(() => buildFollowUpsSummary(payload, translate), [payload, translate]);

  function patchParams(mutator) {
    const nextParams = new URLSearchParams(searchParams);
    mutator(nextParams);
    setSearchParams(nextParams, { replace: true });
  }

  function handleOpen(item) {
    if (item.entityType === "appointment" && (item.appointmentId || item.entityId)) {
      navigate(`${appPath("appointments")}?appointmentId=${encodeURIComponent(item.appointmentId || item.entityId)}`);
      return;
    }
    if (item.entityType === "client" && item.entityId) {
      navigate(appPath(`clients/${item.entityId}`));
      return;
    }
    if (item.entityType === "agenda_contact") {
      navigate(appPath("appointments"));
      return;
    }
    if (item.phone) {
      navigateToProspectWorkspace(navigate, item.phone);
    }
  }

  function openCreate() {
    setForm({
      entityType: searchParams.get("entityType") || "prospect",
      entityId: searchParams.get("entityId") || "",
      subjectLabel: searchParams.get("name") || "",
      dueDate: "",
      dueTime: "",
      notes: ""
    });
    setDialog({ type: "create" });
  }

  async function submitDialog() {
    setSaving(true);
    setError(null);
    try {
      if (dialog.type === "create") {
        await createFollowUp({
          entityType: form.entityType,
          entityId: form.entityId || `manual:${Date.now()}`,
          subjectLabel: form.subjectLabel,
          title: form.subjectLabel || translate("followUpsTitle"),
          dueDate: form.dueDate,
          dueTime: form.dueTime || null,
          notes: form.notes
        });
      } else if (dialog.type === "set-date") {
        await createFollowUp({
          entityType: dialog.item.entityType || "prospect",
          entityId: dialog.item.entityId || dialog.item.phone,
          subjectLabel: dialog.item.name || dialog.item.title,
          title: dialog.item.title || dialog.item.followUpReason || translate("followUpsTitle"),
          dueDate: form.dueDate,
          dueTime: form.dueTime || null,
          notes: dialog.item.followUpReason || dialog.item.notes || null,
          ownerUserId: dialog.item.representativeId || dialog.item.ownerUserId || null,
          subjectPhone: dialog.item.phone || null,
          legacyConversion: true
        });
      } else if (dialog.type === "complete") {
        await completeFollowUp(dialog.item.id, { completionNote: form.notes });
      } else if (dialog.type === "reschedule") {
        await rescheduleFollowUp(dialog.item.id, {
          dueDate: form.dueDate,
          dueTime: form.dueTime || null
        });
      } else if (dialog.type === "cancel") {
        await cancelFollowUp(dialog.item.id, { notes: form.notes });
      }
      setDialog(null);
      await loadFollowUps();
    } catch (err) {
      setError(err instanceof FollowUpsError ? err.message : err.message);
    } finally {
      setSaving(false);
    }
  }

  if (controlPlane) {
    return <ControlPlaneEmptyState translate={translate} />;
  }

  return (
    <div className="follow-ups-page">
      <header className="follow-ups-page__header">
        <div>
          <h1 className="follow-ups-page__title">{translate("followUpsTitle")}</h1>
          <p className="follow-ups-page__subtitle">{translate("followUpsSubtitle")}</p>
        </div>
        <button type="button" className="follow-ups-page__create" onClick={openCreate}>
          {translate("followUpsCreate")}
        </button>
      </header>

      <div className="follow-ups-page__scope" role="tablist" aria-label={translate("followUpsScopeLabel")}>
        <button
          type="button"
          className={`follow-ups-page__filter${activeScope === "mine" ? " is-active" : ""}`}
          onClick={() =>
            patchParams((params) => {
              params.delete("scope");
            })
          }
        >
          {translate("followUpsScopeMine")}
        </button>
        {payload?.teamAvailable ? (
          <button
            type="button"
            className={`follow-ups-page__filter${activeScope === "team" ? " is-active" : ""}`}
            onClick={() =>
              patchParams((params) => {
                params.set("scope", "team");
              })
            }
          >
            {translate("followUpsScopeTeam")}
          </button>
        ) : null}
      </div>

      <div className="follow-ups-page__toolbar">
        <label className="follow-ups-page__search-label" htmlFor="follow-ups-search">
          {translate("followUpsSearchLabel")}
        </label>
        <input
          id="follow-ups-search"
          type="search"
          className="follow-ups-page__search"
          value={searchInput}
          placeholder={translate("followUpsSearchPlaceholder")}
          onChange={(event) => setSearchInput(event.target.value)}
        />

        <div className="follow-ups-page__sort">
          <label className="follow-ups-page__sort-label" htmlFor="follow-ups-sort">
            {translate("followUpsSortLabel")}
          </label>
          <AtlasSelect
            id="follow-ups-sort"
            value={activeSort}
            options={sortOptions.map((option) => ({
              value: option.id,
              label: option.label
            }))}
            onChange={(sortId) =>
              patchParams((params) => {
                if (sortId === "due-date") {
                  params.delete("sort");
                } else {
                  params.set("sort", sortId);
                }
              })
            }
          />
        </div>
      </div>

      <div className="follow-ups-page__filters" role="tablist" aria-label={translate("followUpsFiltersLabel")}>
        {filterOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === option.id}
            className={`follow-ups-page__filter${activeFilter === option.id ? " is-active" : ""}`}
            onClick={() =>
              patchParams((params) => {
                if (option.id === "all") {
                  params.delete("filter");
                } else {
                  params.set("filter", option.id);
                }
              })
            }
          >
            {option.label}
            <span className="follow-ups-page__filter-count">{option.count}</span>
          </button>
        ))}
      </div>

      {!loading && payload ? <p className="follow-ups-page__summary">{summary}</p> : null}
      {error ? <p className="follow-ups-page__error">{error}</p> : null}
      {loading ? <p className="follow-ups-page__status">{translate("followUpsLoading")}</p> : null}
      {!loading && !payload?.items?.length ? (
        <p className="follow-ups-page__status">{translate("followUpsEmpty")}</p>
      ) : null}

      {!loading && payload?.items?.length ? (
        <div className="follow-ups-page__list">
          {payload.items.map((item) => (
            <FollowUpRow
              key={item.id || `${item.phone}:${item.followUpDate}`}
              item={item}
              translate={translate}
              locale={locale}
              onOpen={handleOpen}
              onComplete={(row) => {
                setForm({ notes: "" });
                setDialog({ type: "complete", item: row });
              }}
              onReschedule={(row) => {
                setForm({ dueDate: row.dueDate || row.followUpDate || "", dueTime: row.dueTime || row.followUpTime || "" });
                setDialog({ type: "reschedule", item: row });
              }}
              onCancel={(row) => {
                setForm({ notes: "" });
                setDialog({ type: "cancel", item: row });
              }}
              onSetDate={(row) => {
                setForm({ dueDate: "", dueTime: "" });
                setDialog({ type: "set-date", item: row });
              }}
            />
          ))}
        </div>
      ) : null}

      {!loading && payload?.filteredCount ? (
        <p className="follow-ups-page__footer-hint">{translate("followUpsFooterHint")}</p>
      ) : null}

      {dialog?.type === "create" ? (
        <FollowUpDialog
          title={translate("followUpsCreate")}
          confirmLabel={translate("followUpsSave")}
          cancelLabel={translate("followUpsDialogClose")}
          loading={saving}
          onClose={() => setDialog(null)}
          onConfirm={submitDialog}
        >
          <label>
            {translate("followUpsSubjectType")}
            <select
              value={form.entityType}
              onChange={(event) => setForm((current) => ({ ...current, entityType: event.target.value }))}
            >
              {ENTITY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {translate(`followUpsEntity_${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {translate("followUpsSubjectId")}
            <input
              value={form.entityId}
              onChange={(event) => setForm((current) => ({ ...current, entityId: event.target.value }))}
            />
          </label>
          <label>
            {translate("followUpsSubjectName")}
            <input
              value={form.subjectLabel}
              onChange={(event) => setForm((current) => ({ ...current, subjectLabel: event.target.value }))}
            />
          </label>
          <label>
            {translate("followUpsDate")}
            <input
              type="date"
              required
              value={form.dueDate}
              onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </label>
          <label>
            {translate("followUpsTimeOptional")}
            <input
              type="time"
              value={form.dueTime}
              onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))}
            />
          </label>
          <label>
            {translate("followUpsNote")}
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        </FollowUpDialog>
      ) : null}

      {dialog?.type === "complete" ? (
        <FollowUpDialog
          title={translate("followUpsComplete")}
          confirmLabel={translate("followUpsSave")}
          cancelLabel={translate("followUpsDialogClose")}
          loading={saving}
          onClose={() => setDialog(null)}
          onConfirm={submitDialog}
        >
          <label>
            {translate("followUpsCompletionNote")}
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        </FollowUpDialog>
      ) : null}

      {dialog?.type === "reschedule" || dialog?.type === "set-date" ? (
        <FollowUpDialog
          title={dialog.type === "set-date" ? translate("followUpsSetDate") : translate("followUpsReschedule")}
          confirmLabel={translate("followUpsSave")}
          cancelLabel={translate("followUpsDialogClose")}
          loading={saving}
          onClose={() => setDialog(null)}
          onConfirm={submitDialog}
        >
          <label>
            {translate("followUpsDate")}
            <input
              type="date"
              required
              value={form.dueDate}
              onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </label>
          <label>
            {translate("followUpsTimeOptional")}
            <input
              type="time"
              value={form.dueTime}
              onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))}
            />
          </label>
        </FollowUpDialog>
      ) : null}

      {dialog?.type === "cancel" ? (
        <FollowUpDialog
          title={translate("followUpsCancel")}
          confirmLabel={translate("followUpsSave")}
          cancelLabel={translate("followUpsDialogClose")}
          loading={saving}
          onClose={() => setDialog(null)}
          onConfirm={submitDialog}
        >
          <label>
            {translate("followUpsNote")}
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        </FollowUpDialog>
      ) : null}
    </div>
  );
}
