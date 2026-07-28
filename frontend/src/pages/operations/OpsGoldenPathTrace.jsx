import { useCallback, useState } from "react";
import {
  OpsErrorState,
  OpsLoadingState,
  OpsStatusBadge
} from "../../components/operations/OpsShared";
import { fetchGoldenPathTrace } from "../../services/operationsCenterService";

function ReplayStep({ step }) {
  const status = step.status || "UNKNOWN";
  const tone =
    status === "PASS" ? "healthy" : status === "PENDING" ? "warning" : "failure";

  return (
    <li className="ops-replay-step">
      <OpsStatusBadge status={tone} label={status} />
      <span>{step.step}</span>
    </li>
  );
}

function TracePanel({ title, children }) {
  return (
    <article className="ops-panel">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

export default function OpsGoldenPathTrace({ t }) {
  const [phone, setPhone] = useState("");
  const [trace, setTrace] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const normalized = phone.trim();

    if (!normalized) {
      setError(t.opsAlphaTracePhoneRequired);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await fetchGoldenPathTrace(normalized);
      setTrace(payload.trace || payload);
    } catch (loadError) {
      setTrace(null);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [phone, t]);

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavGoldenPathTrace}</h2>
          <p className="ops-muted">{t.opsGoldenPathTraceSubtitle}</p>
        </div>
      </header>

      <div className="ops-panel ops-stack">
        <div className="ops-inline-form">
          <label className="ops-field">
            <span className="ops-muted">{t.opsAlphaTracePhone}</span>
            <input
              type="text"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t.opsAlphaTracePhonePlaceholder}
            />
          </label>
          <button
            type="button"
            className="ops-button ops-button--primary"
            onClick={load}
            disabled={loading}
          >
            {loading ? t.loading : t.opsGoldenPathLoadTrace}
          </button>
        </div>

        {error ? <OpsErrorState message={error} /> : null}
        {loading ? <OpsLoadingState label={t.opsGoldenPathLoading} /> : null}

        {trace ? (
          <div className="ops-stack">
            <div className="ops-inline-meta">
              <span>{trace.prospect?.name || trace.phone}</span>
              <span>{trace.prospect?.communication_language || "—"}</span>
              <span>{trace.missionControl?.canonicalMilestone || "—"}</span>
            </div>

            <TracePanel title={t.opsGoldenPathReplaySteps}>
              <ol className="ops-replay-list">
                {(trace.replay?.steps || []).map((step) => (
                  <ReplayStep key={step.step} step={step} />
                ))}
              </ol>
            </TracePanel>

            <div className="ops-card-grid">
              <TracePanel title={t.opsGoldenPathAiDecisions}>
                <pre className="ops-code">
                  {JSON.stringify(trace.aiDecisions || {}, null, 2)}
                </pre>
              </TracePanel>
              <TracePanel title={t.opsGoldenPathBusinessRules}>
                <ul className="ops-checklist">
                  {(trace.businessRulesApplied || []).map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </TracePanel>
              <TracePanel title={t.opsGoldenPathCalendar}>
                <pre className="ops-code">{JSON.stringify(trace.calendar || {}, null, 2)}</pre>
              </TracePanel>
              <TracePanel title={t.opsGoldenPathWhatsApp}>
                <pre className="ops-code">{JSON.stringify(trace.whatsapp || {}, null, 2)}</pre>
              </TracePanel>
              <TracePanel title={t.opsGoldenPathMissionControl}>
                <pre className="ops-code">
                  {JSON.stringify(trace.missionControl || {}, null, 2)}
                </pre>
              </TracePanel>
              <TracePanel title={t.opsGoldenPathValidation}>
                <pre className="ops-code">{JSON.stringify(trace.validation || {}, null, 2)}</pre>
              </TracePanel>
            </div>

            <TracePanel title={t.opsGoldenPathTimeline}>
              <p className="ops-muted">
                {trace.timeline?.entryCount || 0} {t.opsGoldenPathTimelineEntries}
              </p>
              <pre className="ops-code">
                {JSON.stringify(trace.timeline?.entries || [], null, 2)}
              </pre>
            </TracePanel>
          </div>
        ) : null}
      </div>
    </section>
  );
}
