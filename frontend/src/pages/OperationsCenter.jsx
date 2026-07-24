import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { bootstrapAtlasSession } from "../services/atlasAuthService";
import {
  operationsCenterSections,
  operationsCenterPath
} from "../config/operationsCenterNav";
import { appPath } from "../config/appRoutes";
import {
  advanceWorkflowSimulator,
  fetchBusinessEventById,
  fetchBusinessEvents,
  fetchDiagnostics,
  fetchOperationsAccess,
  fetchProspectTimeline,
  fetchSimulatorScenarios,
  fetchSmokeTests,
  fetchSystemHealth,
  fetchWorkflowSimulatorState,
  rebuildExecutiveDashboard,
  rebuildMissionControl,
  replayAllProjections,
  replaySingleProspect,
  resetProjectionState,
  runAllSimulatorScenarios,
  runSimulatorScenario,
  runSmokeTest,
  simulateFacebookLead,
  simulateWebsiteLead,
  simulateWhatsAppConversation
} from "../services/operationsCenterService";
import "./OperationsCenter.css";

function StatusBadge({ status }) {
  const normalized = String(status || "unknown").toLowerCase();
  return <span className={`ops-status ops-status--${normalized}`}>{status}</span>;
}

function ActionResult({ result }) {
  if (!result) {
    return null;
  }

  return (
    <div className={`ops-result${result.success === false || result.result === "FAIL" ? " ops-result--error" : ""}`}>
      {result.result ? <p className="ops-result__headline">{result.result}</p> : null}
      {result.eventsReplayed !== undefined ? (
        <p>Events replayed: {result.eventsReplayed}</p>
      ) : null}
      {result.durationMs !== undefined ? <p>Duration: {result.durationMs}ms</p> : null}
      {result.failureDetails ? <pre>{result.failureDetails}</pre> : null}
      {result.message ? <p>{result.message}</p> : null}
    </div>
  );
}

