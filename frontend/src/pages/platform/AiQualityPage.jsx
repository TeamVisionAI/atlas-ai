import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { isSuperAdminUser } from "../../security/isSuperAdminUser";
import { getDefaultLandingPath } from "../../config/workspaceExperience";
import {
  getAiQualityOverview,
  getAiQualityCase,
  listAiQualityCases,
  reviewAiQualityCase,
  getAiQualitySettings,
  listAiQualityRegressions,
  getAiQualityRegressionSpec
} from "../../services/platformService";
import {
  AI_QUALITY_TABS,
  REVIEW_ACTIONS,
  casesForTab,
  formatPercent,
  formatUsd
} from "./aiQualityHelpers";
import "../identity/identity.css";
import "./AiQualityPage.css";

function Metric({ label, value }) {
  return (
    <div className="ai-quality-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function AiQualityPage() {
  const navigate = useNavigate();
  const { user, landingPath } = useWorkspace();
  const allowed = isSuperAdminUser(user);
  const [tab, setTab] = useState("overview");
  const [settings, setSettings] = useState(null);
  const [overview, setOverview] = useState(null);
  const [cases, setCases] = useState([]);
  const [regressions, setRegressions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [spec, setSpec] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [expectedIntent, setExpectedIntent] = useState("");

  useEffect(() => {
    if (!allowed) {
      navigate(landingPath || getDefaultLandingPath(user), { replace: true });
    }
  }, [allowed, landingPath, navigate, user]);

  async function refresh() {
    try {
      const [settingsResult, overviewResult, casesResult, regressionsResult] = await Promise.all([
        getAiQualitySettings(),
        getAiQualityOverview(),
        listAiQualityCases({ tab: tab === "overview" || tab === "cost" ? undefined : tab }),
        listAiQualityRegressions()
      ]);
      setSettings(settingsResult.settings || settingsResult);
      setOverview(overviewResult.overview || overviewResult);
      setCases(casesResult.cases || []);
      setRegressions(regressionsResult.regressions || []);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load AI Quality.");
    }
  }

  useEffect(() => {
    if (allowed) {
      refresh();
    }
  }, [allowed, tab]);

  const visibleCases = useMemo(() => casesForTab(cases, tab), [cases, tab]);

  async function openCase(id) {
    const result = await getAiQualityCase(id);
    setSelected(result.case || result);
    setSpec("");
  }

  async function runReview(action) {
    if (!selected?.id) {
      return;
    }
    const result = await reviewAiQualityCase(selected.id, {
      action,
      notes,
      expectedBehavior: expectedIntent ? { expectedIntent } : {}
    });
    setSelected(result.qualityCase || result.case || selected);
    if (result.markdown) {
      setSpec(result.markdown);
    }
    await refresh();
  }

  async function openRegression(id) {
    const result = await getAiQualityRegressionSpec(id);
    setSpec(result.markdown || JSON.stringify(result.spec, null, 2));
  }

  if (!allowed) {
    return null;
  }

  return (
    <section className="identity-page ai-quality-page">
      <header className="identity-header">
        <div>
          <h1>AI Quality</h1>
          <p className="ai-quality-page__lede">
            Review misunderstandings and promote approved cases into regression
            specs. Capture is off by default. Semantic apply stays off.
          </p>
        </div>
      </header>

      {settings ? (
        <p className="ai-quality-page__lede">
          Platform capture: <strong>{settings.captureEnabled ? "on" : "off"}</strong>
          {" · "}
          Mode: <strong>{settings.mode}</strong>
          {" · "}
          Apply: <strong>off</strong>
        </p>
      ) : null}

      {error ? <p className="identity-error">{error}</p> : null}

      <nav className="ai-quality-tabs">
        {AI_QUALITY_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "is-active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {(tab === "overview" || tab === "cost") && overview ? (
        <div className="ai-quality-metrics">
          <Metric label="Cases detected" value={overview.casesDetected ?? 0} />
          <Metric label="Disagreement rate" value={formatPercent(overview.disagreementRate)} />
          <Metric label="Semantic-win rate" value={formatPercent(overview.semanticWinRate)} />
          <Metric label="Legacy-win rate" value={formatPercent(overview.legacyWinRate)} />
          <Metric label="Both-wrong rate" value={formatPercent(overview.bothWrongRate)} />
          <Metric label="Repeated-question incidents" value={overview.repeatedQuestionIncidents ?? 0} />
          <Metric
            label="Abandonment / frustration"
            value={overview.abandonmentOrFrustrationIncidents ?? 0}
          />
          <Metric label="p50 latency" value={overview.p50LatencyMs ?? "—"} />
          <Metric label="p95 latency" value={overview.p95LatencyMs ?? "—"} />
          <Metric label="Token usage" value={overview.tokenUsage ?? 0} />
          <Metric label="Estimated semantic cost" value={formatUsd(overview.estimatedSemanticCostUsd)} />
        </div>
      ) : null}

      {tab === "regressions" ? (
        <div className="identity-card">
          <h2>Regression library</h2>
          <table className="ai-quality-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tenant</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {regressions.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.organizationId}</td>
                  <td>{row.status}</td>
                  <td>
                    <button type="button" onClick={() => openRegression(row.id)}>
                      Copy spec
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="identity-card">
          <h2>Cases</h2>
          <table className="ai-quality-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Legacy</th>
                <th>Semantic</th>
              </tr>
            </thead>
            <tbody>
              {visibleCases.map((row) => (
                <tr key={row.id} onClick={() => openCase(row.id)}>
                  <td>{row.signalType}</td>
                  <td>{row.organizationId}</td>
                  <td>{row.status}</td>
                  <td>{row.severity}</td>
                  <td>{row.legacyInterpretation?.intent || "—"}</td>
                  <td>{row.semanticInterpretation?.intent || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <div className="identity-card ai-quality-detail">
          <h2>Case detail</h2>
          <p>
            {selected.signalType} · {selected.status} · action {selected.atlasAction || "—"}
          </p>
          <div>
            <strong>Known facts before / after</strong>
            <pre>{JSON.stringify({
              before: selected.knownFactsBefore,
              after: selected.knownFactsAfter
            }, null, 2)}</pre>
          </div>
          <div>
            <strong>Legacy interpretation</strong>
            <pre>{JSON.stringify(selected.legacyInterpretation, null, 2)}</pre>
          </div>
          <div>
            <strong>Semantic interpretation</strong>
            <pre>{JSON.stringify(selected.semanticInterpretation, null, 2)}</pre>
          </div>
          <div>
            <strong>Conversation turns</strong>
            <pre>{JSON.stringify(selected.conversationTurns || [], null, 2)}</pre>
          </div>
          <label>
            Review notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <label>
            Expected intent
            <input
              value={expectedIntent}
              onChange={(event) => setExpectedIntent(event.target.value)}
            />
          </label>
          <div className="ai-quality-actions">
            {REVIEW_ACTIONS.map((item) => (
              <button key={item.id} type="button" onClick={() => runReview(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {spec ? (
        <div className="identity-card">
          <h2>Regression specification</h2>
          <pre>{spec}</pre>
        </div>
      ) : null}
    </section>
  );
}
