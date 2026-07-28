import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { bootstrapAtlasSession } from "../services/atlasAuthService";
import {
  operationsCenterNavGroups,
  operationsCenterPath
} from "../config/operationsCenterNav";
import { appPath } from "../config/appRoutes";
import {
  OpsEmptyState,
  OpsErrorState,
  OpsLoadingState,
  OpsPlatformCard,
  OpsRecentActivityList,
  OpsRunningTasks,
  OpsStatusBadge,
  useRunningTasks
} from "../components/operations/OpsShared";
import OpsDashboard from "./operations/OpsDashboard";
import OpsAlphaChecklist from "./operations/OpsAlphaChecklist";
import OpsGoldenPathTrace from "./operations/OpsGoldenPathTrace";
import {
  advanceWorkflowSimulator,
  fetchBusinessEventById,
  fetchBusinessEvents,
  fetchDiagnostics,
  fetchOperationsAccess,
  fetchOperationsDashboard,
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

function ActionResult({ result }) {
  if (!result) {
    return null;
  }

  const failed = result.success === false || result.result === "FAIL";

  return (
    <div className={`ops-result${failed ? " ops-result--error" : ""}`} role="status">
      {result.result ? <p className="ops-result__headline">{result.result}</p> : null}
      {result.eventsReplayed !== undefined ? <p>Events replayed: {result.eventsReplayed}</p> : null}
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

      {loading && !health ? <OpsLoadingState label={t.loading} /> : null}
      {error ? <OpsErrorState message={error} /> : null}

      <div className="ops-card-grid">
        {(health?.cards || []).map((card) => (
          <OpsPlatformCard key={card.id} card={card} t={t} />
        ))}
      </div>
    </section>
  );
}

function LiveActivitySection({ t }) {
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);

    try {
      const data = await fetchOperationsDashboard();
      setActivity(data.recentActivity || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavLiveActivity}</h2>
          <p className="ops-muted">{t.opsLiveActivityDescription}</p>
        </div>
        <button type="button" className="ops-button ops-button--secondary" onClick={load}>
          {t.opsRefresh}
        </button>
      </header>

      {loading && !activity.length ? <OpsLoadingState label={t.loading} /> : null}
      {error ? <OpsErrorState message={error} /> : null}
      <OpsRecentActivityList items={activity} emptyLabel={t.opsRecentActivityEmpty} />
    </section>
  );
}