function SystemHealthSection({ t }) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchSystemHealth();
      setHealth(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavSystemHealth}</h2>
        </div>
        <button type="button" className="ops-button ops-button--secondary" onClick={load}>
          {t.opsRefresh}
        </button>
      </header>

      {loading && !health ? <p className="ops-muted">{t.loading}</p> : null}
      {error ? <p className="ops-error">{error}</p> : null}

      <div className="ops-card-grid">
        {(health?.cards || []).map((card) => (
          <article key={card.id} className="ops-card">
            <h3>{card.label}</h3>
            <StatusBadge status={card.status} />
            <dl className="ops-meta">
              <div>
                <dt>{t.opsVersion}</dt>
                <dd>{card.version}</dd>
              </div>
              <div>
                <dt>{t.opsLastCheck}</dt>
                <dd>{card.lastCheck}</dd>
              </div>
            </dl>
            {card.detail ? <p className="ops-muted">{card.detail}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkflowSimulatorSection({ t }) {
  const [scenarios, setScenarios] = useState([]);
  const [activePhone, setActivePhone] = useState("");
  const [workflowState, setWorkflowState] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSimulatorScenarios()
      .then((data) => setScenarios(data.scenarios || []))
      .catch(() => {});
  }, []);

  async function runAction(action) {
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const payload = await action();
      setResult(payload);

      if (payload.phone) {
        setActivePhone(payload.phone);
        const state = await fetchWorkflowSimulatorState(payload.phone);
        setWorkflowState(state);
      } else if (payload.reports) {
        setWorkflowState({ scenarios: payload.reports });
      }
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavWorkflowSimulator}</h2>
          <p className="ops-muted">{t.opsWorkflowDescription}</p>
        </div>
      </header>

      <div className="ops-action-row">
        <button
          type="button"
          className="ops-button"
          disabled={busy}
          onClick={() => runAction(simulateFacebookLead)}
        >
          {t.opsGenerateFacebookLead}
        </button>
        <button
          type="button"
          className="ops-button"
          disabled={busy}
          onClick={() => runAction(simulateWebsiteLead)}
        >
          {t.opsGenerateWebsiteLead}
        </button>
        <button
          type="button"
          className="ops-button"
          disabled={busy}
          onClick={() =>
            runAction(() =>
              simulateWhatsAppConversation({
                message: "Hola, quiero información sobre Team Vision."
              })
            )
          }
        >
          {t.opsGenerateWhatsApp}
        </button>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          disabled={busy}
          onClick={() => runAction(runAllSimulatorScenarios)}
        >
          {t.opsRunAllScenarios}
        </button>
      </div>

      {scenarios.length ? (
        <div className="ops-panel">
          <h3>{t.opsPredefinedScenarios}</h3>
          <div className="ops-action-row">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className="ops-button ops-button--secondary"
                disabled={busy}
                onClick={() => runAction(() => runSimulatorScenario(scenario.id))}
              >
                {scenario.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activePhone ? (
        <div className="ops-panel">
          <h3>{t.opsWorkflowProgress}</h3>
          <p className="ops-muted">
            {t.opsActivePhone}: {activePhone}
          </p>
          <button
            type="button"
            className="ops-button ops-button--secondary"
            disabled={busy || !activePhone}
            onClick={() =>
              runAction(() =>
                advanceWorkflowSimulator({
                  phone: activePhone,
                  targetMilestone: "INTERVIEW_READY"
                })
              )
            }
          >
            {t.opsAdvanceWorkflow}
          </button>
        </div>
      ) : null}

      {error ? <p className="ops-error">{error}</p> : null}
      <ActionResult result={result} />

      {workflowState?.workflow ? (
        <pre className="ops-code">{JSON.stringify(workflowState.workflow, null, 2)}</pre>
      ) : null}
      {workflowState?.scenarios ? (
        <pre className="ops-code">{JSON.stringify(workflowState.scenarios, null, 2)}</pre>
      ) : null}
    </section>
  );
}

function SmokeTestsSection({ t }) {
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSmokeTests()
      .then((data) => setTests(data.tests || []))
      .catch((loadError) => setError(loadError.message));
  }, []);

  async function handleRun(testId) {
    setBusyId(testId);
    setError(null);

    try {
      const result = await runSmokeTest(testId);
      setResults((current) => ({ ...current, [testId]: result }));
    } catch (runError) {
      setError(runError.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavSmokeTests}</h2>
          <p className="ops-muted">{t.opsSmokeDescription}</p>
        </div>
      </header>

      {error ? <p className="ops-error">{error}</p> : null}

      <div className="ops-stack">
        {tests.map((test) => {
          const result = results[test.id];
          return (
            <article key={test.id} className="ops-panel ops-panel--row">
              <div>
                <h3>{test.label}</h3>
                {result ? (
                  <div className="ops-inline-meta">
                    <StatusBadge status={result.result === "PASS" ? "healthy" : "degraded"} />
                    <span>{result.durationMs}ms</span>
                  </div>
                ) : null}
                {result?.failureDetails ? <pre>{result.failureDetails}</pre> : null}
              </div>
              <button
                type="button"
                className="ops-button"
                disabled={busyId === test.id}
                onClick={() => handleRun(test.id)}
              >
                {busyId === test.id ? t.loading : t.opsRunTest}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProjectionReplaySection({ t }) {
  const [result, setResult] = useState(null);
  const [prospectId, setProspectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function runAction(action) {
    setBusy(true);
    setError(null);

    try {
      const payload = await action();
      setResult(payload);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavProjectionReplay}</h2>
          <p className="ops-muted">{t.opsReplayDescription}</p>
        </div>
      </header>

      <div className="ops-action-row">
        <button
          type="button"
          className="ops-button"
          disabled={busy}
          onClick={() => runAction(replayAllProjections)}
        >
          {t.opsReplayAll}
        </button>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          disabled={busy}
          onClick={() => runAction(resetProjectionState)}
        >
          {t.opsResetProjection}
        </button>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          disabled={busy}
          onClick={() => runAction(rebuildMissionControl)}
        >
          {t.opsRebuildMissionControl}
        </button>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          disabled={busy}
          onClick={() => runAction(rebuildExecutiveDashboard)}
        >
          {t.opsRebuildExecutiveDashboard}
        </button>
      </div>

      <div className="ops-form-row">
        <label className="ops-field">
          <span>{t.opsProspectId}</span>
          <input
            value={prospectId}
            onChange={(event) => setProspectId(event.target.value)}
            placeholder="00000000-0000-4000-8000-000000000001"
          />
        </label>
        <button
          type="button"
          className="ops-button"
          disabled={busy || !prospectId.trim()}
          onClick={() => runAction(() => replaySingleProspect(prospectId.trim()))}
        >
          {t.opsReplaySingleProspect}
        </button>
      </div>

      {error ? <p className="ops-error">{error}</p> : null}
      <ActionResult result={result} />
    </section>
  );
}

function BusinessEventsSection({ t }) {
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    eventType: "",
    prospectId: "",
    limit: "50"
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchBusinessEvents(filters);
      setEvents(data.items || data.events || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadEvents();
    const timer = window.setInterval(loadEvents, 10000);
    return () => window.clearInterval(timer);
  }, [loadEvents]);

  async function inspectEvent(id) {
    try {
      const data = await fetchBusinessEventById(id);
      setSelected(data.event);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavBusinessEvents}</h2>
        </div>
        <button type="button" className="ops-button ops-button--secondary" onClick={loadEvents}>
          {t.opsRefresh}
        </button>
      </header>

      <div className="ops-form-row">
        <label className="ops-field">
          <span>{t.opsEventType}</span>
          <input
            value={filters.eventType}
            onChange={(event) =>
              setFilters((current) => ({ ...current, eventType: event.target.value }))
            }
          />
        </label>
        <label className="ops-field">
          <span>{t.opsProspectId}</span>
          <input
            value={filters.prospectId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, prospectId: event.target.value }))
            }
          />
        </label>
      </div>

      {loading ? <p className="ops-muted">{t.loading}</p> : null}
      {error ? <p className="ops-error">{error}</p> : null}

      <div className="ops-split">
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>{t.opsEventType}</th>
                <th>{t.opsProspectId}</th>
                <th>{t.opsTimestamp}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.eventId || event.id}>
                  <td>
                    <button
                      type="button"
                      className="ops-link"
                      onClick={() => inspectEvent(event.eventId || event.id)}
                    >
                      {event.eventType || event.event_type}
                    </button>
                  </td>
                  <td>{event.prospectId || event.prospect_id || "—"}</td>
                  <td>{event.timestamp || event.occurred_at || event.createdAt || event.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ops-panel">
          <h3>{t.opsPayloadInspector}</h3>
          {selected ? (
            <pre className="ops-code">{JSON.stringify(selected, null, 2)}</pre>
          ) : (
            <p className="ops-muted">{t.opsSelectEvent}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function TimelineInspectorSection({ t }) {
  const [prospectId, setProspectId] = useState("");
  const [timeline, setTimeline] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(event) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await fetchProspectTimeline(prospectId.trim());
      setTimeline(data);
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavTimelineInspector}</h2>
        </div>
      </header>

      <form className="ops-form-row" onSubmit={handleSearch}>
        <label className="ops-field">
          <span>{t.opsSearchProspect}</span>
          <input
            value={prospectId}
            onChange={(event) => setProspectId(event.target.value)}
            placeholder={t.opsProspectId}
          />
        </label>
        <button type="submit" className="ops-button" disabled={loading || !prospectId.trim()}>
          {loading ? t.loading : t.opsSearch}
        </button>
      </form>

      {error ? <p className="ops-error">{error}</p> : null}

      {timeline ? (
        <pre className="ops-code">{JSON.stringify(timeline, null, 2)}</pre>
      ) : null}
    </section>
  );
}

function LogsDiagnosticsSection({ t }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      const data = await fetchDiagnostics();
      setDiagnostics(data);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavLogsDiagnostics}</h2>
        </div>
        <button type="button" className="ops-button ops-button--secondary" onClick={load}>
          {t.opsRefresh}
        </button>
      </header>

      {error ? <p className="ops-error">{error}</p> : null}

      {diagnostics ? (
        <div className="ops-stack">
          <article className="ops-panel">
            <h3>{t.opsErrors}</h3>
            <pre className="ops-code">{JSON.stringify(diagnostics.errors, null, 2)}</pre>
          </article>
          <article className="ops-panel">
            <h3>{t.opsWarnings}</h3>
            <pre className="ops-code">{JSON.stringify(diagnostics.warnings, null, 2)}</pre>
          </article>
          <article className="ops-panel">
            <h3>{t.opsWorkflowActivity}</h3>
            <pre className="ops-code">{JSON.stringify(diagnostics.workflowActivity, null, 2)}</pre>
          </article>
          <article className="ops-panel">
            <h3>{t.opsIntegrationFailures}</h3>
            <pre className="ops-code">{JSON.stringify(diagnostics.integrationFailures, null, 2)}</pre>
          </article>
          <article className="ops-panel">
            <h3>{t.opsOperationsActivity}</h3>
            <pre className="ops-code">{JSON.stringify(diagnostics.operationsActivity, null, 2)}</pre>
          </article>
        </div>
      ) : null}
    </section>
  );
}

function OperationsCenterLayout({ t }) {
  return (
    <div className="operations-center">
      <aside className="operations-center__sidebar" aria-label={t.opsNavLabel}>
        <div className="operations-center__sidebar-head">
          <p className="operations-center__eyebrow">{t.opsInternalBadge}</p>
          <h1>{t.opsTitle}</h1>
          <p className="ops-muted">{t.opsSubtitle}</p>
        </div>

        <nav className="operations-center__nav">
          {operationsCenterSections.map((section) => (
            <NavLink
              key={section.id}
              to={operationsCenterPath(section.id)}
              className={({ isActive }) =>
                `operations-center__nav-link${isActive ? " is-active" : ""}`
              }
            >
              {t[section.labelKey]}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="operations-center__content">
        <Routes>
          <Route index element={<Navigate to="system-health" replace />} />
          <Route path="system-health" element={<SystemHealthSection t={t} />} />
          <Route path="workflow-simulator" element={<WorkflowSimulatorSection t={t} />} />
          <Route path="smoke-tests" element={<SmokeTestsSection t={t} />} />
          <Route path="projection-replay" element={<ProjectionReplaySection t={t} />} />
          <Route path="business-events" element={<BusinessEventsSection t={t} />} />
          <Route path="timeline-inspector" element={<TimelineInspectorSection t={t} />} />
          <Route path="logs" element={<LogsDiagnosticsSection t={t} />} />
          <Route path="*" element={<Navigate to="system-health" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function OperationsCenter() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await bootstrapAtlasSession();
        const profile = await fetchOperationsAccess();

        if (!cancelled) {
          setAccess(profile);

          if (!profile.allowed) {
            navigate(appPath(), { replace: true });
          }
        }
      } catch {
        if (!cancelled) {
          setAccess({ allowed: false });
          navigate(appPath(), { replace: true });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const allowed = useMemo(() => Boolean(access?.allowed), [access]);

  if (loading) {
    return <p className="ops-muted">{t.loading}</p>;
  }

  if (!allowed) {
    return null;
  }

  return <OperationsCenterLayout t={t} />;
}
