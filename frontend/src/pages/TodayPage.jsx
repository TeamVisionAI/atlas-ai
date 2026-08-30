import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import StatusBadge from "../components/ui/StatusBadge";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import { getToday, TodayError } from "../services/todayService";
import {
  completeFollowUp,
  createFollowUp,
  cancelFollowUp,
  rescheduleFollowUp,
  FollowUpsError
} from "../services/followUpsService";
import { buildFollowUpDueDate, buildFollowUpStatusLabel } from "../engines/followUpsViewModel";
import "./TodayPage.css";

const TODAY_FILTERS = [
  ["all", "todayFilterAll"],
  ["overdue", "todayFilterOverdue"],
  ["needs_attention", "todayFilterNeedsAttention"],
  ["due_today", "todayFilterDueToday"],
  ["appointments", "todayFilterAppointments"],
  ["follow_ups", "todayFilterFollowUps"],
  ["documents", "todayFilterDocuments"]
];

function statusVariant(status) {
  switch (String(status || "")) {
    case "overdue":
    case "human_required":
      return "danger";
    case "needs-date":
    case "due-today":
    case "new":
      return "warning";
    case "scheduled":
    case "confirmed":
      return "info";
    default:
      return "neutral";
  }
}

function kindLabelKey(kind) {
  switch (String(kind || "")) {
    case "human_takeover":
      return "todayKindHumanTakeover";
    case "appointment":
      return "todayKindAppointment";
    case "follow_up":
      return "todayKindFollowUp";
    case "new_lead":
      return "todayKindNeedsAttention";
    case "service_case":
      return "todayKindService";
    case "document_request":
      return "todayKindDocument";
    default:
      return "todayKindNeedsAttention";
  }
}