function WorkflowSimulatorSection({ t }) {
  const [scenarios, setScenarios] = useState([]);
  const [activePhone, setActivePhone] = useState("");
  const [workflowState, setWorkflowState] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { tasks, runTask } = useRunningTasks();

  useEffect(() => {
    fetchSimulatorScenarios()
      .then((data) => setScenarios(data.scenarios || []))
      .catch(() => {});
  }, []);

  async function runAction(id, label, action) {
    setError(null);
    setResult(null);

    try {
      const payload = await runTask(id, label, action);
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

      <OpsRunningTasks tasks={tasks} t={t} />

      <div className="ops-action-row">
        <button
          type="button"
          className="ops-button"
          onClick={() => runAction("sim-facebook", t.opsGenerateFacebookLead, simulateFacebookLead)}
        >
          {t.opsGenerateFacebookLead}
        </button>
        <button
          type="button"
          className="ops-button"
          onClick={() => runAction("sim-website", t.opsGenerateWebsiteLead, simulateWebsiteLead)}
        >
          {t.opsGenerateWebsiteLead}
        </button>
        <button
          type="button"
          className="ops-button"
          onClick={() =>
            runAction("sim-whatsapp", t.opsGenerateWhatsApp, () =>
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
          onClick={() => runAction("sim-scenarios", t.opsRunAllScenarios, runAllSimulatorScenarios)}
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
                onClick={() =>
                  runAction(`scenario-${scenario.id}`, scenario.name, () =>
                    runSimulatorScenario(scenario.id)
                  )
                }
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
            onClick={() =>
              runAction("advance-workflow", t.opsAdvanceWorkflow, () =>
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
  const [error, setError] = useState(null);
  const { tasks, runTask } = useRunningTasks();

  useEffect(() => {
    fetchSmokeTests()
      .then((data) => setTests(data.tests || []))
      .catch((loadError) => setError(loadError.message));
  }, []);

  async function handleRun(testId) {
    setError(null);

    try {
      const result = await runTask(`smoke-${testId}`, testId, () => runSmokeTest(testId));
      setResults((current) => ({ ...current, [testId]: result }));
    } catch (runError) {
      setError(runError.message);
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

      <OpsRunningTasks tasks={tasks} t={t} />
      {error ? <OpsErrorState message={error} /> : null}

      <div className="ops-stack">
        {tests.map((test) => {
          const result = results[test.id];
          const running = tasks[`smoke-${test.id}`]?.status === "running";
          return (
            <article key={test.id} className="ops-panel ops-panel--row">
              <div>
                <h3>{test.label}</h3>
                {result ? (
                  <div className="ops-inline-meta">
                    <OpsStatusBadge status={result.result === "PASS" ? "healthy" : "failure"} label={result.result} />
                    <span>{result.durationMs}ms</span>
                  </div>
                ) : null}
                {result?.failureDetails ? <pre>{result.failureDetails}</pre> : null}
              </div>
              <button
                type="button"
                className="ops-button"
                disabled={running}
                onClick={() => handleRun(test.id)}
              >
                {running ? t.opsRunning : t.opsRunTest}
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
  const [error, setError] = useState(null);
  const { tasks, runTask } = useRunningTasks();

  async function runAction(id, label, action) {
    setError(null);

    try {
      const payload = await runTask(id, label, action);
      setResult(payload);
    } catch (actionError) {
      setError(actionError.message);
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

      <OpsRunningTasks tasks={tasks} t={t} />

      <div className="ops-action-row">
        <button
          type="button"
          className="ops-button"
          onClick={() => runAction("replay-all", t.opsReplayAll, replayAllProjections)}
        >
          {t.opsReplayAll}
        </button>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          onClick={() => runAction("replay-reset", t.opsResetProjection, resetProjectionState)}
        >
          {t.opsResetProjection}
        </button>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          onClick={() => runAction("replay-mc", t.opsRebuildMissionControl, rebuildMissionControl)}
        >
          {t.opsRebuildMissionControl}
        </button>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          onClick={() =>
            runAction("replay-ed", t.opsRebuildExecutiveDashboard, rebuildExecutiveDashboard)
          }
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
          disabled={!prospectId.trim()}
          onClick={() =>
            runAction("replay-prospect", t.opsReplaySingleProspect, () =>
              replaySingleProspect(prospectId.trim())
            )
          }
        >
          {t.opsReplaySingleProspect}
        </button>
      </div>

      {error ? <OpsErrorState message={error} /> : null}
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

      {loading ? <OpsLoadingState label={t.loading} /> : null}
      {error ? <OpsErrorState message={error} /> : null}

      {!loading && !events.length ? <OpsEmptyState title={t.opsBusinessEventsEmpty} /> : null}

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

      {error ? <OpsErrorState message={error} /> : null}

      {!timeline && !loading ? (
        <OpsEmptyState title={t.opsTimelineEmptyTitle} description={t.opsTimelineEmptyDescription} />
      ) : null}

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

      {error ? <OpsErrorState message={error} /> : null}

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
          {operationsCenterNavGroups.map((group) => (
            <div key={group.id} className="operations-center__nav-group">
              <p className="operations-center__nav-group-label">{t[group.labelKey]}</p>
              {group.items.map((section) => (
                <NavLink
                  key={section.id}
                  to={operationsCenterPath(section.id)}
                  end={section.end}
                  className={({ isActive }) =>
                    `operations-center__nav-link${isActive ? " is-active" : ""}`
                  }
                >
                  {t[section.labelKey]}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="operations-center__content">
        <Routes>
          <Route index element={<OpsDashboard t={t} />} />
          <Route path="alpha-checklist" element={<OpsAlphaChecklist t={t} />} />
          <Route path="golden-path-trace" element={<OpsGoldenPathTrace t={t} />} />
          <Route path="system-health" element={<SystemHealthSection t={t} />} />
          <Route path="live-activity" element={<LiveActivitySection t={t} />} />
          <Route path="workflow-simulator" element={<WorkflowSimulatorSection t={t} />} />
          <Route path="smoke-tests" element={<SmokeTestsSection t={t} />} />
          <Route path="projection-replay" element={<ProjectionReplaySection t={t} />} />
          <Route path="business-events" element={<BusinessEventsSection t={t} />} />
          <Route path="timeline-inspector" element={<TimelineInspectorSection t={t} />} />
          <Route path="logs" element={<LogsDiagnosticsSection t={t} />} />
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
    return <OpsLoadingState label={t.loading} />;
  }

  if (!allowed) {
    return null;
  }

  return <OperationsCenterLayout t={t} />;
}
