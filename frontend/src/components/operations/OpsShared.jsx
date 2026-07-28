/**
 * Sprint 17.1 — Shared Operations Center UI primitives.
 */

import { useCallback, useEffect, useState } from "react";

const STATUS_LABELS = {
  healthy: "Healthy",
  warning: "Warning",
  failure: "Error",
  running: "Running",
  disabled: "Disabled"
};

export function normalizeOpsStatus(status) {
  const value = String(status || "disabled").toLowerCase();

  if (["healthy", "ok", "pass", "mvp_ready"].includes(value)) {
    return "healthy";
  }

  if (["warning", "degraded", "warn"].includes(value)) {
    return "warning";
  }

  if (["failure", "fail", "error", "unhealthy", "blocked"].includes(value)) {
    return "failure";
  }

  if (["running", "in_progress", "processing"].includes(value)) {
    return "running";
  }

  return "disabled";
}

export function OpsStatusBadge({ status, label }) {
  const normalized = normalizeOpsStatus(status);
  const text = label || STATUS_LABELS[normalized] || status;

  return (
    <span className={`ops-status ops-status--${normalized}`} role="status">
      {text}
    </span>
  );
}

export function OpsLoadingState({ label }) {
  return (
    <div className="ops-loading" role="status" aria-live="polite">
      <span className="ops-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function OpsEmptyState({ title, description }) {
  return (
    <div className="ops-empty" role="status">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function OpsErrorState({ message }) {
  return (
    <div className="ops-error-banner" role="alert">
      {message}
    </div>
  );
}

export function OpsPlatformCard({ card, t }) {
  const status = normalizeOpsStatus(card.status);

  return (
    <article className={`ops-platform-card ops-platform-card--${status}`}>
      <div className="ops-platform-card__head">
        <h3>{card.label}</h3>
        <OpsStatusBadge status={card.status} />
      </div>
      <dl className="ops-meta">
        {card.version ? (
          <div>
            <dt>{t.opsVersion}</dt>
            <dd>{card.version}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t.opsLastCheck}</dt>
          <dd>{formatTime(card.lastCheck)}</dd>
        </div>
        {card.responseTimeMs !== undefined ? (
          <div>
            <dt>{t.opsResponseTime}</dt>
            <dd>{card.responseTimeMs}ms</dd>
          </div>
        ) : null}
      </dl>
      {card.detail ? <p className="ops-muted">{card.detail}</p> : null}
    </article>
  );
}

export function OpsRunningTasks({ tasks, t }) {
  const entries = Object.values(tasks || {});

  if (!entries.length) {
    return null;
  }

  return (
    <section className="ops-running-tasks" aria-live="polite" aria-label={t.opsRunningTasks}>
      {entries.map((task) => (
        <article key={task.id} className={`ops-running-task ops-running-task--${task.status}`}>
          <div className="ops-running-task__head">
            <div>
              <strong>{task.label}</strong>
              <p className="ops-muted">{task.status === "running" ? t.opsRunning : task.status}</p>
            </div>
            {task.status === "running" ? <span className="ops-spinner" aria-hidden="true" /> : null}
          </div>
          <p>{t.opsElapsed}: {formatDuration(task.elapsedMs || Date.now() - task.startedAt)}</p>
          {task.result ? (
            <p className="ops-running-task__result">
              {task.result.result || (task.result.success ? "OK" : "Failed")}
            </p>
          ) : null}
          {task.error ? <p className="ops-error">{task.error}</p> : null}
        </article>
      ))}
    </section>
  );
}

export function OpsRecentActivityList({ items, emptyLabel }) {
  if (!items?.length) {
    return <OpsEmptyState title={emptyLabel} />;
  }

  return (
    <ol className="ops-activity-feed">
      {items.map((item) => (
        <li key={item.id} className="ops-activity-feed__item">
          <time dateTime={item.timestamp}>{formatTime(item.timestamp)}</time>
          <div>
            <strong>{item.title}</strong>
            {item.detail ? <p className="ops-muted">{item.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function useRunningTasks() {
  const [tasks, setTasks] = useState({});

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTasks((current) => {
        const hasRunning = Object.values(current).some((task) => task.status === "running");
        return hasRunning ? { ...current } : current;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const runTask = useCallback(async (id, label, action) => {
    const startedAt = Date.now();

    setTasks((current) => ({
      ...current,
      [id]: {
        id,
        label,
        startedAt,
        elapsedMs: 0,
        status: "running"
      }
    }));

    try {
      const result = await action();
      const elapsedMs = Date.now() - startedAt;

      setTasks((current) => ({
        ...current,
        [id]: {
          ...current[id],
          status: "complete",
          elapsedMs,
          result
        }
      }));

      return result;
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;

      setTasks((current) => ({
        ...current,
        [id]: {
          ...current[id],
          status: "failed",
          elapsedMs,
          error: error.message
        }
      }));

      throw error;
    }
  }, []);

  const clearTask = useCallback((id) => {
    setTasks((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  return { tasks, runTask, clearTask };
}

export function formatTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(ms) {
  if (!ms || ms < 0) {
    return "0s";
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${seconds}s`;
}

export function OpsReadinessWidget({ readiness, t }) {
  if (!readiness) {
    return null;
  }

  return (
    <section className="ops-panel ops-readiness">
      <div className="ops-readiness__head">
        <h3>{t.opsProductionReadiness}</h3>
        <OpsStatusBadge
          status={readiness.productionReady ? "healthy" : "warning"}
          label={readiness.productionReady ? t.opsProductionReady : t.opsProductionNotReady}
        />
      </div>
      <ul className="ops-readiness__list">
        {(readiness.requirements || []).map((item) => {
          const labelKey = {
            healthy: "opsReadinessReady",
            failure: "opsReadinessMissing",
            warning: "opsReadinessWarning",
            disabled: "opsReadinessDisabled"
          }[item.state];

          return (
            <li key={item.id} className={`ops-readiness__item ops-readiness__item--${item.state}`}>
              <span>{item.label}</span>
              <OpsStatusBadge status={item.state} label={t[labelKey] || item.state} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