function TodayDialog({ title, children, onClose, onConfirm, confirmLabel, cancelLabel, loading }) {
  return (
    <div className="today-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="today-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
        <div className="today-dialog__actions">
          <button type="button" className="today-dialog__secondary" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className="today-dialog__primary" onClick={onConfirm} disabled={loading}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TodayRow({ item, translate, locale, onOpen, onFollowUpAction }) {
  const followUp = item.source && item.kind === "follow_up" ? item.source : null;
  const dueLabel = followUp
    ? buildFollowUpDueDate(followUp.followUpDate || followUp.dueDate, followUp.followUpTime || followUp.dueTime, locale)
    : item.whenLabel;
  const statusLabel = followUp ? buildFollowUpStatusLabel(followUp, translate) : item.status;
  const canManageFollowUp = item.kind === "follow_up" && item.actions?.includes("complete");
  const canSetDate = item.kind === "follow_up" && item.actions?.includes("set-date");
  const primaryLabel =
    item.kind === "appointment"
      ? translate("todayOpenAppointment")
      : item.kind === "document_request"
        ? translate("todayOpenDocument")
        : item.kind === "follow_up" && item.entityType === "client"
          ? translate("todayOpenClient")
          : item.kind === "needs_attention" || item.kind === "human_takeover" || item.kind === "new_lead"
            ? translate("todayOpenConversation")
            : translate("todayOpen");

  return (
    <article className="today-row">
      <button type="button" className="today-row__main" onClick={() => onOpen(item)}>
        <div className="today-row__header">
          <div className="today-row__heading">
            <span className="today-row__kind">{translate(kindLabelKey(item.kind))}</span>
            <h3 className="today-row__title">{item.personName || item.title}</h3>
          </div>
          {statusLabel ? <StatusBadge variant={statusVariant(item.status)}>{statusLabel}</StatusBadge> : null}
        </div>
        <dl className="today-row__details">
          {item.whenLabel || dueLabel ? (
            <div>
              <dt>{translate("todayColumnWhen")}</dt>
              <dd>{item.whenLabel || dueLabel}</dd>
            </div>
          ) : null}
          {item.ownerName ? (
            <div>
              <dt>{translate("todayColumnOwner")}</dt>
              <dd>{item.ownerName}</dd>
            </div>
          ) : null}
          {item.sourceKind || item.subtitle ? (
            <div>
              <dt>{translate("todayColumnSource")}</dt>
              <dd>{item.subtitle || item.sourceKind}</dd>
            </div>
          ) : null}
        </dl>
      </button>
      <div className="today-row__actions">
        <button type="button" onClick={() => onOpen(item)}>
          {primaryLabel}
        </button>
        {canSetDate ? (
          <button type="button" onClick={() => onFollowUpAction("set-date", item)}>
            {translate("followUpsSetDate")}
          </button>
        ) : null}
        {canManageFollowUp ? (
          <>
            <button type="button" onClick={() => onFollowUpAction("complete", item)}>
              {translate("followUpsComplete")}
            </button>
            <button type="button" onClick={() => onFollowUpAction("reschedule", item)}>
              {translate("followUpsReschedule")}
            </button>
            <button type="button" onClick={() => onFollowUpAction("cancel", item)}>
              {translate("followUpsCancel")}
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

export default function TodayPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { translate, language } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const locale = language === "es" ? "es-US" : "en-US";
  const activeScope = searchParams.get("scope") || "mine";
  const activeFilter = searchParams.get("filter") || "all";

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const lastFetchedAtRef = useRef(0);

  const loadToday = useCallback(
    async ({ silent = false } = {}) => {
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
        const data = await getToday({ scope: activeScope, filter: activeFilter });
        setPayload(data);
        lastFetchedAtRef.current = Date.now();
      } catch (err) {
        setError(err instanceof TodayError ? translate("todayLoadError") : err.message);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [activeScope, activeFilter, translate, controlPlane]
  );

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  useEffect(() => {
    function refreshIfStale() {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (Date.now() - lastFetchedAtRef.current < 60000) {
        return;
      }
      loadToday({ silent: true }).catch((err) => {
        console.error(err);
      });
    }
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [loadToday]);

  function replaceParams(mutator) {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    setSearchParams(next, { replace: true });
  }

  function setScope(scope) {
    replaceParams((next) => {
      if (scope === "mine") {
        next.delete("scope");
      } else {
        next.set("scope", scope);
      }
    });
  }

  function setFilter(filter) {
    replaceParams((next) => {
      if (filter === "all") {
        next.delete("filter");
      } else {
        next.set("filter", filter);
      }
    });
  }

  function handleOpen(item) {
    if (item.openPath || item.href) {
      navigate(item.openPath || item.href);
    }
  }

  async function submitDialog() {
    const followUp = dialog?.item?.source;
    if (!followUp || !dialog?.type) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (dialog.type === "set-date") {
        await createFollowUp({
          entityType: followUp.entityType || "prospect",
          entityId: followUp.entityId || followUp.phone,
          subjectLabel: followUp.name || followUp.title,
          title: followUp.title || followUp.followUpReason || translate("followUpsTitle"),
          dueDate: form.dueDate,
          dueTime: form.dueTime || null,
          notes: followUp.followUpReason || followUp.notes || null,
          ownerUserId: followUp.representativeId || followUp.ownerUserId || null,
          subjectPhone: followUp.phone || null,
          legacyConversion: true
        });
      } else if (dialog.type === "complete") {
        await completeFollowUp(followUp.id, { completionNote: form.notes });
      } else if (dialog.type === "reschedule") {
        await rescheduleFollowUp(followUp.id, {
          dueDate: form.dueDate,
          dueTime: form.dueTime || null
        });
      } else if (dialog.type === "cancel") {
        await cancelFollowUp(followUp.id, { notes: form.notes });
      }
      setDialog(null);
      await loadToday({ silent: true });
    } catch (err) {
      setError(err instanceof FollowUpsError ? err.message : err.message);
    } finally {
      setSaving(false);
    }
  }

  if (controlPlane) {
    return <ControlPlaneEmptyState translate={translate} />;
  }

  const counts = payload?.counts || {
    overdue: 0,
    needsAttention: 0,
    dueToday: 0,
    appointmentsToday: 0
  };
  const items = payload?.items || [];
  const filterEmpty = !loading && !payload?.caughtUp && items.length === 0;

  return (
    <div className="today-page">
      <header className="today-page__header">
        <h1 className="today-page__title">{translate("todayTitle")}</h1>
        <p className="today-page__subtitle">{translate("todaySubtitle")}</p>
      </header>

      <div className="today-page__scope" role="tablist" aria-label={translate("todayScopeLabel")}>
        <button
          type="button"
          className={`today-page__scope-btn${activeScope === "mine" ? " is-active" : ""}`}
          onClick={() => setScope("mine")}
        >
          {translate("todayScopeMine")}
        </button>
        {payload?.teamAvailable ? (
          <button
            type="button"
            className={`today-page__scope-btn${activeScope === "team" ? " is-active" : ""}`}
            onClick={() => setScope("team")}
          >
            {translate("todayScopeTeam")}
          </button>
        ) : null}
      </div>

      <div className="today-page__counts" aria-label={translate("todayCountsLabel")}>
        <span className="today-page__chip">
          {translate("todayCountOverdue")}
          <span className="today-page__count">{counts.overdue || 0}</span>
        </span>
        <span className="today-page__chip">
          {translate("todayCountNeedsAttention")}
          <span className="today-page__count">{counts.needsAttention}</span>
        </span>
        <span className="today-page__chip">
          {translate("todayCountDueToday")}
          <span className="today-page__count">{counts.dueToday || 0}</span>
        </span>
        <span className="today-page__chip">
          {translate("todayCountAppointments")}
          <span className="today-page__count">{counts.appointmentsToday}</span>
        </span>
      </div>

      <div className="today-page__filters" role="tablist" aria-label={translate("todayFiltersLabel")}>
        {TODAY_FILTERS.map(([value, labelKey]) => (
          <button
            key={value}
            type="button"
            className={`today-page__scope-btn${activeFilter === value ? " is-active" : ""}`}
            onClick={() => setFilter(value)}
          >
            {translate(labelKey)}
          </button>
        ))}
      </div>

      {error ? <p className="today-page__error">{error}</p> : null}
      {loading ? <p className="today-page__status">{translate("todayLoading")}</p> : null}

      {!loading && payload?.caughtUp ? (
        <p className="today-page__empty">{translate("todayCaughtUp")}</p>
      ) : null}

      {filterEmpty ? <p className="today-page__status">{translate("todayFilterEmpty")}</p> : null}

      {!loading && items.length
        ? (
          <div className="today-page__list">
            {items.map((item) => (
              <TodayRow
                key={item.id}
                item={item}
                translate={translate}
                locale={locale}
                onOpen={handleOpen}
                onFollowUpAction={(type, row) => {
                  const followUp = row.source || {};
                  setForm({
                    notes: "",
                    dueDate: followUp.dueDate || followUp.followUpDate || "",
                    dueTime: followUp.dueTime || followUp.followUpTime || ""
                  });
                  setDialog({ type, item: row });
                }}
              />
            ))}
          </div>
        )
        : null}

      {dialog?.type === "complete" ? (
        <TodayDialog
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
              value={form.notes || ""}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        </TodayDialog>
      ) : null}

      {dialog?.type === "reschedule" || dialog?.type === "set-date" ? (
        <TodayDialog
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
              value={form.dueDate || ""}
              onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </label>
          <label>
            {translate("followUpsTimeOptional")}
            <input
              type="time"
              value={form.dueTime || ""}
              onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))}
            />
          </label>
        </TodayDialog>
      ) : null}

      {dialog?.type === "cancel" ? (
        <TodayDialog
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
              value={form.notes || ""}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        </TodayDialog>
      ) : null}
    </div>
  );
}
