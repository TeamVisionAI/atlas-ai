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
  getPolicyReviewDashboard,
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
  POLICY_REVIEW_DATE_PRESETS,
  POLICY_REVIEW_OUTCOMES,
  POLICY_REVIEW_STAGES,
  POLICY_REVIEW_VIEWS,
  buildPolicyReviewSourceLabel,
  buildPolicyReviewStageLabel,
  emptyPolicyReviewForm,
  formatPolicyReviewMoney,
  formatPolicyReviewTouch
} from "../engines/policyReviewViewModel";
import PolicyReviewsDashboardBlock from "./PolicyReviewsDashboardBlock";
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
  const platformFilter = searchParams.get("platform") || "";
  const campaignFilter = searchParams.get("campaign") || "";
  const sourceFilter = searchParams.get("source") || "";
  const intakeCodeFilter = searchParams.get("intakeCode") || "";
  const languageFilter = searchParams.get("language") || "";
  const stateFilter = searchParams.get("state") || "";
  const ownerFilter = searchParams.get("ownerUserId") || "";
  const rangeFilter = searchParams.get("range") || "30d";
  const fromFilter = searchParams.get("from") || "";
  const toFilter = searchParams.get("to") || "";
  const groupBy = searchParams.get("groupBy") || "campaign";
  const activeView = searchParams.get("view") || POLICY_REVIEW_VIEWS.DASHBOARD;
  const showDashboard = activeView !== POLICY_REVIEW_VIEWS.PIPELINE;
  const showPipeline = activeView !== POLICY_REVIEW_VIEWS.DASHBOARD;

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [selectedId, setSelectedId] = useState(null);
  const [payload, setPayload] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(emptyPolicyReviewForm());
  const [saving, setSaving] = useState(false);

  const sharedFilters = {
    scope: activeScope,
    platform: platformFilter,
    campaign: campaignFilter,
    source: sourceFilter,
    intakeCode: intakeCodeFilter,
    language: languageFilter,
    state: stateFilter,
    ownerUserId: ownerFilter,
    range: rangeFilter,
    from: rangeFilter === "custom" ? fromFilter : "",
    to: rangeFilter === "custom" ? toFilter : ""
  };

  const loadDashboard = useCallback(async () => {
    if (controlPlane || !showDashboard) {
      setDashboardLoading(false);
      return;
    }
    setDashboardLoading(true);
    setError(null);
    try {
      const next = await getPolicyReviewDashboard({
        ...sharedFilters,
        groupBy
      });
      setDashboard(next);
    } catch (err) {
      setError(err instanceof PolicyReviewsError ? translate("policyReviewDashboardLoadError") : err.message);
    } finally {
      setDashboardLoading(false);
    }
  }, [
    activeScope,
    campaignFilter,
    controlPlane,
    fromFilter,
    groupBy,
    intakeCodeFilter,
    languageFilter,
    ownerFilter,
    platformFilter,
    rangeFilter,
    showDashboard,
    sourceFilter,
    stateFilter,
    toFilter,
    translate
  ]);

  const loadList = useCallback(async () => {
    if (controlPlane || !showPipeline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [reviews, clientPayload] = await Promise.all([
        getPolicyReviews({
          ...sharedFilters,
          search: searchQuery,
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
  }, [
    activeScope,
    campaignFilter,
    clientFilter,
    controlPlane,
    fromFilter,
    intakeCodeFilter,
    languageFilter,
    ownerFilter,
    platformFilter,
    rangeFilter,
    searchQuery,
    showPipeline,
    sourceFilter,
    stageFilter,
    stateFilter,
    toFilter,
    translate
  ]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

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
      await Promise.all([loadDashboard(), loadList()]);
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

      <div className="clients-page__scope" role="tablist" aria-label={translate("policyReviewViewLabel")}>
        <button
          type="button"
          className={`clients-page__filter${activeView === POLICY_REVIEW_VIEWS.DASHBOARD ? " is-active" : ""}`}
          onClick={() => patchParams({ view: POLICY_REVIEW_VIEWS.DASHBOARD })}
        >
          {translate("policyReviewViewDashboard")}
        </button>
        <button
          type="button"
          className={`clients-page__filter${activeView === POLICY_REVIEW_VIEWS.PIPELINE ? " is-active" : ""}`}
          onClick={() => patchParams({ view: POLICY_REVIEW_VIEWS.PIPELINE })}
        >
          {translate("policyReviewViewPipeline")}
        </button>
      </div>

      <div className="clients-page__scope" role="tablist" aria-label={translate("policyReviewScopeLabel")}>
        <button
          type="button"
          className={`clients-page__filter${activeScope === "mine" ? " is-active" : ""}`}
          onClick={() => patchParams({ scope: "mine" })}
        >
          {translate("policyReviewScopeMine")}
        </button>
        {(payload?.teamAvailable || dashboard?.teamAvailable) ? (
          <button
            type="button"
            className={`clients-page__filter${activeScope === "team" ? " is-active" : ""}`}
            onClick={() => patchParams({ scope: "team" })}
          >
            {translate("policyReviewScopeTeam")}
          </button>
        ) : null}
      </div>

      <div className="clients-page__scope" role="tablist" aria-label={translate("policyReviewRangeLabel")}>
        {POLICY_REVIEW_DATE_PRESETS.map(([value, labelKey]) => (
          <button
            key={value}
            type="button"
            className={`clients-page__filter${rangeFilter === value ? " is-active" : ""}`}
            onClick={() => patchParams({ range: value })}
          >
            {translate(labelKey)}
          </button>
        ))}
      </div>
      {rangeFilter === "custom" ? (
        <div className="clients-page__scope" aria-label={translate("policyReviewRangeCustom")}>
          <label className="clients-page__search-label">
            {translate("policyReviewRangeFrom")}
            <input type="date" value={fromFilter} onChange={(event) => patchParams({ from: event.target.value, range: "custom" })} />
          </label>
          <label className="clients-page__search-label">
            {translate("policyReviewRangeTo")}
            <input type="date" value={toFilter} onChange={(event) => patchParams({ to: event.target.value, range: "custom" })} />
          </label>
        </div>
      ) : null}

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
        <label className="clients-page__search-label">
          {translate("policyReviewFilterPlatform")}
          <input
            value={platformFilter}
            onChange={(event) => patchParams({ platform: event.target.value })}
            placeholder={translate("policyReviewPlatform")}
          />
        </label>
        <label className="clients-page__search-label">
          {translate("policyReviewFilterCampaign")}
          <input
            value={campaignFilter}
            onChange={(event) => patchParams({ campaign: event.target.value })}
            placeholder={translate("policyReviewCampaign")}
          />
        </label>
        <label className="clients-page__search-label">
          {translate("policyReviewFilterSource")}
          <input
            value={sourceFilter}
            onChange={(event) => patchParams({ source: event.target.value })}
            placeholder={translate("policyReviewSource")}
          />
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

      {showDashboard ? (
        <>
          {dashboardLoading ? <p className="clients-page__status">{translate("policyReviewDashboardLoading")}</p> : null}
          <PolicyReviewsDashboardBlock
            dashboard={dashboard}
            loading={dashboardLoading}
            locale={locale}
            groupBy={groupBy}
            translate={translate}
            onDrilldown={(updates, options = {}) =>
              patchParams({
                view: options.stayOnDashboard ? POLICY_REVIEW_VIEWS.DASHBOARD : POLICY_REVIEW_VIEWS.PIPELINE,
                ...updates
              })
            }
          />
        </>
      ) : null}

      {showPipeline && payload ? (
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
      {showPipeline && loading ? <p className="clients-page__status">{translate("policyReviewLoading")}</p> : null}
      {showPipeline && !loading && !payload?.items?.length ? <p className="clients-page__status">{translate("policyReviewEmpty")}</p> : null}

      {showPipeline && !loading && payload?.items?.length ? (
        <ul className="clients-list">
          {payload.items.map((item) => (
            <li
              key={item.id}
              className={`clients-card${selectedId === item.id ? " is-selected" : ""}`}
              onClick={() => setSelectedId((current) => (current === item.id ? null : item.id))}
            >
              <div>
                <strong>{item.clientName || translate("policyReviewClient")}</strong>
                <span>{buildPolicyReviewStageLabel(item.stage, translate)}</span>
                <span className="policy-review-source-badge">
                  {buildPolicyReviewSourceLabel(item, translate)}
                </span>
                <span>
                  {[item.campaignName || item.campaign, item.adLabel, item.creativeLabel, item.language, item.state]
                    .filter(Boolean)
                    .join(" · ") || translate("policyReviewNoAttribution")}
                </span>
                {selectedId === item.id ? (
                  <section className="policy-review-acquisition" aria-label={translate("policyReviewAcquisition")}>
                    <h3>{translate("policyReviewAcquisition")}</h3>
                    {["firstTouch", "latestTouch"].map((key) => {
                      const touch = formatPolicyReviewTouch(item.acquisition?.[key]);
                      return (
                        <p key={key}>
                          <strong>
                            {translate(key === "firstTouch" ? "policyReviewFirstTouch" : "policyReviewLatestTouch")}
                          </strong>
                          {": "}
                          {touch
                            ? [touch.source, touch.campaign, touch.ad, touch.creative, touch.intakeCode]
                                .filter(Boolean)
                                .join(" · ")
                            : translate("policyReviewNoAttribution")}
                        </p>
                      );
                    })}
                  </section>
                ) : null}
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
              <div className="clients-card__actions" onClick={(event) => event.stopPropagation()}>
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
