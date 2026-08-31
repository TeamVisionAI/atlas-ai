/**
 * BR-186 — Policy Review / IUL pipeline. Separate from Recruiting Dashboard
 * and Policy Intelligence.
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
  completePolicyReview,
  createPolicyReview,
  createPolicyReviewFollowUp,
  getPolicyReviews,
  linkPolicyReviewAppointment,
  markPolicyReviewDocumentsReceived,
  markPolicyReviewPlaced,
  PolicyReviewsError,
  recordPolicyReviewOutcome,
  requestPolicyReviewDocuments,
  submitPolicyReviewApplication,
  transitionPolicyReviewStage
} from "../services/policyReviewsService";
import {
  POLICY_REVIEW_OUTCOMES,
  POLICY_REVIEW_STAGES,
  buildPolicyReviewStageLabel,
  emptyPolicyReviewForm,
  formatPolicyReviewMoney
} from "../engines/policyReviewViewModel";
import "./ClientsPage.css";

const METRICS = [
  ["newLeads", "policyReviewMetricNewLeads"],
  ["qualified", "policyReviewMetricQualified"],
  ["appointmentsBooked", "policyReviewMetricAppointments"],
  ["documentsPending", "policyReviewMetricDocumentsPending"],
  ["reviewsCompleted", "policyReviewMetricReviewsCompleted"],
  ["replacementOpportunities", "policyReviewMetricReplacement"],
  ["applicationsSubmitted", "policyReviewMetricApplications"],
  ["placed", "policyReviewMetricPlaced"],
  ["monthlyPremium", "policyReviewMetricMonthly"],
  ["annualizedPremium", "policyReviewMetricAnnualized"],
  ["estimatedCommission", "policyReviewMetricCommission"]
];

const MONEY_METRICS = new Set(["monthlyPremium", "annualizedPremium", "estimatedCommission"]);

function PolicyReviewDialog({ title, children, onClose, onConfirm, confirmLabel, cancelLabel, loading }) {
  return (
    <div className="clients-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="clients-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="clients-dialog__actions">
          <button type="button" className="clients-dialog__secondary" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className="clients-dialog__primary" onClick={onConfirm} disabled={loading}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PolicyReviewsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { translate, language } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const locale = language === "es" ? "es-US" : "en-US";
  const activeScope = searchParams.get("scope") || "mine";
  const searchQuery = searchParams.get("q") || "";
  const stageFilter = searchParams.get("stage") || "";
  const clientFilter = searchParams.get("clientId") || "";

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [payload, setPayload] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(emptyPolicyReviewForm());
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
      const [reviews, clientPayload] = await Promise.all([
        getPolicyReviews({
          search: searchQuery,
          scope: activeScope,
          stage: stageFilter,
          clientId: clientFilter
        }),
        getClients({ scope: activeScope })
      ]);
      setPayload(reviews);
      setClients(clientPayload?.items || []);
    } catch (err) {
      setError(err instanceof PolicyReviewsError ? translate("policyReviewLoadError") : err.message);
    } finally {
      setLoading(false);
    }
  }, [activeScope, clientFilter, controlPlane, searchQuery, stageFilter, translate]);

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
      const itemId = dialog?.item?.id;
      if (dialog?.type === "create") {
        await createPolicyReview({
          clientId: form.clientId,
          language: form.language || null,
          state: form.state || null,
          source: form.source || null,
          campaign: form.campaign || null,
          campaignIntakeCode: form.campaignIntakeCode || null
        });
      } else if (dialog?.type === "stage") {
        await transitionPolicyReviewStage(itemId, { stage: form.stage });
      } else if (dialog?.type === "complete") {
        await completePolicyReview(itemId);
      } else if (dialog?.type === "outcome") {
        await recordPolicyReviewOutcome(itemId, { outcome: form.outcome });
      } else if (dialog?.type === "appointment") {
        await linkPolicyReviewAppointment(itemId, { appointmentId: form.appointmentId });
      } else if (dialog?.type === "documents") {
        await requestPolicyReviewDocuments(itemId, {
          title: form.title || translate("policyReviewDocumentsTitle"),
          instructions: form.instructions || null,
          dueDate: form.dueDate || null
        });
      } else if (dialog?.type === "documents-received") {
        await markPolicyReviewDocumentsReceived(itemId);
      } else if (dialog?.type === "application") {
        await submitPolicyReviewApplication(itemId, {
          carrierProductLabel: form.carrierProductLabel || null,
          monthlyPremium: form.monthlyPremium === "" ? null : form.monthlyPremium,
          annualizedPremium: form.annualizedPremium === "" ? null : form.annualizedPremium,
          commissionLevelPct: form.commissionLevelPct === "" ? undefined : form.commissionLevelPct,
          paidAdvanceFactorPct: form.paidAdvanceFactorPct === "" ? undefined : form.paidAdvanceFactorPct,
          submissionDate: form.submissionDate || null
        });
      } else if (dialog?.type === "placed") {
        await markPolicyReviewPlaced(itemId, { placedDate: form.placedDate || null });
      } else if (dialog?.type === "follow-up") {
        await createPolicyReviewFollowUp(itemId, {
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
          <h1 className="clients-page__title">{translate("policyReviewTitle")}</h1>
          <p className="clients-page__subtitle">{translate("policyReviewSubtitle")}</p>
        </div>
        <button
          type="button"
          className="clients-page__filter"
          onClick={() => {
            setForm(emptyPolicyReviewForm({ clientId: clientFilter }));
            setDialog({ type: "create" });
          }}
        >
          {translate("policyReviewAdd")}
        </button>
      </header>

      <div className="clients-page__scope" role="tablist" aria-label={translate("policyReviewScopeLabel")}>
        <button
          type="button"
          className={`clients-page__filter${activeScope === "mine" ? " is-active" : ""}`}
          onClick={() => patchParams({ scope: "mine" })}
        >
          {translate("policyReviewScopeMine")}
        </button>
        {payload?.teamAvailable ? (
          <button
            type="button"
            className={`clients-page__filter${activeScope === "team" ? " is-active" : ""}`}
            onClick={() => patchParams({ scope: "team" })}
          >
            {translate("policyReviewScopeTeam")}
          </button>
        ) : null}
      </div>

      <div className="clients-page__scope" aria-label={translate("policyReviewFilters")}>
        <label className="clients-page__search-label">
          {translate("policyReviewStage")}
          <select value={stageFilter} onChange={(event) => patchParams({ stage: event.target.value })}>
            <option value="">{translate("policyReviewFilterAll")}</option>
            {Object.values(POLICY_REVIEW_STAGES).map((stage) => (
              <option key={stage} value={stage}>
                {buildPolicyReviewStageLabel(stage, translate)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="clients-page__search-label" htmlFor="policy-review-search">
        {translate("policyReviewSearchLabel")}
        <input
          id="policy-review-search"
          type="search"
          className="clients-page__search"
          value={searchInput}
          placeholder={translate("policyReviewSearchPlaceholder")}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </label>

      {payload ? (
        <dl className="clients-card__details">
          {METRICS.map(([key, labelKey]) => (
            <div key={key}>
              <dt>{translate(labelKey)}</dt>
              <dd>
                {MONEY_METRICS.has(key)
                  ? formatPolicyReviewMoney(payload.metrics?.[key], locale)
                  : payload.metrics?.[key] || 0}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {error ? <p className="clients-page__error">{error}</p> : null}
      {loading ? <p className="clients-page__status">{translate("policyReviewLoading")}</p> : null}
      {!loading && !payload?.items?.length ? <p className="clients-page__status">{translate("policyReviewEmpty")}</p> : null}

      {!loading && payload?.items?.length ? (
        <ul className="clients-list">
          {payload.items.map((item) => (
            <li key={item.id} className="clients-card">
              <div>
                <strong>{item.clientName || translate("policyReviewClient")}</strong>
                <span>{buildPolicyReviewStageLabel(item.stage, translate)}</span>
                <span>
                  {[item.source, item.campaign, item.language, item.state].filter(Boolean).join(" · ") ||
                    translate("policyReviewNoAttribution")}
                </span>
                <span>
                  {translate("policyReviewMetricMonthly")}: {formatPolicyReviewMoney(item.monthlyPremium, locale)} ·{" "}
                  {translate("policyReviewMetricAnnualized")}: {formatPolicyReviewMoney(item.annualizedPremium, locale)}
                </span>
                <span>
                  {item.commissionLabel === "ACTUAL"
                    ? translate("policyReviewCommissionActual")
                    : translate("policyReviewCommissionEstimated")}
                  : {formatPolicyReviewMoney(item.commissionAmount, locale)}
                </span>
              </div>
              <div className="clients-card__actions">
                <button type="button" onClick={() => navigate(appPath(`clients/${item.clientId}`))}>
                  {translate("policyReviewOpenClient")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyPolicyReviewForm({ appointmentId: item.appointmentId || "" }));
                    setDialog({ type: "appointment", item });
                  }}
                >
                  {translate("policyReviewLinkAppointment")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyPolicyReviewForm());
                    setDialog({ type: "documents", item });
                  }}
                >
                  {translate("policyReviewRequestDocuments")}
                </button>
                {item.documentRequestId ? (
                  <button type="button" onClick={() => setDialog({ type: "documents-received", item })}>
                    {translate("policyReviewMarkDocumentsReceived")}
                  </button>
                ) : null}
                <button type="button" onClick={() => setDialog({ type: "complete", item })}>
                  {translate("policyReviewComplete")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyPolicyReviewForm({ outcome: "" }));
                    setDialog({ type: "outcome", item });
                  }}
                >
                  {translate("policyReviewRecordOutcome")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(
                      emptyPolicyReviewForm({
                        carrierProductLabel: item.carrierProductLabel || "",
                        monthlyPremium: item.monthlyPremium ?? "",
                        annualizedPremium: item.annualizedPremium ?? ""
                      })
                    );
                    setDialog({ type: "application", item });
                  }}
                >
                  {translate("policyReviewSubmitApplication")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyPolicyReviewForm({ placedDate: "" }));
                    setDialog({ type: "placed", item });
                  }}
                >
                  {translate("policyReviewMarkPlaced")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyPolicyReviewForm());
                    setDialog({ type: "follow-up", item });
                  }}
                >
                  {translate("policyReviewAddFollowUp")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {dialog ? (
        <PolicyReviewDialog
          title={translate(
            dialog.type === "create"
              ? "policyReviewAdd"
              : dialog.type === "outcome"
                ? "policyReviewRecordOutcome"
                : dialog.type === "appointment"
                  ? "policyReviewLinkAppointment"
                  : dialog.type === "documents"
                    ? "policyReviewRequestDocuments"
                    : dialog.type === "application"
                      ? "policyReviewSubmitApplication"
                      : dialog.type === "placed"
                        ? "policyReviewMarkPlaced"
                        : dialog.type === "follow-up"
                          ? "policyReviewAddFollowUp"
                          : dialog.type === "complete"
                            ? "policyReviewComplete"
                            : "policyReviewMarkDocumentsReceived"
          )}
          confirmLabel={translate("followUpsSave")}
          cancelLabel={translate("followUpsDialogClose")}
          loading={saving}
          onClose={() => setDialog(null)}
          onConfirm={submitDialog}
        >
          {dialog.type === "create" ? (
            <>
              <label>
                {translate("policyReviewClient")}
                <select
                  value={form.clientId}
                  onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))}
                >
                  <option value="">{translate("policyReviewSelectClient")}</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("policyReviewSource")}
                <input value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} />
              </label>
              <label>
                {translate("policyReviewCampaign")}
                <input value={form.campaign} onChange={(event) => setForm((current) => ({ ...current, campaign: event.target.value }))} />
              </label>
              <label>
                {translate("policyReviewLanguage")}
                <input value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))} />
              </label>
              <label>
                {translate("policyReviewState")}
                <input value={form.state} onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} />
              </label>
            </>
          ) : null}
          {dialog.type === "appointment" ? (
            <label>
              {translate("policyReviewAppointmentId")}
              <input
                value={form.appointmentId}
                onChange={(event) => setForm((current) => ({ ...current, appointmentId: event.target.value }))}
              />
            </label>
          ) : null}
          {dialog.type === "documents" ? (
            <>
              <label>
                {translate("policyReviewDocumentsTitle")}
                <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label>
                {translate("policyReviewDueDate")}
                <input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
            </>
          ) : null}
          {dialog.type === "outcome" ? (
            <label>
              {translate("policyReviewOutcome")}
              <select value={form.outcome} onChange={(event) => setForm((current) => ({ ...current, outcome: event.target.value }))}>
                <option value="">{translate("policyReviewSelectOutcome")}</option>
                {Object.values(POLICY_REVIEW_OUTCOMES).map((outcome) => (
                  <option key={outcome} value={outcome}>
                    {buildPolicyReviewStageLabel(outcome, translate)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {dialog.type === "application" ? (
            <>
              <label>
                {translate("policyReviewCarrierProduct")}
                <input
                  value={form.carrierProductLabel}
                  onChange={(event) => setForm((current) => ({ ...current, carrierProductLabel: event.target.value }))}
                />
              </label>
              <label>
                {translate("policyReviewMonthlyPremium")}
                <input
                  value={form.monthlyPremium}
                  onChange={(event) => setForm((current) => ({ ...current, monthlyPremium: event.target.value }))}
                />
              </label>
              <label>
                {translate("policyReviewAnnualizedPremium")}
                <input
                  value={form.annualizedPremium}
                  onChange={(event) => setForm((current) => ({ ...current, annualizedPremium: event.target.value }))}
                />
              </label>
            </>
          ) : null}
          {dialog.type === "placed" ? (
            <label>
              {translate("policyReviewPlacedDate")}
              <input
                type="date"
                value={form.placedDate}
                onChange={(event) => setForm((current) => ({ ...current, placedDate: event.target.value }))}
              />
            </label>
          ) : null}
          {dialog.type === "follow-up" ? (
            <>
              <label>
                {translate("policyReviewDueDate")}
                <input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
              <label>
                {translate("followUpsNote")}
                <textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </>
          ) : null}
        </PolicyReviewDialog>
      ) : null}
    </div>
  );
}
