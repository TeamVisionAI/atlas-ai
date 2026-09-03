import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useNavigate, Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { bootstrapAtlasSession } from "../services/atlasAuthService";
import {
  operationsCenterNavGroups,
  operationsCenterPath
} from "../config/operationsCenterNav";
import { appPath } from "../config/appRoutes";
import ForbiddenPage from "./ForbiddenPage";
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
import SimulatorReviewExperience from "./operations/SimulatorReviewExperience";
import {
  formatPlaygroundDiagnostics,
  formatRecruitAiV2FactChanges,
  PLAYGROUND_EXPECTATIONS,
  summarizeRecruitAiV2ScenarioReport
} from "../engines/recruitAiV2SimulatorPresentation";
import {
  formatIulDiagnosticsRows,
  summarizeIulScenarioReport,
  summarizeIulStagingReport
} from "../engines/iulPolicyReviewSimulatorPresentation";
import {
  advanceWorkflowSimulator,
  cleanupIulStagingSimulatorEvent,
  exportRecruitAiV2PlaygroundCandidate,
  fetchBusinessEventById,
  fetchBusinessEvents,
  fetchDiagnostics,
  fetchIulPolicyReviewSimulatorScenarios,
  fetchOperationsAccess,
  fetchOperationsDashboard,
  fetchProspectTimeline,
  fetchSimulatorScenarios,
  fetchRecruitAiV2SimulatorScenarios,
  fetchSmokeTests,
  fetchSystemHealth,
  fetchWorkflowSimulatorState,
  rebuildExecutiveDashboard,
  rebuildMissionControl,
  replayAllProjections,
  replaySingleProspect,
  resetProjectionState,
  resetRecruitAiV2PlaygroundSession,
  runAllIulPolicyReviewSimulatorScenarios,
  runAllSimulatorScenarios,
  runAllRecruitAiV2SimulatorScenarios,
  runIulPolicyReviewSimulatorScenario,
  runIulStagingE2ESimulator,
  runRecruitAiV2SimulatorScenario,
  runSimulatorScenario,
  runSmokeTest,
  sendRecruitAiV2PlaygroundTurn,
  simulateFacebookLead,
  simulateWebsiteLead,
  simulateWhatsAppConversation,
  startRecruitAiV2PlaygroundSession
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

function RecruitAiV2ScenarioResult({ report, t }) {
  if (!report) {
    return null;
  }

  const summary = summarizeRecruitAiV2ScenarioReport(report);
  const turns = Array.isArray(report.turns) ? report.turns : [];

  return (
    <div className="ops-panel">
      <div className="ops-panel ops-panel--row" style={{ border: "none", padding: 0 }}>
        <div>
          <h3>{summary.scenarioName}</h3>
          <p className="ops-muted">
            {t.opsV2Assertions}: {summary.passed}/{summary.totalAssertions} ·{" "}
            {t.opsV2FinalStage}: {summary.finalContextStage || "—"} ·{" "}
            {t.opsV2HumanEscalation}: {summary.humanEscalation ? t.opsYes : t.opsNo} ·{" "}
            {t.opsV2SideEffectsDenied}: {summary.sideEffectsDenied ? t.opsYes : t.opsNo}
          </p>
        </div>
        <OpsStatusBadge status={summary.pass ? "healthy" : "failure"} label={summary.pass ? "PASS" : "FAIL"} />
      </div>

      {turns.length ? (
        <div className="ops-table-wrap" style={{ overflowX: "auto", marginTop: "0.75rem" }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.opsV2ColInput}</th>
                <th>{t.opsV2ColLanguage}</th>
                <th>{t.opsV2ColIntent}</th>
                <th>{t.opsV2ColConfidence}</th>
                <th>{t.opsV2ColStage}</th>
                <th>{t.opsV2ColFacts}</th>
                <th>{t.opsV2ColClarify}</th>
                <th>{t.opsV2ColDecision}</th>
                <th>{t.opsV2ColSideEffect}</th>
                <th>{t.opsV2ColAuth}</th>
                <th>{t.opsV2ColResult}</th>
              </tr>
            </thead>
            <tbody>
              {turns.map((turn) => (
                <tr key={`${turn.turn}-${turn.turnNumber}`}>
                  <td>{turn.turnNumber}</td>
                  <td>{turn.prospectInput}</td>
                  <td>{turn.preferredLanguage}</td>
                  <td>{turn.interpretedIntent}</td>
                  <td>{turn.confidence != null ? Number(turn.confidence).toFixed(2) : "—"}</td>
                  <td>{turn.currentStage}</td>
                  <td>
                    <code className="ops-code" style={{ whiteSpace: "pre-wrap" }}>
                      {formatRecruitAiV2FactChanges(turn.knownFactChanges)}
                    </code>
                  </td>
                  <td>{turn.clarificationRequired ? t.opsYes : t.opsNo}</td>
                  <td>{turn.decision}</td>
                  <td>{turn.proposedSideEffect || "—"}</td>
                  <td>{turn.authorizationResult}</td>
                  <td>
                    <OpsStatusBadge
                      status={turn.pass ? "healthy" : "failure"}
                      label={turn.pass ? "PASS" : "FAIL"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <details style={{ marginTop: "0.75rem" }}>
        <summary className="ops-muted">{t.opsV2ExpandContext}</summary>
        <pre className="ops-code">{JSON.stringify(report.finalContext || {}, null, 2)}</pre>
      </details>
    </div>
  );
}

function IulPolicyReviewScenarioResult({ report }) {
  if (!report) {
    return null;
  }

  const summary = summarizeIulScenarioReport(report);
  const staging = summarizeIulStagingReport(report);
  const turns = Array.isArray(report.turns) ? report.turns : [];

  return (
    <div className="ops-panel">
      <div className="ops-panel ops-panel--row" style={{ border: "none", padding: 0 }}>
        <div>
          <h3>{summary.scenarioName}</h3>
          <p className="ops-muted">
            Mode: {summary.mode} · Turns: {summary.turnCount} · Passed: {summary.passed}/
            {summary.turnCount}
          </p>
          {report.mode === "staging_e2e" ? (
            <p className="ops-muted">
              Booking: {report.bookingPath || "—"} · Calendar: {staging.calendarName} · Meeting:{" "}
              {staging.meetingMode} · Event: {staging.eventCreated ? staging.eventId : "Failed"} · Zoom:{" "}
              {staging.zoomVerified ? "Verified" : staging.zoomConfigured ? "Missing in reply" : "Not configured"}{" "}
              · Cleanup: {staging.cleanupStatus}
            </p>
          ) : null}
        </div>
        <OpsStatusBadge status={summary.pass ? "healthy" : "failure"} label={summary.pass ? "PASS" : "FAIL"} />
      </div>

      {turns.map((turn) => {
        const diagRows = formatIulDiagnosticsRows(turn.diagnostics);
        return (
          <div key={turn.turn || turn.prospectInput} style={{ marginBottom: "0.85rem" }}>
            <p>
              <strong>Inbound:</strong> {turn.prospectInput}
              {turn.interactiveSelection?.id ? (
                <code className="ops-code"> ({turn.interactiveSelection.id})</code>
              ) : null}
            </p>
            <p>
              <strong>Atlas:</strong> {turn.atlasReply || "—"}
            </p>
            {turn.interactiveOptions?.length ? (
              <p className="ops-muted">
                <strong>Options:</strong>{" "}
                {turn.interactiveOptions.map((o) => `${o.title} [${o.id}]`).join(" · ")}
              </p>
            ) : null}
            <OpsStatusBadge
              status={turn.pass ? "healthy" : "failure"}
              label={turn.pass ? "PASS" : "FAIL"}
            />
            <details>
              <summary className="ops-muted">Diagnostics</summary>
              <table className="ops-table">
                <tbody>
                  {diagRows.map(([key, value]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>
                        <code className="ops-code">{value == null ? "—" : String(value)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {turn.failures?.length ? (
                <pre className="ops-code">{JSON.stringify(turn.failures, null, 2)}</pre>
              ) : null}
            </details>
          </div>
        );
      })}
    </div>
  );
}

function RecruitAiV2CustomPlayground({ t }) {
  const [session, setSession] = useState(null);
  const [turns, setTurns] = useState([]);
  const [context, setContext] = useState(null);
  const [message, setMessage] = useState("");
  const [initialLanguage, setInitialLanguage] = useState("auto");
  const [meetingContext, setMeetingContext] = useState("none");
  const [expectation, setExpectation] = useState("");
  const [candidateJson, setCandidateJson] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const suggested =
    session?.suggestedPrompts || {
      spanish: ["Hola", "Miami", "Florida"],
      english: ["Hi", "I live in Tampa", "Florida"],
      fragments: ["La or", "idk", "maybe"],
      unexpected: ["Is this insurance?", "Stop texting me"]
    };

  async function startConversation() {
    setError(null);
    setCandidateJson("");
    setBusy(true);
    try {
      const payload = await startRecruitAiV2PlaygroundSession({
        initialLanguage,
        meetingContext
      });
      setSession(payload.session);
      setTurns([]);
      setContext(payload.session?.context || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetConversation() {
    setError(null);
    setCandidateJson("");
    setBusy(true);
    try {
      if (!session?.sessionId) {
        await startConversation();
        return;
      }
      const payload = await resetRecruitAiV2PlaygroundSession(session.sessionId, {
        initialLanguage,
        meetingContext
      });
      setSession(payload.session);
      setTurns([]);
      setContext(payload.session?.context || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(textOverride) {
    const text = String(textOverride ?? message).trim();
    if (!text) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let active = session;
      if (!active?.sessionId) {
        const started = await startRecruitAiV2PlaygroundSession({
          initialLanguage,
          meetingContext
        });
        active = started.session;
        setSession(active);
      }
      const payload = await sendRecruitAiV2PlaygroundTurn(active.sessionId, {
        text,
        expectation: expectation || undefined
      });
      setTurns((prev) => [...prev, payload.turn]);
      setContext(payload.context || null);
      setMessage("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRegressionCandidate() {
    if (!session?.sessionId) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const payload = await exportRecruitAiV2PlaygroundCandidate(session.sessionId);
      setCandidateJson(payload.copyText || JSON.stringify(payload.candidate, null, 2));
      if (navigator?.clipboard?.writeText && payload.copyText) {
        await navigator.clipboard.writeText(payload.copyText);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-panel">
      <h3>{t.opsV2PlaygroundTitle}</h3>
      <p className="ops-muted">{t.opsV2PlaygroundHint}</p>

      <div className="ops-action-row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <label className="ops-muted">
          {t.opsV2PlaygroundLanguage}{" "}
          <select
            value={initialLanguage}
            onChange={(e) => setInitialLanguage(e.target.value)}
            disabled={busy}
          >
            <option value="auto">{t.opsV2PlaygroundLangAuto}</option>
            <option value="english">{t.opsV2PlaygroundLangEnglish}</option>
            <option value="spanish">{t.opsV2PlaygroundLangSpanish}</option>
          </select>
        </label>
        <label className="ops-muted">
          {t.opsV2PlaygroundMeeting}{" "}
          <select
            value={meetingContext}
            onChange={(e) => setMeetingContext(e.target.value)}
            disabled={busy}
          >
            <option value="none">{t.opsV2PlaygroundMeetingNone}</option>
            <option value="appointment_proposed">{t.opsV2PlaygroundMeetingProposed}</option>
            <option value="appointment_confirmed">{t.opsV2PlaygroundMeetingConfirmed}</option>
          </select>
        </label>
        <label className="ops-muted">
          {t.opsV2PlaygroundExpectation}{" "}
          <select
            value={expectation}
            onChange={(e) => setExpectation(e.target.value)}
            disabled={busy}
          >
            <option value="">{t.opsV2PlaygroundExpectationNone}</option>
            {PLAYGROUND_EXPECTATIONS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ops-action-row">
        <button type="button" className="ops-button" disabled={busy} onClick={startConversation}>
          {t.opsV2PlaygroundStart}
        </button>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          disabled={busy}
          onClick={resetConversation}
        >
          {t.opsV2PlaygroundReset}
        </button>
        <button
          type="button"
          className="ops-button ops-button--secondary"
          disabled={busy || !session?.sessionId || !turns.length}
          onClick={saveRegressionCandidate}
        >
          {t.opsV2PlaygroundSaveCandidate}
        </button>
      </div>

      <div className="ops-muted" style={{ marginTop: "0.5rem" }}>
        <span>{t.opsV2PlaygroundSuggested}: </span>
        {Object.entries(suggested).map(([group, prompts]) => (
          <span key={group} style={{ marginRight: "0.75rem" }}>
            <strong>{group}</strong>{" "}
            {(prompts || []).map((prompt) => (
              <button
                key={`${group}-${prompt}`}
                type="button"
                className="ops-button ops-button--secondary"
                style={{ margin: "0.15rem", padding: "0.2rem 0.45rem", fontSize: "0.8rem" }}
                disabled={busy}
                onClick={() => sendMessage(prompt)}
              >
                {prompt}
              </button>
            ))}
          </span>
        ))}
      </div>

      <div
        className="ops-panel"
        style={{
          marginTop: "0.75rem",
          maxHeight: "280px",
          overflowY: "auto",
          background: "transparent"
        }}
      >
        {!turns.length ? (
          <p className="ops-muted">{t.opsV2PlaygroundEmpty}</p>
        ) : (
          turns.map((turn) => {
            const diagRows = formatPlaygroundDiagnostics(turn.diagnostics);
            return (
              <div key={turn.turnId || turn.turnNumber} style={{ marginBottom: "0.85rem" }}>
                <p>
                  <strong>{t.opsV2PlaygroundProspect}</strong> {turn.prospectInput}
                </p>
                <p>
                  <strong>{t.opsV2PlaygroundAtlasReply}</strong>{" "}
                  {turn.atlasProposedReply || "—"}
                </p>
                {turn.pass != null ? (
                  <OpsStatusBadge
                    status={turn.pass ? "healthy" : "failure"}
                    label={turn.pass ? "PASS" : "FAIL"}
                  />
                ) : null}
                <details>
                  <summary className="ops-muted">{t.opsV2PlaygroundDiagnostics}</summary>
                  <table className="ops-table">
                    <tbody>
                      {diagRows.map(([key, value]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>
                            <code className="ops-code">
                              {value == null || value === ""
                                ? "—"
                                : typeof value === "object"
                                  ? JSON.stringify(value)
                                  : String(value)}
                            </code>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td>knownFactsChanged</td>
                        <td>
                          <code className="ops-code">
                            {formatRecruitAiV2FactChanges(turn.diagnostics?.knownFactsChanged)}
                          </code>
                        </td>
                      </tr>
                      <tr>
                        <td>safeReasonCodes</td>
                        <td>
                          <code className="ops-code">
                            {(turn.diagnostics?.safeReasonCodes || []).join(", ") || "—"}
                          </code>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </details>
              </div>
            );
          })
        )}
      </div>

      <div className="ops-action-row" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: 1 }}>
          <span className="ops-muted">{t.opsV2PlaygroundCompose}</span>
          <input
            type="text"
            style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
            value={message}
            disabled={busy}
            placeholder={t.opsV2PlaygroundPlaceholder}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
        </label>
        <button
          type="button"
          className="ops-button"
          disabled={busy || !message.trim()}
          onClick={() => sendMessage()}
        >
          {t.opsV2PlaygroundSend}
        </button>
      </div>

      <details style={{ marginTop: "0.75rem" }}>
        <summary className="ops-muted">{t.opsV2PlaygroundContext}</summary>
        <pre className="ops-code">{JSON.stringify(context || {}, null, 2)}</pre>
      </details>

      {candidateJson ? (
        <details open style={{ marginTop: "0.75rem" }}>
          <summary className="ops-muted">{t.opsV2PlaygroundCandidateReady}</summary>
          <pre className="ops-code">{candidateJson}</pre>
        </details>
      ) : null}

      {error ? <p className="ops-error">{error}</p> : null}
    </div>
  );
}

function WorkflowSimulatorSection({ t }) {
  const [scenarios, setScenarios] = useState([]);
  const [v2Scenarios, setV2Scenarios] = useState([]);
  const [iulScenarios, setIulScenarios] = useState([]);
  const [activePhone, setActivePhone] = useState("");
  const [workflowState, setWorkflowState] = useState(null);
  const [v2Report, setV2Report] = useState(null);
  const [v2Suite, setV2Suite] = useState(null);
  const [iulReport, setIulReport] = useState(null);
  const [iulSuite, setIulSuite] = useState(null);
  const [iulStagingSuite, setIulStagingSuite] = useState(null);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { tasks, runTask } = useRunningTasks();

  useEffect(() => {
    fetchSimulatorScenarios()
      .then((data) => setScenarios(data.scenarios || []))
      .catch(() => {});
    fetchRecruitAiV2SimulatorScenarios()
      .then((data) => setV2Scenarios(data.scenarios || []))
      .catch(() => {});
    fetchIulPolicyReviewSimulatorScenarios()
      .then((data) => setIulScenarios(data.scenarios || []))
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
      } else if (payload.reports && !payload.recruitAiV2) {
        setWorkflowState({ scenarios: payload.reports });
      }
    } catch (actionError) {
      setError(actionError.message);
    }
  }

  async function runV2Action(id, label, action) {
    setError(null);
    setResult(null);
    setV2Report(null);
    setV2Suite(null);

    try {
      const payload = await runTask(id, label, action);
      setResult(payload);
      if (payload.report?.recruitAiV2) {
        setV2Report(payload.report);
      } else if (payload.recruitAiV2 && payload.reports) {
        setV2Suite(payload);
      }
    } catch (actionError) {
      setError(actionError.message);
    }
  }

  async function runIulAction(id, label, action) {
    setError(null);
    setResult(null);
    setIulReport(null);
    setIulSuite(null);
    setIulStagingSuite(null);

    try {
      const payload = await runTask(id, label, action);
      setResult(payload);
      if (payload.report?.iulPolicyReview) {
        setIulReport(payload.report);
      } else if (payload.iulPolicyReview && payload.reports) {
        if (payload.mode === "staging_e2e") {
          setIulStagingSuite(payload);
        } else {
          setIulSuite(payload);
        }
      } else if (payload.report) {
        setIulReport(payload.report);
      }
    } catch (actionError) {
      setError(actionError.message);
    }
  }

  async function runIulCleanup(simulatorRunId) {
    setCleanupResult(null);
    try {
      const payload = await cleanupIulStagingSimulatorEvent(simulatorRunId);
      setCleanupResult(payload.cleanup || payload);
    } catch (cleanupError) {
      setError(cleanupError.message);
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

      <div className="ops-panel">
        <h3>{t.opsRecruitAiV2Scenarios}</h3>
        <p className="ops-muted">{t.opsRecruitAiV2ScenariosHint}</p>
        <div className="ops-action-row">
          <button
            type="button"
            className="ops-button"
            onClick={() =>
              runV2Action("v2-suite", t.opsRunAllV2Scenarios, runAllRecruitAiV2SimulatorScenarios)
            }
          >
            {t.opsRunAllV2Scenarios}
          </button>
          {v2Scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className="ops-button ops-button--secondary"
              onClick={() =>
                runV2Action(`v2-${scenario.id}`, scenario.name, () =>
                  runRecruitAiV2SimulatorScenario(scenario.id)
                )
              }
            >
              {scenario.name}
            </button>
          ))}
        </div>
      </div>

      <div className="ops-panel">
        <div className="ops-panel ops-panel--row" style={{ border: "none", padding: 0, marginBottom: "0.5rem" }}>
          <div>
            <h3>IUL POLICY REVIEW</h3>
            <p className="ops-muted">
              Dry-run uses fixture availability and the real IUL engine. Staging E2E writes only to
              Atlas Staging via Super Admin personal integration.
            </p>
          </div>
          <OpsStatusBadge status="warning" label="STAGING CALENDAR WRITE" />
        </div>
        <div className="ops-action-row">
          <button
            type="button"
            className="ops-button"
            onClick={() =>
              runIulAction("iul-golden-suite", "Run IUL Golden Suite", runAllIulPolicyReviewSimulatorScenarios)
            }
          >
            Run IUL Golden Suite
          </button>
          <button
            type="button"
            className="ops-button ops-button--secondary"
            onClick={() =>
              runIulAction("iul-staging-e2e", "Run IUL Staging E2E", () =>
                runIulStagingE2ESimulator({ autoCleanup: true })
              )
            }
          >
            Run IUL Staging E2E
          </button>
        </div>
        <div className="ops-action-row">
          {iulScenarios
            .filter((scenario) => scenario.mode !== "staging_e2e")
            .map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className="ops-button ops-button--secondary"
                onClick={() =>
                  runIulAction(`iul-${scenario.id}`, scenario.name, () =>
                    runIulPolicyReviewSimulatorScenario(scenario.id)
                  )
                }
              >
                {scenario.name}
              </button>
            ))}
        </div>
        {iulStagingSuite?.reports?.[0]?.simulatorRunId ? (
          <div className="ops-action-row" style={{ marginTop: "0.5rem" }}>
            <button
              type="button"
              className="ops-button ops-button--secondary"
              onClick={() => runIulCleanup(iulStagingSuite.reports[0].simulatorRunId)}
            >
              Clean up simulator event
            </button>
          </div>
        ) : null}
      </div>

      <RecruitAiV2CustomPlayground t={t} />

      {activePhone ? (
        <div className="ops-panel">
          <h3>{t.opsWorkflowProgress}</h3>
          <p className="ops-muted">
            {t.opsActivePhone}: {activePhone}
          </p>
          <div className="ops-action-row">
            <Link
              className="ops-button"
              to={operationsCenterPath(`review/${encodeURIComponent(activePhone)}`)}
            >
              {t.opsOpenReviewExperience}
            </Link>
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
        </div>
      ) : null}

      {error ? <p className="ops-error">{error}</p> : null}
      <ActionResult result={result} />

      {v2Report ? <RecruitAiV2ScenarioResult report={v2Report} t={t} /> : null}

      {iulReport ? <IulPolicyReviewScenarioResult report={iulReport} /> : null}

      {iulSuite?.reports ? (
        <div className="ops-panel">
          <h3>IUL Golden Suite</h3>
          <p className="ops-muted">
            {iulSuite.passed}/{iulSuite.total} passed
          </p>
          <div className="ops-stack">
            {iulSuite.reports.map((report) => (
              <div key={report.scenarioId} className="ops-panel ops-panel--row">
                <span>{report.scenarioName}</span>
                <OpsStatusBadge status={report.pass ? "healthy" : "failure"} label={report.pass ? "PASS" : "FAIL"} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {iulStagingSuite?.reports ? (
        <div className="ops-panel">
          <h3>IUL Staging E2E</h3>
          <p className="ops-muted">
            {iulStagingSuite.passed}/{iulStagingSuite.total} passed · Writes to Atlas Staging calendar only
          </p>
          {iulStagingSuite.reports.map((report) => (
            <IulPolicyReviewScenarioResult key={report.scenarioId} report={report} />
          ))}
        </div>
      ) : null}

      {cleanupResult ? (
        <div className="ops-panel">
          <h3>Cleanup</h3>
          <pre className="ops-code">{JSON.stringify(cleanupResult, null, 2)}</pre>
        </div>
      ) : null}

      {v2Suite?.reports ? (
        <div className="ops-panel">
          <h3>{t.opsV2SuiteSummary}</h3>
          <p className="ops-muted">
            {v2Suite.passed}/{v2Suite.total} {t.opsV2Passed}
          </p>
          <div className="ops-stack">
            {v2Suite.reports.map((report) => (
              <div key={report.scenarioId} className="ops-panel ops-panel--row">
                <span>{report.scenarioName}</span>
                <OpsStatusBadge
                  status={report.pass ? "healthy" : "failure"}
                  label={report.pass ? "PASS" : "FAIL"}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result?.phone ? (
        <div className="ops-action-row">
          <Link
            className="ops-button"
            to={operationsCenterPath(`review/${encodeURIComponent(result.phone)}`)}
          >
            {t.opsOpenReviewExperience}
          </Link>
        </div>
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
          <Route path="review/:phone" element={<SimulatorReviewExperience t={t} />} />
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
    return <ForbiddenPage routeKey="operations-center" />;
  }

  return <OperationsCenterLayout t={t} />;
}
