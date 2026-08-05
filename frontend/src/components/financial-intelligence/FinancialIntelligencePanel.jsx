import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  localizeFiStatus,
  translateFiReport
} from "../../i18n/fiReportMessages";
import { PERMISSIONS, roleHasPermission } from "../../security/workspacePermissions";
import {
  acknowledgeReplacement,
  createStrategyEvaluation,
  fetchLatestStrategyEvaluation,
  fetchStrategyEvaluationHistory,
  updateInvestmentHorizon,
  updateRiskProfile,
  updateTermQuote
} from "../../services/financialIntelligenceService";
import DiscussionScenariosSection from "./DiscussionScenariosSection";
import "./DiscussionScenariosSection.css";
import "./FinancialIntelligencePanel.css";
import "./fiPrintReport.css";

const PREMIUM_SOURCES = [
  "OFFICIAL_QUOTE",
  "REPRESENTATIVE_CONFIRMED",
  "PRELIMINARY_ESTIMATE",
  "MISSING"
];

const RISK_PROFILES = ["NOT_COMPLETED", "CONSERVATIVE", "MODERATE", "AGGRESSIVE"];

/**
 * Live Financial Intelligence panel — API-backed only (RC3 Phase B).
 * Does not import preview fixtures or frontend calculation engines.
 */
