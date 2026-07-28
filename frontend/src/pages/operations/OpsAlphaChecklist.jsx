import { useCallback, useState } from "react";
import {
  OpsErrorState,
  OpsLoadingState,
  OpsStatusBadge,
  formatDuration,
  useRunningTasks
} from "../../components/operations/OpsShared";
import { fetchAlphaChecklist, runAlphaChecklist } from "../../services/operationsCenterService";

function ChecklistItem({ item }) {
  return (
    <li className={`ops-checklist-item${item.pass ? " is-pass" : " is-fail"}`}>
      <span className="ops-checklist-item__box" aria-hidden="true">
        {item.pass ? "☑" : "□"}
      </span>
      <div className="ops-checklist-item__body">
        <strong>{item.label}</strong>
        {item.detail ? <p className="ops-muted">{item.detail}</p> : null}
      </div>
      <OpsStatusBadge status={item.pass ? "healthy" : "failure"} label={item.status} />
    </li>
  );
}

export default function OpsAlphaChecklist({ t }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState("");
  const [includeValidation, setIncludeValidation] = useState(false);
  const { running, runTask } = useRunningTasks();

  const load = useCallback(
    async (withValidation = includeValidation) => {
      setError(null);

      try {
        const payload = await fetchAlphaChecklist({
          phone: phone.trim() || undefined,
          runValidation: withValidation
        });
        setReport(payload);
      } catch (loadError) {
        setError(loadError.message);
      }
    },
    [phone, includeValidation]
  );

  const runFull = useCallback(async () => {
    setError(null);

    await runTask("alpha-checklist", async () => {
      const payload = await runAlphaChecklist({
        phone: phone.trim() || undefined,
        runValidation: includeValidation
      });
      setReport(payload);
    });
  }, [phone, includeValidation, runTask]);

  return (
    <section className="ops-section">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2>{t.opsNavAlphaChecklist}</h2>
          <p className="ops-muted">{t.opsAlphaChecklistSubtitle}</p>
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
          <label className="ops-checkbox">
            <input
              type="checkbox"
              checked={includeValidation}
              onChange={(event) => setIncludeValidation(event.target.checked)}
            />
            <span>{t.opsAlphaIncludeValidation}</span>
          </label>
          <button
            type="button"
            className="ops-button ops-button--secondary"
            onClick={() => load(includeValidation)}
            disabled={running}
          >
            {t.opsRefresh}
          </button>
          <button
            type="button"
            className="ops-button ops-button--primary"
            onClick={runFull}
            disabled={running}
          >
            {running ? t.opsRunning : t.opsAlphaRunChecklist}
          </button>
        </div>

        {error ? <OpsErrorState message={error} /> : null}
        {running && !report ? <OpsLoadingState label={t.opsAlphaRunningChecklist} /> : null}

        {report?.alphaReady ? (
          <div className="ops-alpha-ready-banner" role="status">
            <span aria-hidden="true">🟢</span>
            <strong>{t.opsAlphaReadyTitle}</strong>
          </div>
        ) : null}

        {report ? (
          <div className="ops-stack">
            <div className="ops-inline-meta">
              <span>
                {t.opsAlphaPassed}: {report.passed}/{report.total}
              </span>
              {report.durationMs ? (
                <span>
                  {t.opsValidationDuration}: {formatDuration(report.durationMs)}
                </span>
              ) : null}
              {report.tracePhone ? (
                <span>
                  {t.opsAlphaTracePhone}: {report.tracePhone}
                </span>
              ) : null}
            </div>

            <ul className="ops-checklist">
              {(report.items || []).map((item) => (
                <ChecklistItem key={item.id} item={item} />
              ))}
            </ul>

            {report.validationSummary ? (
              <p className="ops-muted">
                {t.opsValidationReportTitle}: {report.validationSummary.overall} (
                {report.validationSummary.stepsPassed} {t.opsValidationStepsPassed})
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