export default function FinancialIntelligencePanel({ reviewId }) {
  const { user } = useWorkspace();
  const { language } = useLanguage();
  const t = (key, params) => translateFiReport(language, key, params);
  const canWrite = roleHasPermission(user?.role, PERMISSIONS.POLICY_WRITE);

  const [evaluation, setEvaluation] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(Boolean(reviewId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [termForm, setTermForm] = useState({
    deathBenefit: "",
    termDurationYears: "",
    monthlyPremium: "",
    premiumSource: "REPRESENTATIVE_CONFIRMED",
    quoteDate: "",
    productLabel: "",
    representativeConfirmed: true,
    longestAvailableTermConfirmed: false,
    eligibilitySource: "",
    notes: ""
  });
  const [horizonYears, setHorizonYears] = useState("");
  const [horizonGoal, setHorizonGoal] = useState("");
  const [riskProfile, setRiskProfile] = useState("NOT_COMPLETED");

  const syncFormsFromEvaluation = useCallback((next) => {
    if (!next) {
      return;
    }
    const quote = next.termQuote || {};
    setTermForm({
      deathBenefit:
        quote.deathBenefit != null
          ? String(quote.deathBenefit)
          : next.proposedTermDeathBenefit != null
            ? String(next.proposedTermDeathBenefit)
            : next.currentIulDeathBenefit != null
              ? String(next.currentIulDeathBenefit)
              : "",
      termDurationYears:
        quote.selectedTermDuration != null ? String(quote.selectedTermDuration) : "",
      monthlyPremium: quote.monthlyPremium != null ? String(quote.monthlyPremium) : "",
      premiumSource: quote.premiumSource || next.premiumSource || "REPRESENTATIVE_CONFIRMED",
      quoteDate: quote.quoteDate || "",
      productLabel: quote.productLabel || "",
      representativeConfirmed: Boolean(quote.representativeConfirmed),
      longestAvailableTermConfirmed: Boolean(quote.longestAvailableTermConfirmed),
      eligibilitySource: quote.eligibilitySource || "",
      notes: quote.notes || ""
    });
    setHorizonYears(
      next.investmentHorizon?.years != null ? String(next.investmentHorizon.years) : ""
    );
    setHorizonGoal(next.investmentHorizon?.goalLabel || "");
    setRiskProfile(next.riskProfile || "NOT_COMPLETED");
  }, []);

  const loadEvaluation = useCallback(async () => {
    if (!reviewId) {
      setEvaluation(null);
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [latest, versions] = await Promise.all([
        fetchLatestStrategyEvaluation(reviewId),
        fetchStrategyEvaluationHistory(reviewId).catch(() => [])
      ]);
      setEvaluation(latest);
      setHistory(versions);
      syncFormsFromEvaluation(latest);
    } catch (err) {
      setEvaluation(null);
      setError(err.message || "Unable to load Financial Intelligence evaluation.");
    } finally {
      setLoading(false);
    }
  }, [reviewId, syncFormsFromEvaluation]);

  useEffect(() => {
    loadEvaluation();
  }, [loadEvaluation]);

  async function handleCreate() {
    if (!canWrite || !reviewId) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await createStrategyEvaluation(reviewId);
      setEvaluation(created);
      syncFormsFromEvaluation(created);
      setNotice("Discussion scenario created (version 1).");
      const versions = await fetchStrategyEvaluationHistory(reviewId).catch(() => []);
      setHistory(versions);
    } catch (err) {
      setError(err.message || "Unable to create strategy evaluation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTermQuote(event) {
    event.preventDefault();
    if (!canWrite || !evaluation?.id) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await updateTermQuote(evaluation.id, {
        deathBenefit: termForm.deathBenefit === "" ? undefined : Number(termForm.deathBenefit),
        termDurationYears:
          termForm.termDurationYears === "" ? undefined : Number(termForm.termDurationYears),
        monthlyPremium:
          termForm.monthlyPremium === "" ? undefined : Number(termForm.monthlyPremium),
        premiumSource: termForm.premiumSource,
        quoteDate: termForm.quoteDate || null,
        productLabel: termForm.productLabel || null,
        representativeConfirmed: termForm.representativeConfirmed,
        longestAvailableTermConfirmed: termForm.longestAvailableTermConfirmed,
        eligibilitySource: termForm.eligibilitySource || null,
        notes: termForm.notes || null
      });
      setEvaluation(next);
      syncFormsFromEvaluation(next);
      setNotice(`Term quote saved — evaluation version ${next.version}.`);
      const versions = await fetchStrategyEvaluationHistory(reviewId).catch(() => []);
      setHistory(versions);
    } catch (err) {
      setError(err.message || "Unable to save term quote.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveHorizon(event) {
    event.preventDefault();
    if (!canWrite || !evaluation?.id) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await updateInvestmentHorizon(evaluation.id, {
        years: Number(horizonYears),
        goalLabel: horizonGoal || null,
        source: "representative",
        confirmed: true
      });
      setEvaluation(next);
      syncFormsFromEvaluation(next);
      setNotice(`Investment horizon saved — evaluation version ${next.version}.`);
      const versions = await fetchStrategyEvaluationHistory(reviewId).catch(() => []);
      setHistory(versions);
    } catch (err) {
      setError(err.message || "Unable to save investment horizon.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRisk(event) {
    event.preventDefault();
    if (!canWrite || !evaluation?.id) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await updateRiskProfile(evaluation.id, riskProfile);
      setEvaluation(next);
      syncFormsFromEvaluation(next);
      setNotice(`Risk-profile input saved — evaluation version ${next.version}.`);
      const versions = await fetchStrategyEvaluationHistory(reviewId).catch(() => []);
      setHistory(versions);
    } catch (err) {
      setError(err.message || "Unable to save risk profile.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAcknowledgeReplacement() {
    if (!canWrite || !evaluation?.id) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await acknowledgeReplacement(evaluation.id, true);
      setEvaluation(next);
      syncFormsFromEvaluation(next);
      setNotice(
        `Replacement safeguards acknowledged — evaluation version ${next.version}. This does not complete all legal or company replacement requirements.`
      );
      const versions = await fetchStrategyEvaluationHistory(reviewId).catch(() => []);
      setHistory(versions);
    } catch (err) {
      setError(err.message || "Unable to record acknowledgement.");
    } finally {
      setBusy(false);
    }
  }

  if (!reviewId) {
    return (
      <section className="fi-panel" data-testid="fi-panel-no-review">
        <p className="fi-panel__empty">
          Select a Policy Intelligence review to create or view a discussion scenario.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="fi-panel" data-testid="fi-panel-loading" aria-busy="true">
        <p className="fi-panel__loading">Loading Financial Intelligence evaluation…</p>
        <p className="fi-panel__note">No sample financial values are shown while loading.</p>
      </section>
    );
  }

  if (error && !evaluation) {
    return (
      <section className="fi-panel" data-testid="fi-panel-error">
        <p className="fi-panel__error" role="alert">
          {error}
        </p>
        <button type="button" className="fi-panel__button" onClick={loadEvaluation} disabled={busy}>
          Retry
        </button>
      </section>
    );
  }

  if (!evaluation) {
    return (
      <section className="fi-panel" data-testid="fi-panel-empty">
        <header className="fi-panel__header">
          <p className="fi-panel__eyebrow">Financial Intelligence</p>
          <h2>Possible Discussion Scenarios for the Primerica Representative</h2>
        </header>
        <p className="fi-panel__empty">{t("fiPanelNoEvaluation")}</p>
        {canWrite ? (
          <button
            type="button"
            className="fi-panel__button fi-panel__button--primary"
            onClick={handleCreate}
            disabled={busy}
            data-testid="fi-create-discussion-scenario"
          >
            {t("fiPanelCreateScenario")}
          </button>
        ) : (
          <p className="fi-panel__note">{t("fiPanelNoPermission")}</p>
        )}
        {error ? (
          <p className="fi-panel__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const statusLabel = localizeFiStatus(language, evaluation.status);
  const isPreliminary = evaluation.premiumSource === "PRELIMINARY_ESTIMATE";

  return (
    <section className="fi-panel" data-testid="fi-panel-connected" data-fi-language={language}>
      {notice ? <p className="fi-panel__notice">{notice}</p> : null}
      {error ? (
        <p className="fi-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="fi-panel__meta-bar">
        <span>
          {t("fiPanelStatus")}: <strong data-testid="fi-status-label">{statusLabel}</strong>
        </span>
        <span>
          {t("fiPanelVersion")}: <strong data-testid="fi-version">{evaluation.version}</strong>
          {evaluation.isCurrentVersion
            ? ` ${t("fiPanelVersionCurrent")}`
            : ` ${t("fiPanelVersionSuperseded")}`}
        </span>
        <span>
          {t("fiPanelReview")}: <code>{evaluation.reviewId}</code>
        </span>
      </div>

      {isPreliminary ? (
        <p className="fi-panel__preliminary" role="status" data-testid="fi-preliminary-banner">
          {t("fiPreliminaryEstimate")}
        </p>
      ) : null}

      {evaluation.status === "DRAFT_TERM_QUOTE_REQUIRED" ? (
        <p className="fi-panel__callout" data-testid="fi-quote-required">
          {t("fiPanelQuoteRequired")}
        </p>
      ) : null}

      <DiscussionScenariosSection evaluation={evaluation} source="api" />

      {canWrite && evaluation.isCurrentVersion ? (
        <div className="fi-panel__forms" data-testid="fi-representative-inputs">
          <form className="fi-panel__form" onSubmit={handleSaveTermQuote}>
            <h3>Representative-entered term quote</h3>
            <p className="fi-panel__note">
              Default death benefit matches the current IUL. Changing it is an explicit
              representative adjustment.
            </p>
            <div className="fi-panel__grid">
              <label>
                <span>Proposed term death benefit</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={termForm.deathBenefit}
                  onChange={(e) => setTermForm((f) => ({ ...f, deathBenefit: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label>
                <span>Term duration (years)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={termForm.termDurationYears}
                  onChange={(e) =>
                    setTermForm((f) => ({ ...f, termDurationYears: e.target.value }))
                  }
                  disabled={busy}
                  required
                />
              </label>
              <label>
                <span>Monthly premium</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={termForm.monthlyPremium}
                  onChange={(e) => setTermForm((f) => ({ ...f, monthlyPremium: e.target.value }))}
                  disabled={busy}
                  required
                />
              </label>
              <label>
                <span>Premium source</span>
                <select
                  value={termForm.premiumSource}
                  onChange={(e) => setTermForm((f) => ({ ...f, premiumSource: e.target.value }))}
                  disabled={busy}
                >
                  {PREMIUM_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Quote / illustration date</span>
                <input
                  type="date"
                  value={termForm.quoteDate}
                  onChange={(e) => setTermForm((f) => ({ ...f, quoteDate: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label>
                <span>Product / quote label</span>
                <input
                  value={termForm.productLabel}
                  onChange={(e) => setTermForm((f) => ({ ...f, productLabel: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label>
                <span>Eligibility source</span>
                <input
                  value={termForm.eligibilitySource}
                  onChange={(e) =>
                    setTermForm((f) => ({ ...f, eligibilitySource: e.target.value }))
                  }
                  disabled={busy}
                />
              </label>
              <label className="fi-panel__check">
                <input
                  type="checkbox"
                  checked={termForm.representativeConfirmed}
                  onChange={(e) =>
                    setTermForm((f) => ({ ...f, representativeConfirmed: e.target.checked }))
                  }
                  disabled={busy}
                />
                Representative confirmed
              </label>
              <label className="fi-panel__check">
                <input
                  type="checkbox"
                  checked={termForm.longestAvailableTermConfirmed}
                  onChange={(e) =>
                    setTermForm((f) => ({
                      ...f,
                      longestAvailableTermConfirmed: e.target.checked
                    }))
                  }
                  disabled={busy}
                />
                Longest available Primerica term confirmed
              </label>
            </div>
            <label>
              <span>Notes</span>
              <textarea
                value={termForm.notes}
                onChange={(e) => setTermForm((f) => ({ ...f, notes: e.target.value }))}
                disabled={busy}
                rows={2}
              />
            </label>
            <button type="submit" className="fi-panel__button fi-panel__button--primary" disabled={busy}>
              Save term quote (new revision)
            </button>
          </form>

          <form className="fi-panel__form" onSubmit={handleSaveHorizon}>
            <h3>Investment projection horizon</h3>
            <p className="fi-panel__note">
              Distinct from term duration. Do not assume they are the same.
            </p>
            <div className="fi-panel__grid">
              <label>
                <span>Horizon (years)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={horizonYears}
                  onChange={(e) => setHorizonYears(e.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              <label>
                <span>Optional goal label</span>
                <input
                  value={horizonGoal}
                  onChange={(e) => setHorizonGoal(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <button type="submit" className="fi-panel__button fi-panel__button--primary" disabled={busy}>
              Save horizon (new revision)
            </button>
          </form>

          <form className="fi-panel__form" onSubmit={handleSaveRisk}>
            <h3>Risk-profile planning input</h3>
            <p className="fi-panel__note">
              Representative-entered planning input — not an Atlas suitability determination.
            </p>
            <label>
              <span>Risk profile</span>
              <select
                value={riskProfile}
                onChange={(e) => setRiskProfile(e.target.value)}
                disabled={busy}
              >
                {RISK_PROFILES.map((profile) => (
                  <option key={profile} value={profile}>
                    {profile.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="fi-panel__button fi-panel__button--primary" disabled={busy}>
              Save risk profile (new revision)
            </button>
          </form>

          {!evaluation.replacementAcknowledged ? (
            <div className="fi-panel__form">
              <h3>Replacement review acknowledgement</h3>
              <p className="fi-panel__note">
                Acknowledgement records that the representative reviewed the listed safeguards. It
                does not prove that all legal or company replacement requirements are complete.
              </p>
              <button
                type="button"
                className="fi-panel__button fi-panel__button--primary"
                onClick={handleAcknowledgeReplacement}
                disabled={busy}
              >
                Acknowledge replacement safeguards
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {history.length > 1 ? (
        <div className="fi-panel__history" data-testid="fi-history">
          <h3>Evaluation history</h3>
          <ul>
            {history.map((item) => (
              <li key={item.id} data-testid="fi-history-item">
                v{item.version} · {localizeFiStatus(language, item.status)}
                {item.isCurrentVersion ? " · current" : ""}
                {item.id === evaluation.id ? " · viewing" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
